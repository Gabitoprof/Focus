import { createHash, randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { normalizeTerm } from "@/domain/catalog";
import {
  ORG_LIMITS,
  canAutoApprove,
  cnpjDigits,
  domainMatches,
  emailDomain,
  formatCnpj,
  isEducationActivity,
  isFreeEmailDomain,
  isValidCnpj,
  orgContext,
  type OrgChecks,
  type OrgRole,
  type OrganizationKind,
} from "@/domain/organizations";
import { clippedSeconds, type Range } from "@/domain/time";
import { getCnpjProvider, type CnpjData, type CnpjProvider } from "../cnpj-lookup";
import {
  auditLogs,
  institutions,
  organizationMembers,
  organizations,
  profiles,
  projectMembers,
  projects,
  sessionSegments,
  studySessions,
  user,
  userIdentity,
} from "../db/schema";
import { cpfHmac } from "../identity-crypto";
import { sendMail } from "../mail";
import { AppError, type Ctx, type Tx } from "./common";
import { createProject } from "./projects";
import type { DB } from "../db";

type Db = DB | Tx;
type OrgRow = typeof organizations.$inferSelect;
export type Mailer = (msg: { to: string; subject: string; text: string }) => Promise<void>;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const isUniqueViolation = (e: unknown) => {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
};

// ---------------------------------------------------------------------------
// Pedido de cadastro e verificação
// ---------------------------------------------------------------------------

export type OrganizationRequestInput = {
  kind: OrganizationKind;
  cnpj: string;
  alias: string;
  contactEmail: string;
  requesterRole: string;
  message: string;
  institutionId?: string | null;
};

/**
 * Pedido de cadastro de instituição/empresa. Exige conta com CPF verificado. Consulta o CNPJ,
 * guarda as checagens automáticas e envia o link de confirmação ao e-mail informado.
 */
export async function requestOrganization(
  ctx: Ctx,
  userId: string,
  input: OrganizationRequestInput,
  opts: { provider?: CnpjProvider; mailer?: Mailer; baseUrl: string },
) {
  const [identity] = await ctx.db.select().from(userIdentity).where(eq(userIdentity.userId, userId));
  if (!identity) throw new AppError("Para cadastrar uma organização, vincule seu CPF primeiro.", "forbidden");
  const cnpj = cnpjDigits(input.cnpj);
  if (!isValidCnpj(cnpj)) throw new AppError("CNPJ inválido.");

  const open = await ctx.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(
      and(
        eq(organizations.requesterUserId, userId),
        inArray(organizations.status, ["pending_email", "pending_review"]),
      ),
    );
  if (open.length >= ORG_LIMITS.maxOpenRequests) {
    throw new AppError("Você já tem pedidos em andamento. Aguarde a análise.", "conflict");
  }
  const [taken] = await ctx.db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(eq(organizations.cnpj, cnpj), ne(organizations.status, "rejected")));
  if (taken) throw new AppError("Este CNPJ já está cadastrado ou em análise.", "conflict");
  if (input.institutionId) {
    const [inst] = await ctx.db.select({ id: institutions.id }).from(institutions).where(eq(institutions.id, input.institutionId));
    if (!inst) throw new AppError("Instituição não encontrada.", "not_found");
  }

  const result = await (opts.provider ?? getCnpjProvider()).lookup(cnpj);
  if (result.status === "unavailable") {
    throw new AppError("A consulta de CNPJ está indisponível no momento. Tente novamente mais tarde.");
  }
  if (result.status === "not_found") throw new AppError("CNPJ não encontrado.", "not_found");
  const data = result.data;
  if (!data.active) throw new AppError("Este CNPJ não está ativo.");

  const [requester] = await ctx.db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const domain = emailDomain(input.contactEmail);
  const checks: OrgChecks = {
    cnpjActive: data.active,
    educationActivity: input.kind === "institution" ? data.activityIds.some(isEducationActivity) : null,
    corporateDomain: Boolean(domain) && !isFreeEmailDomain(domain),
    domainMatchesCnpj: domainMatches(domain, data.emailDomains),
    requesterIsMember: Boolean(requester) && data.memberNames.some((n) => normalizeTerm(n) === normalizeTerm(requester.name)),
    emailConfirmed: false,
  };

  const token = randomBytes(32).toString("hex");
  const now = ctx.now();
  let org: OrgRow;
  try {
    [org] = await ctx.db
      .insert(organizations)
      .values({
        kind: input.kind,
        cnpj,
        legalName: data.legalName,
        alias: input.alias.trim(),
        institutionId: input.institutionId ?? null,
        requesterUserId: userId,
        requesterRole: input.requesterRole.trim(),
        contactEmail: input.contactEmail.trim().toLowerCase(),
        message: input.message.trim(),
        status: "pending_email",
        checks,
        cnpjSnapshot: snapshot(data),
        emailTokenHash: hashToken(token),
        emailTokenExpiresAt: new Date(now.getTime() + ORG_LIMITS.emailTokenHours * 3_600_000),
      })
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("Este CNPJ já está cadastrado ou em análise.", "conflict");
    throw e;
  }
  await ctx.db.insert(auditLogs).values({
    actorUserId: userId,
    action: "organization.requested",
    entityType: "organization",
    entityId: org.id,
    metadata: { cnpj, kind: input.kind, checks },
  });
  await (opts.mailer ?? sendMail)({
    to: org.contactEmail,
    subject: "Focus — confirme o cadastro da organização",
    text:
      `Recebemos o pedido de cadastro de ${org.alias} (CNPJ ${formatCnpj(cnpj)}) na Focus.\n\n` +
      `Para confirmar que este e-mail pertence à organização, abra o link (válido por ${ORG_LIMITS.emailTokenHours} horas):\n` +
      `${opts.baseUrl}/organizacao/confirmar?token=${token}\n\n` +
      `Se você não fez este pedido, ignore esta mensagem.`,
  });
  return { id: org.id };
}

