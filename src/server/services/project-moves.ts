import { and, desc, eq, inArray, or } from "drizzle-orm";
import type { AppContext } from "@/domain/contexts";
import { orgContext } from "@/domain/organizations";
import { auditLogs, organizationMembers, organizations, profiles, projectMoveRequests, projects } from "../db/schema";
import { AppError, type Ctx, type Tx } from "./common";
import { activeMembership } from "./projects";
import type { DB } from "../db";

type Db = DB | Tx;
export type MoveTarget = { context: AppContext; organizationId: string | null };

/** Para onde a pessoa pode mover projetos: Pessoal e as organizações em que foi aceita. */
export async function moveTargets(db: Db, userId: string) {
  const orgs = await db
    .select({ id: organizations.id, alias: organizations.alias, kind: organizations.kind, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        eq(organizations.status, "approved"),
      ),
    );
  return [
    { context: "personal" as AppContext, organizationId: null, label: null as string | null },
    ...orgs.map((o) => ({ context: orgContext(o.kind) as AppContext, organizationId: o.id as string | null, label: o.alias as string | null })),
  ];
}

async function orgRole(db: Db, userId: string, orgId: string) {
  const [m] = await db
    .select({ role: organizationMembers.role })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
      ),
    );
  return m?.role ?? null;
}

async function execute(db: Db, actorId: string, p: typeof projects.$inferSelect, target: MoveTarget, now: Date) {
  const leavingOrg = p.organizationId && p.organizationId !== target.organizationId;
  await db
    .update(projects)
    .set({
      context: target.context,
      organizationId: target.organizationId,
      // Saiu de uma organização: ela continua vendo o projeto, riscado ("movido por…").
      ...(leavingOrg
        ? { movedFromOrganizationId: p.organizationId, movedAt: now, movedBy: actorId }
        : target.organizationId
          ? { movedFromOrganizationId: null, movedAt: null, movedBy: null }
          : {}),
      updatedAt: now,
    })
    .where(eq(projects.id, p.id));
  await db.insert(auditLogs).values({
    actorUserId: actorId,
    action: "project.moved",
    entityType: "project",
    entityId: p.id,
    metadata: { from: { context: p.context, organizationId: p.organizationId }, to: target },
  });
}

/**
 * Move um projeto para outro perfil. Ele não fica nos dois lugares: passa a existir só no destino.
 * As horas e o XP já registrados ficam onde aconteceram (a sessão guarda isso).
 * - Quem não criou o projeto não move: o pedido vai para quem criou.
 * - Tirar um projeto de uma organização depende do aceite da gestão (dono/gestor dela),
 *   a não ser que quem move já seja gestor.
 */
export async function moveProject(ctx: Ctx, userId: string, projectId: string, target: MoveTarget) {
  const { project: p } = await activeMembership(ctx.db, userId, projectId);
  const targets = await moveTargets(ctx.db, userId);
  const valid = targets.some((t) => t.context === target.context && t.organizationId === target.organizationId);
  if (!valid) throw new AppError("Destino inválido para este projeto.", "invalid");
  if (p.context === target.context && p.organizationId === target.organizationId) {
    throw new AppError("O projeto já está nesse perfil.", "conflict");
  }
  const now = ctx.now();
  const request = async (approver: "owner" | "manager") => {
    try {
      await ctx.db.insert(projectMoveRequests).values({
        projectId,
        requestedBy: userId,
        approver,
        targetContext: target.context,
        targetOrganizationId: target.organizationId,
      });
    } catch (e) {
      const err = e as { code?: string; cause?: { code?: string } };
      if (err?.code === "23505" || err?.cause?.code === "23505") {
        throw new AppError("Você já tem um pedido de transferência aguardando para este projeto.", "conflict");
      }
      throw e;
    }
    return { status: "requested" as const, approver };
  };
  if (p.ownerUserId !== userId) return request("owner");
  if (p.organizationId && p.organizationId !== target.organizationId) {
    const role = await orgRole(ctx.db, userId, p.organizationId);
    if (role !== "owner" && role !== "manager") return request("manager");
  }
  await execute(ctx.db, userId, p, target, now);
  return { status: "moved" as const };
}

