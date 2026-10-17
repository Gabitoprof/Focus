import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { profiles, sessionSegments, studySessions } from "@/server/db/schema";
import { deleteCategory, listCategories, updateCategory } from "@/server/services/categories";
import { updateProfile } from "@/server/services/profile";
import { getDashboard, listSessions } from "@/server/services/stats";
import { finishSession, heartbeat, pauseSession, resumeSession, startSession } from "@/server/services/timer";
import { localDayKey, resolveRange, secondsByLocalDay, computeStreaks } from "@/domain/time";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

async function study(userId: string, topicId: string, minutes: number, planned = minutes) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: planned });
  for (let i = 0; i < minutes; i++) {
    env.clock.advance(60);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  return finishSession(env.ctx, userId, s.session!.id);
}

describe("Isolamento entre usuários", () => {
  it("10. um usuário não consulta nem altera sessões e categorias de outro", async () => {
    const a = await createUser(env.ctx, "Ana");
    const b = await createUser(env.ctx, "Bruno");
    await study(a.id, a.topic.id, 30);

    expect(await listSessions(env.ctx, b.id)).toHaveLength(0);
    expect((await listCategories(env.ctx, b.id)).map((c) => c.id)).not.toContain(a.category.id);
    const dashB = await getDashboard(env.ctx, b.id, { key: "30d" });
    expect(dashB.totals.allTimeSeconds).toBe(0);

    await expect(updateCategory(env.ctx, b.id, a.category.id, { name: "Hack" })).rejects.toThrow(/não encontrad[oa]/);
    await expect(deleteCategory(env.ctx, b.id, a.category.id)).rejects.toThrow(/não encontrad[oa]/);
    // B não consegue estudar no tema de A.
    await expect(
      startSession(env.ctx, b.id, { topicId: a.topic.id, methodId: "custom", plannedMinutes: 30 }),
    ).rejects.toThrow(/Tema não encontrado/);
    // B não consegue pausar a sessão de A.
    const s = await startSession(env.ctx, a.id, { topicId: a.topic.id, methodId: "custom", plannedMinutes: 30 });
    await pauseSession(env.ctx, b.id, s.session!.id);
    const [row] = await env.db.select().from(studySessions).where(eq(studySessions.id, s.session!.id));
    expect(row.status).toBe("running");
  });

  it("9. o usuário não altera o próprio XP pelas funções expostas", async () => {
    const a = await createUser(env.ctx);
    // Campos extras enviados por um cliente malicioso são ignorados.
    await updateProfile(env.ctx, a.id, { displayName: "Novo", xpBalance: 99999 } as never);
    const [p] = await env.db.select().from(profiles).where(eq(profiles.userId, a.id));
    expect(p.displayName).toBe("Novo");
    expect(p.xpBalance).toBe(0);
  });
});

describe("Dashboard", () => {
  it("14. totais correspondem aos registros persistidos", async () => {
    const u = await createUser(env.ctx);
    await study(u.id, u.topic.id, 30);
    env.clock.advance(3600);
    await study(u.id, u.topic.id, 45, 30);

    const dash = await getDashboard(env.ctx, u.id, { key: "today" });
    const sessions = await env.db.select().from(studySessions).where(eq(studySessions.userId, u.id));
    const segs = await env.db.select().from(sessionSegments).where(eq(sessionSegments.userId, u.id));
    const segTotal = segs.reduce((a, s) => a + (s.endedAt!.getTime() - s.startedAt.getTime()) / 1000, 0);
    const sessionTotal = sessions.reduce((a, s) => a + s.activeSeconds, 0);

    expect(sessionTotal).toBe(75 * 60);
    expect(segTotal).toBe(75 * 60);
    expect(dash.totals.allTimeSeconds).toBe(75 * 60);
    expect(dash.totals.todaySeconds).toBe(75 * 60);
    expect(dash.period.overtimeSeconds).toBe(15 * 60);
    expect(dash.period.plannedSeconds).toBe(60 * 60);
    expect(dash.totals.completedCycles).toBe(2);
    expect(dash.totals.xpBalance).toBe(60);
    expect(dash.byCategory[0].seconds).toBe(75 * 60);
    expect(dash.period.pausedSeconds).toBe(0);
    expect(dash.byTopic[0].seconds).toBe(75 * 60);
    expect(dash.perDay.reduce((a, d) => a + d.seconds, 0)).toBe(75 * 60);
  });

  it("excluir uma categoria não apaga o histórico", async () => {
    const u = await createUser(env.ctx);
    await study(u.id, u.topic.id, 30);
    await deleteCategory(env.ctx, u.id, u.category.id);
    expect(await listCategories(env.ctx, u.id)).toHaveLength(0);
    expect(await listSessions(env.ctx, u.id)).toHaveLength(1);
    const dash = await getDashboard(env.ctx, u.id, { key: "today" });
    expect(dash.totals.allTimeSeconds).toBe(30 * 60);
  });

  it("15. o tempo diário respeita o fuso horário configurado", async () => {
    const u = await createUser(env.ctx);
    // 02:30 UTC = 23:30 do dia anterior em São Paulo (UTC-3).
    env.clock.set("2026-03-11T02:30:00.000Z");
    await study(u.id, u.topic.id, 60);
    // Sessão das 23:30 às 00:30 em São Paulo: 30 min em cada dia local.
    const dashSp = await getDashboard(env.ctx, u.id, { key: "today" });
    expect(dashSp.totals.todaySeconds).toBe(30 * 60);
    const dash7 = await getDashboard(env.ctx, u.id, { key: "7d" });
    expect(dash7.perDay).toEqual([
      { day: "2026-03-10", seconds: 30 * 60 },
      { day: "2026-03-11", seconds: 30 * 60 },
    ]);

    // Mesmo registro visto em UTC: todo o estudo cai em 11/03.
    await updateProfile(env.ctx, u.id, { timezone: "UTC" });
    const dashUtc = await getDashboard(env.ctx, u.id, { key: "7d" });
    expect(dashUtc.perDay).toEqual([{ day: "2026-03-11", seconds: 60 * 60 }]);
  });
});

