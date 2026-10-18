import { beforeEach, describe, expect, it } from "vitest";
import { getAchievements, setShowcase } from "@/server/services/achievements";
import { deleteSession } from "@/server/services/corrections";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

let env: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  env = await setup();
});

async function focus(userId: string, topicId: string) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: 30 });
  for (let i = 0; i < 6; i++) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  return s.session!.id;
}

describe("Vitrine de conquistas no ranking", () => {
  it("só aceita conquistas desbloqueadas, no máximo 5, e some se a conquista deixar de valer", async () => {
    const u = await createUser(env.ctx, "Ana");
    await expect(setShowcase(env.ctx, u.id, ["primeiro_foco"])).rejects.toThrow(/já desbloqueou/);
    const id = await focus(u.id, u.topic.id);
    expect(await setShowcase(env.ctx, u.id, ["primeiro_foco", "primeiro_ciclo", "primeiro_foco"])).toEqual(["primeiro_foco", "primeiro_ciclo"]);
    expect((await getAchievements(env.ctx, u.id)).showcase).toEqual(["primeiro_foco", "primeiro_ciclo"]);
    await expect(setShowcase(env.ctx, u.id, ["a", "b", "c", "d", "e", "f"])).rejects.toThrow(/no máximo 5/);
    await expect(setShowcase(env.ctx, u.id, ["nao_existe"])).rejects.toThrow(/inválida/);
    // Sessão excluída: a conquista deixa de valer e sai da vitrine exibida.
    await deleteSession(env.ctx, u.id, id);
    expect((await getAchievements(env.ctx, u.id)).showcase).toEqual([]);
  });
});
