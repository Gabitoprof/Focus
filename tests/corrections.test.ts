import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { profiles, sessionSegments, xpTransactions } from "@/server/db/schema";
import { deleteSession, listCorrectableSessions, trimSession } from "@/server/services/corrections";
import { createProject, getProject } from "@/server/services/projects";
import { getDashboard, listSessions } from "@/server/services/stats";
import { finishSession, heartbeat, startSession, type SessionInput } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

let env: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  env = await setup();
});

/** Sessão de 30 min planejados que fica `minutes` minutos ligada. */
async function focus(userId: string, input: Omit<SessionInput, "methodId" | "plannedMinutes">, minutes: number) {
  const s = await startSession(env.ctx, userId, { ...input, methodId: "custom", plannedMinutes: 30 } as SessionInput);
  for (let i = 0; i < minutes / 5; i++) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  return s.session!.id;
}

const balance = async (userId: string) =>
  (await env.db.select({ xp: profiles.xpBalance }).from(profiles).where(eq(profiles.userId, userId)))[0].xp;
const ledger = async (userId: string) =>
  Number((await env.db.select({ n: sql<number>`coalesce(sum(${xpTransactions.amount}), 0)::int` }).from(xpTransactions).where(eq(xpTransactions.userId, userId)))[0].n);

describe("Correção de sessões (só para menos)", () => {
  it("esqueceu o cronômetro: reduz o tempo cortando do fim; mantém o XP se ainda cumpriu o planejado", async () => {
    const u = await createUser(env.ctx, "Ana");
    const id = await focus(u.id, { topicId: u.topic.id }, 120); // 30 min planejados, 2h ligado
    expect(await balance(u.id)).toBe(30);

    expect(await trimSession(env.ctx, u.id, id, 40)).toEqual({ activeSeconds: 2400, xpRemoved: 0 });
    const [s] = await listSessions(env.ctx, u.id);
    expect(s).toMatchObject({ activeSeconds: 2400, overtimeSeconds: 600, completed: true, xpAwarded: 30, correction: "trimmed", originalActiveSeconds: 7200 });
    const segs = await env.db.select().from(sessionSegments).where(eq(sessionSegments.sessionId, id));
    const total = segs.reduce((a, x) => a + (x.endedAt!.getTime() - x.startedAt.getTime()) / 1000, 0);
    expect(total).toBe(2400);
    expect(await balance(u.id)).toBe(30);

    // Uma redução por sessão; depois, só excluir.
    await expect(trimSession(env.ctx, u.id, id, 35)).rejects.toThrow(/já teve o tempo reduzido/);
  });

  it("reduzir abaixo do planejado tira o XP; nunca aceita acrescentar", async () => {
    const u = await createUser(env.ctx, "Ana");
    const id = await focus(u.id, { topicId: u.topic.id }, 30);
    await expect(trimSession(env.ctx, u.id, id, 30)).rejects.toThrow(/menor que o registrado/);
    await expect(trimSession(env.ctx, u.id, id, 300)).rejects.toThrow(/menor que o registrado/);
    await expect(trimSession(env.ctx, u.id, id, 0)).rejects.toThrow(/mín\. 1 min/);
    expect(await trimSession(env.ctx, u.id, id, 10)).toEqual({ activeSeconds: 600, xpRemoved: 30 });
    expect(await balance(u.id)).toBe(0);
    expect(await ledger(u.id)).toBe(0);
    const reasons = (await env.db.select().from(xpTransactions).where(eq(xpTransactions.userId, u.id))).map((x) => x.reason);
    expect(reasons.sort()).toEqual(["cycle_completed", "session_trimmed"]);
  });

  it("excluir zera tempo e XP, some das listas e contagens, mas fica registrado", async () => {
    const u = await createUser(env.ctx, "Ana");
    await focus(u.id, { topicId: u.topic.id }, 30);
    const id = await focus(u.id, { topicId: u.topic.id }, 30);
    expect(await balance(u.id)).toBe(60);

    expect(await deleteSession(env.ctx, u.id, id)).toEqual({ removedSeconds: 1800, xpRemoved: 30 });
    expect(await balance(u.id)).toBe(30);
    expect(await listSessions(env.ctx, u.id)).toHaveLength(1);
    expect(await listCorrectableSessions(env.ctx, u.id)).toHaveLength(1);
    const d = await getDashboard(env.ctx, u.id, { key: "7d" }, "academic");
    expect(d.totals).toMatchObject({ sessions: 1, allTimeSeconds: 1800 });
    await expect(deleteSession(env.ctx, u.id, id)).rejects.toThrow(/já foi excluída/);
  });

  it("só a própria sessão e só da semana atual (semanas fechadas ficam congeladas)", async () => {
    const u = await createUser(env.ctx, "Ana");
    const other = await createUser(env.ctx, "Bruno");
    env.clock.set("2026-03-06T12:00:00.000Z"); // sexta da semana anterior
    const old = await focus(u.id, { topicId: u.topic.id }, 30);
    env.clock.set("2026-03-10T12:00:00.000Z"); // terça
    const fresh = await focus(u.id, { topicId: u.topic.id }, 30);
    await expect(deleteSession(env.ctx, u.id, old)).rejects.toThrow(/semana atual/);
    await expect(deleteSession(env.ctx, other.id, fresh)).rejects.toThrow(/não encontrada/);
    expect((await listCorrectableSessions(env.ctx, u.id)).map((s) => s.id)).toEqual([fresh]);
  });

  it("no projeto, o grupo vê a correção na atividade e as horas caem", async () => {
    const u = await createUser(env.ctx, "Ana");
    const p = await createProject(env.ctx, u.id, { context: "personal", name: "TCC" });
    const id = await focus(u.id, { projectId: p.id }, 60);
    await trimSession(env.ctx, u.id, id, 20);
    let d = await getProject(env.ctx, u.id, p.id);
    expect(d.recent[0]).toMatchObject({ correction: "trimmed", activeSeconds: 1200, originalSeconds: 3600 });
    await deleteSession(env.ctx, u.id, id);
    d = await getProject(env.ctx, u.id, p.id);
    expect(d.recent[0]).toMatchObject({ correction: "deleted", activeSeconds: 0, originalSeconds: 3600 });
    expect(d.ranking[0]?.seconds ?? 0).toBe(0);
  });
});
