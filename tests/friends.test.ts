import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { profiles } from "@/server/db/schema";
import { createCategory, createTopic } from "@/server/services/categories";
import { getFriendsRanking, listFriends, removeFriend, respondFriendRequest, sendFriendRequest } from "@/server/services/friends";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

const codeOf = async (id: string) => (await env.db.select({ c: profiles.publicCode }).from(profiles).where(eq(profiles.userId, id)))[0].c!;

async function study(userId: string, minutes: number) {
  const c = await createCategory(env.ctx, userId, { name: `Fac ${minutes}`, context: "personal", usage: "academic" });
  const t = await createTopic(env.ctx, userId, { categoryId: c.id, name: "Genética" });
  const s = await startSession(env.ctx, userId, { topicId: t.id, methodId: "custom", plannedMinutes: minutes });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
}

describe("Amigos", () => {
  it("pedido pelo código, aceitar, desfazer; pedido cruzado vira amizade na hora", async () => {
    const a = await createUser(env.ctx, "Ana");
    const b = await createUser(env.ctx, "Bruno");
    const c = await createUser(env.ctx, "Carla");
    await expect(sendFriendRequest(env.ctx, a.id, await codeOf(a.id))).rejects.toThrow(/seu próprio código/);
    expect(await sendFriendRequest(env.ctx, a.id, (await codeOf(b.id)).toLowerCase())).toEqual({ status: "pending" });
    await expect(sendFriendRequest(env.ctx, a.id, await codeOf(b.id))).rejects.toThrow(/já existe um pedido/);
    expect((await listFriends(env.ctx, b.id)).incoming.map((p) => p.displayName)).toEqual(["Ana"]);
    await respondFriendRequest(env.ctx, b.id, await codeOf(a.id), true);
    expect((await listFriends(env.ctx, a.id)).friends.map((p) => p.displayName)).toEqual(["Bruno"]);

    await sendFriendRequest(env.ctx, c.id, await codeOf(a.id));
    expect(await sendFriendRequest(env.ctx, a.id, await codeOf(c.id))).toEqual({ status: "accepted" });

    await removeFriend(env.ctx, a.id, await codeOf(b.id));
    expect((await listFriends(env.ctx, b.id)).friends).toEqual([]);
  });

  it("ranking entre amigos: você + amigos aceitos, por XP do ranking acadêmico", async () => {
    const a = await createUser(env.ctx, "Ana");
    const b = await createUser(env.ctx, "Bruno");
    const stranger = await createUser(env.ctx, "Estranho");
    await sendFriendRequest(env.ctx, a.id, await codeOf(b.id));
    await respondFriendRequest(env.ctx, b.id, await codeOf(a.id), true);
    await study(a.id, 30);
    await study(b.id, 45);
    await study(stranger.id, 60);
    const board = await getFriendsRanking(env.ctx, a.id, "week");
    expect(board.map((r) => [r.position, r.displayName, r.xp, r.isViewer])).toEqual([
      [1, "Bruno", 45, false],
      [2, "Ana", 30, true],
    ]);
  });
});
