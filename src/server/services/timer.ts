import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import {
  computeCycleXp,
  methodRulesSchema,
  resolveBreak,
  resolveStudyMinutes,
  RuleViolation,
  type MethodRules,
} from "@/domain/methods";
import { isRankedCategory, projectKey, taskKey, type AppContext, type Subject } from "@/domain/contexts";
import { computeBreakPenalty, type TimerSettings } from "@/domain/settings";
import {
  auditLogs,
  breaks,
  catalogTopics,
  categories,
  projects,
  projectTasks,
  sessionSegments,
  studyMethods,
  studySessions,
  topics,
} from "../db/schema";
import { AppError, getTimerSettings, lockProfile, secondsBetween, type Ctx, type Tx } from "./common";
import { projectForSession } from "./projects";
import { postXp } from "./xp";

type SessionRow = typeof studySessions.$inferSelect;
type BreakRow = typeof breaks.$inferSelect;

export type TimerState = {
  serverNow: string;
  session: null | {
    id: string;
    status: "running" | "paused";
    context: AppContext;
    /** Em sessões de projeto: tema = tarefa (ou o próprio projeto) e categoria = projeto. */
    topic: { id: string; name: string };
    category: { id: string; name: string; color: string };
    project: { id: string; taskId: string | null } | null;
    method: { id: string; name: string };
    plannedSeconds: number;
    /** Segundos dos segmentos já fechados. */
    closedActiveSeconds: number;
    /** Início do segmento aberto (null quando pausada). */
    openSegmentStartedAt: string | null;
    startedAt: string;
    cycleIndex: number;
  };
  break: null | {
    id: string;
    kind: "short" | "long";
    plannedSeconds: number;
    startedAt: string;
    methodId: string;
    toleranceSeconds: number;
    penaltyXp: number;
  };
  /** Última sessão encerrada recentemente (para oferecer o intervalo e mostrar o resultado). */
  lastSession: null | {
    id: string;
    /** Chaves da seleção do cronômetro (projeto: "p:<id>", tarefa: "t:<id>"). */
    topicId: string;
    categoryId: string;
    methodId: string;
    plannedSeconds: number;
    activeSeconds: number;
    overtimeSeconds: number;
    pausedSeconds: number;
    completed: boolean;
    xpAwarded: number;
    status: string;
    endedAt: string;
    canStartBreak: boolean;
    nextBreak: { kind: "short" | "long"; fixedMinutes: number | null; presets: number[]; min: number; max: number };
  };
  lastBreak: null | { id: string; overrunSeconds: number; penaltyXp: number; endedAt: string };
};

// ---------------------------------------------------------------------------
// Auxiliares internos (sempre dentro de transação com o perfil travado)
// ---------------------------------------------------------------------------

async function closedSegmentSeconds(tx: Tx, sessionId: string): Promise<number> {
  const [row] = await tx
    .select({
      total: sql<number>`coalesce(floor(sum(extract(epoch from (${sessionSegments.endedAt} - ${sessionSegments.startedAt})))), 0)::int`,
    })
    .from(sessionSegments)
    .where(and(eq(sessionSegments.sessionId, sessionId), isNotNull(sessionSegments.endedAt)));
  return Number(row?.total ?? 0);
}

async function openSegment(tx: Tx, sessionId: string) {
  const [seg] = await tx
    .select()
    .from(sessionSegments)
    .where(and(eq(sessionSegments.sessionId, sessionId), isNull(sessionSegments.endedAt)));
  return seg ?? null;
}

async function closeOpenSegment(tx: Tx, sessionId: string, at: Date) {
  const seg = await openSegment(tx, sessionId);
  if (!seg) return;
  const end = at < seg.startedAt ? seg.startedAt : at;
  await tx.update(sessionSegments).set({ endedAt: end }).where(eq(sessionSegments.id, seg.id));
}

async function activeSession(tx: Tx, userId: string) {
  const [s] = await tx
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), inArray(studySessions.status, ["running", "paused"])));
  return s ?? null;
}

async function activeBreak(tx: Tx, userId: string) {
  const [b] = await tx
    .select()
    .from(breaks)
    .where(and(eq(breaks.userId, userId), eq(breaks.status, "running")));
  return b ?? null;
}