function snapshot(d: CnpjData) {
  return {
    legalName: d.legalName,
    alias: d.alias,
    statusText: d.statusText,
    mainActivity: d.mainActivity,
    activityIds: d.activityIds,
    emailDomains: d.emailDomains,
    emails: d.emails,
    city: d.city,
    uf: d.uf,
  };
}

/**
 * Confirma o e-mail do pedido pelo link. Se todas as checagens conferem, a organização é aprovada
 * na hora; senão, vai para a análise da equipe.
 */
export async function confirmOrganizationEmail(ctx: Ctx, token: string, mailer: Mailer = sendMail) {
  const now = ctx.now();
  const [org] = await ctx.db.select().from(organizations).where(eq(organizations.emailTokenHash, hashToken(token)));
  if (!org || org.status !== "pending_email") throw new AppError("Link inválido ou já utilizado.", "not_found");
  if (!org.emailTokenExpiresAt || org.emailTokenExpiresAt < now) {
    throw new AppError("Este link expirou. Faça o pedido novamente.", "invalid");
  }
  const checks: OrgChecks = { ...org.checks, emailConfirmed: true };
  await ctx.db
    .update(organizations)
    .set({
      checks,
      emailConfirmedAt: now,
      emailTokenHash: null,
      emailTokenExpiresAt: null,
      status: "pending_review",
      updatedAt: now,
    })
    .where(eq(organizations.id, org.id));
  if (canAutoApprove(org.kind, checks)) {
    await approve(ctx, { ...org, checks }, null, "Aprovação automática: todas as checagens conferem.", mailer);
    return { id: org.id, status: "approved" as const };
  }
  return { id: org.id, status: "pending_review" as const };
}

async function approve(ctx: Ctx, org: OrgRow, reviewerId: string | null, note: string, mailer: Mailer) {
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(organizations)
      .set({ status: "approved", approvedAt: now, reviewedBy: reviewerId, reviewNote: note, updatedAt: now })
      .where(eq(organizations.id, org.id));
    await tx
      .insert(organizationMembers)
      .values({
        organizationId: org.id,
        userId: org.requesterUserId,
        role: "owner",
        status: "active",
        invitedBy: org.requesterUserId,
        invitedAt: now,
        joinedAt: now,
      })
      .onConflictDoUpdate({
        target: [organizationMembers.organizationId, organizationMembers.userId],
        set: { role: "owner", status: "active", joinedAt: now },
      });
    await tx.insert(auditLogs).values({
      actorUserId: reviewerId,
      action: "organization.approved",
      entityType: "organization",
      entityId: org.id,
      metadata: { note },
    });
  });
  // Aviso aos e-mails do cadastro do CNPJ (a organização legítima pode contestar).
  const official = ((org.cnpjSnapshot as { emails?: string[] } | null)?.emails ?? []).filter((e) => e !== org.contactEmail);
  for (const to of [org.contactEmail, ...official].slice(0, 4)) {
    await mailer({
      to,
      subject: "Focus — organização cadastrada",
      text:
        `${org.alias} (CNPJ ${formatCnpj(org.cnpj)}) foi cadastrada na Focus, a pedido de ${org.contactEmail}.\n` +
        `Se não reconhece este cadastro, responda a este e-mail para contestar.`,
    }).catch((e) => console.warn("[organizations] aviso não enviado", e));
  }
}

