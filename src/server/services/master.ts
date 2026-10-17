import { and, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import { formatCnpj } from "@/domain/organizations";
import {
  catalogTopics,
  institutionMemberships,
  institutions,
  organizationMembers,
  organizationRoster,
  organizations,
  projects,
  studySessions,
  subscriptions,
  user,
  xpTransactions,
} from "../db/schema";
import { AppError, type Ctx } from "./common";
import { isMaster } from "./profile";

/**
 * Console master: visão do dono da plataforma. Só números agregados — nada de dados individuais
 * de estudo ou da vida pessoal de ninguém (LGPD).
 */
export async function requireMaster(ctx: Ctx, userId: string) {
  if (!(await isMaster(ctx.db, userId))) throw new AppError("Acesso restrito.", "forbidden");
}

const DAY = 86_400_000;
const n = (v: unknown) => Number(v ?? 0);

export async function getMasterOverview(ctx: Ctx, userId: string) {
  await requireMaster(ctx, userId);
  const now = ctx.now();
  const d7 = new Date(now.getTime() - 7 * DAY);
  const d30 = new Date(now.getTime() - 30 * DAY);
  const [users, sessions7, byContext, xp7, subs, orgs, members, catalog] = await Promise.all([
    ctx.db
      .select({
        total: sql<number>`count(*)::int`,
        new7: sql<number>`count(*) filter (where ${user.createdAt} >= ${d7.toISOString()}::timestamptz)::int`,
        new30: sql<number>`count(*) filter (where ${user.createdAt} >= ${d30.toISOString()}::timestamptz)::int`,
      })
      .from(user),
    ctx.db
      .select({
        sessions: sql<number>`count(*)::int`,
        active: sql<number>`count(distinct ${studySessions.userId})::int`,
        seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
      })
      .from(studySessions)
      .where(and(isNotNull(studySessions.endedAt), gte(studySessions.endedAt, d7))),
    ctx.db
      .select({ context: studySessions.context, seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int` })
      .from(studySessions)
      .where(and(isNotNull(studySessions.endedAt), gte(studySessions.endedAt, d7)))
      .groupBy(studySessions.context),
    ctx.db
      .select({ xp: sql<number>`coalesce(sum(${xpTransactions.amount}) filter (where ${xpTransactions.amount} > 0), 0)::int` })
      .from(xpTransactions)
      .where(gte(xpTransactions.createdAt, d7)),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(inArray(subscriptions.status, ["active", "trialing"])),
    ctx.db
      .select({ kind: organizations.kind, status: organizations.status, n: sql<number>`count(*)::int` })
      .from(organizations)
      .groupBy(organizations.kind, organizations.status),
    ctx.db
      .select({ status: institutionMemberships.status, n: sql<number>`count(*)::int` })
      .from(institutionMemberships)
      .groupBy(institutionMemberships.status),
    ctx.db
      .select({ status: catalogTopics.status, n: sql<number>`count(*)::int` })
      .from(catalogTopics)
      .groupBy(catalogTopics.status),
  ]);
  const orgCount = (kind: string, status?: string) =>
    orgs.filter((o) => o.kind === kind && (!status || o.status === status)).reduce((a, o) => a + n(o.n), 0);
  return {
    users: { total: n(users[0]?.total), new7: n(users[0]?.new7), new30: n(users[0]?.new30) },
    last7: {
      sessions: n(sessions7[0]?.sessions),
      activeUsers: n(sessions7[0]?.active),
      seconds: n(sessions7[0]?.seconds),
      xp: n(xp7[0]?.xp),
      byContext: Object.fromEntries(byContext.map((c) => [c.context, n(c.seconds)])) as Record<string, number>,
    },
    subscriptionsActive: n(subs[0]?.n),
    organizations: {
      institutions: orgCount("institution", "approved"),
      companies: orgCount("company", "approved"),
      pendingReview: orgs.filter((o) => o.status === "pending_review").reduce((a, o) => a + n(o.n), 0),
      pendingEmail: orgs.filter((o) => o.status === "pending_email").reduce((a, o) => a + n(o.n), 0),
    },
    memberships: {
      active: n(members.find((m) => m.status === "active")?.n),
      pending: n(members.find((m) => m.status === "pending")?.n),
    },
    catalog: {
      approved: n(catalog.find((c) => c.status === "approved")?.n),
      pending: n(catalog.find((c) => c.status === "pending")?.n),
    },
  };
}

/**
 * Ranking de empresas (só no console master): funcionários, horas e XP nos projetos da empresa,
 * projetos concluídos. A receita média mensal fica vazia até existir cobrança para empresas.
 */
export async function getCompanyStats(ctx: Ctx, userId: string) {
  await requireMaster(ctx, userId);
  const now = ctx.now();
  const d30 = new Date(now.getTime() - 30 * DAY);
  const orgs = await ctx.db
    .select({ id: organizations.id, alias: organizations.alias, cnpj: organizations.cnpj, approvedAt: organizations.approvedAt })
    .from(organizations)
    .where(and(eq(organizations.kind, "company"), eq(organizations.status, "approved")));
  if (orgs.length === 0) return [];
  const ids = orgs.map((o) => o.id);
  const [members, projs, time] = await Promise.all([
    ctx.db
      .select({
        orgId: organizationMembers.organizationId,
        active: sql<number>`count(*) filter (where ${organizationMembers.status} = 'active')::int`,
        requested: sql<number>`count(*) filter (where ${organizationMembers.status} = 'requested')::int`,
      })
      .from(organizationMembers)
      .where(inArray(organizationMembers.organizationId, ids))
      .groupBy(organizationMembers.organizationId),
    ctx.db
      .select({
        orgId: projects.organizationId,
        total: sql<number>`count(*)::int`,
        done: sql<number>`count(*) filter (where ${projects.status} = 'done')::int`,
      })
      .from(projects)
      .where(and(inArray(projects.organizationId, ids), sql`${projects.deletedAt} is null`))
      .groupBy(projects.organizationId),
    ctx.db
      .select({
        orgId: projects.organizationId,
        seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
        seconds30: sql<number>`coalesce(sum(${studySessions.activeSeconds}) filter (where ${studySessions.endedAt} >= ${d30.toISOString()}::timestamptz), 0)::int`,
        xp: sql<number>`coalesce(sum(${studySessions.xpAwarded}), 0)::int`,
      })
      .from(studySessions)
      .innerJoin(projects, eq(projects.id, studySessions.projectId))
      .where(and(inArray(projects.organizationId, ids), isNotNull(studySessions.endedAt)))
      .groupBy(projects.organizationId),
  ]);
  return orgs
    .map((o) => {
      const m = members.find((x) => x.orgId === o.id);
      const p = projs.find((x) => x.orgId === o.id);
      const t = time.find((x) => x.orgId === o.id);
      return {
        id: o.id,
        name: o.alias,
        cnpj: formatCnpj(o.cnpj),
        approvedAt: o.approvedAt,
        employees: n(m?.active),
        pendingRequests: n(m?.requested),
        projects: n(p?.total),
        projectsDone: n(p?.done),
        seconds: n(t?.seconds),
        seconds30: n(t?.seconds30),
        xp: n(t?.xp),
        /** Sem cobrança de empresas ainda: preenchido quando os planos empresariais existirem. */
        monthlyRevenueCents: null as number | null,
      };
    })
    .sort((a, b) => b.seconds - a.seconds || b.employees - a.employees);
}

/** Painel de instituições cadastradas: alunos, pedidos, horas e XP dos últimos 30 dias. */
export async function getInstitutionStats(ctx: Ctx, userId: string) {
  await requireMaster(ctx, userId);
  const now = ctx.now();
  const d30 = new Date(now.getTime() - 30 * DAY);
  const orgs = await ctx.db
    .select({
      id: organizations.id,
      alias: organizations.alias,
      cnpj: organizations.cnpj,
      status: organizations.status,
      approvedAt: organizations.approvedAt,
      createdAt: organizations.createdAt,
      institutionId: organizations.institutionId,
      institutionName: institutions.name,
    })
    .from(organizations)
    .leftJoin(institutions, eq(institutions.id, organizations.institutionId))
    .where(eq(organizations.kind, "institution"))
    .orderBy(desc(organizations.createdAt));
  const instIds = orgs.map((o) => o.institutionId).filter((x): x is string => Boolean(x));
  const [students, time, roster] = await Promise.all([
    instIds.length
      ? ctx.db
          .select({
            institutionId: institutionMemberships.institutionId,
            active: sql<number>`count(*) filter (where ${institutionMemberships.status} = 'active')::int`,
            pending: sql<number>`count(*) filter (where ${institutionMemberships.status} = 'pending')::int`,
          })
          .from(institutionMemberships)
          .where(inArray(institutionMemberships.institutionId, instIds))
          .groupBy(institutionMemberships.institutionId)
      : [],
    instIds.length
      ? ctx.db
          .select({
            institutionId: institutionMemberships.institutionId,
            seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
            xp: sql<number>`coalesce(sum(${studySessions.xpAwarded}), 0)::int`,
          })
          .from(studySessions)
          .innerJoin(institutionMemberships, eq(institutionMemberships.userId, studySessions.userId))
          .where(
            and(
              inArray(institutionMemberships.institutionId, instIds),
              eq(institutionMemberships.status, "active"),
              eq(studySessions.ranked, true),
              isNotNull(studySessions.endedAt),
              gte(studySessions.endedAt, d30),
              sql`${studySessions.endedAt} >= ${institutionMemberships.joinedAt}`,
            ),
          )
          .groupBy(institutionMemberships.institutionId)
      : [],
    ctx.db
      .select({ orgId: organizationRoster.organizationId, n: sql<number>`count(*)::int` })
      .from(organizationRoster)
      .groupBy(organizationRoster.organizationId),
  ]);
  return orgs.map((o) => {
    const s = students.find((x) => x.institutionId === o.institutionId);
    const t = time.find((x) => x.institutionId === o.institutionId);
    return {
      id: o.id,
      name: o.alias,
      cnpj: formatCnpj(o.cnpj),
      status: o.status,
      createdAt: o.createdAt,
      approvedAt: o.approvedAt,
      institutionName: o.institutionName,
      studentsActive: n(s?.active),
      studentsPending: n(s?.pending),
      rosterSize: n(roster.find((r) => r.orgId === o.id)?.n),
      seconds30: n(t?.seconds),
      xp30: n(t?.xp),
    };
  });
}