async function finalizeSession(
  tx: Tx,
  s: SessionRow,
  endAt: Date,
  status: "finished" | "abandoned",
  endReason: NonNullable<SessionRow["endReason"]>,
  settings: TimerSettings,
) {
  await closeOpenSegment(tx, s.id, endAt);
  const activeSeconds = await closedSegmentSeconds(tx, s.id);
  const overtimeSeconds = Math.max(0, activeSeconds - s.plannedSeconds);
  const completed = activeSeconds >= s.plannedSeconds;
  const xp = computeCycleXp(s.rulesSnapshot, s.plannedSeconds, activeSeconds);
  const flagged = activeSeconds > settings.suspiciousSessionHours * 3600;
  const endedAt = endAt < s.startedAt ? s.startedAt : endAt;
  // Tudo o que não foi estudo entre o início e o fim da sessão foi pausa.
  const pausedSeconds = Math.max(0, secondsBetween(s.startedAt, endedAt) - activeSeconds);

  await tx
    .update(studySessions)
    .set({
      status,
      endedAt,
      activeSeconds,
      overtimeSeconds,
      pausedSeconds,
      completed,
      xpAwarded: xp,
      endReason,
      flagged,
      flagReason: flagged ? `Sessão com mais de ${settings.suspiciousSessionHours}h de estudo efetivo.` : null,
    })
    .where(eq(studySessions.id, s.id));

  if (xp > 0) {
    await postXp(tx, {
      userId: s.userId,
      amount: xp,
      reason: "cycle_completed",
      methodId: s.methodId,
      areaId: s.areaId,
      catalogTopicId: s.catalogTopicId,
      ranked: s.ranked,
      sourceType: "study_session",
      sourceId: s.id,
      at: endedAt,
    });
  }
  if (flagged || status === "abandoned") {
    await tx.insert(auditLogs).values({
      actorUserId: null,
      action: flagged ? "session.flagged" : "session.auto_closed",
      entityType: "study_session",
      entityId: s.id,
      metadata: { userId: s.userId, endReason, activeSeconds },
    });
  }
}

async function finalizeBreak(
  tx: Tx,
  b: BreakRow,
  endAt: Date,
  status: "finished" | "abandoned",
  endReason: NonNullable<BreakRow["endReason"]>,
  settings: TimerSettings,
) {
  const elapsed = secondsBetween(b.startedAt, endAt);
  const overrunSeconds = Math.max(0, elapsed - b.plannedSeconds);
  const penalty = computeBreakPenalty(settings, overrunSeconds);
  let penaltyXp = 0;
  if (penalty > 0) {
    const [prev] = b.sessionId
      ? await tx
          .select({ areaId: studySessions.areaId, catalogTopicId: studySessions.catalogTopicId, ranked: studySessions.ranked })
          .from(studySessions)
          .where(eq(studySessions.id, b.sessionId))
      : [];
    const posted = await postXp(tx, {
      userId: b.userId,
      amount: -penalty,
      reason: "break_overrun_penalty",
      methodId: b.methodId,
      areaId: prev?.areaId ?? null,
      catalogTopicId: prev?.catalogTopicId ?? null,
      ranked: prev?.ranked ?? true,
      sourceType: "break",
      sourceId: b.id,
      note: `Intervalo excedido em ${overrunSeconds}s (tolerância de ${settings.breakToleranceSeconds}s).`,
      at: endAt < b.startedAt ? b.startedAt : endAt,
    });
    penaltyXp = posted ? -posted.amount : 0;
  }
  await tx
    .update(breaks)
    .set({ status, endedAt: endAt < b.startedAt ? b.startedAt : endAt, overrunSeconds, penaltyXp, endReason })
    .where(eq(breaks.id, b.id));
}

