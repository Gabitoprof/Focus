import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { breaks, profiles, sessionSegments, studySessions, xpTransactions } from "@/server/db/schema";
import {
  finishBreak,
  finishSession,
  getTimerState,
  heartbeat,
  pauseSession,
  resumeSession,
  startBreak,
  startSession,
} from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

async function balance(userId: string) {
  const [p] = await env.db.select().from(profiles).where(eq(profiles.userId, userId));
  return p.xpBalance;
}

async function xpRows(userId: string) {
  return env.db.select().from(xpTransactions).where(eq(xpTransactions.userId, userId));
}

/** Estuda `minutes` com heartbeats a cada minuto (como o navegador faz). */
async function studyFor(userId: string, sessionId: string, seconds: number) {
  let left = seconds;
  while (left > 0) {
    const step = Math.min(60, left);
    env.clock.advance(step);
    left -= step;
    await heartbeat(env.ctx, userId, sessionId);
  }
}

async function runSession(userId: string, topicId: string, methodId: string, planned: number | undefined, studiedSeconds: number) {
  const s = await startSession(env.ctx, userId, { topicId, methodId, plannedMinutes: planned });
  await studyFor(userId, s.session!.id, studiedSeconds);
  return finishSession(env.ctx, userId, s.session!.id);
}

describe("XP por ciclo", () => {
  it("1. sessão de 30 minutos concede 30 XP", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "custom", 30, 30 * 60);
    expect(st.lastSession?.xpAwarded).toBe(30);
    expect(await balance(u.id)).toBe(30);
  });

  it("2. sessão de 37 minutos concede 37 XP", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "custom", 37, 37 * 60);
    expect(st.lastSession?.xpAwarded).toBe(37);
    expect(await balance(u.id)).toBe(37);
  });

  it("Pomodoro clássico: ciclo de 25 min concede 25 XP e ignora duração enviada", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "pomodoro_classic", 90, 25 * 60);
    expect(st.lastSession?.plannedSeconds).toBe(25 * 60);
    expect(st.lastSession?.xpAwarded).toBe(25);
  });

  it("3. excedente é contabilizado como estudo, mas não gera XP extra (50 min em ciclo de 30)", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "custom", 30, 50 * 60);
    expect(st.lastSession?.activeSeconds).toBe(50 * 60);
    expect(st.lastSession?.overtimeSeconds).toBe(20 * 60);
    expect(st.lastSession?.xpAwarded).toBe(30);
  });

  it("sessão encerrada antes do planejado registra o tempo e não gera XP", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "custom", 30, 29 * 60);
    expect(st.lastSession?.activeSeconds).toBe(29 * 60);
    expect(st.lastSession?.completed).toBe(false);
    expect(st.lastSession?.xpAwarded).toBe(0);
  });

  it("sessões curtas fora da faixa de XP não pontuam (5 min no personalizado)", async () => {
    const u = await createUser(env.ctx);
    const st = await runSession(u.id, u.topic.id, "custom", 5, 5 * 60);
    expect(st.lastSession?.completed).toBe(true);
    expect(st.lastSession?.xpAwarded).toBe(0);
  });

  it("pausas não contam como estudo", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    const id = s.session!.id;
    await studyFor(u.id, id, 10 * 60);
    await pauseSession(env.ctx, u.id, id);
    env.clock.advance(15 * 60);
    await resumeSession(env.ctx, u.id, id);
    await studyFor(u.id, id, 20 * 60);
    const st = await finishSession(env.ctx, u.id, id);
    expect(st.lastSession?.activeSeconds).toBe(30 * 60);
    expect(st.lastSession?.xpAwarded).toBe(30);
    // A pausa é registrada à parte.
    expect(st.lastSession?.pausedSeconds).toBe(15 * 60);
    expect(st.lastSession?.overtimeSeconds).toBe(0);
  });

  it("pausa não completa o ciclo: 20 min de estudo + 10 de pausa em ciclo de 30 não gera XP", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    await studyFor(u.id, s.session!.id, 20 * 60);
    await pauseSession(env.ctx, u.id, s.session!.id);
    env.clock.advance(10 * 60);
    const st = await finishSession(env.ctx, u.id, s.session!.id);
    expect(st.lastSession?.activeSeconds).toBe(20 * 60);
    expect(st.lastSession?.pausedSeconds).toBe(10 * 60);
    expect(st.lastSession?.xpAwarded).toBe(0);
  });
});

