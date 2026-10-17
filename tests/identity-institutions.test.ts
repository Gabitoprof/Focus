import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { DEFAULT_CATALOG_SETTINGS } from "@/domain/catalog";
import { isValidCpf } from "@/domain/identity";
import { appSettings, institutions, profiles, user, userIdentity } from "@/server/db/schema";
import { createCategory, createTopic } from "@/server/services/categories";
import { grantManualSubscription } from "@/server/services/entitlements";
import { digitsOnlyVerifier } from "@/server/cpf-verification";
import { getIdentity, registerCpf, releaseCpf } from "@/server/services/identity";

const BIRTH = "2000-01-01";
import { getMembership, joinInstitution, searchInstitutions, upsertInstitutions } from "@/server/services/institutions";
import { ensureProfile } from "@/server/services/profile";
import { getInstitutionsLeaderboard, getLeaderboard } from "@/server/services/ranking";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

// CPFs válidos pelos dígitos verificadores (números de exemplo, não pertencem a pessoas reais conhecidas).
const CPF_A = "529.982.247-25";
const CPF_B = "123.456.789-09";
/** Gera um CPF válido (dígitos verificadores corretos) a partir de 9 dígitos base. */
function makeCpf(n: number): string {
  const d = String(100000000 + n).slice(-9).split("").map(Number);
  for (const len of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += d[i] * (len + 1 - i);
    d.push(((sum * 10) % 11) % 10);
  }
  return d.join("");
}
const VALID_CPFS = Array.from({ length: 6 }, (_, i) => makeCpf(234567 + i * 7919));

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
  await upsertInstitutions(env.db, [
    { kind: "higher", source: "emec", sourceCode: "T1", name: "Universidade Teste de Minas", acronym: "UTM", city: "Belo Horizonte", uf: "MG" },
    { kind: "higher", source: "emec", sourceCode: "T2", name: "Faculdade Exemplo Paulista", acronym: "FEP", city: "São Paulo", uf: "SP" },
    { kind: "school", source: "inep", sourceCode: "99999999", name: "Escola Estadual Teste", city: "Contagem", uf: "MG" },
  ]);
});

async function newUser(name: string, premium = false) {
  const id = randomUUID();
  await env.db.insert(user).values({ id, name, email: `${id}@teste.local` });
  await ensureProfile(env.db, id, name);
  const c = await createCategory(env.ctx, id, { name: "Estudos" });
  const t = await createTopic(env.ctx, id, { categoryId: c.id, name: "Metodologia Científica" });
  if (premium) await grantManualSubscription(env.ctx, id, new Date("2030-01-01"));
  return { id, topicId: t.id };
}

async function inst(code: string) {
  const [i] = await env.db.select().from(institutions).where(eq(institutions.sourceCode, code));
  return i.id;
}

async function cycle(u: { id: string; topicId: string }, minutes = 30) {
  const s = await startSession(env.ctx, u.id, { topicId: u.topicId, methodId: "custom", plannedMinutes: minutes });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(Math.min(5, left) * 60);
    await heartbeat(env.ctx, u.id, s.session!.id);
  }
  await finishSession(env.ctx, u.id, s.session!.id);
  env.clock.advance(60);
}

