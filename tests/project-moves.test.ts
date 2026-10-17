import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { CnpjProvider } from "@/server/cnpj-lookup";
import { profiles, projects, studySessions, user, userIdentity } from "@/server/db/schema";
import {
  confirmOrganizationEmail,
  createOrgProject,
  getOrganization,
  inviteOrgMember,
  requestOrganization,
  respondOrgInvite,
} from "@/server/services/organizations";
import { decideMoveRequest, listMoveRequests, moveProject, moveTargets } from "@/server/services/project-moves";
import { createProject, createTask, deleteTask, getProject, inviteMember, respondInvite } from "@/server/services/projects";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
  env.clock.set("2026-03-10T12:00:00.000Z");
});

async function verified(name: string) {
  const u = await createUser(env.ctx, name);
  await env.db.update(user).set({ name }).where(eq(user.id, u.id));
  await env.db.insert(userIdentity).values({ userId: u.id, cpfHmac: randomUUID(), cpfLastDigits: "00", verifiedAt: env.clock.now() });
  return u;
}
const codeOf = async (id: string) => (await env.db.select({ c: profiles.publicCode }).from(profiles).where(eq(profiles.userId, id)))[0].c!;

async function company() {
  const owner = await verified("Gestora");
  let token = "";
  const provider: CnpjProvider = {
    name: "fake",
    lookup: async () => ({
      status: "found",
      data: {
        taxId: "11444777000161", legalName: "ACME LTDA", alias: "Acme", active: true, statusText: "Ativa",
        mainActivity: null, activityIds: [6201501], emailDomains: ["acme.com.br"], emails: [], memberNames: [], city: null, uf: null,
      },
    }),
  };
  const { id } = await requestOrganization(
    env.ctx, owner.id,
    { kind: "company", cnpj: "11444777000161", alias: "Acme", contactEmail: "ti@acme.com.br", requesterRole: "CEO", message: "Queremos usar a Focus." },
    { provider, mailer: async (m) => void (token = /token=([0-9a-f]+)/.exec(m.text)?.[1] ?? token), baseUrl: "http://x" },
  );
  await confirmOrganizationEmail(env.ctx, token, async () => {});
  const func = await verified("Funcionário");
  await inviteOrgMember(env.ctx, owner.id, id, { publicCode: await codeOf(func.id), role: "member" });
  await respondOrgInvite(env.ctx, func.id, id, true);
  return { owner, func, orgId: id };
}