/** Encerra sessões e intervalos abandonados deste usuário. */
async function sweepStale(tx: Tx, userId: string, settings: TimerSettings, now: Date) {
  const s = await activeSession(tx, userId);
  if (s?.status === "running") {
    const staleAt = new Date(s.lastHeartbeatAt.getTime() + settings.staleHeartbeatMinutes * 60_000);
    if (now > staleAt) {
      await finalizeSession(tx, s, s.lastHeartbeatAt, "abandoned", "heartbeat_timeout", settings);
    }
  } else if (s?.status === "paused") {
    const [lastSeg] = await tx
      .select({ endedAt: sessionSegments.endedAt })
      .from(sessionSegments)
      .where(eq(sessionSegments.sessionId, s.id))
      .orderBy(desc(sessionSegments.startedAt))
      .limit(1);
    const pausedAt = lastSeg?.endedAt ?? s.startedAt;
    if (now.getTime() - pausedAt.getTime() > settings.maxPausedHours * 3_600_000) {
      await finalizeSession(tx, s, pausedAt, "abandoned", "pause_timeout", settings);
    }
  }

  const b = await activeBreak(tx, userId);
  if (b) {
    const limit = new Date(
      b.startedAt.getTime() + b.plannedSeconds * 1000 + settings.abandonedBreakMinutes * 60_000,
    );
    if (now > limit) await finalizeBreak(tx, b, limit, "abandoned", "abandoned", settings);
  }
}

async function loadMethodRules(tx: Tx, methodId: string) {
  const [m] = await tx.select().from(studyMethods).where(eq(studyMethods.id, methodId));
  if (!m || !m.isActive) throw new AppError("Método de estudo indisponível.", "not_found");
  const rules = methodRulesSchema.parse(m.rules);
  return { method: m, rules };
}

/** Sessão encerrada mais recente que ainda pode receber intervalo. */
async function lastEndedSession(tx: Tx, userId: string) {
  const [s] = await tx
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), inArray(studySessions.status, ["finished", "abandoned"])))
    .orderBy(desc(studySessions.endedAt))
    .limit(1);
  return s ?? null;
}

async function sessionHasBreak(tx: Tx, sessionId: string) {
  const [b] = await tx.select({ id: breaks.id }).from(breaks).where(eq(breaks.sessionId, sessionId));
  return Boolean(b);
}

function wrapRule<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof RuleViolation) throw new AppError(e.message, "invalid");
    throw e;
  }
}

async function createBreak(
  tx: Tx,
  userId: string,
  requestedMinutes: number | undefined,
  now: Date,
): Promise<void> {
  const last = await lastEndedSession(tx, userId);
  if (!last) throw new AppError("O intervalo começa ao terminar uma sessão de estudo.", "invalid");
  if (await sessionHasBreak(tx, last.id)) {
    throw new AppError("Esta sessão já teve um intervalo. Inicie uma nova sessão de estudo.", "conflict");
  }
  const rules = methodRulesSchema.parse(last.rulesSnapshot);
  const { minutes, kind } = wrapRule(() =>
    resolveBreak(rules, requestedMinutes, last.completed ? last.cycleIndex : null),
  );
  await tx.insert(breaks).values({
    userId,
    sessionId: last.id,
    methodId: last.methodId,
    kind,
    plannedSeconds: minutes * 60,
    status: "running",
    startedAt: now,
  });
}

async function createSession(
  tx: Tx,
  userId: string,
  input: SessionInput,
  settings: TimerSettings,
  now: Date,
) {
  const subject = toSubject(input);
  if (subject.kind === "project") {
    const { project, task } = await projectForSession(tx, userId, subject.projectId, subject.taskId);
    await insertSession(tx, userId, input, settings, now, {
      projectId: project.id,
      taskId: task?.id ?? null,
      context: project.context,
      // Projetos ficam fora dos rankings gerais (têm ranking próprio entre participantes).
      ranked: false,
      areaId: null,
      catalogTopicId: null,
    });
    return;
  }
  const [topic] = await tx
    .select({ topic: topics, category: categories, catalogAreaId: catalogTopics.areaId })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .leftJoin(catalogTopics, and(eq(catalogTopics.id, topics.catalogTopicId), eq(catalogTopics.status, "approved")))
    .where(and(eq(topics.id, subject.topicId), eq(topics.userId, userId)));
  if (!topic || topic.topic.deletedAt || topic.category.deletedAt) {
    throw new AppError("Tema não encontrado.", "not_found");
  }
  if (topic.topic.archivedAt || topic.category.archivedAt) {
    throw new AppError("Este tema está arquivado. Restaure-o para estudar.", "invalid");
  }
  // Ranking acadêmico geral: perfil Acadêmico ou área Acadêmica do Pessoal, e só com tema do
  // catálogo oficial (tema inventado não pontua em ranking nenhum).
  const ranked = isRankedCategory(topic.category) && Boolean(topic.catalogAreaId);
  await insertSession(tx, userId, input, settings, now, {
    topicId: topic.topic.id,
    categoryId: topic.category.id,
    context: topic.category.context,
    // A área vem do tema do catálogo (nunca da categoria, que é só organização pessoal):
    // área e tema de uma sessão são sempre coerentes. Tema personalizado → sem área/tema.
    // Fora do contexto Acadêmico: fora dos rankings gerais, sem área nem tema.
    ranked,
    areaId: ranked ? (topic.catalogAreaId ?? null) : null,
    catalogTopicId: ranked && topic.catalogAreaId ? topic.topic.catalogTopicId : null,
  });
}

