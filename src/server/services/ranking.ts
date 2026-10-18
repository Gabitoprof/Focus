import { SHOWCASE_MAX } from "@/domain/achievements";
import { TZDate } from "@date-fns/tz";
import { startOfDay, startOfISOWeek, startOfMonth } from "date-fns";
import { and, eq, gte, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import { GOAL_TAGS } from "@/domain/catalog";
import { titleFor, type TitleId } from "@/domain/titles";
import {
  catalogTopics,
  institutionMemberships,
  institutions,
  organizations,
  knowledgeAreas,
  profiles,
  studyMethods,
  studySessions,
  userGoalTags,
  xpTransactions,
} from "../db/schema";
import { getCatalogSettings, getProfileTags } from "./catalog";
import { AppError, type Ctx } from "./common";
import { getAccess, requireFeature } from "./entitlements";
import { getMembership, type InstitutionKind } from "./institutions";

/** Fuso oficial dos rankings (início de semana e de mês iguais para todos). */
export const RANKING_TIMEZONE = "America/Sao_Paulo";

export const RANKING_SCOPES = ["global", "mine", "filter", "institution"] as const;
export const RANKING_PERIODS = ["day", "week", "month", "all"] as const;
export type RankingScope = (typeof RANKING_SCOPES)[number];
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

export type RankingQuery = {
  scope: RankingScope;
  period: RankingPeriod;
  areaId?: string;
  topicId?: string;
  methodId?: string;
  page?: number;
  pageSize?: number;
};

/** Critério de contagem de XP de um recorte. */
type Criteria = {
  start: Date | null;
  end: Date;
  methodId?: string;
  areaId?: string;
  topicId?: string;
  /** "Meu geral": XP em qualquer uma das áreas OU temas. */
  anyOf?: { areaIds: string[]; topicIds: string[] };
  /** Ranking da instituição: só membros, e só o XP ganho depois de entrar nela. */
  institutionId?: string;
};

export function periodStart(period: RankingPeriod, now: Date): Date | null {
  const local = new TZDate(now.getTime(), RANKING_TIMEZONE);
  if (period === "day") return new Date(startOfDay(local).getTime());
  if (period === "week") return new Date(startOfISOWeek(local).getTime());
  if (period === "month") return new Date(startOfMonth(local).getTime());
  return null;
}

function xpConditions(c: Criteria): SQL[] {
  // XP de categorias pessoais nunca entra em ranking.
  const w: SQL[] = [lte(xpTransactions.createdAt, c.end), eq(xpTransactions.ranked, true)];
  if (c.start) w.push(gte(xpTransactions.createdAt, c.start));
  if (c.methodId) w.push(eq(xpTransactions.methodId, c.methodId));
  if (c.areaId) w.push(eq(xpTransactions.areaId, c.areaId));
  if (c.topicId) w.push(eq(xpTransactions.catalogTopicId, c.topicId));
  if (c.anyOf) {
    const parts: SQL[] = [];
    if (c.anyOf.areaIds.length) parts.push(inArray(xpTransactions.areaId, c.anyOf.areaIds));
    if (c.anyOf.topicIds.length) parts.push(inArray(xpTransactions.catalogTopicId, c.anyOf.topicIds));
    w.push(parts.length ? or(...parts)! : sql`false`);
  }
  if (c.institutionId) {
    w.push(
      sql`exists (select 1 from ${institutionMemberships} m where m.user_id = ${xpTransactions.userId} and m.institution_id = ${c.institutionId} and m.status = 'active' and ${xpTransactions.createdAt} >= m.joined_at)`,
    );
  }
  return w;
}

function sessionConditions(c: Criteria): SQL[] {
  const w: SQL[] = [isNotNull(studySessions.endedAt), lte(studySessions.endedAt, c.end), eq(studySessions.ranked, true)];
  if (c.start) w.push(gte(studySessions.endedAt, c.start));
  if (c.methodId) w.push(eq(studySessions.methodId, c.methodId));
  if (c.areaId) w.push(eq(studySessions.areaId, c.areaId));
  if (c.topicId) w.push(eq(studySessions.catalogTopicId, c.topicId));
  if (c.anyOf) {
    const parts: SQL[] = [];
    if (c.anyOf.areaIds.length) parts.push(inArray(studySessions.areaId, c.anyOf.areaIds));
    if (c.anyOf.topicIds.length) parts.push(inArray(studySessions.catalogTopicId, c.anyOf.topicIds));
    w.push(parts.length ? or(...parts)! : sql`false`);
  }
  if (c.institutionId) {
    w.push(
      sql`exists (select 1 from ${institutionMemberships} m where m.user_id = ${studySessions.userId} and m.institution_id = ${c.institutionId} and m.status = 'active' and ${studySessions.endedAt} >= m.joined_at)`,
    );
  }
  return w;
}

type Standing = { userId: string; xp: number; seconds: number; lastAt: number };

type Extras = {
  platformSeconds: number;
  totalSeconds: number;
  institution: { name: string; acronym: string | null; pending: boolean } | null;
};

/**
 * Dados públicos extras das linhas do ranking: horas na plataforma no período (todos os perfis),
 * horas totais (para o título) e a instituição vinculada.
 */
async function publicExtras(ctx: Ctx, userIds: string[], start: Date | null, end: Date) {
  const inPeriod = start
    ? sql<number>`coalesce(sum(${studySessions.activeSeconds}) filter (where ${studySessions.endedAt} >= ${start.toISOString()}::timestamptz and ${studySessions.endedAt} <= ${end.toISOString()}::timestamptz), 0)::int`
    : sql<number>`coalesce(sum(${studySessions.activeSeconds}) filter (where ${studySessions.endedAt} <= ${end.toISOString()}::timestamptz), 0)::int`;
  const [secs, inst] = await Promise.all([
    ctx.db
      .select({
        userId: studySessions.userId,
        period: inPeriod,
        total: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
      })
      .from(studySessions)
      .where(and(inArray(studySessions.userId, userIds), isNotNull(studySessions.endedAt)))
      .groupBy(studySessions.userId),
    ctx.db
      .select({
        userId: institutionMemberships.userId,
        name: institutions.name,
        acronym: institutions.acronym,
        status: institutionMemberships.status,
      })
      .from(institutionMemberships)
      .innerJoin(institutions, eq(institutions.id, institutionMemberships.institutionId))
      .where(inArray(institutionMemberships.userId, userIds)),
  ]);
  const out = new Map<string, Extras>();
  for (const id of userIds) {
    const sRow = secs.find((x) => x.userId === id);
    const iRow = inst.find((x) => x.userId === id);
    out.set(id, {
      platformSeconds: Number(sRow?.period ?? 0),
      totalSeconds: Number(sRow?.total ?? 0),
      institution: iRow ? { name: iRow.name, acronym: iRow.acronym, pending: iRow.status === "pending" } : null,
    });
  }
  return out;
}

/**
 * Classificação de um recorte: XP somado no período (saldo do recorte > 0).
 * Desempate: mais tempo estudado no recorte; depois, quem chegou primeiro ao XP
 * (último lançamento mais antigo); por fim, ordem estável pelo id.
 */
async function computeStandings(ctx: Ctx, c: Criteria): Promise<Standing[]> {
  const rows = await ctx.db
    .select({
      userId: xpTransactions.userId,
      xp: sql<number>`sum(${xpTransactions.amount})::int`,
      lastAt: sql<string>`max(${xpTransactions.createdAt})`,
    })
    .from(xpTransactions)
    .where(and(...xpConditions(c)))
    .groupBy(xpTransactions.userId)
    .having(sql`sum(${xpTransactions.amount}) > 0`);
  if (rows.length === 0) return [];

  const secs = await ctx.db
    .select({ userId: studySessions.userId, seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int` })
    .from(studySessions)
    .where(and(...sessionConditions(c), inArray(studySessions.userId, rows.map((r) => r.userId))))
    .groupBy(studySessions.userId);
  const secByUser = new Map(secs.map((s) => [s.userId, Number(s.seconds)]));

  return rows
    .map((r) => ({
      userId: r.userId,
      xp: Number(r.xp),
      seconds: secByUser.get(r.userId) ?? 0,
      lastAt: new Date(r.lastAt).getTime(),
    }))
    .sort((a, b) => b.xp - a.xp || b.seconds - a.seconds || a.lastAt - b.lastAt || a.userId.localeCompare(b.userId));
}

export type LeaderboardRow = {
  position: number;
  displayName: string;
  xp: number;
  studiedSeconds: number;
  /** Posições ganhas (+) ou perdidas (−) nas últimas 24h; null se entrou agora no ranking. */
  change: number | null;
  /** Identificadores dos objetivos do perfil (ex.: "enem"). */
  goals: string[];
  isViewer: boolean;
  /** Tempo de foco no período em todos os perfis (estudo, projetos, pessoal…). */
  platformSeconds: number;
  /** Instituição em nome da qual disputa; null = sem vínculo. */
  institution: { name: string; acronym: string | null; pending: boolean } | null;
  /** Título conquistado pelas horas acumuladas na plataforma. */
  title: TitleId;
  /** Código público da conta (para adicionar como amigo). */
  publicCode: string | null;
  /** Conquistas que a pessoa escolheu exibir (vitrine), na ordem escolhida. */
  showcase: string[];
};

export type Leaderboard =
  | {
      status: "ok";
      title: string;
      participants: number;
      page: number;
      pageCount: number;
      rows: LeaderboardRow[];
      viewer: LeaderboardRow | null;
    }
  | { status: "insufficient"; title: string; participants: number; minParticipants: number }
  | { status: "needs_tags"; title: string }
  | { status: "needs_institution"; title: string };

async function describe(ctx: Ctx, q: RankingQuery): Promise<string> {
  const parts: string[] = [];
  if (q.scope === "global") parts.push("Geral Focus");
  if (q.scope === "mine") parts.push("Meu geral");
  if (q.areaId) {
    const [a] = await ctx.db.select({ name: knowledgeAreas.name }).from(knowledgeAreas).where(eq(knowledgeAreas.id, q.areaId));
    if (!a) throw new AppError("Área inválida.");
    parts.push(a.name);
  }
  if (q.topicId) {
    const [t] = await ctx.db
      .select({ name: catalogTopics.name })
      .from(catalogTopics)
      .where(and(eq(catalogTopics.id, q.topicId), eq(catalogTopics.status, "approved")));
    if (!t) throw new AppError("Tema inválido.");
    parts.push(t.name);
  }
  if (q.methodId) {
    const [m] = await ctx.db.select({ name: studyMethods.name }).from(studyMethods).where(eq(studyMethods.id, q.methodId));
    if (!m) throw new AppError("Método inválido.");
    parts.push(m.name);
  }
  if (q.scope === "filter" && parts.length === 0) parts.push("Todos os estudantes");
  if (q.scope === "institution" && parts.length === 0) parts.push("Minha instituição");
  return parts.join(" · ");
}

/**
 * Ranking com verificação de acesso no servidor (assinante ou admin).
 * Retorna apenas dados públicos: posição, nome de exibição, XP, tempo e objetivos.
 */
export async function getLeaderboard(ctx: Ctx, viewerId: string, q: RankingQuery): Promise<Leaderboard> {
  await requireFeature(ctx, viewerId, "ranking");
  const now = ctx.now();
  const settings = await getCatalogSettings(ctx.db);
  let title = await describe(ctx, q);
  const pageSize = Math.min(Math.max(q.pageSize ?? 50, 1), 100);

  const criteria: Criteria = { start: periodStart(q.period, now), end: now };
  if (q.scope === "institution") {
    const m = await getMembership(ctx, viewerId);
    if (!m || m.status !== "active") return { status: "needs_institution", title };
    criteria.institutionId = m.institutionId;
    title = m.acronym ? `${m.acronym} — ${m.name}` : m.name;
  }
  if (q.scope === "mine") {
    const tags = await getProfileTags(ctx, viewerId);
    if (tags.areas.length === 0 && tags.topics.length === 0) return { status: "needs_tags", title };
    criteria.anyOf = { areaIds: tags.areas.map((a) => a.id), topicIds: tags.topics.map((t) => t.id) };
  }
  if (q.scope !== "global") {
    criteria.methodId = q.methodId;
    if (q.scope === "filter") {
      criteria.areaId = q.areaId;
      criteria.topicId = q.topicId;
    }
  } else if (q.methodId) {
    criteria.methodId = q.methodId;
  }

  const standings = await computeStandings(ctx, criteria);
  if (q.scope !== "global" && standings.length < settings.rankingMinParticipants) {
    return { status: "insufficient", title, participants: standings.length, minParticipants: settings.rankingMinParticipants };
  }

  // Evolução: posição no mesmo recorte há 24h.
  const before = await computeStandings(ctx, { ...criteria, end: new Date(now.getTime() - 24 * 3_600_000) });
  const prevPos = new Map(before.map((s, i) => [s.userId, i + 1]));

  const pageCount = Math.max(1, Math.ceil(standings.length / pageSize));
  const page = Math.min(Math.max(q.page ?? 1, 1), pageCount);
  const pageItems = standings.slice((page - 1) * pageSize, page * pageSize);
  const viewerIndex = standings.findIndex((s) => s.userId === viewerId);
  const needed = [...new Set([...pageItems.map((s) => s.userId), ...(viewerIndex >= 0 ? [viewerId] : [])])];

  const [names, goals, extras] = needed.length
    ? await Promise.all([
        ctx.db
          .select({ userId: profiles.userId, displayName: profiles.displayName, publicCode: profiles.publicCode, showcase: profiles.showcaseAchievements })
          .from(profiles)
          .where(inArray(profiles.userId, needed)),
        ctx.db.select().from(userGoalTags).where(inArray(userGoalTags.userId, needed)),
        publicExtras(ctx, needed, criteria.start, now),
      ])
    : [[], [], new Map<string, Extras>()];
  const nameBy = new Map(names.map((n) => [n.userId, n.displayName]));
  const codeBy = new Map(names.map((n) => [n.userId, n.publicCode]));
  const showcaseBy = new Map(names.map((n) => [n.userId, n.showcase]));

  const toRow = (s: Standing, index: number): LeaderboardRow => {
    const position = index + 1;
    const prev = prevPos.get(s.userId);
    return {
      position,
      displayName: nameBy.get(s.userId) ?? "Estudante",
      xp: s.xp,
      studiedSeconds: s.seconds,
      change: prev == null ? null : prev - position,
      // Identificadores dos objetivos (a tela traduz para o idioma do usuário).
      goals: goals
        .filter((g) => g.userId === s.userId && GOAL_TAGS.some((t) => t.id === g.tagId))
        .map((g) => g.tagId),
      isViewer: s.userId === viewerId,
      platformSeconds: extras.get(s.userId)?.platformSeconds ?? 0,
      institution: extras.get(s.userId)?.institution ?? null,
      title: titleFor(extras.get(s.userId)?.totalSeconds ?? 0),
      publicCode: codeBy.get(s.userId) ?? null,
      showcase: (showcaseBy.get(s.userId) ?? []).slice(0, SHOWCASE_MAX),
    };
  };

  return {
    status: "ok",
    title,
    participants: standings.length,
    page,
    pageCount,
    rows: pageItems.map((s, i) => toRow(s, (page - 1) * pageSize + i)),
    viewer: viewerIndex >= 0 ? toRow(standings[viewerIndex], viewerIndex) : null,
  };
}

/**
 * Opções de filtro a partir das tags do usuário, com o número de participantes de cada uma
 * (opções abaixo do mínimo aparecem desabilitadas).
 */
export async function getFilterOptions(ctx: Ctx, viewerId: string, period: RankingPeriod, methodId?: string) {
  await requireFeature(ctx, viewerId, "ranking");
  const now = ctx.now();
  const settings = await getCatalogSettings(ctx.db);
  const tags = await getProfileTags(ctx, viewerId);
  const base: Criteria = { start: periodStart(period, now), end: now, methodId };

  const countBy = async (column: typeof xpTransactions.areaId | typeof xpTransactions.catalogTopicId, ids: string[]) => {
    if (!ids.length) return new Map<string, number>();
    const inner = ctx.db
      .select({ key: column, userId: xpTransactions.userId })
      .from(xpTransactions)
      .where(and(...xpConditions(base), inArray(column, ids)))
      .groupBy(column, xpTransactions.userId)
      .having(sql`sum(${xpTransactions.amount}) > 0`)
      .as("t");
    const rows = await ctx.db
      .select({ key: inner.key, n: sql<number>`count(*)::int` })
      .from(inner)
      .groupBy(inner.key);
    return new Map(rows.map((r) => [r.key as string, Number(r.n)]));
  };

  const [areaCounts, topicCounts] = await Promise.all([
    countBy(xpTransactions.areaId, tags.areas.map((a) => a.id)),
    countBy(xpTransactions.catalogTopicId, tags.topics.map((t) => t.id)),
  ]);
  const methods = await ctx.db.select({ id: studyMethods.id, name: studyMethods.name }).from(studyMethods).orderBy(studyMethods.sortOrder);
  return {
    minParticipants: settings.rankingMinParticipants,
    hasTags: tags.areas.length + tags.topics.length > 0,
    areas: tags.areas.map((a) => ({ ...a, participants: areaCounts.get(a.id) ?? 0 })),
    topics: tags.topics.map((t) => ({ id: t.id, name: t.name, participants: topicCounts.get(t.id) ?? 0 })),
    methods,
  };
}

/** Posição no Geral Focus (sempre), para o dashboard. Null sem acesso premium. */
export async function getViewerGlobalPosition(ctx: Ctx, viewerId: string) {
  if (!(await getAccess(ctx, viewerId, "ranking")).allowed) return null;
  const standings = await computeStandings(ctx, { start: null, end: ctx.now() });
  const i = standings.findIndex((s) => s.userId === viewerId);
  return i >= 0 ? { position: i + 1, participants: standings.length } : { position: null, participants: standings.length };
}

/**
 * Posição do usuário nos rankings das áreas em que ganhou XP nesta semana (para o Painel).
 * Até 4 áreas, das que ele mais pontuou. Null sem acesso premium.
 */
export async function getViewerAreaPositions(ctx: Ctx, viewerId: string) {
  if (!(await getAccess(ctx, viewerId, "ranking")).allowed) return null;
  const now = ctx.now();
  const start = periodStart("week", now);
  const settings = await getCatalogSettings(ctx.db);
  const mine = await ctx.db
    .select({ areaId: xpTransactions.areaId, xp: sql<number>`sum(${xpTransactions.amount})::int` })
    .from(xpTransactions)
    .where(and(eq(xpTransactions.userId, viewerId), isNotNull(xpTransactions.areaId), ...xpConditions({ start, end: now })))
    .groupBy(xpTransactions.areaId)
    .having(sql`sum(${xpTransactions.amount}) > 0`)
    .orderBy(sql`sum(${xpTransactions.amount}) desc`)
    .limit(4);
  const result: { areaId: string; position: number | null; participants: number; minParticipants: number }[] = [];
  for (const { areaId } of mine) {
    const standings = await computeStandings(ctx, { start, end: now, areaId: areaId! });
    const i = standings.findIndex((s) => s.userId === viewerId);
    const enough = standings.length >= settings.rankingMinParticipants;
    result.push({
      areaId: areaId!,
      position: enough && i >= 0 ? i + 1 : null,
      participants: standings.length,
      minParticipants: settings.rankingMinParticipants,
    });
  }
  return result;
}

export type InstitutionMedals = { gold: number; silver: number; bronze: number };

export type InstitutionStanding = {
  position: number;
  institutionId: string;
  name: string;
  acronym: string | null;
  city: string | null;
  uf: string | null;
  /** Média de XP por aluno ativo no período. */
  averageXp: number;
  activeMembers: number;
  totalXp: number;
  /** Horas de estudo (ranqueadas) dos alunos ativos no período. */
  totalSeconds: number;
  averageSeconds: number;
  /** Pódios nas últimas semanas fechadas (ranking por média). */
  medals: InstitutionMedals;
  isViewerInstitution: boolean;
};

type InstitutionRow = { institutionId: string; total: number; active: number; avg: number; seconds: number };

/**
 * Classificação entre instituições do mesmo tipo num intervalo: XP e horas (ranqueados) dos
 * alunos com vínculo aceito, contando só o que veio depois de cada um entrar. Entram instituições
 * com pelo menos `minActive` alunos ativos (saldo positivo no intervalo).
 */
async function institutionStandings(
  ctx: Ctx,
  q: { kind: InstitutionKind; start: Date | null; end: Date; methodId?: string; sort?: "average" | "total"; minActive: number },
): Promise<InstitutionRow[]> {
  const where: SQL[] = [
    lte(xpTransactions.createdAt, q.end),
    eq(xpTransactions.ranked, true),
    sql`${xpTransactions.createdAt} >= ${institutionMemberships.joinedAt}`,
    eq(institutionMemberships.status, "active"),
    eq(institutions.kind, q.kind),
  ];
  if (q.start) where.push(gte(xpTransactions.createdAt, q.start));
  if (q.methodId) where.push(eq(xpTransactions.methodId, q.methodId));

  const perUser = ctx.db
    .select({
      institutionId: institutionMemberships.institutionId,
      userId: xpTransactions.userId,
      xp: sql<number>`sum(${xpTransactions.amount})`.as("xp"),
    })
    .from(xpTransactions)
    .innerJoin(institutionMemberships, eq(institutionMemberships.userId, xpTransactions.userId))
    .innerJoin(institutions, eq(institutions.id, institutionMemberships.institutionId))
    .where(and(...where))
    .groupBy(institutionMemberships.institutionId, xpTransactions.userId)
    .having(sql`sum(${xpTransactions.amount}) > 0`)
    .as("per_user");

  const rows = await ctx.db
    .select({
      institutionId: perUser.institutionId,
      total: sql<number>`sum(${perUser.xp})::int`,
      active: sql<number>`count(*)::int`,
    })
    .from(perUser)
    .groupBy(perUser.institutionId);

  const secWhere: SQL[] = [
    isNotNull(studySessions.endedAt),
    lte(studySessions.endedAt, q.end),
    eq(studySessions.ranked, true),
    sql`${studySessions.endedAt} >= ${institutionMemberships.joinedAt}`,
    eq(institutionMemberships.status, "active"),
    eq(institutions.kind, q.kind),
  ];
  if (q.start) secWhere.push(gte(studySessions.endedAt, q.start));
  if (q.methodId) secWhere.push(eq(studySessions.methodId, q.methodId));
  const secRows = await ctx.db
    .select({
      institutionId: institutionMemberships.institutionId,
      seconds: sql<number>`coalesce(sum(${studySessions.activeSeconds}), 0)::int`,
    })
    .from(studySessions)
    .innerJoin(institutionMemberships, eq(institutionMemberships.userId, studySessions.userId))
    .innerJoin(institutions, eq(institutions.id, institutionMemberships.institutionId))
    .where(and(...secWhere))
    .groupBy(institutionMemberships.institutionId);
  const secBy = new Map(secRows.map((r) => [r.institutionId, Number(r.seconds)]));

  const byTotal = q.sort === "total";
  return rows
    .map((r) => ({
      institutionId: r.institutionId,
      total: Number(r.total),
      active: Number(r.active),
      avg: Number(r.total) / Number(r.active),
      seconds: secBy.get(r.institutionId) ?? 0,
    }))
    .filter((r) => r.active >= q.minActive)
    .sort((a, b) =>
      (byTotal ? b.total - a.total : b.avg - a.avg) || b.active - a.active || a.institutionId.localeCompare(b.institutionId),
    );
}

/** Semanas fechadas consideradas para as medalhas institucionais. */
export const MEDAL_WEEKS = 12;

/**
 * Medalhas institucionais: a cada semana fechada, ouro, prata e bronze para as três primeiras do
 * ranking entre instituições (média por aluno ativo). Conta as últimas `MEDAL_WEEKS` semanas.
 */
export async function weeklyMedals(ctx: Ctx, kind: InstitutionKind, minActive: number) {
  const now = ctx.now();
  const thisWeek = periodStart("week", now)!;
  const medals = new Map<string, InstitutionMedals>();
  for (let w = 1; w <= MEDAL_WEEKS; w++) {
    const start = new Date(thisWeek.getTime() - w * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000 - 1);
    const podium = (await institutionStandings(ctx, { kind, start, end, minActive })).slice(0, 3);
    podium.forEach((r, i) => {
      const m = medals.get(r.institutionId) ?? { gold: 0, silver: 0, bronze: 0 };
      if (i === 0) m.gold++;
      else if (i === 1) m.silver++;
      else m.bronze++;
      medals.set(r.institutionId, m);
    });
  }
  return medals;
}

/**
 * Ranking entre instituições do mesmo tipo (faculdades OU escolas), por média de XP por aluno
 * ativo (padrão) ou pelo total. Mostra horas, XP total e medalhas.
 */
export async function getInstitutionsLeaderboard(
  ctx: Ctx,
  viewerId: string,
  q: { kind: InstitutionKind; period: RankingPeriod; methodId?: string; limit?: number; sort?: "average" | "total" },
) {
  await requireFeature(ctx, viewerId, "ranking");
  const now = ctx.now();
  const settings = await getCatalogSettings(ctx.db);
  const eligible = await institutionStandings(ctx, {
    kind: q.kind,
    start: periodStart(q.period, now),
    end: now,
    methodId: q.methodId,
    sort: q.sort,
    minActive: settings.institutionMinActive,
  });
  const medals = await weeklyMedals(ctx, q.kind, settings.institutionMinActive);

  const viewer = await getMembership(ctx, viewerId);
  const viewerActive = viewer?.status === "active" ? viewer : null;
  const top = eligible.slice(0, Math.min(q.limit ?? 50, 100));
  const ids = [...new Set([...top.map((r) => r.institutionId), ...(viewerActive ? [viewerActive.institutionId] : [])])];
  const info = ids.length
    ? await ctx.db
        .select({ id: institutions.id, name: institutions.name, acronym: institutions.acronym, city: institutions.city, uf: institutions.uf })
        .from(institutions)
        .where(inArray(institutions.id, ids))
    : [];
  const byId = new Map(info.map((i) => [i.id, i]));
  const toRow = (r: InstitutionRow, index: number): InstitutionStanding => {
    const i = byId.get(r.institutionId)!;
    return {
      position: index + 1,
      institutionId: r.institutionId,
      name: i.name,
      acronym: i.acronym,
      city: i.city,
      uf: i.uf,
      averageXp: Math.round(r.avg * 10) / 10,
      activeMembers: r.active,
      totalXp: r.total,
      totalSeconds: r.seconds,
      averageSeconds: Math.round(r.seconds / r.active),
      medals: medals.get(r.institutionId) ?? { gold: 0, silver: 0, bronze: 0 },
      isViewerInstitution: r.institutionId === viewerActive?.institutionId,
    };
  };

  const viewerIndex = viewerActive ? eligible.findIndex((r) => r.institutionId === viewerActive.institutionId) : -1;
  const viewerRow = viewerIndex >= 0 ? eligible[viewerIndex] : undefined;
  return {
    minActive: settings.institutionMinActive,
    rows: top.map(toRow),
    viewerInstitution: viewerActive
      ? {
          name: viewerActive.name,
          kind: viewerActive.kind,
          activeMembers: viewerRow ? viewerRow.active : await activeCount(ctx, viewerActive.institutionId, periodStart(q.period, now), now),
          standing: viewerIndex >= 0 ? toRow(eligible[viewerIndex], viewerIndex) : null,
        }
      : null,
  };
}

/** Alunos com vínculo aceito que pontuaram no intervalo (para "faltam N para entrar"). */
async function activeCount(ctx: Ctx, institutionId: string, start: Date | null, end: Date) {
  const where: SQL[] = [
    eq(institutionMemberships.institutionId, institutionId),
    eq(institutionMemberships.status, "active"),
    eq(xpTransactions.ranked, true),
    lte(xpTransactions.createdAt, end),
    sql`${xpTransactions.createdAt} >= ${institutionMemberships.joinedAt}`,
  ];
  if (start) where.push(gte(xpTransactions.createdAt, start));
  const [r] = await ctx.db
    .select({ n: sql<number>`count(distinct ${xpTransactions.userId})::int` })
    .from(xpTransactions)
    .innerJoin(institutionMemberships, eq(institutionMemberships.userId, xpTransactions.userId))
    .where(and(...where));
  return Number(r?.n ?? 0);
}

/**
 * Página pública de uma instituição no ranking: números da semana e do mês, posição, medalhas e
 * a apresentação escrita pela própria instituição (quando ela tem conta verificada).
 */
export async function getInstitutionProfile(ctx: Ctx, viewerId: string, institutionId: string) {
  await requireFeature(ctx, viewerId, "ranking");
  const [inst] = await ctx.db.select().from(institutions).where(eq(institutions.id, institutionId));
  if (!inst) throw new AppError("Instituição não encontrada.", "not_found");
  const now = ctx.now();
  const settings = await getCatalogSettings(ctx.db);
  const [week, month, all, medals, members] = await Promise.all([
    institutionStandings(ctx, { kind: inst.kind, start: periodStart("week", now), end: now, minActive: 1 }),
    institutionStandings(ctx, { kind: inst.kind, start: periodStart("month", now), end: now, minActive: 1 }),
    institutionStandings(ctx, { kind: inst.kind, start: null, end: now, minActive: 1 }),
    weeklyMedals(ctx, inst.kind, settings.institutionMinActive),
    ctx.db
      .select({ n: sql<number>`count(*)::int` })
      .from(institutionMemberships)
      .where(and(eq(institutionMemberships.institutionId, institutionId), eq(institutionMemberships.status, "active"))),
  ]);
  const stats = (rows: InstitutionRow[]) => {
    const eligible = rows.filter((r) => r.active >= settings.institutionMinActive);
    const i = eligible.findIndex((r) => r.institutionId === institutionId);
    const r = rows.find((x) => x.institutionId === institutionId);
    return {
      position: i >= 0 ? i + 1 : null,
      activeMembers: r?.active ?? 0,
      totalSeconds: r?.seconds ?? 0,
      totalXp: r?.total ?? 0,
      averageSeconds: r ? Math.round(r.seconds / r.active) : 0,
    };
  };
  const [org] = await ctx.db
    .select({ alias: organizations.alias, about: organizations.about, whyStudy: organizations.whyStudy, website: organizations.website })
    .from(organizations)
    .where(and(eq(organizations.institutionId, institutionId), eq(organizations.status, "approved")));
  return {
    id: inst.id,
    kind: inst.kind,
    name: inst.name,
    acronym: inst.acronym,
    city: inst.city,
    uf: inst.uf,
    members: Number(members[0]?.n ?? 0),
    minActive: settings.institutionMinActive,
    week: stats(week),
    month: stats(month),
    all: stats(all),
    medals: medals.get(institutionId) ?? { gold: 0, silver: 0, bronze: 0 },
    verified: Boolean(org),
    page: org ? { about: org.about, whyStudy: org.whyStudy, website: org.website } : null,
  };
}

export type InstitutionProfile = Awaited<ReturnType<typeof getInstitutionProfile>>;
