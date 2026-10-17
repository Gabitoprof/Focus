import { and, asc, eq, ilike, inArray, isNotNull, or, sql } from "drizzle-orm";
import type { AppContext } from "@/domain/contexts";
import { cnpjDigits } from "@/domain/organizations";
import { normalizeEnrollment } from "@/domain/identity";
import { enrollmentHmac } from "../identity-crypto";
import {
  auditLogs,
  institutionMemberships,
  institutions,
  organizationMembers,
  organizationRoster,
  organizations,
  profiles,
  userIdentity,
} from "../db/schema";
import { AppError, type Ctx, type Tx } from "./common";
import type { DB } from "../db";

type Db = DB | Tx;

// ---------------------------------------------------------------------------
// Acesso aos perfis
// ---------------------------------------------------------------------------

/**
 * Perfis liberados: o Pessoal sempre; o Acadêmico para quem foi aceito por uma instituição de
 * ensino verificada; o Profissional para quem foi aceito por uma empresa verificada.
 */
export async function getContextAccess(db: Db, userId: string): Promise<Record<AppContext, boolean>> {
  const rows = await db
    .select({ kind: organizations.kind })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        eq(organizations.status, "approved"),
      ),
    );
  return {
    personal: true,
    academic: rows.some((r) => r.kind === "institution"),
    professional: rows.some((r) => r.kind === "company"),
  };
}

// ---------------------------------------------------------------------------
// Pedidos de vínculo e aceite
// ---------------------------------------------------------------------------

/** Organização verificada que representa a instituição do e-MEC/INEP (se existir). */
export async function orgForInstitution(db: Db, institutionId: string) {
  const [o] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.institutionId, institutionId), eq(organizations.status, "approved")));
  return o ?? null;
}

/** Chave da lista de matrículas: instituição → id do e-MEC/INEP; empresa → id da organização. */
const rosterKey = (org: { id: string; kind: string; institutionId: string | null }, value: string) =>
  enrollmentHmac(org.kind === "institution" && org.institutionId ? org.institutionId : org.id, value);

async function inRoster(db: Db, orgId: string, keyHmac: string) {
  const [r] = await db
    .select({ k: organizationRoster.keyHmac })
    .from(organizationRoster)
    .where(and(eq(organizationRoster.organizationId, orgId), eq(organizationRoster.keyHmac, keyHmac)));
  return Boolean(r);
}

async function activateOrgMember(tx: Db, orgId: string, userId: string, by: string | null, now: Date) {
  await tx
    .insert(organizationMembers)
    .values({ organizationId: orgId, userId, role: "member", status: "active", invitedBy: by, invitedAt: now, joinedAt: now })
    .onConflictDoUpdate({
      target: [organizationMembers.organizationId, organizationMembers.userId],
      set: { status: "active", joinedAt: now },
    });
}

/**
 * Depois que o aluno informa instituição + matrícula: se a instituição tem conta verificada na
 * Focus, o vínculo fica pendente até ela aceitar — ou é aceito na hora quando a matrícula está na
 * lista enviada por ela. Sem conta verificada, o vínculo declarado (CPF + matrícula) vale direto.
 */
export async function settleInstitutionMembership(
  tx: Db,
  userId: string,
  institutionId: string,
  enrollment: string,
  now: Date,
) {
  const org = await orgForInstitution(tx, institutionId);
  if (!org) return "active" as const;
  const matched = await inRoster(tx, org.id, rosterKey(org, normalizeEnrollment(enrollment)));
  if (matched) {
    await tx
      .update(institutionMemberships)
      .set({ status: "active", joinedAt: now, reviewedBy: "roster", enrollmentDisplay: null })
      .where(eq(institutionMemberships.userId, userId));
    await activateOrgMember(tx, org.id, userId, null, now);
    return "active" as const;
  }
  await tx
    .update(institutionMemberships)
    .set({ status: "pending", enrollmentDisplay: enrollment.trim().slice(0, 40), requestedAt: now, reviewedBy: null })
    .where(eq(institutionMemberships.userId, userId));
  return "pending" as const;
}