/** Fila de análise (admin). */
export async function listPendingOrganizations(ctx: Ctx) {
  return ctx.db
    .select({
      org: organizations,
      requesterName: profiles.displayName,
      requesterCode: profiles.publicCode,
    })
    .from(organizations)
    .innerJoin(profiles, eq(profiles.userId, organizations.requesterUserId))
    .where(eq(organizations.status, "pending_review"))
    .orderBy(asc(organizations.createdAt));
}

/** Decisão da equipe sobre um pedido em análise. */
export async function reviewOrganization(
  ctx: Ctx,
  adminId: string,
  orgId: string,
  decision: { approve: boolean; note: string },
  mailer: Mailer = sendMail,
) {
  const [org] = await ctx.db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org || org.status !== "pending_review") throw new AppError("Pedido não encontrado.", "not_found");
  if (decision.approve) {
    await approve(ctx, org, adminId, decision.note, mailer);
    return;
  }
  const now = ctx.now();
  await ctx.db
    .update(organizations)
    .set({ status: "rejected", reviewedBy: adminId, reviewNote: decision.note, updatedAt: now })
    .where(eq(organizations.id, orgId));
  await ctx.db.insert(auditLogs).values({
    actorUserId: adminId,
    action: "organization.rejected",
    entityType: "organization",
    entityId: orgId,
    metadata: { note: decision.note },
  });
  await mailer({
    to: org.contactEmail,
    subject: "Focus — pedido de cadastro não aprovado",
    text: `O pedido de cadastro de ${org.alias} não foi aprovado.${decision.note ? `\nMotivo: ${decision.note}` : ""}`,
  }).catch((e) => console.warn("[organizations] aviso não enviado", e));
}

// ---------------------------------------------------------------------------
// Membros e papéis
// ---------------------------------------------------------------------------

/** Membro ativo de organização aprovada; senão, "não encontrada". */
async function activeOrgMember(db: Db, userId: string, orgId: string) {
  const [row] = await db
    .select({ org: organizations, role: organizationMembers.role, area: organizationMembers.area })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.organizationId, orgId),
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        eq(organizations.status, "approved"),
      ),
    );
  if (!row) throw new AppError("Organização não encontrada.", "not_found");
  return row;
}

async function managerOf(db: Db, userId: string, orgId: string) {
  const m = await activeOrgMember(db, userId, orgId);
  if (m.role === "member") throw new AppError("Só o dono ou um gestor da organização pode fazer isso.", "forbidden");
  return m;
}

/** Organizações em que o usuário está, convites recebidos e pedidos feitos por ele. */
export async function listMyOrganizations(ctx: Ctx, userId: string) {
  const [memberships, requests] = await Promise.all([
    ctx.db
      .select({
        id: organizations.id,
        kind: organizations.kind,
        alias: organizations.alias,
        legalName: organizations.legalName,
        role: organizationMembers.role,
        status: organizationMembers.status,
        area: organizationMembers.area,
      })
      .from(organizationMembers)
      .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
      .where(and(eq(organizationMembers.userId, userId), eq(organizations.status, "approved")))
      .orderBy(asc(organizations.alias)),
    ctx.db
      .select({
        id: organizations.id,
        kind: organizations.kind,
        alias: organizations.alias,
        cnpj: organizations.cnpj,
        status: organizations.status,
        reviewNote: organizations.reviewNote,
        createdAt: organizations.createdAt,
      })
      .from(organizations)
      .where(and(eq(organizations.requesterUserId, userId), ne(organizations.status, "approved")))
      .orderBy(desc(organizations.createdAt)),
  ]);
  return {
    organizations: memberships.filter((m) => m.status === "active"),
    invites: memberships.filter((m) => m.status === "invited"),
    /** Pedidos de vínculo feitos pela pessoa, aguardando o aceite da organização. */
    pendingLinks: memberships.filter((m) => m.status === "requested"),
    requests,
  };
}

