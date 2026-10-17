import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { normalizeTerm } from "@/domain/catalog";
import { catalogTermUsage, catalogTopics, profiles, studySessions, topics, user, xpTransactions } from "@/server/db/schema";
import { linkTopicToCatalog, setCategoryArea } from "@/server/services/catalog";
import { createCategory, createTopic, makeCategoryPersonal } from "@/server/services/categories";
import { grantManualSubscription } from "@/server/services/entitlements";
import { ensureProfile } from "@/server/services/profile";
import { getLeaderboard } from "@/server/services/ranking";
import { getDashboard } from "@/server/services/stats";
import { finishBreak, finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

async function newUser(name = "Ana") {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name, email: `${id}@teste.local` });
  await ensureProfile(env.db, id, name);
  await grantManualSubscription(env.ctx, id, new Date("2030-01-01"));
  return id;
}

async function cycle(userId: string, topicId: string, opts: { breakOverrun?: number } = {}) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: 30 });
  for (let i = 0; i < 6; i++) {
    env.clock.advance(5 * 60);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  const st = await finishSession(env.ctx, userId, s.session!.id, { startBreak: opts.breakOverrun != null, breakMinutes: 5 });
  if (opts.breakOverrun != null) {
    env.clock.advance(5 * 60 + opts.breakOverrun);
    await finishBreak(env.ctx, userId, st.break!.id);
  }
  env.clock.advance(60);
  return s.session!.id;
}

describe("Categoria pessoal", () => {
  it("ganha XP e aparece no dashboard, mas fica fora de todos os rankings", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Trabalho", context: "personal" });
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "Relatórios" });
    await cycle(u, t.id);

    const [p] = await env.db.select().from(profiles).where(eq(profiles.userId, u));
    expect(p.xpBalance).toBe(30);
    expect((await getDashboard(env.ctx, u, { key: "today" }, "personal")).totals.todaySeconds).toBe(30 * 60);

    const global = await getLeaderboard(env.ctx, u, { scope: "global", period: "all" });
    const method = await getLeaderboard(env.ctx, u, { scope: "global", period: "all", methodId: "custom" });
    if (global.status !== "ok" || method.status !== "ok") throw new Error("status");
    expect(global.participants).toBe(0);
    expect(method.participants).toBe(0);
  });

  it("no ranking só entra o XP das categorias de estudo", async () => {
    const u = await newUser();
    const estudo = await createCategory(env.ctx, u, { name: "Faculdade" });
    const pessoal = await createCategory(env.ctx, u, { name: "Academia", context: "personal" });
    const t1 = await createTopic(env.ctx, u, { categoryId: estudo.id, name: "Cálculo" });
    const t2 = await createTopic(env.ctx, u, { categoryId: pessoal.id, name: "Treino" });
    await cycle(u, t1.id);
    await cycle(u, t2.id);
    const lb = await getLeaderboard(env.ctx, u, { scope: "global", period: "all" });
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(lb.viewer?.xp).toBe(30); // saldo total é 60, ranking só 30
    expect(lb.viewer?.studiedSeconds).toBe(30 * 60);
  });

  it("não tem área, não vincula ao catálogo e não vota na comunidade", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Hobby", context: "personal", areaId: "exatas" });
    expect(c.areaId).toBeNull();
    // Nome igual ao catálogo, mas não é vinculado.
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "Matemática" });
    expect(t.catalogTopicId).toBeNull();
    await createTopic(env.ctx, u, { categoryId: c.id, name: "Assunto inventado pessoal" });
    const usage = await env.db.select().from(catalogTermUsage).where(eq(catalogTermUsage.userId, u));
    expect(usage).toHaveLength(0);
    const [pending] = await env.db
      .select()
      .from(catalogTopics)
      .where(eq(catalogTopics.normalizedName, normalizeTerm("Assunto inventado pessoal")));
    expect(pending).toBeUndefined();

    await expect(setCategoryArea(env.ctx, u, c.id, "exatas")).rejects.toThrow(/contexto Acadêmico/);
    const [mat] = await env.db.select().from(catalogTopics).where(eq(catalogTopics.normalizedName, "matematica"));
    await expect(linkTopicToCatalog(env.ctx, u, t.id, mat.id)).rejects.toThrow(/contexto Acadêmico/);
  });

  it("tornar pessoal vale daqui para frente e não tem volta", async () => {
    const u = await newUser();
    const c = await createCategory(env.ctx, u, { name: "Cursos", areaId: "exatas" });
    const t = await createTopic(env.ctx, u, { categoryId: c.id, name: "Matemática" });
    expect(t.catalogTopicId).not.toBeNull();
    const before = await cycle(u, t.id);

    await makeCategoryPersonal(env.ctx, u, c.id);
    const [topic] = await env.db.select().from(topics).where(eq(topics.id, t.id));
    expect(topic.catalogTopicId).toBeNull();
    const after = await cycle(u, t.id, { breakOverrun: 60 });

    const [s1] = await env.db.select().from(studySessions).where(eq(studySessions.id, before));
    const [s2] = await env.db.select().from(studySessions).where(eq(studySessions.id, after));
    expect(s1.ranked).toBe(true); // o passado não muda
    expect(s2.ranked).toBe(false);
    expect(s2.areaId).toBeNull();

    // A penalidade do intervalo após a sessão pessoal também fica fora do ranking.
    const [penalty] = await env.db
      .select()
      .from(xpTransactions)
      .where(and(eq(xpTransactions.userId, u), eq(xpTransactions.reason, "break_overrun_penalty")));
    expect(penalty.ranked).toBe(false);

    // Não há volta: a categoria não aceita área de novo.
    await expect(setCategoryArea(env.ctx, u, c.id, "exatas")).rejects.toThrow(/contexto Acadêmico/);
  });
});