/** Empresas verificadas, para o funcionário pedir vínculo (por nome ou CNPJ). */
export async function searchCompanies(ctx: Ctx, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const digits = cnpjDigits(q);
  return ctx.db
    .select({ id: organizations.id, alias: organizations.alias, legalName: organizations.legalName })
    .from(organizations)
    .where(
      and(
        eq(organizations.kind, "company"),
        eq(organizations.status, "approved"),
        or(
          ilike(organizations.alias, `%${q}%`),
          ilike(organizations.legalName, `%${q}%`),
          digits.length >= 8 ? ilike(organizations.cnpj, `${digits}%`) : sql`false`,
        ),
      ),
    )
    .orderBy(asc(organizations.alias))
    .limit(10);
}

/**
 * Funcionário pede vínculo com uma empresa verificada informando a matrícula/registro.
 * Aceite automático se o registro estiver na lista da empresa; senão, fica pendente.
 */
export async function requestCompanyLink(ctx: Ctx, userId: string, orgId: string, registration: string) {
  const [identity] = await ctx.db.select({ u: userIdentity.userId }).from(userIdentity).where(eq(userIdentity.userId, userId));
  if (!identity) throw new AppError("Para pedir vínculo com uma empresa, vincule seu CPF primeiro.", "forbidden");
  const normalized = normalizeEnrollment(registration);
  if (normalized.length < 2 || normalized.length > 30) throw new AppError("Informe uma matrícula válida.");
  const [org] = await ctx.db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.kind, "company"), eq(organizations.status, "approved")));
  if (!org) throw new AppError("Organização não encontrada.", "not_found");
  const now = ctx.now();
  const key = rosterKey(org, normalized);
  const matched = await inRoster(ctx.db, org.id, key);
  const [existing] = await ctx.db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, userId)));
  if (existing?.status === "active") throw new AppError("Você já participa desta organização.", "conflict");
  try {
    await ctx.db
      .insert(organizationMembers)
      .values({
        organizationId: orgId,
        userId,
        role: "member",
        status: matched ? "active" : "requested",
        enrollmentHmac: key,
        enrollmentDisplay: matched ? null : registration.trim().slice(0, 40),
        invitedBy: userId,
        invitedAt: now,
        joinedAt: matched ? now : null,
      })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: {
          status: matched ? "active" : "requested",
          enrollmentHmac: key,
          enrollmentDisplay: matched ? null : registration.trim().slice(0, 40),
          joinedAt: matched ? now : null,
        },
      });
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      throw new AppError("Esta matrícula já está vinculada a outra conta nesta organização.", "conflict");
    }
    throw e;
  }
  await ctx.db.insert(auditLogs).values({
    actorUserId: userId,
    action: matched ? "organization.member_auto_accepted" : "organization.member_requested",
    entityType: "organization",
    entityId: orgId,
  });
  return { status: matched ? ("active" as const) : ("pending" as const) };
}

async function managedOrg(db: Db, actorId: string, orgId: string) {
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, actorId),
        eq(organizationMembers.status, "active"),
        eq(organizations.status, "approved"),
      ),
    );
  if (!row) throw new AppError("Organização não encontrada.", "not_found");
  if (row.role === "member") throw new AppError("Só o dono ou um gestor da organização pode fazer isso.", "forbidden");
  return row;
}

export type MemberRequest = {
  userId: string;
  displayName: string;
  publicCode: string | null;
  enrollment: string | null;
  requestedAt: Date | null;
  cpfVerified: boolean;
};