/** Convida pelo código da conta. Só o dono convida gestores; dono e gestores convidam membros. */
export async function inviteOrgMember(
  ctx: Ctx,
  actorId: string,
  orgId: string,
  input: { publicCode: string; role: OrgRole; area?: string | null },
) {
  const actor = await managerOf(ctx.db, actorId, orgId);
  if (input.role === "owner") throw new AppError("Papel inválido.");
  if (input.role === "manager" && actor.role !== "owner") {
    throw new AppError("Só o dono pode convidar gestores.", "forbidden");
  }
  const [target] = await ctx.db
    .select({ userId: profiles.userId })
    .from(profiles)
    .where(eq(profiles.publicCode, input.publicCode.trim().toUpperCase()));
  if (!target) throw new AppError("Nenhuma conta com esse código.", "not_found");
  const [{ n }] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(organizationMembers)
    .where(eq(organizationMembers.organizationId, orgId));
  if (Number(n) >= ORG_LIMITS.maxMembers) throw new AppError("A organização atingiu o limite de membros.", "conflict");
  const inserted = await ctx.db
    .insert(organizationMembers)
    .values({
      organizationId: orgId,
      userId: target.userId,
      role: input.role,
      area: input.area?.trim() || null,
      status: "invited",
      invitedBy: actorId,
      invitedAt: ctx.now(),
    })
    .onConflictDoNothing()
    .returning();
  if (inserted.length === 0) throw new AppError("Essa pessoa já participa ou já foi convidada.", "conflict");
}

export async function respondOrgInvite(ctx: Ctx, userId: string, orgId: string, accept: boolean) {
  const where = and(
    eq(organizationMembers.organizationId, orgId),
    eq(organizationMembers.userId, userId),
    eq(organizationMembers.status, "invited"),
  );
  const [invite] = await ctx.db.select().from(organizationMembers).where(where);
  if (!invite) throw new AppError("Convite não encontrado.", "not_found");
  if (accept) await ctx.db.update(organizationMembers).set({ status: "active", joinedAt: ctx.now() }).where(where);
  else await ctx.db.delete(organizationMembers).where(where);
}

/** Altera papel/área de um membro (só o dono altera papéis; gestores alteram áreas de membros). */
export async function updateOrgMember(
  ctx: Ctx,
  actorId: string,
  orgId: string,
  memberId: string,
  input: { role?: Exclude<OrgRole, "owner">; area?: string | null },
) {
  const actor = await managerOf(ctx.db, actorId, orgId);
  const [m] = await ctx.db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, memberId)));
  if (!m) throw new AppError("Participante não encontrado.", "not_found");
  if (m.role === "owner" && input.role) throw new AppError("O papel do dono não muda.", "invalid");
  if (actor.role !== "owner" && (input.role || m.role !== "member")) {
    throw new AppError("Só o dono pode alterar gestores e papéis.", "forbidden");
  }
  await ctx.db
    .update(organizationMembers)
    .set({
      ...(input.role ? { role: input.role } : {}),
      ...(input.area !== undefined ? { area: input.area?.trim() || null } : {}),
    })
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, memberId)));
}

/**
 * Remove um membro (dono remove qualquer um; gestor remove membros; qualquer um pode sair).
 * Sai também dos projetos da organização; o tempo registrado continua nos projetos.
 */
export async function removeOrgMember(ctx: Ctx, actorId: string, orgId: string, memberId: string) {
  const [m] = await ctx.db
    .select()
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, memberId)));
  if (!m) throw new AppError("Participante não encontrado.", "not_found");
  if (m.role === "owner") throw new AppError("O dono não pode sair da organização.", "invalid");
  if (actorId !== memberId) {
    const actor = await managerOf(ctx.db, actorId, orgId);
    if (actor.role !== "owner" && m.role !== "member") throw new AppError("Só o dono pode remover gestores.", "forbidden");
  }
  await ctx.db.transaction(async (tx) => {
    await tx
      .delete(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, orgId), eq(organizationMembers.userId, memberId)));
    const orgProjects = await tx.select({ id: projects.id }).from(projects).where(eq(projects.organizationId, orgId));
    if (orgProjects.length) {
      await tx
        .delete(projectMembers)
        .where(
          and(
            eq(projectMembers.userId, memberId),
            ne(projectMembers.role, "owner"),
            inArray(projectMembers.projectId, orgProjects.map((p) => p.id)),
          ),
        );
    }
  });
}

