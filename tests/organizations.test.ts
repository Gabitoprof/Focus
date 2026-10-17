import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { canAutoApprove, domainMatches, isEducationActivity, isValidCnpj } from "@/domain/organizations";
import { cnpjaProvider, type CnpjData, type CnpjProvider } from "@/server/cnpj-lookup";
import { organizations, profiles, user, userIdentity } from "@/server/db/schema";
import {
  assignToOrgProject,
  confirmOrganizationEmail,
  createOrgProject,
  getOrganization,
  inviteOrgMember,
  listMyOrganizations,
  listPendingOrganizations,
  removeOrgMember,
  requestOrganization,
  respondOrgInvite,
  reviewOrganization,
  updateOrgMember,
} from "@/server/services/organizations";
import { getProject } from "@/server/services/projects";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

const CNPJ = "11.222.333/0001-81";

beforeEach(async () => {
  env = await setup();
});

function data(over: Partial<CnpjData> = {}): CnpjData {
  return {
    taxId: "11222333000181",
    legalName: "SOCIEDADE MINEIRA DE CULTURA",
    alias: "PUC Minas",
    active: true,
    statusText: "Ativa",
    mainActivity: { id: 8532500, text: "Educação superior - graduação e pós-graduação" },
    activityIds: [8532500],
    emailDomains: ["pucminas.br"],
    emails: ["secretaria@pucminas.br"],
    memberNames: ["Clóvis Souza"],
    city: "Belo Horizonte",
    uf: "MG",
    ...over,
  };
}

const provider = (d: CnpjData | "not_found" | "unavailable"): CnpjProvider => ({
  name: "fake",
  async lookup() {
    if (d === "not_found" || d === "unavailable") return { status: d };
    return { status: "found", data: d };
  },
});

function mailbox() {
  const sent: { to: string; subject: string; text: string }[] = [];
  return { sent, mailer: async (m: { to: string; subject: string; text: string }) => void sent.push(m), token: () => /token=([0-9a-f]+)/.exec(sent[0]?.text ?? "")?.[1] ?? "" };
}

async function verifiedUser(name: string) {
  const u = await createUser(env.ctx, name);
  await env.db.update(user).set({ name }).where(eq(user.id, u.id));
  await env.db.insert(userIdentity).values({ userId: u.id, cpfHmac: randomUUID(), cpfLastDigits: "00", verifiedAt: env.clock.now() });
  return u;
}

async function codeOf(userId: string) {
  const [p] = await env.db.select({ code: profiles.publicCode }).from(profiles).where(eq(profiles.userId, userId));
  return p.code!;
}

const baseInput = {
  kind: "institution" as const,
  cnpj: CNPJ,
  alias: "PUC Minas",
  contactEmail: "clovis@pucminas.br",
  requesterRole: "Coordenador",
  message: "Queremos organizar as equipes de projeto da graduação.",
};

async function approvedOrg() {
  const owner = await verifiedUser("Clóvis Souza");
  const box = mailbox();
  const { id } = await requestOrganization(env.ctx, owner.id, baseInput, { provider: provider(data()), mailer: box.mailer, baseUrl: "http://x" });
  await confirmOrganizationEmail(env.ctx, box.token(), box.mailer);
  return { owner, orgId: id };
}

