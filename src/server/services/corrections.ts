import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { computeCycleXp } from "@/domain/methods";
import { weekRange } from "@/domain/time";
import {
  auditLogs,
  categories,
  profiles,
  projects,
  projectTasks,
  sessionSegments,
  studySessions,
  topics,
  xpTransactions,
} from "../db/schema";
import { AppError, lockProfile, secondsBetween, type Ctx, type Tx } from "./common";
import { postXp } from "./xp";

/**
 * Correção de sessões pela própria pessoa: só para MENOS (reduzir o tempo ou excluir),
 * nunca para acrescentar horas. Vale para sessões encerradas na semana atual (no fuso da
 * pessoa) — semanas fechadas, com pódios e medalhas, ficam congeladas.
 * XP, horas, rankings, sequência e conquistas se recalculam sozinhos, porque todos vêm
 * dos segmentos e do extrato de XP, que a correção ajusta.
 */

/** Sessões que entram nas listas e contagens (as excluídas ficam só para auditoria). */
export const notDeletedSession = sql`${studySessions.correction} is distinct from 'deleted'`;

async function editableSession(tx: Tx, userId: string, sessionId: string, now: Date) {
  const profile = await lockProfile(tx, userId);
  const [s] = await tx.select().from(studySessions).where(eq(studySessions.id, sessionId));
  if (!s || s.userId !== userId) throw new AppError("Sessão não encontrada.", "not_found");
  if (s.correction === "deleted") throw new AppError("Esta sessão já foi excluída.", "conflict");
  if (!s.endedAt) throw new AppError("Encerre a sessão antes de corrigi-la.", "invalid");
  if (s.endedAt < weekRange(profile.timezone ?? "America/Sao_Paulo", now).start) {
    throw new AppError("Só dá para corrigir sessões da semana atual.", "forbidden");
  }
  return s;
}

/** Estorna a diferença de XP na mesma data do crédito original (o período do ranking não muda). */
async function reverseXp(
  tx: Tx,
  s: typeof studySessions.$inferSelect,
  amount: number,
  reason: "session_trimmed" | "session_deleted",
  note: string,
) {
  if (amount <= 0) return;
  const [credit] = await tx
    .select({ at: xpTransactions.createdAt })
    .from(xpTransactions)
    .where(
      and(
        eq(xpTransactions.sourceType, "study_session"),
        eq(xpTransactions.sourceId, s.id),
        eq(xpTransactions.reason, "cycle_completed"),
      ),
    );
  await postXp(tx, {
    userId: s.userId,
    amount: -amount,
    reason,
    methodId: s.methodId,
    areaId: s.areaId,
    catalogTopicId: s.catalogTopicId,
    ranked: s.ranked,
    sourceType: "study_session",
    sourceId: s.id,
    note,
    at: credit?.at ?? s.endedAt!,
  });
}

/**
 * Reduz o tempo estudado para `minutes` (menor que o atual). Corta do fim da sessão para trás:
 * o caso típico é ter esquecido o cronômetro ligado. Cada sessão pode ser reduzida uma vez.
 */