describe("CPF e código da conta", () => {
  it("valida dígitos verificadores", () => {
    expect(isValidCpf(CPF_A)).toBe(true);
    expect(isValidCpf(CPF_B)).toBe(true);
    expect(isValidCpf("529.982.247-24")).toBe(false);
    expect(isValidCpf("111.111.111-11")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("cada conta tem um código público único", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const rows = await env.db.select({ code: profiles.publicCode }).from(profiles);
    const codes = rows.map((r) => r.code);
    expect(codes.every((c) => /^FCS-[2-9A-HJKMNP-Z]{8}$/.test(c ?? ""))).toBe(true);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).not.toContain(a.id);
    expect(codes).not.toContain(b.id);
  });

  it("um CPF só pode ficar em uma conta; o CPF não é gravado", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    await registerCpf(env.ctx, a.id, CPF_A, BIRTH, digitsOnlyVerifier);
    // Mesmo CPF com outra formatação, em outra conta → recusado.
    await expect(registerCpf(env.ctx, b.id, "52998224725", BIRTH, digitsOnlyVerifier)).rejects.toThrow(/já está vinculado a outra conta/);
    // A mesma conta não troca o CPF por conta própria.
    await expect(registerCpf(env.ctx, a.id, CPF_B, BIRTH, digitsOnlyVerifier)).rejects.toThrow(/já tem um CPF/);
    await expect(registerCpf(env.ctx, b.id, "000.000.000-00", BIRTH, digitsOnlyVerifier)).rejects.toThrow(/inválido/);

    const [row] = await env.db.select().from(userIdentity).where(eq(userIdentity.userId, a.id));
    expect(row.cpfHmac).toMatch(/^[0-9a-f]{64}$/);
    const dump = JSON.stringify(await env.db.execute(sql`select * from user_identity`));
    expect(dump).not.toContain("52998224725");
    expect(dump).not.toContain("529.982.247");
    expect(await getIdentity(env.ctx, a.id)).toMatchObject({ hasCpf: true, masked: "•••.•••.•••-25" });
  });

  it("cadastros simultâneos com o mesmo CPF: só um vence", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const results = await Promise.allSettled([registerCpf(env.ctx, a.id, CPF_A, BIRTH, digitsOnlyVerifier), registerCpf(env.ctx, b.id, CPF_A, BIRTH, digitsOnlyVerifier)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("admin libera o CPF (disputa) e ele pode ser usado por outra conta", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    await registerCpf(env.ctx, a.id, CPF_A, BIRTH, digitsOnlyVerifier);
    await releaseCpf(env.ctx, "admin", a.id, "CPF usado indevidamente");
    await registerCpf(env.ctx, b.id, CPF_A, BIRTH, digitsOnlyVerifier);
    expect((await getIdentity(env.ctx, b.id)).hasCpf).toBe(true);
  });
});

describe("Instituições", () => {
  it("busca por nome sem acento ou por sigla", async () => {
    expect((await searchInstitutions(env.ctx, { query: "paulista" })).map((i) => i.acronym)).toEqual(["FEP"]);
    expect((await searchInstitutions(env.ctx, { query: "UTM" })).map((i) => i.name)).toEqual(["Universidade Teste de Minas"]);
    expect((await searchInstitutions(env.ctx, { query: "teste", kind: "school" })).map((i) => i.uf)).toEqual(["MG"]);
    expect(await searchInstitutions(env.ctx, { query: "%" })).toEqual([]);
  });

  it("importação é idempotente e marca extintas sem apagar", async () => {
    await upsertInstitutions(env.db, [
      { kind: "higher", source: "emec", sourceCode: "T1", name: "Universidade Teste de Minas", acronym: "UTM", city: "Belo Horizonte", uf: "MG", isActive: false },
    ]);
    const all = await env.db.select().from(institutions);
    expect(all).toHaveLength(3);
    expect(all.find((i) => i.sourceCode === "T1")?.isActive).toBe(false);
  });

  it("exige CPF; matrícula única dentro da instituição; troca só após 90 dias", async () => {
    const a = await newUser("A");
    const b = await newUser("B");
    const utm = await inst("T1");
    const fep = await inst("T2");
    await expect(joinInstitution(env.ctx, a.id, { institutionId: utm, enrollment: "2026-001" })).rejects.toThrow(/CPF/);

    await registerCpf(env.ctx, a.id, CPF_A, BIRTH, digitsOnlyVerifier);
    await registerCpf(env.ctx, b.id, CPF_B, BIRTH, digitsOnlyVerifier);
    await joinInstitution(env.ctx, a.id, { institutionId: utm, enrollment: "2026-001" });
    // Mesma matrícula (com outra formatação) na mesma instituição → recusada.
    await expect(joinInstitution(env.ctx, b.id, { institutionId: utm, enrollment: "2026 001" })).rejects.toThrow(/matrícula já está vinculada/);
    // Mesma matrícula em outra instituição → permitido.
    await joinInstitution(env.ctx, b.id, { institutionId: fep, enrollment: "2026-001" });

    // Corrigir a matrícula na mesma instituição: permitido e mantém a data de entrada.
    const before = await getMembership(env.ctx, a.id);
    env.clock.advance(86_400);
    await joinInstitution(env.ctx, a.id, { institutionId: utm, enrollment: "2026-002" });
    expect((await getMembership(env.ctx, a.id))?.joinedAt).toEqual(before?.joinedAt);

    // Trocar de instituição antes de 90 dias → recusado; depois → permitido.
    await expect(joinInstitution(env.ctx, a.id, { institutionId: fep, enrollment: "X-100" })).rejects.toThrow(/trocar de instituição a partir de/);
    env.clock.advance(90 * 86_400);
    await joinInstitution(env.ctx, a.id, { institutionId: fep, enrollment: "X-100" });
    expect((await getMembership(env.ctx, a.id))?.name).toBe("Faculdade Exemplo Paulista");
  });
});

describe("Rankings de instituição", () => {
  it("Minha instituição: só membros e só o XP ganho depois de entrar", async () => {
    const utm = await inst("T1");
    const viewer = await newUser("Viewer", true);
    expect((await getLeaderboard(env.ctx, viewer.id, { scope: "institution", period: "all" })).status).toBe("needs_institution");

    const members = [viewer];
    for (const n of ["A", "B", "C", "D"]) members.push(await newUser(n));
    const outsider = await newUser("Fora");
    // "A" estuda antes de entrar: esse XP não conta para a instituição.
    await cycle(members[1]);
    for (const [i, m] of members.entries()) {
      await registerCpf(env.ctx, m.id, VALID_CPFS[i], BIRTH, digitsOnlyVerifier);
      await joinInstitution(env.ctx, m.id, { institutionId: utm, enrollment: `MAT-${i}` });
    }
    for (const m of members) await cycle(m);
    await cycle(outsider);

    const lb = await getLeaderboard(env.ctx, viewer.id, { scope: "institution", period: "all" });
    if (lb.status !== "ok") throw new Error(lb.status);
    expect(lb.title).toBe("UTM — Universidade Teste de Minas");
    expect(lb.participants).toBe(5);
    expect(lb.rows.every((r) => r.xp === 30)).toBe(true); // o XP anterior de "A" ficou de fora
    expect(lb.rows.map((r) => r.displayName)).not.toContain("Fora");
  });

  it("Entre instituições: média por aluno ativo, mínimo de ativos e tipos separados", async () => {
    await env.db
      .update(appSettings)
      .set({ value: { ...DEFAULT_CATALOG_SETTINGS, institutionMinActive: 2 } })
      .where(eq(appSettings.key, "catalog"));
    const utm = await inst("T1");
    const fep = await inst("T2");
    const escola = await inst("99999999");
    const viewer = await newUser("Viewer", true);

    const plan: [string, string, number][] = [
      // UTM: 3 ativos, 30 + 30 + 60 → média 40
      [utm, "u1", 1], [utm, "u2", 1], [utm, "u3", 2],
      // FEP: 2 ativos, 60 + 60 → média 60 (vence mesmo com menos alunos)
      [fep, "f1", 2], [fep, "f2", 2],
      // Escola: não aparece no ranking de faculdades
      [escola, "e1", 3], [escola, "e2", 3],
    ];
    let i = 0;
    for (const [institutionId, name, cycles] of plan) {
      const u = await newUser(name);
      await registerCpf(env.ctx, u.id, makeCpf(500000 + i * 104729), BIRTH, digitsOnlyVerifier);
      i++;
      await joinInstitution(env.ctx, u.id, { institutionId, enrollment: `M-${name}` });
      for (let c = 0; c < cycles; c++) await cycle(u);
    }
    // Um membro da UTM sem XP não derruba a média (não é ativo).
    const idle = await newUser("idle");
    await registerCpf(env.ctx, idle.id, makeCpf(987654), BIRTH, digitsOnlyVerifier);
    await joinInstitution(env.ctx, idle.id, { institutionId: utm, enrollment: "M-idle" });

    const higher = await getInstitutionsLeaderboard(env.ctx, viewer.id, { kind: "higher", period: "all" });
    expect(higher.rows.map((r) => [r.acronym, r.averageXp, r.activeMembers])).toEqual([
      ["FEP", 60, 2],
      ["UTM", 40, 3],
    ]);
    const schools = await getInstitutionsLeaderboard(env.ctx, viewer.id, { kind: "school", period: "all" });
    expect(schools.rows.map((r) => r.name)).toEqual(["Escola Estadual Teste"]);
  });
});