// ---------------------------------------------------------------------------
// Projetos da organização e ranking interno
// ---------------------------------------------------------------------------

/** Dono/gestor cria um projeto da organização (contexto Acadêmico ou Profissional). */
export async function createOrgProject(
  ctx: Ctx,
  actorId: string,
  orgId: string,
  input: { name: string; description?: string | null; targetMinutes?: number | null; dueDate?: string | null; color?: string },
) {
  const { org } = await managerOf(ctx.db, actorId, orgId);
  const p = await createProject(ctx, actorId, { ...input, context: orgContext(org.kind) });
  await ctx.db.update(projects).set({ organizationId: orgId }).where(eq(projects.id, p.id));
  return { ...p, organizationId: orgId };
}

/**
 * Designa um membro da organização para um projeto dela (sem convite: o vínculo com a
 * organização já foi aceito). Quem designa: o dono do projeto ou o dono da organização.
 */
export async function assignToOrgProject(ctx: Ctx, actorId: string, orgId: string, projectId: string, memberId: string) {
  const actor = await managerOf(ctx.db, actorId, orgId);
  const [p] = await ctx.db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId), isNull(projects.deletedAt)));
  if (!p) throw new AppError("Projeto não encontrado.", "not_found");
  if (p.ownerUserId !== actorId && actor.role !== "owner") {
    throw new AppError("Só quem criou o projeto ou o dono da organização pode designar pessoas.", "forbidden");
  }
  await activeOrgMember(ctx.db, memberId, orgId).catch(() => {
    throw new AppError("Essa pessoa não é membro ativo da organização.", "invalid");
  });
  const now = ctx.now();
  await ctx.db
    .insert(projectMembers)
    .values({ projectId, userId: memberId, role: "member", status: "active", invitedBy: actorId, invitedAt: now, joinedAt: now })
    .onConflictDoUpdate({
      target: [projectMembers.projectId, projectMembers.userId],
      set: { status: "active", joinedAt: now },
    });
}

/**
 * Painel da organização para um membro ativo. Dono e gestores veem todos os projetos e membros;
 * membros veem os colegas e os projetos em que participam. Só o tempo em projetos da
 * organização aparece aqui (estudos e vida pessoal de cada um nunca).
 */