describe("Intervalos e penalidades", () => {
  async function studyThenBreak(userId: string, topicId: string) {
    const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: 30 });
    await studyFor(userId, s.session!.id, 30 * 60);
    return finishSession(env.ctx, userId, s.session!.id, { startBreak: true, breakMinutes: 5 });
  }

  it("4. o intervalo não é contabilizado como estudo", async () => {
    const u = await createUser(env.ctx);
    const st = await studyThenBreak(u.id, u.topic.id);
    expect(st.break).not.toBeNull();
    env.clock.advance(5 * 60);
    const after = await finishBreak(env.ctx, u.id, st.break!.id);
    const sessions = await env.db.select().from(studySessions).where(eq(studySessions.userId, u.id));
    const total = sessions.reduce((a, s) => a + s.activeSeconds, 0);
    expect(total).toBe(30 * 60);
    const segs = await env.db.select().from(sessionSegments).where(eq(sessionSegments.userId, u.id));
    expect(segs.length).toBe(1);
    expect(after.lastBreak?.penaltyXp).toBe(0);
  });

  it("5. intervalo excedido aplica no máximo uma penalidade", async () => {
    const u = await createUser(env.ctx);
    const st = await studyThenBreak(u.id, u.topic.id);
    const breakId = st.break!.id;
    env.clock.advance(5 * 60 + 31);
    // Várias consultas/encerramentos repetidos não multiplicam a penalidade.
    await getTimerState(env.ctx, u.id);
    await finishBreak(env.ctx, u.id, breakId);
    await finishBreak(env.ctx, u.id, breakId);
    env.clock.advance(600);
    await getTimerState(env.ctx, u.id);
    const penalties = (await xpRows(u.id)).filter((r) => r.reason === "break_overrun_penalty");
    expect(penalties).toHaveLength(1);
    expect(penalties[0].amount).toBe(-5);
    expect(await balance(u.id)).toBe(25);
  });

  it("6. intervalo encerrado dentro da tolerância não gera penalidade", async () => {
    const u = await createUser(env.ctx);
    const st = await studyThenBreak(u.id, u.topic.id);
    env.clock.advance(5 * 60 + 30);
    const after = await finishBreak(env.ctx, u.id, st.break!.id, {
      topicId: u.topic.id,
      methodId: "custom",
      plannedMinutes: 30,
    });
    expect(after.lastBreak?.penaltyXp).toBe(0);
    expect(after.session?.status).toBe("running");
    const penalties = (await xpRows(u.id)).filter((r) => r.reason === "break_overrun_penalty");
    expect(penalties).toHaveLength(0);
  });

  it("saldo de XP nunca fica negativo", async () => {
    const u = await createUser(env.ctx);
    // Sessão curta (sem XP) seguida de intervalo excedido.
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 5 });
    await studyFor(u.id, s.session!.id, 5 * 60);
    const st = await finishSession(env.ctx, u.id, s.session!.id, { startBreak: true, breakMinutes: 5 });
    env.clock.advance(20 * 60);
    await finishBreak(env.ctx, u.id, st.break!.id);
    expect(await balance(u.id)).toBe(0);
    const [penalty] = (await xpRows(u.id)).filter((r) => r.reason === "break_overrun_penalty");
    expect(penalty.amount).toBe(0);
    expect(penalty.balanceAfter).toBe(0);
  });

  it("intervalo abandonado é encerrado e penalizado uma única vez", async () => {
    const u = await createUser(env.ctx);
    await studyThenBreak(u.id, u.topic.id);
    env.clock.advance(5 * 60 + 121 * 60);
    const st = await getTimerState(env.ctx, u.id);
    expect(st.break).toBeNull();
    const [b] = await env.db.select().from(breaks).where(eq(breaks.userId, u.id));
    expect(b.status).toBe("abandoned");
    expect(b.penaltyXp).toBe(5);
  });

  it("Pomodoro: o 4º ciclo seguido oferece intervalo longo de 15 min", async () => {
    const u = await createUser(env.ctx);
    let st;
    for (let i = 1; i <= 4; i++) {
      const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "pomodoro_classic" });
      expect(s.session!.cycleIndex).toBe(i);
      await studyFor(u.id, s.session!.id, 25 * 60);
      st = await finishSession(env.ctx, u.id, s.session!.id, { startBreak: true });
      if (i < 4) {
        expect(st.break!.kind).toBe("short");
        expect(st.break!.plannedSeconds).toBe(5 * 60);
        env.clock.advance(5 * 60);
        await finishBreak(env.ctx, u.id, st.break!.id);
      }
    }
    expect(st!.break!.kind).toBe("long");
    expect(st!.break!.plannedSeconds).toBe(15 * 60);
  });
});

