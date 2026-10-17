import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { appSettings, institutionMemberships, institutions, organizations, user } from "@/server/db/schema";
import { createCategory, createTopic } from "@/server/services/categories";
import { grantManualSubscription } from "@/server/services/entitlements";
import { updateOrgPublicPage } from "@/server/services/organizations";
import { ensureProfile } from "@/server/services/profile";
import { getInstitutionProfile, getInstitutionsLeaderboard, weeklyMedals } from "@/server/services/ranking";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  // Terça-feira; uma instituição com 1 aluno ativo já entra (para o teste ficar pequeno).
  env.clock.set("2026-03-10T12:00:00.000Z");
  const [row] = await env.db.select().from(appSettings).where(eq(appSettings.key, "catalog"));
  await env.db.update(appSettings).set({ value: { ...(row.value as object), institutionMinActive: 1 } }).where(eq(appSettings.key, "catalog"));
});

async function inst(name: string) {
  const [i] = await env.db
    .insert(institutions)
    .values({ kind: "higher", source: "admin", sourceCode: name, name, acronym: name, normalizedName: name.toLowerCase() })
    .returning();
  return i.id;
}

async function student(institutionId: string) {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name: "Aluno", email: `${id}@t.local` });
  await ensureProfile(env.db, id, "Aluno");
  await grantManualSubscription(env.ctx, id, new Date("2030-01-01"));
  await env.db.insert(institutionMemberships).values({ userId: id, institutionId, enrollmentHmac: randomUUID(), joinedAt: new Date("2026-01-01") });
  const c = await createCategory(env.ctx, id, { name: "Faculdade", context: "personal", usage: "academic" });
  const t = await createTopic(env.ctx, id, { categoryId: c.id, name: "Genética" });
  return { id, topicId: t.id };
}

async function study(u: { id: string; topicId: string }, minutes: number) {
  const s = await startSession(env.ctx, u.id, { topicId: u.topicId, methodId: "custom", plannedMinutes: minutes });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(300);
    await heartbeat(env.ctx, u.id, s.session!.id);
  }
  await finishSession(env.ctx, u.id, s.session!.id);
}

describe("Medalhas e página da instituição", () => {
  it("pódio de cada semana fechada vira medalha; a semana atual não conta", async () => {
    const a = await inst("UFA");
    const b = await inst("UFB");
    const sa = await student(a);
    const sb = await student(b);
    // Semana passada: A estuda mais.
    env.clock.set("2026-03-03T12:00:00.000Z");
    await study(sa, 60);
    await study(sb, 30);
    // Semana atual: B estuda mais (ainda não vale medalha).
    env.clock.set("2026-03-10T12:00:00.000Z");
    await study(sb, 45);
    const medals = await weeklyMedals(env.ctx, "higher", 1);
    expect(medals.get(a)).toEqual({ gold: 1, silver: 0, bronze: 0 });
    expect(medals.get(b)).toEqual({ gold: 0, silver: 1, bronze: 0 });

    const board = await getInstitutionsLeaderboard(env.ctx, sa.id, { kind: "higher", period: "all" });
    expect(board.rows.map((r) => [r.acronym, r.medals.gold])).toEqual([["UFB", 0], ["UFA", 1]]);
    const total = await getInstitutionsLeaderboard(env.ctx, sa.id, { kind: "higher", period: "all", sort: "total" });
    expect(total.rows[0]).toMatchObject({ acronym: "UFB", totalSeconds: 75 * 60, totalXp: 75 });
  });

  it("página: números, medalhas e o texto da instituição verificada", async () => {
    const a = await inst("UFA");
    const sa = await student(a);
    await study(sa, 30);
    const before = await getInstitutionProfile(env.ctx, sa.id, a);
    expect(before).toMatchObject({ verified: false, page: null, members: 1, week: { position: 1, activeMembers: 1, totalSeconds: 30 * 60 } });

    const [org] = await env.db
      .insert(organizations)
      .values({
        kind: "institution", cnpj: "11222333000181", legalName: "UFA", alias: "UFA", institutionId: a, requesterUserId: sa.id,
        requesterRole: "Reitor", contactEmail: "r@ufa.edu.br", message: "x", status: "approved",
        checks: { cnpjActive: true, educationActivity: true, corporateDomain: true, domainMatchesCnpj: true, requesterIsMember: true, emailConfirmed: true },
      })
      .returning();
    const { organizationMembers } = await import("@/server/db/schema");
    await env.db.insert(organizationMembers).values({ organizationId: org.id, userId: sa.id, role: "owner", status: "active", joinedAt: env.clock.now() });
    await expect(updateOrgPublicPage(env.ctx, sa.id, org.id, { website: "http://inseguro" })).rejects.toThrow(/https/);
    await updateOrgPublicPage(env.ctx, sa.id, org.id, { about: "Universidade pública.", whyStudy: "Laboratórios.", website: "https://ufa.edu.br" });
    const after = await getInstitutionProfile(env.ctx, sa.id, a);
    expect(after).toMatchObject({ verified: true, page: { about: "Universidade pública.", whyStudy: "Laboratórios.", website: "https://ufa.edu.br" } });
  });
});
