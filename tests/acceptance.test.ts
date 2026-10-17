import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CnpjData, CnpjProvider } from "@/server/cnpj-lookup";
import { institutionMemberships, profiles, user, userIdentity } from "@/server/db/schema";
import { grantManualSubscription } from "@/server/services/entitlements";
import { getMembership, joinInstitution, upsertInstitutions } from "@/server/services/institutions";
import {
  addToRoster,
  getContextAccess,
  linkOrgToInstitution,
  listMemberRequests,
  requestCompanyLink,
  reviewMemberRequests,
  searchCompanies,
} from "@/server/services/membership";
import { confirmOrganizationEmail, requestOrganization } from "@/server/services/organizations";
import { getActiveContext, setActiveContext } from "@/server/services/profile";
import { getLeaderboard } from "@/server/services/ranking";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

const data = (over: Partial<CnpjData>): CnpjData => ({
  taxId: "11222333000181",
  legalName: "SOCIEDADE MINEIRA DE CULTURA",
  alias: "PUC Minas",
  active: true,
  statusText: "Ativa",
  mainActivity: { id: 8532500, text: "Educação superior" },
  activityIds: [8532500],
  emailDomains: ["pucminas.br"],
  emails: [],
  memberNames: [],
  city: "Belo Horizonte",
  uf: "MG",
  ...over,
});

async function verified(name: string) {
  const u = await createUser(env.ctx, name);
  await env.db.update(user).set({ name }).where(eq(user.id, u.id));
  await env.db.insert(userIdentity).values({ userId: u.id, cpfHmac: randomUUID(), cpfLastDigits: "00", verifiedAt: env.clock.now() });
  await grantManualSubscription(env.ctx, u.id, new Date("2030-01-01"));
  return u;
}

async function approvedOrg(kind: "institution" | "company", cnpj: string, domain: string) {
  const owner = await verified(`Dono ${kind}`);
  let token = "";
  const provider: CnpjProvider = {
    name: "fake",
    lookup: async () => ({
      status: "found",
      data: data({ taxId: cnpj, emailDomains: [domain], activityIds: kind === "institution" ? [8532500] : [6201501] }),
    }),
  };
  const { id } = await requestOrganization(
    env.ctx,
    owner.id,
    { kind, cnpj, alias: kind === "institution" ? "PUC Minas" : "Acme Tecnologia", contactEmail: `ti@${domain}`, requesterRole: "Diretor", message: "Queremos usar a Focus." },
    { provider, mailer: async (m) => void (token = /token=([0-9a-f]+)/.exec(m.text)?.[1] ?? token), baseUrl: "http://x" },
  );
  await confirmOrganizationEmail(env.ctx, token, async () => {});
  return { owner, orgId: id };
}

async function institution() {
  await upsertInstitutions(env.db, [
    { kind: "higher", source: "emec", sourceCode: "1", name: "Pontifícia Universidade Católica de Minas Gerais", acronym: "PUC Minas", city: "Belo Horizonte", uf: "MG", isActive: true },
  ]);
  const [i] = await env.db.query.institutions.findMany();
  return i.id;
}

async function focus(userId: string, topicId: string) {
  const s = await startSession(env.ctx, userId, { topicId, methodId: "custom", plannedMinutes: 30 });
  for (let i = 0; i < 6; i++) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
}

