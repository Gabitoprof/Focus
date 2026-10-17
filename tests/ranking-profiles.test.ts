import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { compactNumber, titleFor } from "@/domain/titles";
import { institutionMemberships, institutions, studySessions, user } from "@/server/db/schema";
import { createCategory, createTopic, setCategoryUsage } from "@/server/services/categories";
import { grantManualSubscription } from "@/server/services/entitlements";
import { ensureProfile } from "@/server/services/profile";
import { getLeaderboard, periodStart } from "@/server/services/ranking";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

async function newUser(name: string) {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name, email: `${id}@teste.local` });
  await ensureProfile(env.db, id, name);
  await grantManualSubscription(env.ctx, id, new Date("2030-01-01"));
  return id;
}

async function topicIn(userId: string, opts: { context: "academic" | "personal" | "professional"; usage?: "personal" | "professional" | "academic"; topic: string }) {
  const c = await createCategory(env.ctx, userId, { name: `Cat ${opts.topic}`, context: opts.context, usage: opts.usage });
  const t = await createTopic(env.ctx, userId, { categoryId: c.id, name: opts.topic });
  return { categoryId: c.id, topicId: t.id };
}

async function focus(userId: string, topicId: string, minutes = 30) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: minutes });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(Math.min(5, left) * 60);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  env.clock.advance(60);
  const [row] = await env.db.select().from(studySessions).where(eq(studySessions.id, s.session!.id));
  return row;
}

describe("Perfis, áreas de utilização e ranking geral", () => {
  it("área Acadêmica do Pessoal pontua; áreas pessoal e profissional, não; tema inventado nunca", async () => {
    const u = await newUser("Ana");
    const acadPessoal = await topicIn(u, { context: "personal", usage: "academic", topic: "Genética" });
    const hobby = await topicIn(u, { context: "personal", usage: "personal", topic: "Xadrez" });
    const trabalho = await topicIn(u, { context: "personal", usage: "professional", topic: "Marketing" });
    const inventado = await topicIn(u, { context: "academic", topic: "Meu tema secreto" });
    const oficial = await topicIn(u, { context: "academic", topic: "Estequiometria" });

    expect((await focus(u, acadPessoal.topicId)).ranked).toBe(true);
    expect((await focus(u, hobby.topicId)).ranked).toBe(false);
    expect((await focus(u, trabalho.topicId)).ranked).toBe(false);
    expect((await focus(u, inventado.topicId)).ranked).toBe(false);
    expect((await focus(u, oficial.topicId)).ranked).toBe(true);

    // Os pontos ficam onde foram registrados: mudar a área depois não mexe no passado.
    await setCategoryUsage(env.ctx, u, acadPessoal.categoryId, "personal");
    const board = await getLeaderboard(env.ctx, u, { scope: "global", period: "all" });
    expect(board.status === "ok" && board.rows[0].xp).toBe(60);
    expect((await focus(u, acadPessoal.topicId)).ranked).toBe(false);
  });

  it("a área de utilização só muda no perfil Pessoal; Acadêmico e Profissional são fixos", async () => {
    const u = await newUser("Bia");
    const acad = await topicIn(u, { context: "academic", usage: "personal", topic: "Genética" });
    await expect(setCategoryUsage(env.ctx, u, acad.categoryId, "personal")).rejects.toThrow(/só muda no perfil Pessoal/);
    expect((await focus(u, acad.topicId)).ranked).toBe(true); // Acadêmico ignora a área pedida
  });

  it("linha do ranking: instituição ou sem vínculo, horas na plataforma, título", async () => {
    const a = await newUser("Ana");
    const b = await newUser("Bruno");
    const [inst] = await env.db
      .insert(institutions)
      .values({ kind: "higher", source: "admin", sourceCode: "X1", name: "Universidade Teste", acronym: "UT", normalizedName: "universidade teste" })
      .returning();
    await env.db.insert(institutionMemberships).values({ userId: a, institutionId: inst.id, enrollmentHmac: "h", joinedAt: env.clock.now() });
    const ta = await topicIn(a, { context: "academic", topic: "Genética" });
    const hobby = await topicIn(a, { context: "personal", usage: "personal", topic: "Xadrez" });
    const tb = await topicIn(b, { context: "personal", usage: "academic", topic: "Genética" });
    await focus(a, ta.topicId, 40);
    await focus(a, hobby.topicId, 20);
    await focus(b, tb.topicId, 30);
    const board = await getLeaderboard(env.ctx, a, { scope: "global", period: "week" });
    if (board.status !== "ok") throw new Error(board.status);
    const ana = board.rows.find((r) => r.displayName === "Ana")!;
    const bruno = board.rows.find((r) => r.displayName === "Bruno")!;
    expect(ana).toMatchObject({ institution: { acronym: "UT" }, studiedSeconds: 40 * 60, platformSeconds: 60 * 60, title: "iniciante" });
    expect(bruno.institution).toBeNull();
    expect(JSON.stringify(board)).not.toContain("@teste.local");
  });

  it("período diário começa à meia-noite de Brasília", () => {
    expect(periodStart("day", new Date("2026-03-10T12:00:00Z"))?.toISOString()).toBe("2026-03-10T03:00:00.000Z");
  });

  it("títulos sobem com as horas e o XP é abreviado", () => {
    expect(titleFor(0)).toBe("iniciante");
    expect(titleFor(26 * 3600)).toBe("dedicado");
    expect(titleFor(1200 * 3600)).toBe("lenda");
    expect(compactNumber(950, "pt-BR")).toBe("950");
    expect(compactNumber(1_000_000, "en")).toBe("1M");
  });
});