export async function getOrganization(ctx: Ctx, userId: string, orgId: string, range?: Range) {
  const me = await activeOrgMember(ctx.db, userId, orgId);
  const canManage = me.role !== "member";
  const [linkedInstitution = null] = me.org.institutionId
    ? await ctx.db
        .select({ id: institutions.id, name: institutions.name, acronym: institutions.acronym })
        .from(institutions)
        .where(eq(institutions.id, me.org.institutionId))
    : [];
  const now = ctx.now();
  const [members, orgProjects] = await Promise.all([
    ctx.db
      .select({
        userId: organizationMembers.userId,
        role: organizationMembers.role,
        area: organizationMembers.area,
        status: organizationMembers.status,
        displayName: profiles.displayName,
        publicCode: profiles.publicCode,
      })
      .from(organizationMembers)
      .innerJoin(profiles, eq(profiles.userId, organizationMembers.userId))
      // Pedidos de vínculo ainda não aceitos aparecem só na lista de solicitações.
      .where(and(eq(organizationMembers.organizationId, orgId), ne(organizationMembers.status, "requested")))
      .orderBy(asc(profiles.displayName)),
    ctx.db
      .select()
      .from(projects)
      .where(
        and(
          or(eq(projects.organizationId, orgId), eq(projects.movedFromOrganizationId, orgId)),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(asc(projects.name)),
  ]);
  const projectIds = orgProjects.map((p) => p.id);
  const [pm, segs] = projectIds.length
    ? await Promise.all([
        ctx.db
          .select({ projectId: projectMembers.projectId, userId: projectMembers.userId })
          .from(projectMembers)
          .where(and(inArray(projectMembers.projectId, projectIds), eq(projectMembers.status, "active"))),
        orgSegments(ctx.db, projectIds, range),
      ])
    : [[], []];
  // Projeto que saiu da organização só conta o tempo de antes da mudança.
  const movedAt = new Map(orgProjects.filter((p) => p.organizationId !== orgId && p.movedAt).map((p) => [p.id, p.movedAt!]));
  const secondsOf = (pred: (s: { projectId: string; userId: string }) => boolean) =>
    Math.floor(
      segs.filter(pred).reduce((a, s) => {
        const cut = movedAt.get(s.projectId);
        const end = cut && (s.end ?? now) > cut ? cut : (s.end ?? now);
        if (cut && s.start >= cut) return a;
        return a + (range ? clippedSeconds(s.start, end, range) : secs(s.start, end));
      }, 0),
    );

  const active = members.filter((m) => m.status === "active");
  const ranking = active
    .map((m) => ({ ...m, seconds: secondsOf((s) => s.userId === m.userId), isViewer: m.userId === userId }))
    .sort((a, b) => b.seconds - a.seconds || a.displayName.localeCompare(b.displayName));
  const areas = [...new Set(active.map((m) => m.area).filter((a): a is string => Boolean(a)))].sort();

  const visibleProjects = orgProjects.filter(
    (p) => (canManage || pm.some((x) => x.projectId === p.id && x.userId === userId)) && (p.organizationId === orgId || canManage),
  );
  const nameOf = new Map(members.map((m) => [m.userId, m.displayName]));
  return {
    id: me.org.id,
    kind: me.org.kind,
    alias: me.org.alias,
    legalName: me.org.legalName,
    cnpj: formatCnpj(me.org.cnpj),
    /** Registro do e-MEC/INEP ligado à organização (instituições de ensino). */
    institution: linkedInstitution,
    page: { about: me.org.about, whyStudy: me.org.whyStudy, website: me.org.website },
    role: me.role,
    canManage,
    isOwner: me.role === "owner",
    members: (canManage ? members : active).map((m) => ({ ...m, isViewer: m.userId === userId })),
    areas,
    /** Ranking interno: geral e por área (posição recalculada dentro da área na tela). */
    ranking,
    projects: visibleProjects.map((p) => ({
      id: p.id,
      name: p.name,
      color: p.color,
      status: p.status,
      targetMinutes: p.targetMinutes,
      dueDate: p.dueDate,
      ownerUserId: p.ownerUserId,
      memberIds: pm.filter((x) => x.projectId === p.id).map((x) => x.userId),
      seconds: secondsOf((s) => s.projectId === p.id),
      /** Saiu da organização (movido para o Pessoal): aparece riscado, sem detalhes novos. */
      movedOut: p.organizationId !== orgId,
      movedBy: p.organizationId !== orgId && p.movedBy ? (nameOf.get(p.movedBy) ?? null) : null,
    })),
  };
}

export type OrganizationDetail = Awaited<ReturnType<typeof getOrganization>>;

const secs = (a: Date, b: Date) => Math.max(0, (b.getTime() - a.getTime()) / 1000);

async function orgSegments(db: Db, projectIds: string[], range?: Range) {
  const where = [inArray(studySessions.projectId, projectIds)];
  if (range) {
    where.push(lt(sessionSegments.startedAt, range.end));
    where.push(or(isNull(sessionSegments.endedAt), gt(sessionSegments.endedAt, range.start))!);
  }
  const rows = await db
    .select({
      projectId: studySessions.projectId,
      userId: sessionSegments.userId,
      start: sessionSegments.startedAt,
      end: sessionSegments.endedAt,
    })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(and(...where));
  return rows.map((r) => ({ ...r, projectId: r.projectId! }));
}

/** Página pública da instituição no ranking (apresentação, por que estudar lá, site). Dono/gestor. */
export async function updateOrgPublicPage(
  ctx: Ctx,
  actorId: string,
  orgId: string,
  input: { about?: string | null; whyStudy?: string | null; website?: string | null },
) {
  await managerOf(ctx.db, actorId, orgId);
  const website = input.website?.trim() || null;
  if (website && !/^https:\/\/[^\s/$.?#].[^\s]*$/i.test(website)) throw new AppError("Informe o site começando com https://.");
  await ctx.db
    .update(organizations)
    .set({
      about: input.about?.trim() || null,
      whyStudy: input.whyStudy?.trim() || null,
      website,
      updatedAt: ctx.now(),
    })
    .where(eq(organizations.id, orgId));
}

// ---------------------------------------------------------------------------
// Busca de membros (gestores): por nome, CPF e turma/área
// ---------------------------------------------------------------------------

export type MemberSearch = {
  /** Nome (parte dele, sem acento/maiúsculas) ou CPF (11 dígitos, com ou sem pontuação). */
  query?: string;
  area?: string | null;
  /** Esconde quem já participa (ativo) deste projeto. */
  excludeProjectId?: string;
  limit?: number;
};

/**
 * Membros ativos da organização que batem com o filtro. O CPF nunca é gravado: comparamos o
 * HMAC do CPF digitado com o da conta verificada. Só o dono e os gestores podem buscar.
 */
export async function searchOrgMembers(ctx: Ctx, actorId: string, orgId: string, f: MemberSearch = {}) {
  await managerOf(ctx.db, actorId, orgId);
  const q = (f.query ?? "").trim();
  const digits = q.replace(/\D/g, "");
  const byCpf = digits.length === 11 && /^[\d.\-\s]+$/.test(q);
  const where = [eq(organizationMembers.organizationId, orgId), eq(organizationMembers.status, "active")];
  if (f.area) where.push(eq(organizationMembers.area, f.area));
  if (byCpf) {
    where.push(eq(userIdentity.cpfHmac, cpfHmac(digits)));
  }
  let rows = await ctx.db
    .select({
      userId: organizationMembers.userId,
      role: organizationMembers.role,
      area: organizationMembers.area,
      enrollment: organizationMembers.enrollmentDisplay,
      displayName: profiles.displayName,
      publicCode: profiles.publicCode,
      cpfLastDigits: userIdentity.cpfLastDigits,
    })
    .from(organizationMembers)
    .innerJoin(profiles, eq(profiles.userId, organizationMembers.userId))
    .leftJoin(userIdentity, eq(userIdentity.userId, organizationMembers.userId))
    .where(and(...where))
    .orderBy(asc(profiles.displayName));
  if (q && !byCpf) {
    const term = normalizeTerm(q);
    rows = rows.filter((r) => normalizeTerm(r.displayName).includes(term) || (r.enrollment && normalizeTerm(r.enrollment).includes(term)));
  }
  if (f.excludeProjectId) {
    const inProject = await ctx.db
      .select({ userId: projectMembers.userId })
      .from(projectMembers)
      .where(and(eq(projectMembers.projectId, f.excludeProjectId), eq(projectMembers.status, "active")));
    const skip = new Set(inProject.map((m) => m.userId));
    rows = rows.filter((r) => !skip.has(r.userId));
  }
  return rows.slice(0, Math.min(f.limit ?? 50, 200));
}

/**
 * No projeto de uma organização: quem vê o projeto pode incluir membros direto (sem convite)?
 * Pode o dono da organização ou o gestor que criou o projeto. Retorna também as turmas/áreas.
 */
export async function orgAssignRights(ctx: Ctx, userId: string, project: { organizationId: string | null; ownerUserId: string }) {
  if (!project.organizationId) return null;
  const me = await managerOf(ctx.db, userId, project.organizationId).catch(() => null);
  if (!me || (me.role !== "owner" && project.ownerUserId !== userId)) return null;
  const areas = await ctx.db
    .selectDistinct({ area: organizationMembers.area })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, project.organizationId), eq(organizationMembers.status, "active")));
  return {
    orgId: project.organizationId,
    orgAlias: me.org.alias,
    areas: areas.map((a) => a.area).filter((a): a is string => Boolean(a)).sort(),
  };
}

/**
 * Organização que um gestor está representando ao criar um projeto no Registro: no Acadêmico,
 * a instituição; no Profissional, a empresa. Assim o projeto já nasce da organização e os
 * participantes entram direto, sem convite.
 */
export async function managedOrgForContext(db: Db, userId: string, context: string) {
  if (context !== "academic" && context !== "professional") return null;
  const rows = await db
    .select({ id: organizations.id, kind: organizations.kind })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizations.id, organizationMembers.organizationId))
    .where(
      and(
        eq(organizationMembers.userId, userId),
        eq(organizationMembers.status, "active"),
        ne(organizationMembers.role, "member"),
        eq(organizations.status, "approved"),
      ),
    )
    .orderBy(asc(organizationMembers.joinedAt));
  return rows.find((r) => orgContext(r.kind) === context)?.id ?? null;
}