/** Pedidos de vínculo aguardando o aceite da organização (alunos ou funcionários). */
export async function listMemberRequests(ctx: Ctx, actorId: string, orgId: string): Promise<MemberRequest[]> {
  const { org } = await managedOrg(ctx.db, actorId, orgId);
  const rows =
    org.kind === "institution" && org.institutionId
      ? await ctx.db
          .select({
            userId: institutionMemberships.userId,
            displayName: profiles.displayName,
            publicCode: profiles.publicCode,
            enrollment: institutionMemberships.enrollmentDisplay,
            requestedAt: institutionMemberships.requestedAt,
          })
          .from(institutionMemberships)
          .innerJoin(profiles, eq(profiles.userId, institutionMemberships.userId))
          .where(
            and(
              eq(institutionMemberships.institutionId, org.institutionId),
              eq(institutionMemberships.status, "pending"),
            ),
          )
          .orderBy(asc(institutionMemberships.requestedAt))
      : await ctx.db
          .select({
            userId: organizationMembers.userId,
            displayName: profiles.displayName,
            publicCode: profiles.publicCode,
            enrollment: organizationMembers.enrollmentDisplay,
            requestedAt: organizationMembers.invitedAt,
          })
          .from(organizationMembers)
          .innerJoin(profiles, eq(profiles.userId, organizationMembers.userId))
          .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.status, "requested")))
          .orderBy(asc(organizationMembers.invitedAt));
  const ids = rows.map((r) => r.userId);
  const verified = ids.length
    ? await ctx.db.select({ userId: userIdentity.userId }).from(userIdentity).where(inArray(userIdentity.userId, ids))
    : [];
  const ok = new Set(verified.map((v) => v.userId));
  return rows.map((r) => ({ ...r, cpfVerified: ok.has(r.userId) }));
}

/**
 * Aceita ou recusa pedidos (um ou vários). Aceitar: o aluno passa a pontuar pela instituição a
 * partir de agora e ganha o perfil Acadêmico (funcionário: perfil Profissional). Recusar: o
 * pedido some e a pessoa pode reenviar os dados.
 */
export async function reviewMemberRequests(ctx: Ctx, actorId: string, orgId: string, userIds: string[], approve: boolean) {
  const { org } = await managedOrg(ctx.db, actorId, orgId);
  const now = ctx.now();
  let done = 0;
  await ctx.db.transaction(async (tx) => {
    for (const userId of [...new Set(userIds)]) {
      if (org.kind === "institution" && org.institutionId) {
        const where = and(
          eq(institutionMemberships.userId, userId),
          eq(institutionMemberships.institutionId, org.institutionId),
          eq(institutionMemberships.status, "pending"),
        );
        const [m] = await tx.select().from(institutionMemberships).where(where);
        if (!m) continue;
        if (approve) {
          await tx
            .update(institutionMemberships)
            .set({ status: "active", joinedAt: now, reviewedBy: actorId, enrollmentDisplay: null })
            .where(where);
          await activateOrgMember(tx, orgId, userId, actorId, now);
        } else {
          await tx.delete(institutionMemberships).where(where);
        }
      } else {
        const where = and(
          eq(organizationMembers.organizationId, orgId),
          eq(organizationMembers.userId, userId),
          eq(organizationMembers.status, "requested"),
        );
        const [m] = await tx.select().from(organizationMembers).where(where);
        if (!m) continue;
        if (approve) {
          await tx.update(organizationMembers).set({ status: "active", joinedAt: now, enrollmentDisplay: null }).where(where);
        } else {
          await tx.delete(organizationMembers).where(where);
        }
      }
      done++;
    }
    if (done) {
      await tx.insert(auditLogs).values({
        actorUserId: actorId,
        action: approve ? "organization.members_accepted" : "organization.members_rejected",
        entityType: "organization",
        entityId: orgId,
        metadata: { count: done },
      });
    }
  });
  return done;
}

/**
 * Lista de matrículas/registros para o aceite automático. Guarda só o HMAC. Depois de enviar,
 * os pedidos pendentes que batem com a lista são aceitos na hora.
 */