describe("Pausas no dashboard", () => {
  it("tempo pausado aparece à parte e não soma nas horas estudadas", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    for (let i = 0; i < 10; i++) {
      env.clock.advance(60);
      await heartbeat(env.ctx, u.id, s.session!.id);
    }
    await pauseSession(env.ctx, u.id, s.session!.id);
    env.clock.advance(7 * 60);
    await finishSession(env.ctx, u.id, s.session!.id);
    const dash = await getDashboard(env.ctx, u.id, { key: "today" });
    expect(dash.totals.todaySeconds).toBe(10 * 60);
    expect(dash.period.studiedSeconds).toBe(10 * 60);
    expect(dash.period.pausedSeconds).toBe(7 * 60);
    expect(dash.period.pausedSessions).toBe(1);
    const [row] = await listSessions(env.ctx, u.id);
    expect(row.pausedSeconds).toBe(7 * 60);
  });
});

describe("Sessão em andamento no dashboard", () => {
  it("excedente e pausa da sessão aberta aparecem ao vivo, sem esperar o encerramento", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 25 });
    const id = s.session!.id;
    for (let i = 0; i < 10; i++) {
      env.clock.advance(60);
      await heartbeat(env.ctx, u.id, id);
    }
    await pauseSession(env.ctx, u.id, id);
    env.clock.advance(5 * 60);
    await resumeSession(env.ctx, u.id, id);
    for (let i = 0; i < 20; i++) {
      env.clock.advance(60);
      await heartbeat(env.ctx, u.id, id);
    }
    // 30 min estudados (5 excedentes) + 5 min de pausa; sessão ainda aberta.
    const dash = await getDashboard(env.ctx, u.id, { key: "today" });
    expect(dash.live?.activeSeconds).toBe(30 * 60);
    expect(dash.live?.overtimeSeconds).toBe(5 * 60);
    expect(dash.live?.pausedSeconds).toBe(5 * 60);
    expect(dash.totals.todaySeconds).toBe(30 * 60);
    expect(dash.totals.allTimeSeconds).toBe(30 * 60);
    expect(dash.period.studiedSeconds).toBe(30 * 60);
    expect(dash.period.overtimeSeconds).toBe(5 * 60);
    expect(dash.period.pausedSeconds).toBe(5 * 60);
    expect(dash.byTopic[0].seconds).toBe(30 * 60);
    const [cat] = await listCategories(env.ctx, u.id);
    expect(cat.topics[0].totalSeconds).toBe(30 * 60);

    // Ao encerrar, os números permanecem os mesmos (sem contar duas vezes).
    await finishSession(env.ctx, u.id, id);
    const after = await getDashboard(env.ctx, u.id, { key: "today" });
    expect(after.live).toBeNull();
    expect(after.totals.todaySeconds).toBe(30 * 60);
    expect(after.period.overtimeSeconds).toBe(5 * 60);
    expect(after.period.pausedSeconds).toBe(5 * 60);
  });
});

describe("Funções de tempo", () => {
  it("resolve 'hoje' a partir da meia-noite local", () => {
    const now = new Date("2026-03-11T02:30:00.000Z");
    const r = resolveRange("today", "America/Sao_Paulo", now);
    expect(r.start.toISOString()).toBe("2026-03-10T03:00:00.000Z");
    expect(localDayKey(now, "America/Sao_Paulo")).toBe("2026-03-10");
  });

  it("divide estudo que cruza a meia-noite", () => {
    const m = secondsByLocalDay(
      [{ start: new Date("2026-03-11T02:40:00Z"), end: new Date("2026-03-11T03:30:00Z") }],
      "America/Sao_Paulo",
    );
    expect(Object.fromEntries(m)).toEqual({ "2026-03-10": 20 * 60, "2026-03-11": 30 * 60 });
  });

  it("calcula sequência atual e maior sequência", () => {
    const days = ["2026-03-01", "2026-03-02", "2026-03-03", "2026-03-07", "2026-03-08"];
    expect(computeStreaks(days, "2026-03-09")).toEqual({ current: 2, longest: 3 });
    expect(computeStreaks(days, "2026-03-10")).toEqual({ current: 0, longest: 3 });
  });
});