async function focus(userId: string, projectId: string, minutes: number) {
  const s = await startSession(env.ctx, userId, { projectId, methodId: "custom", plannedMinutes: minutes });
  for (let left = minutes; left > 0; left -= 5) {
    env.clock.advance(300);
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  return s.session!.id;
}

describe("Mover projetos entre perfis", () => {
  it("do Pessoal para a empresa: não duplica, a empresa passa a ver, e o tempo antigo fica no Pessoal", async () => {
    const { owner, func, orgId } = await company();
    const p = await createProject(env.ctx, func.id, { context: "personal", name: "Relatório" });
    const sid = await focus(func.id, p.id, 20);
    expect((await moveTargets(env.db, func.id)).map((t) => t.context)).toEqual(["personal", "professional"]);
    expect(await moveProject(env.ctx, func.id, p.id, { context: "professional", organizationId: orgId })).toEqual({ status: "moved" });
    const [row] = await env.db.select().from(projects).where(eq(projects.id, p.id));
    expect(row).toMatchObject({ context: "professional", organizationId: orgId });
    const [s] = await env.db.select().from(studySessions).where(eq(studySessions.id, sid));
    expect(s.context).toBe("personal"); // o ponto vale onde foi registrado
    expect((await getOrganization(env.ctx, owner.id, orgId)).projects.map((x) => x.name)).toContain("Relatório");
    await expect(moveProject(env.ctx, func.id, p.id, { context: "professional", organizationId: orgId })).rejects.toThrow(/já está nesse perfil/);
    await expect(moveProject(env.ctx, func.id, p.id, { context: "academic", organizationId: orgId })).rejects.toThrow(/Destino inválido/);
  });

  it("projeto designado pela empresa: membro não move direto; o pedido vai para quem criou e depois para a gestão", async () => {
    const { owner, func, orgId } = await company();
    const p = await createOrgProject(env.ctx, owner.id, orgId, { name: "Sistema" });
    const { assignToOrgProject } = await import("@/server/services/organizations");
    await assignToOrgProject(env.ctx, owner.id, orgId, p.id, func.id);
    await focus(func.id, p.id, 30);

    expect(await moveProject(env.ctx, func.id, p.id, { context: "personal", organizationId: null })).toEqual({ status: "requested", approver: "owner" });
    await expect(moveProject(env.ctx, func.id, p.id, { context: "personal", organizationId: null })).rejects.toThrow(/já tem um pedido/);
    const [req] = await listMoveRequests(env.ctx, owner.id);
    expect(req).toMatchObject({ projectName: "Sistema", requestedBy: "Funcionário", targetContext: "personal" });
    expect(await listMoveRequests(env.ctx, func.id)).toEqual([]);
    // A criadora é a dona da empresa: aceitar já move.
    expect(await decideMoveRequest(env.ctx, owner.id, req.id, true)).toEqual({ status: "moved" });

    // A empresa continua vendo o projeto riscado, "movido por", só com o tempo de antes.
    const view = await getOrganization(env.ctx, owner.id, orgId);
    const moved = view.projects.find((x) => x.name === "Sistema")!;
    expect(moved).toMatchObject({ movedOut: true, movedBy: "Gestora", seconds: 30 * 60 });
    await focus(func.id, p.id, 10);
    expect((await getOrganization(env.ctx, owner.id, orgId)).projects.find((x) => x.name === "Sistema")!.seconds).toBe(30 * 60);
  });

  it("criador sem cargo de gestão tira o projeto da empresa só com o aceite da gestão", async () => {
    const { owner, func, orgId } = await company();
    const p = await createProject(env.ctx, func.id, { context: "professional", name: "Estudo de caso" });
    await env.db.update(projects).set({ organizationId: orgId }).where(eq(projects.id, p.id));
    expect(await moveProject(env.ctx, func.id, p.id, { context: "personal", organizationId: null })).toEqual({ status: "requested", approver: "manager" });
    const [req] = await listMoveRequests(env.ctx, owner.id);
    expect(req.approver).toBe("manager");
    expect(await decideMoveRequest(env.ctx, owner.id, req.id, false)).toEqual({ status: "rejected" });
    expect((await env.db.select().from(projects).where(eq(projects.id, p.id)))[0].organizationId).toBe(orgId);
  });

  it("participantes acrescentam tarefas; só quem criou (ou o dono) exclui", async () => {
    const a = await createUser(env.ctx, "Ana");
    const b = await createUser(env.ctx, "Bruno");
    const p = await createProject(env.ctx, a.id, { context: "personal", name: "Viagem" });
    await inviteMember(env.ctx, a.id, p.id, await codeOf(b.id));
    await respondInvite(env.ctx, b.id, p.id, true);
    const tb = await createTask(env.ctx, b.id, p.id, { title: "Passagens" });
    await expect(createTask(env.ctx, b.id, p.id, { title: "Hotel", assigneeUserId: a.id })).rejects.toThrow(/Só o dono/);
    const ta = await createTask(env.ctx, a.id, p.id, { title: "Roteiro" });
    await expect(deleteTask(env.ctx, b.id, p.id, ta.id)).rejects.toThrow(/Só quem criou/);
    const detail = await getProject(env.ctx, b.id, p.id);
    expect(detail.tasks.map((t) => [t.title, t.canDelete])).toEqual([["Passagens", true], ["Roteiro", false]]);
    await deleteTask(env.ctx, b.id, p.id, tb.id);
    await deleteTask(env.ctx, a.id, p.id, ta.id);
  });
});