export async function addToRoster(ctx: Ctx, actorId: string, orgId: string, values: string[]) {
  const { org } = await managedOrg(ctx.db, actorId, orgId);
  if (org.kind === "institution" && !org.institutionId) {
    throw new AppError("Vincule a organização ao cadastro do e-MEC/INEP antes de enviar a lista de matrículas.", "invalid");
  }
  const keys = [...new Set(values.map(normalizeEnrollment).filter((v) => v.length >= 2 && v.length <= 30))].map((v) =>
    rosterKey(org, v),
  );
  if (keys.length === 0) throw new AppError("Nenhuma matrícula válida na lista.");
  if (keys.length > 100_000) throw new AppError("Envie no máximo 100.000 matrículas por vez.");
  for (let i = 0; i < keys.length; i += 1000) {
    await ctx.db
      .insert(organizationRoster)
      .values(keys.slice(i, i + 1000).map((keyHmac) => ({ organizationId: orgId, keyHmac })))
      .onConflictDoNothing();
  }
  // Pendentes que agora batem com a lista.
  const pendingIds =
    org.kind === "institution"
      ? (
          await ctx.db
            .select({ userId: institutionMemberships.userId })
            .from(institutionMemberships)
            .where(
              and(
                eq(institutionMemberships.institutionId, org.institutionId!),
                eq(institutionMemberships.status, "pending"),
                inArray(institutionMemberships.enrollmentHmac, keys),
              ),
            )
        ).map((r) => r.userId)
      : (
          await ctx.db
            .select({ userId: organizationMembers.userId })
            .from(organizationMembers)
            .where(
              and(
                eq(organizationMembers.organizationId, orgId),
                eq(organizationMembers.status, "requested"),
                isNotNull(organizationMembers.enrollmentHmac),
                inArray(organizationMembers.enrollmentHmac, keys),
              ),
            )
        ).map((r) => r.userId);
  const accepted = pendingIds.length ? await reviewMemberRequests(ctx, actorId, orgId, pendingIds, true) : 0;
  return { added: keys.length, accepted };
}

/** Liga a organização (instituição de ensino) ao registro dela no e-MEC/INEP. Só o dono. */
export async function linkOrgToInstitution(ctx: Ctx, actorId: string, orgId: string, institutionId: string) {
  const { org, role } = await managedOrg(ctx.db, actorId, orgId);
  if (role !== "owner") throw new AppError("Só o dono da organização pode fazer isso.", "forbidden");
  if (org.kind !== "institution") throw new AppError("Só instituições de ensino têm registro no e-MEC/INEP.", "invalid");
  const [inst] = await ctx.db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, institutionId));
  if (!inst) throw new AppError("Instituição não encontrada.", "not_found");
  const taken = await orgForInstitution(ctx.db, institutionId);
  if (taken && taken.id !== orgId) throw new AppError("Esta instituição já está vinculada a outra organização.", "conflict");
  await ctx.db.update(organizations).set({ institutionId, updatedAt: ctx.now() }).where(eq(organizations.id, orgId));
  // Alunos já vinculados a essa instituição viram membros da organização (sem perder pontuação).
  const linked = await ctx.db
    .select({ userId: institutionMemberships.userId })
    .from(institutionMemberships)
    .where(and(eq(institutionMemberships.institutionId, institutionId), eq(institutionMemberships.status, "active")));
  const now = ctx.now();
  for (const { userId } of linked) {
    await ctx.db
      .insert(organizationMembers)
      .values({ organizationId: orgId, userId, role: "member", status: "active", invitedBy: actorId, invitedAt: now, joinedAt: now })
      .onConflictDoNothing();
  }
  await ctx.db.insert(auditLogs).values({
    actorUserId: actorId,
    action: "organization.linked_institution",
    entityType: "organization",
    entityId: orgId,
    metadata: { institutionId, students: linked.length },
  });
}
