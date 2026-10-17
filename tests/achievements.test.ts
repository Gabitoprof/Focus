import { beforeEach, describe, expect, it } from "vitest";
import { ACHIEVEMENTS, evaluateAchievements } from "@/domain/achievements";
import { getAchievements } from "@/server/services/achievements";
import { createCategory, createTopic } from "@/server/services/categories";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

async function cycle(userId: string, topicId: string, methodId: string, minutes: number) {
  const s = await startSession(env.ctx, userId, { topicId, methodId, plannedMinutes: methodId === "custom" ? minutes : undefined });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  env.clock.advance(60);
}

describe("Conquistas", () => {
  it("cada conquista tem meta positiva e id único", () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
    expect(ACHIEVEMENTS.every((a) => a.target > 0)).toBe(true);
    const all = evaluateAchievements(Object.fromEntries(ACHIEVEMENTS.map((a) => [a.metric, 0])) as never);
    expect(all.every((a) => !a.unlocked && a.current === 0)).toBe(true);
  });

  it("calcula o progresso a partir do que foi registrado (todos os perfis, no fuso da pessoa)", async () => {
    // 05:00 em São Paulo (08:00 UTC): sessão de madrugador.
    env.clock.set("2026-03-10T08:00:00.000Z");
    const u = await createUser(env.ctx, "Ana");
    const exatas = await createCategory(env.ctx, u.id, { name: "Exatas", context: "personal", usage: "academic" });
    const mat = await createTopic(env.ctx, u.id, { categoryId: exatas.id, name: "Estequiometria" });
    const gen = await createTopic(env.ctx, u.id, { categoryId: exatas.id, name: "Genética" });
    await cycle(u.id, mat.id, "pomodoro_classic", 25);
    await cycle(u.id, gen.id, "custom", 30);
    const { list, unlocked } = await getAchievements(env.ctx, u.id);
    const get = (id: string) => list.find((a) => a.id === id)!;
    expect(get("primeiro_foco").unlocked).toBe(true);
    expect(get("primeiro_ciclo").unlocked).toBe(true);
    expect(get("dez_ciclos")).toMatchObject({ unlocked: false, current: 2, target: 10 });
    expect(get("madrugador").unlocked).toBe(true);
    expect(get("coruja").unlocked).toBe(false);
    expect(get("explorador")).toMatchObject({ current: 2, target: 3 });
    expect(get("horas_10").current).toBe(0);
    expect(get("primeiro_amigo").unlocked).toBe(false);
    expect(unlocked).toBeGreaterThanOrEqual(3);
  });
});
