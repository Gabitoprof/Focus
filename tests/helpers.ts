import { randomUUID } from "node:crypto";
import { createTestDb, type DB } from "@/server/db";
import { user } from "@/server/db/schema";
import type { Ctx } from "@/server/services/common";
import { createCategory, createTopic } from "@/server/services/categories";
import { ensureProfile } from "@/server/services/profile";

/** Relógio controlável para simular a passagem do tempo nos testes. */
export class FakeClock {
  constructor(private t = new Date("2026-03-10T12:00:00.000Z")) {}
  now = () => new Date(this.t.getTime());
  advance(seconds: number) {
    this.t = new Date(this.t.getTime() + seconds * 1000);
  }
  set(iso: string) {
    this.t = new Date(iso);
  }
}

export async function setup() {
  const db: DB = await createTestDb();
  const clock = new FakeClock();
  const ctx: Ctx = { db, now: clock.now };
  return { db, clock, ctx };
}

export async function createUser(ctx: Ctx, name = "Estudante") {
  const id = randomUUID();
  await ctx.db.insert(user).values({ id, name, email: `${id}@teste.local` });
  await ensureProfile(ctx.db, id, name);
  const category = await createCategory(ctx, id, { name: "Cisco Networking Academy" });
  const topic = await createTopic(ctx, id, { categoryId: category.id, name: "Fundamentos de redes" });
  return { id, category, topic };
}