export type SessionInput = {
  topicId?: string;
  projectId?: string;
  taskId?: string | null;
  methodId: string;
  plannedMinutes?: number;
};

function toSubject(input: SessionInput): Subject {
  if (input.projectId) return { kind: "project", projectId: input.projectId, taskId: input.taskId ?? null };
  if (input.topicId) return { kind: "topic", topicId: input.topicId };
  throw new AppError("Tema inválido.", "invalid");
}

async function insertSession(
  tx: Tx,
  userId: string,
  input: SessionInput,
  settings: TimerSettings,
  now: Date,
  subject: Pick<
    typeof studySessions.$inferInsert,
    "topicId" | "categoryId" | "projectId" | "taskId" | "context" | "ranked" | "areaId" | "catalogTopicId"
  >,
) {
  const { rules } = await loadMethodRules(tx, input.methodId);
  const minutes = wrapRule(() => resolveStudyMinutes(rules, input.plannedMinutes));

  // Contagem de ciclos encadeados (usada no intervalo longo do Pomodoro).
  const [prev] = await tx
    .select()
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), eq(studySessions.methodId, input.methodId)))
    .orderBy(desc(studySessions.startedAt))
    .limit(1);
  let cycleIndex = 1;
  if (prev?.completed && prev.endedAt && now.getTime() - prev.endedAt.getTime() <= settings.cycleChainGapMinutes * 60_000) {
    const every = rules.break.longBreakEvery;
    cycleIndex = every ? (prev.cycleIndex % every) + 1 : prev.cycleIndex + 1;
  }

  const [s] = await tx
    .insert(studySessions)
    .values({
      userId,
      ...subject,
      methodId: input.methodId,
      rulesSnapshot: rules,
      plannedSeconds: minutes * 60,
      status: "running",
      startedAt: now,
      lastHeartbeatAt: now,
      cycleIndex,
    })
    .returning();
  await tx.insert(sessionSegments).values({ sessionId: s.id, userId, startedAt: now });
}

/** Nome e cor do assunto da sessão: tema/categoria, ou tarefa/projeto. */
async function sessionSubject(tx: Tx, s: SessionRow) {
  if (s.projectId) {
    const [p] = await tx.select({ name: projects.name, color: projects.color }).from(projects).where(eq(projects.id, s.projectId));
    const [task] = s.taskId
      ? await tx.select({ title: projectTasks.title }).from(projectTasks).where(eq(projectTasks.id, s.taskId))
      : [];
    return {
      topic: { id: s.taskId ? taskKey(s.taskId) : projectKey(s.projectId), name: task?.title ?? p?.name ?? "" },
      category: { id: projectKey(s.projectId), name: p?.name ?? "", color: p?.color ?? "#274DEA" },
      project: { id: s.projectId, taskId: s.taskId },
    };
  }
  const [info] = await tx
    .select({ topicName: topics.name, categoryName: categories.name, categoryColor: categories.color })
    .from(topics)
    .innerJoin(categories, eq(categories.id, topics.categoryId))
    .where(eq(topics.id, s.topicId!));
  return {
    topic: { id: s.topicId!, name: info?.topicName ?? "" },
    category: { id: s.categoryId!, name: info?.categoryName ?? "", color: info?.categoryColor ?? "#274DEA" },
    project: null,
  };
}