export async function trimSession(ctx: Ctx, userId: string, sessionId: string, minutes: number) {
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    const s = await editableSession(tx, userId, sessionId, now);
    if (s.correction === "trimmed") throw new AppError("Esta sessão já teve o tempo reduzido. Se precisar, exclua-a.", "conflict");
    if (!Number.isInteger(minutes) || minutes < 1) throw new AppError("Informe o tempo que você realmente estudou (mín. 1 min).", "invalid");
    const target = minutes * 60;
    if (target >= s.activeSeconds) throw new AppError("O novo tempo precisa ser menor que o registrado. Não é possível acrescentar horas.", "invalid");

    const segs = await tx
      .select()
      .from(sessionSegments)
      .where(eq(sessionSegments.sessionId, s.id))
      .orderBy(asc(sessionSegments.startedAt));
    let left = target;
    let newEnd = s.startedAt;
    for (const seg of segs) {
      const len = secondsBetween(seg.startedAt, seg.endedAt!);
      if (left <= 0) {
        await tx.delete(sessionSegments).where(eq(sessionSegments.id, seg.id));
      } else if (len > left) {
        newEnd = new Date(seg.startedAt.getTime() + left * 1000);
        await tx.update(sessionSegments).set({ endedAt: newEnd }).where(eq(sessionSegments.id, seg.id));
        left = 0;
      } else {
        left -= len;
        newEnd = seg.endedAt!;
      }
    }

    const completed = target >= s.plannedSeconds;
    const xp = computeCycleXp(s.rulesSnapshot, s.plannedSeconds, target);
    await tx
      .update(studySessions)
      .set({
        activeSeconds: target,
        overtimeSeconds: Math.max(0, target - s.plannedSeconds),
        pausedSeconds: Math.max(0, secondsBetween(s.startedAt, newEnd) - target),
        endedAt: newEnd,
        completed,
        xpAwarded: Math.min(xp, s.xpAwarded),
        flagged: false,
        flagReason: null,
        correction: "trimmed",
        originalActiveSeconds: s.activeSeconds,
        correctedAt: now,
      })
      .where(eq(studySessions.id, s.id));
    await reverseXp(tx, s, s.xpAwarded - Math.min(xp, s.xpAwarded), "session_trimmed", `Tempo reduzido pela pessoa: ${s.activeSeconds}s → ${target}s.`);
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "session.trimmed",
      entityType: "study_session",
      entityId: s.id,
      metadata: { from: s.activeSeconds, to: target, xpRemoved: s.xpAwarded - Math.min(xp, s.xpAwarded), projectId: s.projectId },
    });
    return { activeSeconds: target, xpRemoved: s.xpAwarded - Math.min(xp, s.xpAwarded) };
  });
}

/** Exclui a sessão: zera o tempo e o XP, mas mantém o registro para auditoria. */
export async function deleteSession(ctx: Ctx, userId: string, sessionId: string) {
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    const s = await editableSession(tx, userId, sessionId, now);
    await tx.delete(sessionSegments).where(eq(sessionSegments.sessionId, s.id));
    await tx
      .update(studySessions)
      .set({
        activeSeconds: 0,
        overtimeSeconds: 0,
        pausedSeconds: 0,
        completed: false,
        xpAwarded: 0,
        flagged: false,
        flagReason: null,
        correction: "deleted",
        originalActiveSeconds: s.originalActiveSeconds ?? s.activeSeconds,
        correctedAt: now,
      })
      .where(eq(studySessions.id, s.id));
    await reverseXp(tx, s, s.xpAwarded, "session_deleted", `Sessão excluída pela pessoa (${s.activeSeconds}s).`);
    await tx.insert(auditLogs).values({
      actorUserId: userId,
      action: "session.deleted",
      entityType: "study_session",
      entityId: s.id,
      metadata: { activeSeconds: s.activeSeconds, xpRemoved: s.xpAwarded, projectId: s.projectId },
    });
    return { removedSeconds: s.activeSeconds, xpRemoved: s.xpAwarded };
  });
}

/** Sessões da semana atual que a pessoa ainda pode corrigir (Painel). */
export async function listCorrectableSessions(ctx: Ctx, userId: string, context?: string) {
  const [profile] = await ctx.db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const start = weekRange(profile?.tz ?? "America/Sao_Paulo", ctx.now()).start;
  const where = [
    eq(studySessions.userId, userId),
    isNotNull(studySessions.endedAt),
    inArray(studySessions.status, ["finished", "abandoned"]),
    gte(studySessions.endedAt, start),
    notDeletedSession,
  ];
  if (context) where.push(sql`${studySessions.context} = ${context}`);
  return ctx.db
    .select({
      id: studySessions.id,
      startedAt: studySessions.startedAt,
      endedAt: studySessions.endedAt,
      plannedSeconds: studySessions.plannedSeconds,
      activeSeconds: studySessions.activeSeconds,
      xpAwarded: studySessions.xpAwarded,
      correction: studySessions.correction,
      originalActiveSeconds: studySessions.originalActiveSeconds,
      topicName: sql<string>`coalesce(${topics.name}, ${projectTasks.title}, ${projects.name})`,
      categoryName: sql<string>`coalesce(${categories.name}, ${projects.name})`,
      categoryColor: sql<string>`coalesce(${categories.color}, ${projects.color})`,
    })
    .from(studySessions)
    .leftJoin(topics, eq(topics.id, studySessions.topicId))
    .leftJoin(categories, eq(categories.id, studySessions.categoryId))
    .leftJoin(projects, eq(projects.id, studySessions.projectId))
    .leftJoin(projectTasks, eq(projectTasks.id, studySessions.taskId))
    .where(and(...where))
    .orderBy(desc(studySessions.startedAt))
    .limit(30);
}
