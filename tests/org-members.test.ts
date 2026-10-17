import { beforeEach, describe, expect, it } from "vitest";
import { extractEnrollments } from "@/domain/roster";
import { organizationMembers, organizations, userIdentity } from "@/server/db/schema";
import { cpfHmac } from "@/server/identity-crypto";
import {
  assignToOrgProject,
  createOrgProject,
  managedOrgForContext,
  orgAssignRights,
  searchOrgMembers,
} from "@/server/services/organizations";
import { createProject, getProject } from "@/server/services/projects";
import { createUser, setup } from "./helpers";

let env: Awaited<ReturnType<typeof setup>>;
beforeEach(async () => {
  env = await setup();
});

/** Instituição aprovada com dona, um professor (gestor) e alunos em turmas. */
async function puc() {
  const dona = await createUser(env.ctx, "Helena Duarte");
  const [org] = await env.db
    .insert(organizations)
    .values({
      kind: "institution",
      cnpj: "11222333000181",
      legalName: "SOCIEDADE MINEIRA DE CULTURA",
      alias: "PUC Minas",
      requesterUserId: dona.id,
      requesterRole: "Reitora",
      contactEmail: "ti@pucminas.br",
      message: "Teste",
      status: "approved",
      checks: {} as never,
    })
    .returning();
  const prof = await createUser(env.ctx, "Clóvis Andrade");
  const ana = await createUser(env.ctx, "Ana Lima");
  const bruno = await createUser(env.ctx, "Bruno Costa");
  const joana = await createUser(env.ctx, "Joana Ávila");
  const now = env.clock.now();
  const member = (userId: string, role: "owner" | "manager" | "member", area: string | null, enrollment: string | null = null) => ({
    organizationId: org.id,
    userId,
    role,
    area,
    status: "active" as const,
    enrollmentDisplay: enrollment,
    joinedAt: now,
  });
  await env.db.insert(organizationMembers).values([
    member(dona.id, "owner", null),
    member(prof.id, "manager", null),
    member(ana.id, "member", "Turma A", "2024-001"),
    member(bruno.id, "member", "Turma B", "2024-002"),
    member(joana.id, "member", "Turma A", "2024-003"),
  ]);
  await env.db.insert(userIdentity).values({ userId: ana.id, cpfHmac: cpfHmac("529.982.247-25"), cpfLastDigits: "•••.•••.•••-25", verifiedAt: now });
  return { orgId: org.id, dona, prof, ana, bruno, joana };
}

describe("Busca de membros da organização (gestores)", () => {
  it("por nome (sem acento), CPF, matrícula e turma; aluno não pode buscar", async () => {
    const { orgId, prof, ana, joana } = await puc();
    const names = async (f: Parameters<typeof searchOrgMembers>[3]) => (await searchOrgMembers(env.ctx, prof.id, orgId, f)).map((m) => m.displayName);
    expect(await names({ query: "avila" })).toEqual(["Joana Ávila"]);
    expect(await names({ query: "52998224725" })).toEqual(["Ana Lima"]);
    expect(await names({ query: "529.982.247-25" })).toEqual(["Ana Lima"]);
    expect(await names({ query: "111.111.111-11" })).toEqual([]);
    expect(await names({ query: "2024-002" })).toEqual(["Bruno Costa"]);
    expect(await names({ area: "Turma A" })).toEqual(["Ana Lima", "Joana Ávila"]);
    await expect(searchOrgMembers(env.ctx, ana.id, orgId, {})).rejects.toThrow(/Só o dono ou um gestor/);
    expect(joana.id).toBeTruthy();
  });

  it("projeto criado pelo gestor no Registro já é da organização; ele inclui alunos direto, sem convite", async () => {
    const { orgId, dona, prof, ana, bruno } = await puc();
    expect(await managedOrgForContext(env.db, prof.id, "academic")).toBe(orgId);
    expect(await managedOrgForContext(env.db, prof.id, "personal")).toBeNull();
    expect(await managedOrgForContext(env.db, ana.id, "academic")).toBeNull();

    const p = await createOrgProject(env.ctx, prof.id, orgId, { name: "Projeto Integrador" });
    const rights = await orgAssignRights(env.ctx, prof.id, { organizationId: orgId, ownerUserId: prof.id });
    expect(rights).toMatchObject({ orgId, orgAlias: "PUC Minas", areas: ["Turma A", "Turma B"] });
    // A dona da organização também pode; um aluno, não.
    expect(await orgAssignRights(env.ctx, dona.id, { organizationId: orgId, ownerUserId: prof.id })).not.toBeNull();
    expect(await orgAssignRights(env.ctx, ana.id, { organizationId: orgId, ownerUserId: prof.id })).toBeNull();

    await assignToOrgProject(env.ctx, prof.id, orgId, p.id, ana.id);
    const d = await getProject(env.ctx, prof.id, p.id);
    expect(d.members.find((m) => m.userId === ana.id)?.status).toBe("active");
    // Quem já participa some da busca do projeto.
    const left = await searchOrgMembers(env.ctx, prof.id, orgId, { excludeProjectId: p.id });
    expect(left.map((m) => m.userId)).not.toContain(ana.id);
    expect(left.map((m) => m.userId)).toContain(bruno.id);
  });

  it("projeto pessoal não tem inclusão direta", async () => {
    const { prof } = await puc();
    const p = await createProject(env.ctx, prof.id, { context: "personal", name: "Leituras" });
    expect(await orgAssignRights(env.ctx, prof.id, { organizationId: null, ownerUserId: prof.id })).toBeNull();
    expect(p.organizationId).toBeNull();
  });
});

describe("Lista de matrículas por arquivo", () => {
  it("TXT: uma por linha, sem repetidas", () => {
    expect(extractEnrollments("2024001\r\n2024002\n\n2024001\n")).toEqual(["2024001", "2024002"]);
  });
  it("CSV com cabeçalho: usa a coluna Matrícula", () => {
    const csv = "﻿Nome;Matrícula;Turma\nAna Lima;2024-001;A\n\"Bruno Costa\";\"2024-002\";B\n";
    expect(extractEnrollments(csv)).toEqual(["2024-001", "2024-002"]);
  });
  it("CSV sem coluna reconhecida: usa a primeira", () => {
    expect(extractEnrollments("RA,Nome\n123,Ana\n456,Bruno")).toEqual(["123", "456"]);
    expect(extractEnrollments("codigo\tnome\n9001\tAna")).toEqual(["9001"]);
  });
});