async function buildState(tx: Tx, userId: string, settings: TimerSettings, now: Date): Promise<TimerState> {
  const state: TimerState = { serverNow: now.toISOString(), session: null, break: null, lastSession: null, lastBreak: null };

  const s = await activeSession(tx, userId);
  if (s) {
    const [method] = await tx.select({ name: studyMethods.name }).from(studyMethods).where(eq(studyMethods.id, s.methodId));
    const subject = await sessionSubject(tx, s);
    const seg = await openSegment(tx, s.id);
    state.session = {
      id: s.id,
      status: s.status as "running" | "paused",
      context: s.context,
      ...subject,
      method: { id: s.methodId, name: method?.name ?? "" },
      plannedSeconds: s.plannedSeconds,
      closedActiveSeconds: await closedSegmentSeconds(tx, s.id),
      openSegmentStartedAt: seg ? seg.startedAt.toISOString() : null,
      startedAt: s.startedAt.toISOString(),
      cycleIndex: s.cycleIndex,
    };
  }

  const b = await activeBreak(tx, userId);
  if (b) {
    state.break = {
      id: b.id,
      kind: b.kind,
      plannedSeconds: b.plannedSeconds,
      startedAt: b.startedAt.toISOString(),
      methodId: b.methodId,
      toleranceSeconds: settings.breakToleranceSeconds,
      penaltyXp: settings.breakPenaltyXp,
    };
  }

  if (!s) {
    const last = await lastEndedSession(tx, userId);
    const recentMs = 12 * 3_600_000;
    if (last?.endedAt && now.getTime() - last.endedAt.getTime() < recentMs) {
      const rules: MethodRules = methodRulesSchema.parse(last.rulesSnapshot);
      const hasBreak = await sessionHasBreak(tx, last.id);
      const isLong =
        last.completed &&
        rules.break.longBreakEvery != null &&
        rules.break.longBreakMinutes != null &&
        last.cycleIndex % rules.break.longBreakEvery === 0;
      state.lastSession = {
        id: last.id,
        topicId: last.projectId ? (last.taskId ? taskKey(last.taskId) : projectKey(last.projectId)) : last.topicId!,
        categoryId: last.projectId ? projectKey(last.projectId) : last.categoryId!,
        methodId: last.methodId,
        plannedSeconds: last.plannedSeconds,
        activeSeconds: last.activeSeconds,
        overtimeSeconds: last.overtimeSeconds,
        pausedSeconds: last.pausedSeconds,
        completed: last.completed,
        xpAwarded: last.xpAwarded,
        status: last.status,
        endedAt: last.endedAt.toISOString(),
        canStartBreak: !hasBreak && !b,
        nextBreak: {
          kind: isLong ? "long" : "short",
          fixedMinutes: isLong ? rules.break.longBreakMinutes : rules.break.fixedMinutes,
          presets: rules.break.presets,
          min: rules.break.minMinutes,
          max: rules.break.maxMinutes,
        },
      };
    }
  }

  if (!b) {
    const [lb] = await tx
      .select()
      .from(breaks)
      .where(and(eq(breaks.userId, userId), inArray(breaks.status, ["finished", "abandoned"])))
      .orderBy(desc(breaks.endedAt))
      .limit(1);
    if (lb?.endedAt && now.getTime() - lb.endedAt.getTime() < 12 * 3_600_000) {
      state.lastBreak = {
        id: lb.id,
        overrunSeconds: lb.overrunSeconds,
        penaltyXp: lb.penaltyXp,
        endedAt: lb.endedAt.toISOString(),
      };
    }
  }
  return state;
}

/** Executa uma operação do cronômetro: transação, trava do usuário, limpeza e estado final. */
async function run(ctx: Ctx, userId: string, op?: (tx: Tx, settings: TimerSettings, now: Date) => Promise<void>) {
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    await lockProfile(tx, userId);
    const settings = await getTimerSettings(tx);
    await sweepStale(tx, userId, settings, now);
    if (op) await op(tx, settings, now);
    return buildState(tx, userId, settings, now);
  });
}

// ---------------------------------------------------------------------------
// API pública do serviço
// ---------------------------------------------------------------------------

export function getTimerState(ctx: Ctx, userId: string) {
  return run(ctx, userId);
}

/**
 * Inicia uma sessão. Se já houver sessão ativa, retorna o estado sem criar outra
 * (cliques repetidos e atualizações de página não duplicam). Um intervalo em andamento
 * é encerrado ("voltar aos estudos").
 */
export function startSession(ctx: Ctx, userId: string, input: SessionInput) {
  return run(ctx, userId, async (tx, settings, now) => {
    if (await activeSession(tx, userId)) return;
    const b = await activeBreak(tx, userId);
    if (b) await finalizeBreak(tx, b, now, "finished", "back_to_study", settings);
    await createSession(tx, userId, input, settings, now);
  });
}