describe("Persistência e idempotência", () => {
  it("7. atualizar a página não reinicia nem duplica a sessão", async () => {
    const u = await createUser(env.ctx);
    const first = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    env.clock.advance(120);
    // "Recarregar" = buscar o estado de novo; clique duplo em iniciar = mesma sessão.
    const reload = await getTimerState(env.ctx, u.id);
    const again = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    expect(reload.session!.id).toBe(first.session!.id);
    expect(again.session!.id).toBe(first.session!.id);
    expect(reload.session!.openSegmentStartedAt).toBe(first.session!.openSegmentStartedAt);
    const rows = await env.db.select().from(studySessions).where(eq(studySessions.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("início concorrente cria uma única sessão", async () => {
    const u = await createUser(env.ctx);
    const input = { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 };
    const results = await Promise.allSettled([
      startSession(env.ctx, u.id, input),
      startSession(env.ctx, u.id, input),
      startSession(env.ctx, u.id, input),
    ]);
    expect(results.every((r) => r.status === "fulfilled")).toBe(true);
    const rows = await env.db.select().from(studySessions).where(eq(studySessions.userId, u.id));
    expect(rows).toHaveLength(1);
  });

  it("8. finalizar a sessão duas vezes não duplica registros nem XP", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    await studyFor(u.id, s.session!.id, 30 * 60);
    await finishSession(env.ctx, u.id, s.session!.id);
    env.clock.advance(60);
    await finishSession(env.ctx, u.id, s.session!.id);
    await Promise.all([finishSession(env.ctx, u.id, s.session!.id), finishSession(env.ctx, u.id, s.session!.id)]);
    expect((await xpRows(u.id)).filter((r) => r.reason === "cycle_completed")).toHaveLength(1);
    expect(await balance(u.id)).toBe(30);
    const [row] = await env.db.select().from(studySessions).where(eq(studySessions.id, s.session!.id));
    expect(row.activeSeconds).toBe(30 * 60);
  });

  it("sessão sem heartbeat é encerrada no último sinal; o tempo até ali conta", async () => {
    const u = await createUser(env.ctx);
    const s = await startSession(env.ctx, u.id, { topicId: u.topic.id, methodId: "custom", plannedMinutes: 30 });
    await studyFor(u.id, s.session!.id, 12 * 60);
    env.clock.advance(3 * 3600); // navegador fechado
    const st = await getTimerState(env.ctx, u.id);
    expect(st.session).toBeNull();
    const [row] = await env.db.select().from(studySessions).where(eq(studySessions.id, s.session!.id));
    expect(row.status).toBe("abandoned");
    expect(row.activeSeconds).toBe(12 * 60);
    expect(row.xpAwarded).toBe(0);
  });

  it("não é possível iniciar intervalo sem sessão anterior", async () => {
    const u = await createUser(env.ctx);
    await expect(startBreak(env.ctx, u.id, { minutes: 5 })).rejects.toThrow(/sessão de estudo/);
  });
});