/** Pedidos de transferência que a pessoa pode decidir (como criadora do projeto ou gestora). */
export async function listMoveRequests(ctx: Ctx, userId: string) {
  const managed = await ctx.db
    .select({ orgId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        inArray(organizationMembers.role, ["owner", "manager"]),
      ),
    );
  const orgIds = managed.map((m) => m.orgId);
  const rows = await ctx.db
    .select({
      id: projectMoveRequests.id,
      projectId: projects.id,
      projectName: projects.name,
      approver: projectMoveRequests.approver,
      targetContext: projectMoveRequests.targetContext,
      targetOrganizationId: projectMoveRequests.targetOrganizationId,
      requestedBy: profiles.displayName,
      createdAt: projectMoveRequests.createdAt,
    })
    .from(projectMoveRequests)
    .innerJoin(projects, eq(projects.id, projectMoveRequests.projectId))
    .innerJoin(profiles, eq(profiles.userId, projectMoveRequests.requestedBy))
    .where(
      and(
        eq(projectMoveRequests.status, "pending"),
        or(
          and(eq(projectMoveRequests.approver, "owner"), eq(projects.ownerUserId, userId)),
          orgIds.length
            ? and(eq(projectMoveRequests.approver, "manager"), inArray(projects.organizationId, orgIds))
            : undefined,
        ),
      ),
    )
    .orderBy(desc(projectMoveRequests.createdAt));
  const targetOrgIds = [...new Set(rows.map((r) => r.targetOrganizationId).filter((x): x is string => Boolean(x)))];
  const names = targetOrgIds.length
    ? await ctx.db.select({ id: organizations.id, alias: organizations.alias }).from(organizations).where(inArray(organizations.id, targetOrgIds))
    : [];
  return rows.map((r) => ({ ...r, targetLabel: names.find((n) => n.id === r.targetOrganizationId)?.alias ?? null }));
}

/**
 * Decide um pedido. Aceitar como criador do projeto executa a mudança como se ele mesmo movesse
 * (se o projeto sair de uma organização, ainda pode precisar do aceite da gestão).
 */
export async function decideMoveRequest(ctx: Ctx, userId: string, requestId: string, approve: boolean) {
  const [r] = await ctx.db.select().from(projectMoveRequests).where(eq(projectMoveRequests.id, requestId));
  if (!r || r.status !== "pending") throw new AppError("Pedido não encontrado.", "not_found");
  const [p] = await ctx.db.select().from(projects).where(eq(projects.id, r.projectId));
  if (!p) throw new AppError("Projeto não encontrado.", "not_found");
  const allowed =
    r.approver === "owner"
      ? p.ownerUserId === userId
      : Boolean(p.organizationId) && ["owner", "manager"].includes((await orgRole(ctx.db, userId, p.organizationId!)) ?? "");
  if (!allowed) throw new AppError("Pedido não encontrado.", "not_found");
  const now = ctx.now();
  await ctx.db
    .update(projectMoveRequests)
    .set({ status: approve ? "approved" : "rejected", decidedBy: userId, decidedAt: now })
    .where(eq(projectMoveRequests.id, requestId));
  if (!approve) return { status: "rejected" as const };
  const target = { context: r.targetContext, organizationId: r.targetOrganizationId };
  if (r.approver === "manager") {
    await execute(ctx.db, userId, p, target, now);
    return { status: "moved" as const };
  }
  // Criador aceitou o destino pedido (validado para quem pediu). Se o projeto sai de uma
  // organização e o criador não é gestor dela, ainda falta o aceite da gestão.
  if (p.organizationId && p.organizationId !== target.organizationId) {
    const role = await orgRole(ctx.db, userId, p.organizationId);
    if (role !== "owner" && role !== "manager") {
      await ctx.db.insert(projectMoveRequests).values({
        projectId: p.id,
        requestedBy: userId,
        approver: "manager",
        targetContext: target.context,
        targetOrganizationId: target.organizationId,
      }).onConflictDoNothing();
      return { status: "requested" as const, approver: "manager" as const };
    }
  }
  await execute(ctx.db, userId, p, target, now);
  return { status: "moved" as const };
}