async function ownedActiveSession(tx: Tx, userId: string, sessionId: string) {
  const s = await activeSession(tx, userId);
  return s && s.id === sessionId ? s : null;
}

export function pauseSession(ctx: Ctx, userId: string, sessionId: string) {
  return run(ctx, userId, async (tx, _settings, now) => {
    const s = await ownedActiveSession(tx, userId, sessionId);
    if (!s || s.status !== "running") return; // já pausada ou encerrada: nada a fazer
    await closeOpenSegment(tx, s.id, now);
    await tx.update(studySessions).set({ status: "paused" }).where(eq(studySessions.id, s.id));
  });
}

export function resumeSession(ctx: Ctx, userId: string, sessionId: string) {
  return run(ctx, userId, async (tx, _settings, now) => {
    const s = await ownedActiveSession(tx, userId, sessionId);
    if (!s || s.status !== "paused") return;
    await tx.insert(sessionSegments).values({ sessionId: s.id, userId, startedAt: now });
    await tx
      .update(studySessions)
      .set({ status: "running", lastHeartbeatAt: now })
      .where(eq(studySessions.id, s.id));
  });
}

export function heartbeat(ctx: Ctx, userId: string, sessionId: string) {
  return run(ctx, userId, async (tx, _settings, now) => {
    const s = await ownedActiveSession(tx, userId, sessionId);
    if (!s || s.status !== "running") return;
    await tx.update(studySessions).set({ lastHeartbeatAt: now }).where(eq(studySessions.id, s.id));
  });
}

/**
 * Finaliza a sessão. Idempotente: finalizar uma sessão já encerrada não altera nada.
 * Com `breakMinutes` definido (ou método de intervalo fixo e `startBreak`), inicia o intervalo.
 */
export function finishSession(
  ctx: Ctx,
  userId: string,
  sessionId: string,
  opts: { startBreak?: boolean; breakMinutes?: number } = {},
) {
  return run(ctx, userId, async (tx, settings, now) => {
    const s = await ownedActiveSession(tx, userId, sessionId);
    if (!s) return;
    await finalizeSession(tx, s, now, "finished", opts.startBreak ? "break_started" : "user_finished", settings);
    if (opts.startBreak) await createBreak(tx, userId, opts.breakMinutes, now);
  });
}

export function startBreak(ctx: Ctx, userId: string, opts: { minutes?: number } = {}) {
  return run(ctx, userId, async (tx, settings, now) => {
    if (await activeBreak(tx, userId)) return;
    const s = await activeSession(tx, userId);
    if (s) await finalizeSession(tx, s, now, "finished", "break_started", settings);
    await createBreak(tx, userId, opts.minutes, now);
  });
}

/**
 * Encerra o intervalo (antecipadamente ou após o fim). Penalidade aplicada no máximo uma vez.
 * Com `backToStudy`, inicia a próxima sessão na mesma transação.
 */
export function finishBreak(
  ctx: Ctx,
  userId: string,
  breakId: string,
  backToStudy?: SessionInput,
) {
  return run(ctx, userId, async (tx, settings, now) => {
    const b = await activeBreak(tx, userId);
    if (!b || b.id !== breakId) return;
    await finalizeBreak(tx, b, now, "finished", backToStudy ? "back_to_study" : "user_finished", settings);
    if (backToStudy && !(await activeSession(tx, userId))) {
      await createSession(tx, userId, backToStudy, settings, now);
    }
  });
}

/** Manutenção global (rota de cron): encerra sessões/intervalos abandonados de todos os usuários. */
export async function sweepAllStale(ctx: Ctx) {
  const users = await ctx.db
    .selectDistinct({ userId: studySessions.userId })
    .from(studySessions)
    .where(inArray(studySessions.status, ["running", "paused"]))
    .union(ctx.db.selectDistinct({ userId: breaks.userId }).from(breaks).where(eq(breaks.status, "running")));
  for (const { userId } of users) await getTimerState(ctx, userId);
  return users.length;
}

export async function listMethods(ctx: Ctx) {
  const rows = await ctx.db
    .select()
    .from(studyMethods)
    .where(eq(studyMethods.isActive, true))
    .orderBy(studyMethods.sortOrder);
  return rows.map((m) => ({ id: m.id, name: m.name, description: m.description, rules: methodRulesSchema.parse(m.rules) }));
}