describe("Regras de CNPJ e domínio", () => {
  it("valida dígitos, domínio corporativo e CNAE de educação", () => {
    expect(isValidCnpj(CNPJ)).toBe(true);
    expect(isValidCnpj("11.222.333/0001-82")).toBe(false);
    expect(isValidCnpj("00000000000000")).toBe(false);
    expect(domainMatches("pucminas.br", ["pucminas.br"])).toBe(true);
    expect(domainMatches("sga.pucminas.br", ["pucminas.br"])).toBe(true);
    expect(domainMatches("gmail.com", ["gmail.com"])).toBe(false);
    expect(domainMatches("pucminas.br.fake.com", ["pucminas.br"])).toBe(false);
    expect(isEducationActivity(8532500)).toBe(true);
    expect(isEducationActivity(6422100)).toBe(false);
  });

  it("adaptador CNPJá: chave no cabeçalho, situação ativa, domínios e sócios", async () => {
    const f = vi.fn(async () =>
      new Response(
        JSON.stringify({
          taxId: "11222333000181",
          alias: "PUC",
          status: { id: 2, text: "Ativa" },
          company: { name: "SMC", members: [{ person: { name: "Clóvis Souza" } }] },
          mainActivity: { id: 8532500, text: "Educação superior" },
          sideActivities: [{ id: 8599604 }],
          emails: [{ address: "Sec@PucMinas.br", domain: "pucminas.br" }],
          address: { city: "Belo Horizonte", state: "MG" },
        }),
        { status: 200 },
      ),
    );
    const r = await cnpjaProvider("chave", f as unknown as typeof fetch).lookup("11222333000181");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cnpja.com/office/11222333000181");
    expect((init.headers as Record<string, string>).Authorization).toBe("chave");
    expect(r).toMatchObject({ status: "found", data: { active: true, activityIds: [8532500, 8599604], emailDomains: ["pucminas.br"], emails: ["sec@pucminas.br"] } });
    const notFound = vi.fn(async () => new Response("{}", { status: 404 }));
    expect(await cnpjaProvider("k", notFound as unknown as typeof fetch).lookup("1")).toEqual({ status: "not_found" });
    const down = vi.fn(async () => new Response("{}", { status: 429 }));
    expect(await cnpjaProvider("k", down as unknown as typeof fetch).lookup("1")).toEqual({ status: "unavailable" });
  });

  it("aprovação automática só com tudo conferindo", () => {
    const ok = { cnpjActive: true, educationActivity: true, corporateDomain: true, domainMatchesCnpj: true, requesterIsMember: false, emailConfirmed: true };
    expect(canAutoApprove("institution", ok)).toBe(true);
    expect(canAutoApprove("institution", { ...ok, educationActivity: false })).toBe(false);
    expect(canAutoApprove("company", { ...ok, educationActivity: null })).toBe(true);
    expect(canAutoApprove("company", { ...ok, domainMatchesCnpj: false })).toBe(false);
    expect(canAutoApprove("company", { ...ok, emailConfirmed: false })).toBe(false);
  });
});