describe("Aceite de alunos pela instituição", () => {
  it("sem conta verificada na Focus, o vínculo declarado vale na hora", async () => {
    const instId = await institution();
    const aluno = await verified("Aluno");
    expect(await joinInstitution(env.ctx, aluno.id, { institutionId: instId, enrollment: "2024-001" })).toEqual({ status: "active" });
    expect((await getMembership(env.ctx, aluno.id))?.status).toBe("active");
  });

  it("com conta verificada: pendente até o aceite; aparece como pendente no ranking geral; aceito libera o perfil Acadêmico", async () => {
    const instId = await institution();
    const { owner, orgId } = await approvedOrg("institution", "11222333000181", "pucminas.br");
    await linkOrgToInstitution(env.ctx, owner.id, orgId, instId);

    const aluno = await verified("Aluno");
    expect(await joinInstitution(env.ctx, aluno.id, { institutionId: instId, enrollment: "2024-001" })).toEqual({ status: "pending" });
    const reqs = await listMemberRequests(env.ctx, owner.id, orgId);
    expect(reqs).toMatchObject([{ displayName: "Aluno", enrollment: "2024-001", cpfVerified: true }]);
    expect((await getContextAccess(env.db, aluno.id)).academic).toBe(false);

    // Pontua no ranking geral, sinalizado como pendente; não pontua pela instituição.
    const t = await import("@/server/services/categories").then(async (m) => {
      const c = await m.createCategory(env.ctx, aluno.id, { name: "Faculdade", context: "personal", usage: "academic" });
      return m.createTopic(env.ctx, aluno.id, { categoryId: c.id, name: "Genética" });
    });
    await focus(aluno.id, t.id);
    const board = await getLeaderboard(env.ctx, aluno.id, { scope: "global", period: "week" });
    expect(board.status === "ok" && board.rows[0].institution).toMatchObject({ acronym: "PUC Minas", pending: true });
    expect((await getLeaderboard(env.ctx, aluno.id, { scope: "institution", period: "week" })).status).toBe("needs_institution");

    // Membro comum não aprova; o dono aprova.
    await expect(reviewMemberRequests(env.ctx, aluno.id, orgId, [aluno.id], true)).rejects.toThrow(/não encontrada/);
    expect(await reviewMemberRequests(env.ctx, owner.id, orgId, [aluno.id], true)).toBe(1);
    expect((await getMembership(env.ctx, aluno.id))?.status).toBe("active");
    expect((await getContextAccess(env.db, aluno.id)).academic).toBe(true);
    await setActiveContext(env.ctx, aluno.id, "academic");
    expect(await getActiveContext(env.ctx, aluno.id)).toBe("academic");
    // A matrícula digitada some depois da decisão.
    const [m] = await env.db.select().from(institutionMemberships).where(eq(institutionMemberships.userId, aluno.id));
    expect(m.enrollmentDisplay).toBeNull();
  });

  it("lista de matrículas: aceita na hora quem está nela e aceita os pendentes que batem", async () => {
    const instId = await institution();
    const { owner, orgId } = await approvedOrg("institution", "11222333000181", "pucminas.br");
    await expect(addToRoster(env.ctx, owner.id, orgId, ["1"])).rejects.toThrow(/Vincule a organização ao cadastro/);
    await linkOrgToInstitution(env.ctx, owner.id, orgId, instId);

    const antes = await verified("Antes");
    expect(await joinInstitution(env.ctx, antes.id, { institutionId: instId, enrollment: "A-100" })).toEqual({ status: "pending" });
    expect(await addToRoster(env.ctx, owner.id, orgId, ["a100", "B200", "  "])).toEqual({ added: 2, accepted: 1 });

    const depois = await verified("Depois");
    expect(await joinInstitution(env.ctx, depois.id, { institutionId: instId, enrollment: "B 200" })).toEqual({ status: "active" });
    const errado = await verified("Errado");
    expect(await joinInstitution(env.ctx, errado.id, { institutionId: instId, enrollment: "Z-999" })).toEqual({ status: "pending" });
    // Recusar apaga o pedido: a pessoa pode reenviar os dados.
    await reviewMemberRequests(env.ctx, owner.id, orgId, [errado.id], false);
    expect(await getMembership(env.ctx, errado.id)).toBeNull();
  });
});

describe("Aceite de funcionários pela empresa", () => {
  it("pedido pelo registro; aceite libera o perfil Profissional; lista de registros aceita na hora", async () => {
    const { owner, orgId } = await approvedOrg("company", "11444777000161", "acme.com.br");
    expect((await searchCompanies(env.ctx, "acme")).map((c) => c.id)).toEqual([orgId]);
    const semCpf = await createUser(env.ctx, "Sem CPF");
    await expect(requestCompanyLink(env.ctx, semCpf.id, orgId, "F-1")).rejects.toThrow(/vincule seu CPF/);

    const func = await verified("Funcionária");
    expect(await requestCompanyLink(env.ctx, func.id, orgId, "F-1")).toEqual({ status: "pending" });
    expect((await listMemberRequests(env.ctx, owner.id, orgId)).map((r) => r.enrollment)).toEqual(["F-1"]);
    await reviewMemberRequests(env.ctx, owner.id, orgId, [func.id], true);
    expect((await getContextAccess(env.db, func.id)).professional).toBe(true);

    await addToRoster(env.ctx, owner.id, orgId, ["F-2"]);
    const outra = await verified("Outra");
    expect(await requestCompanyLink(env.ctx, outra.id, orgId, "f2")).toEqual({ status: "active" });
    const copia = await verified("Cópia");
    await expect(requestCompanyLink(env.ctx, copia.id, orgId, "F-2")).rejects.toThrow(/já está vinculada a outra conta/);
  });

  it("só o dono liga a organização ao e-MEC/INEP, e cada instituição tem uma organização", async () => {
    const instId = await institution();
    const a = await approvedOrg("institution", "11222333000181", "pucminas.br");
    const b = await approvedOrg("institution", "11444777000161", "outra.edu.br");
    await linkOrgToInstitution(env.ctx, a.owner.id, a.orgId, instId);
    await expect(linkOrgToInstitution(env.ctx, b.owner.id, b.orgId, instId)).rejects.toThrow(/já está vinculada a outra organização/);
    const [p] = await env.db.select().from(profiles).where(eq(profiles.userId, a.owner.id));
    expect(p).toBeTruthy();
  });
});