describe("Pedido de cadastro", () => {
  it("exige CPF verificado e CNPJ válido, ativo e encontrado", async () => {
    const noCpf = await createUser(env.ctx);
    const opts = { provider: provider(data()), mailer: mailbox().mailer, baseUrl: "http://x" };
    await expect(requestOrganization(env.ctx, noCpf.id, baseInput, opts)).rejects.toThrow(/vincule seu CPF/);
    const u = await verifiedUser("Ana");
    await expect(requestOrganization(env.ctx, u.id, { ...baseInput, cnpj: "11222333000182" }, opts)).rejects.toThrow(/CNPJ inválido/);
    await expect(requestOrganization(env.ctx, u.id, baseInput, { ...opts, provider: provider("not_found") })).rejects.toThrow(/não encontrado/);
    await expect(requestOrganization(env.ctx, u.id, baseInput, { ...opts, provider: provider("unavailable") })).rejects.toThrow(/indisponível/);
    await expect(requestOrganization(env.ctx, u.id, baseInput, { ...opts, provider: provider(data({ active: false })) })).rejects.toThrow(/não está ativo/);
  });

  it("e-mail do domínio oficial confirmado → aprovado na hora; dono criado; aviso ao e-mail do CNPJ", async () => {
    const owner = await verifiedUser("Clóvis Souza");
    const box = mailbox();
    const { id } = await requestOrganization(env.ctx, owner.id, baseInput, { provider: provider(data()), mailer: box.mailer, baseUrl: "http://x" });
    expect(box.sent[0].to).toBe("clovis@pucminas.br");
    const [pending] = await env.db.select().from(organizations).where(eq(organizations.id, id));
    expect(pending.status).toBe("pending_email");
    expect(pending.checks).toMatchObject({ domainMatchesCnpj: true, educationActivity: true, requesterIsMember: true });
    // O token nunca é gravado em claro.
    expect(JSON.stringify(pending)).not.toContain(box.token());

    expect(await confirmOrganizationEmail(env.ctx, box.token(), box.mailer)).toEqual({ id, status: "approved" });
    await expect(confirmOrganizationEmail(env.ctx, box.token(), box.mailer)).rejects.toThrow(/inválido ou já utilizado/);
    expect(box.sent.map((m) => m.to)).toContain("secretaria@pucminas.br");
    const mine = await listMyOrganizations(env.ctx, owner.id);
    expect(mine.organizations).toMatchObject([{ id, role: "owner" }]);

    // Mesmo CNPJ não pode ser cadastrado de novo.
    const other = await verifiedUser("Bia");
    await expect(
      requestOrganization(env.ctx, other.id, baseInput, { provider: provider(data()), mailer: box.mailer, baseUrl: "http://x" }),
    ).rejects.toThrow(/já está cadastrado/);
  });

  it("e-mail gratuito ou domínio diferente → análise da equipe; recusa libera o CNPJ", async () => {
    const u = await verifiedUser("Ana");
    const admin = await createUser(env.ctx, "Admin");
    const box = mailbox();
    const { id } = await requestOrganization(env.ctx, u.id, { ...baseInput, contactEmail: "escola@gmail.com" }, {
      provider: provider(data()),
      mailer: box.mailer,
      baseUrl: "http://x",
    });
    expect((await confirmOrganizationEmail(env.ctx, box.token(), box.mailer)).status).toBe("pending_review");
    expect((await listPendingOrganizations(env.ctx)).map((p) => p.org.id)).toEqual([id]);
    await reviewOrganization(env.ctx, admin.id, id, { approve: false, note: "Sem comprovação." }, box.mailer);
    expect((await listMyOrganizations(env.ctx, u.id)).requests[0]).toMatchObject({ status: "rejected", reviewNote: "Sem comprovação." });
    // Recusado: o CNPJ pode ser pedido de novo (pela organização legítima).
    await requestOrganization(env.ctx, u.id, baseInput, { provider: provider(data()), mailer: box.mailer, baseUrl: "http://x" });
  });

  it("link expira em 48 h", async () => {
    const u = await verifiedUser("Ana");
    const box = mailbox();
    await requestOrganization(env.ctx, u.id, baseInput, { provider: provider(data()), mailer: box.mailer, baseUrl: "http://x" });
    env.clock.advance(49 * 3600);
    await expect(confirmOrganizationEmail(env.ctx, box.token(), box.mailer)).rejects.toThrow(/expirou/);
  });
});

describe("Membros, projetos designados e ranking interno", () => {
  async function focus(userId: string, projectId: string, seconds: number) {
    const s = await startSession(env.ctx, userId, { projectId, methodId: "custom", plannedMinutes: Math.round(seconds / 60) });
    for (let left = seconds; left > 0; left -= 60) {
      env.clock.advance(Math.min(60, left));
      await heartbeat(env.ctx, userId, s.session!.id);
    }
    await finishSession(env.ctx, userId, s.session!.id);
  }

  it("dono convida gestor; gestor convida aluno, cria projeto e designa; ranking por área", async () => {
    const { owner, orgId } = await approvedOrg();
    const prof = await createUser(env.ctx, "Professor");
    const aluno = await createUser(env.ctx, "Aluno");
    const aluna = await createUser(env.ctx, "Aluna");

    await inviteOrgMember(env.ctx, owner.id, orgId, { publicCode: await codeOf(prof.id), role: "manager" });
    await respondOrgInvite(env.ctx, prof.id, orgId, true);
    await expect(inviteOrgMember(env.ctx, prof.id, orgId, { publicCode: await codeOf(aluno.id), role: "manager" })).rejects.toThrow(/Só o dono/);
    await inviteOrgMember(env.ctx, prof.id, orgId, { publicCode: await codeOf(aluno.id), role: "member", area: "Turma A" });
    await inviteOrgMember(env.ctx, prof.id, orgId, { publicCode: await codeOf(aluna.id), role: "member", area: "Turma B" });
    await respondOrgInvite(env.ctx, aluno.id, orgId, true);
    await respondOrgInvite(env.ctx, aluna.id, orgId, true);

    const p = await createOrgProject(env.ctx, prof.id, orgId, { name: "Projeto Integrador", targetMinutes: 1200 });
    expect(p.context).toBe("academic");
    await assignToOrgProject(env.ctx, prof.id, orgId, p.id, aluno.id);
    await assignToOrgProject(env.ctx, prof.id, orgId, p.id, aluna.id);
    // Membro não designa; quem não é da organização não é designado.
    await expect(assignToOrgProject(env.ctx, aluno.id, orgId, p.id, aluna.id)).rejects.toThrow(/dono ou um gestor/);
    const outsider = await createUser(env.ctx, "Fora");
    await expect(assignToOrgProject(env.ctx, prof.id, orgId, p.id, outsider.id)).rejects.toThrow(/não é membro ativo/);

    await focus(aluno.id, p.id, 30 * 60);
    await focus(aluna.id, p.id, 45 * 60);
    // Estudo fora da organização nunca aparece no painel dela.
    const s = await startSession(env.ctx, aluno.id, { topicId: aluno.topic.id, methodId: "custom", plannedMinutes: 10 });
    env.clock.advance(600);
    await heartbeat(env.ctx, aluno.id, s.session!.id);
    await finishSession(env.ctx, aluno.id, s.session!.id);

    const view = await getOrganization(env.ctx, prof.id, orgId);
    expect(view.areas).toEqual(["Turma A", "Turma B"]);
    expect(view.ranking.slice(0, 2).map((r) => [r.displayName, r.seconds, r.area])).toEqual([
      ["Aluna", 45 * 60, "Turma B"],
      ["Aluno", 30 * 60, "Turma A"],
    ]);
    expect(view.projects[0]).toMatchObject({ name: "Projeto Integrador", seconds: 75 * 60 });
    expect((await getProject(env.ctx, aluno.id, p.id)).totalSeconds).toBe(75 * 60);

    // Membro vê só os projetos em que participa e não vê convites pendentes.
    const other = await createOrgProject(env.ctx, prof.id, orgId, { name: "Outro" });
    const asMember = await getOrganization(env.ctx, aluno.id, orgId);
    expect(asMember.projects.map((x) => x.name)).toEqual(["Projeto Integrador"]);
    expect(asMember.canManage).toBe(false);
    expect(other.id).toBeTruthy();

    // Gestor muda a área de um membro; não promove ninguém.
    await updateOrgMember(env.ctx, prof.id, orgId, aluno.id, { area: "Turma B" });
    await expect(updateOrgMember(env.ctx, prof.id, orgId, aluno.id, { role: "manager" })).rejects.toThrow(/Só o dono/);

    // Quem sai da organização sai dos projetos dela; o tempo continua no projeto.
    await removeOrgMember(env.ctx, aluno.id, orgId, aluno.id);
    await expect(getProject(env.ctx, aluno.id, p.id)).rejects.toThrow(/não encontrado/);
    expect((await getProject(env.ctx, aluna.id, p.id)).totalSeconds).toBe(75 * 60);
    await expect(removeOrgMember(env.ctx, owner.id, orgId, owner.id)).rejects.toThrow(/dono não pode sair/);
  });

  it("organização em análise ainda não tem painel nem convites", async () => {
    const u = await verifiedUser("Ana");
    const box = mailbox();
    const { id } = await requestOrganization(env.ctx, u.id, { ...baseInput, contactEmail: "a@gmail.com" }, {
      provider: provider(data()),
      mailer: box.mailer,
      baseUrl: "http://x",
    });
    await expect(getOrganization(env.ctx, u.id, id)).rejects.toThrow(/não encontrada/);
  });
});
