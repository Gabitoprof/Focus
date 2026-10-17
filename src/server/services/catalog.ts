import { and, asc, count, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  DEFAULT_CATALOG_SETTINGS,
  GOAL_TAGS,
  catalogSettingsSchema,
  normalizeTerm,
  type CatalogSettings,
} from "@/domain/catalog";
import type { DB } from "../db";
import {
  appSettings,
  auditLogs,
  catalogAliases,
  catalogTermUsage,
  catalogTopics,
  categories,
  knowledgeAreas,
  topics,
  userFollowedTopics,
  userGoalTags,
  userInterestAreas,
} from "../db/schema";
import { isRankedCategory } from "@/domain/contexts";
import { AppError, type Ctx, type Tx } from "./common";

export async function getCatalogSettings(db: DB | Tx): Promise<CatalogSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "catalog"));
  const parsed = catalogSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...DEFAULT_CATALOG_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}

export async function listAreas(ctx: Ctx) {
  return ctx.db
    .select({ id: knowledgeAreas.id, name: knowledgeAreas.name })
    .from(knowledgeAreas)
    .where(eq(knowledgeAreas.isActive, true))
    .orderBy(asc(knowledgeAreas.sortOrder));
}

/** Temas aprovados do catálogo, opcionalmente filtrados por área e por texto. */
export async function searchCatalogTopics(ctx: Ctx, opts: { query?: string; areaId?: string; limit?: number } = {}) {
  const where = [eq(catalogTopics.status, "approved")];
  if (opts.areaId) where.push(eq(catalogTopics.areaId, opts.areaId));
  if (opts.query?.trim()) {
    const q = `%${normalizeTerm(opts.query)}%`;
    where.push(
      or(
        ilike(catalogTopics.normalizedName, q),
        sql`exists (select 1 from unnest(${catalogTopics.courses}) c where c ilike ${`%${opts.query.trim()}%`})`,
      )!,
    );
  }
  return ctx.db
    .select({
      id: catalogTopics.id,
      name: catalogTopics.name,
      areaId: catalogTopics.areaId,
      levels: catalogTopics.levels,
      courses: catalogTopics.courses,
    })
    .from(catalogTopics)
    .where(and(...where))
    .orderBy(asc(catalogTopics.name))
    .limit(opts.limit ?? 5000);
}

/** Tema aprovado correspondente a um termo (nome padronizado ou sinônimo). */
async function findApproved(db: DB | Tx, normalized: string) {
  const [direct] = await db
    .select({ id: catalogTopics.id })
    .from(catalogTopics)
    .where(and(eq(catalogTopics.normalizedName, normalized), eq(catalogTopics.status, "approved")));
  if (direct) return direct.id;
  const [alias] = await db
    .select({ id: catalogAliases.catalogTopicId })
    .from(catalogAliases)
    .innerJoin(catalogTopics, eq(catalogTopics.id, catalogAliases.catalogTopicId))
    .where(and(eq(catalogAliases.normalizedName, normalized), eq(catalogTopics.status, "approved")));
  return alias?.id ?? null;
}

/** Área mais usada pelos usuários para um termo (decide a área de um tema promovido). */
async function majorityArea(db: DB | Tx, normalized: string): Promise<string | null> {
  const rows = await db
    .select({ areaId: catalogTermUsage.areaId, n: count() })
    .from(catalogTermUsage)
    .where(and(eq(catalogTermUsage.normalizedName, normalized), sql`${catalogTermUsage.areaId} is not null`))
    .groupBy(catalogTermUsage.areaId)
    .orderBy(sql`count(*) desc`)
    .limit(1);
  return rows[0]?.areaId ?? null;
}

/**
 * Aprova um tema e vincula a ele os temas de usuários com o mesmo nome padronizado (ou
 * sinônimo) que ainda não tinham vínculo. Vale para sessões futuras; o passado não muda.
 */
export async function approveCatalogTopic(db: DB | Tx, catalogTopicId: string, areaId: string, now: Date, actor: string | null) {
  const [t] = await db.select().from(catalogTopics).where(eq(catalogTopics.id, catalogTopicId));
  if (!t) throw new AppError("Tema do catálogo não encontrado.", "not_found");
  await db
    .update(catalogTopics)
    .set({ status: "approved", areaId, approvedAt: now })
    .where(eq(catalogTopics.id, catalogTopicId));
  await linkMatchingUserTopics(db, catalogTopicId, [t.normalizedName]);
  await db.insert(auditLogs).values({
    actorUserId: actor,
    action: actor ? "catalog.approved" : "catalog.auto_approved",
    entityType: "catalog_topic",
    entityId: catalogTopicId,
    metadata: { name: t.name, areaId },
  });
}

async function linkMatchingUserTopics(db: DB | Tx, catalogTopicId: string, normalizedNames: string[]) {
  await db
    .update(topics)
    .set({ catalogTopicId })
    .where(and(isNull(topics.catalogTopicId), isNull(topics.deletedAt), inArray(topics.normalizedName, normalizedNames)));
}

/** Registra um sinônimo e vincula os temas de usuários que usam esse termo. */
export async function addCatalogAlias(db: DB | Tx, catalogTopicId: string, aliasName: string) {
  const normalized = normalizeTerm(aliasName);
  if (!normalized) throw new AppError("Sinônimo inválido.");
  await db.insert(catalogAliases).values({ normalizedName: normalized, catalogTopicId }).onConflictDoNothing();
  // Um tema pendente com o mesmo nome deixa de existir como sugestão.
  await db
    .update(catalogTopics)
    .set({ status: "rejected" })
    .where(and(eq(catalogTopics.normalizedName, normalized), eq(catalogTopics.status, "pending")));
  await linkMatchingUserTopics(db, catalogTopicId, [normalized]);
}

/**
 * Registra o uso de um termo por um usuário e aplica a promoção automática:
 * - termo já aprovado (ou sinônimo) → retorna o tema para vínculo imediato;
 * - termo novo → vira tema pendente; com `autoApproveMinUsers` usuários distintos e área
 *   conhecida, é aprovado sozinho.
 * Deve rodar dentro de uma transação.
 */
export async function recordTermUsage(
  tx: Tx,
  input: { userId: string; name: string; areaId: string | null },
  now: Date,
): Promise<string | null> {
  const normalized = normalizeTerm(input.name);
  if (!normalized) return null;

  await tx
    .insert(catalogTermUsage)
    .values({ normalizedName: normalized, userId: input.userId, displayName: input.name.trim(), areaId: input.areaId })
    .onConflictDoUpdate({
      target: [catalogTermUsage.normalizedName, catalogTermUsage.userId],
      set: { areaId: sql`coalesce(excluded.area_id, ${catalogTermUsage.areaId})` },
    });

  const approved = await findApproved(tx, normalized);
  if (approved) return approved;

  const [existing] = await tx.select().from(catalogTopics).where(eq(catalogTopics.normalizedName, normalized));
  if (existing?.status === "rejected") return null;
  let pendingId = existing?.id;
  if (!existing) {
    const [created] = await tx
      .insert(catalogTopics)
      .values({ name: input.name.trim(), normalizedName: normalized, status: "pending", source: "community", areaId: input.areaId })
      .onConflictDoNothing()
      .returning({ id: catalogTopics.id });
    pendingId = created?.id;
  }
  if (!pendingId) return null;

  const settings = await getCatalogSettings(tx);
  const [{ users }] = await tx
    .select({ users: count() })
    .from(catalogTermUsage)
    .where(eq(catalogTermUsage.normalizedName, normalized));
  if (Number(users) >= settings.autoApproveMinUsers) {
    const area = await majorityArea(tx, normalized);
    if (area) {
      await approveCatalogTopic(tx, pendingId, area, now, null);
      return pendingId;
    }
  }
  return null;
}

/** Sugestões para o admin: termos pendentes usados por pelo menos `suggestMinUsers` pessoas. */
export async function listPendingSuggestions(ctx: Ctx) {
  const settings = await getCatalogSettings(ctx.db);
  const rows = await ctx.db
    .select({
      id: catalogTopics.id,
      name: catalogTopics.name,
      normalizedName: catalogTopics.normalizedName,
      areaId: catalogTopics.areaId,
      users: sql<number>`(select count(*) from ${catalogTermUsage} u where u.normalized_name = ${catalogTopics.normalizedName})::int`,
    })
    .from(catalogTopics)
    .where(eq(catalogTopics.status, "pending"));
  return rows
    .map((r) => ({ ...r, users: Number(r.users) }))
    .filter((r) => r.users >= settings.suggestMinUsers)
    .sort((a, b) => b.users - a.users);
}

// ---------------------------------------------------------------------------
// Vínculos feitos pelo usuário
// ---------------------------------------------------------------------------

export async function setCategoryArea(ctx: Ctx, userId: string, categoryId: string, areaId: string | null) {
  await ctx.db.transaction(async (tx) => {
    const [c] = await tx
      .select()
      .from(categories)
      .where(and(eq(categories.id, categoryId), eq(categories.userId, userId), isNull(categories.deletedAt)));
    if (!c) throw new AppError("Registro não encontrado.", "not_found");
    if (!isRankedCategory(c) && areaId) throw new AppError("Só registros do contexto Acadêmico têm área do conhecimento.");
    if (areaId) {
      const [a] = await tx.select().from(knowledgeAreas).where(eq(knowledgeAreas.id, areaId));
      if (!a) throw new AppError("Área do conhecimento inválida.");
    }
    await tx.update(categories).set({ areaId, updatedAt: ctx.now() }).where(eq(categories.id, categoryId));
    // Os termos dos temas desta categoria passam a "votar" nessa área.
    const own = await tx
      .select({ name: topics.name })
      .from(topics)
      .where(and(eq(topics.categoryId, categoryId), isNull(topics.deletedAt)));
    const names = own.map((t) => normalizeTerm(t.name)).filter(Boolean);
    if (names.length) {
      await tx
        .update(catalogTermUsage)
        .set({ areaId })
        .where(and(eq(catalogTermUsage.userId, userId), inArray(catalogTermUsage.normalizedName, names)));
    }
  });
}

/** Vincula (ou desvincula, com null) um tema do usuário a um tema aprovado do catálogo. */
export async function linkTopicToCatalog(ctx: Ctx, userId: string, topicId: string, catalogTopicId: string | null) {
  const [t] = await ctx.db
    .select()
    .from(topics)
    .where(and(eq(topics.id, topicId), eq(topics.userId, userId), isNull(topics.deletedAt)));
  if (!t) throw new AppError("Tema não encontrado.", "not_found");
  if (catalogTopicId) {
    const [cat] = await ctx.db.select({ context: categories.context, usage: categories.usage }).from(categories).where(eq(categories.id, t.categoryId));
    if (cat && !isRankedCategory(cat)) throw new AppError("Só temas do contexto Acadêmico podem ser vinculados ao catálogo.");
    const [ct] = await ctx.db
      .select()
      .from(catalogTopics)
      .where(and(eq(catalogTopics.id, catalogTopicId), eq(catalogTopics.status, "approved")));
    if (!ct) throw new AppError("Tema do catálogo não encontrado.", "not_found");
  }
  await ctx.db.update(topics).set({ catalogTopicId, updatedAt: ctx.now() }).where(eq(topics.id, topicId));
}

// ---------------------------------------------------------------------------
// Tags do perfil
// ---------------------------------------------------------------------------

export async function getProfileTags(ctx: Ctx, userId: string) {
  const [areas, followed, goals] = await Promise.all([
    ctx.db
      .select({ id: knowledgeAreas.id, name: knowledgeAreas.name })
      .from(userInterestAreas)
      .innerJoin(knowledgeAreas, eq(knowledgeAreas.id, userInterestAreas.areaId))
      .where(eq(userInterestAreas.userId, userId))
      .orderBy(asc(knowledgeAreas.sortOrder)),
    ctx.db
      .select({ id: catalogTopics.id, name: catalogTopics.name, areaId: catalogTopics.areaId })
      .from(userFollowedTopics)
      .innerJoin(catalogTopics, eq(catalogTopics.id, userFollowedTopics.catalogTopicId))
      .where(eq(userFollowedTopics.userId, userId))
      .orderBy(asc(catalogTopics.name)),
    ctx.db.select({ id: userGoalTags.tagId }).from(userGoalTags).where(eq(userGoalTags.userId, userId)),
  ]);
  return {
    areas,
    topics: followed,
    goals: goals.map((g) => GOAL_TAGS.find((t) => t.id === g.id)).filter((g): g is (typeof GOAL_TAGS)[number] => Boolean(g)),
  };
}

export async function setProfileTags(
  ctx: Ctx,
  userId: string,
  input: { areaIds: string[]; catalogTopicIds: string[]; goalIds: string[] },
) {
  const settings = await getCatalogSettings(ctx.db);
  const areaIds = [...new Set(input.areaIds)];
  const topicIds = [...new Set(input.catalogTopicIds)];
  const goalIds = [...new Set(input.goalIds)];
  if (areaIds.length > settings.maxInterestAreas) {
    throw new AppError(`Escolha no máximo ${settings.maxInterestAreas} áreas de interesse.`);
  }
  if (topicIds.length > settings.maxFollowedTopics) {
    throw new AppError(`Acompanhe no máximo ${settings.maxFollowedTopics} temas.`);
  }
  if (goalIds.length > settings.maxGoalTags) throw new AppError(`Escolha no máximo ${settings.maxGoalTags} objetivos.`);
  if (goalIds.some((g) => !GOAL_TAGS.some((t) => t.id === g))) throw new AppError("Objetivo inválido.");

  await ctx.db.transaction(async (tx) => {
    if (areaIds.length) {
      const valid = await tx.select({ id: knowledgeAreas.id }).from(knowledgeAreas).where(inArray(knowledgeAreas.id, areaIds));
      if (valid.length !== areaIds.length) throw new AppError("Área do conhecimento inválida.");
    }
    if (topicIds.length) {
      const valid = await tx
        .select({ id: catalogTopics.id })
        .from(catalogTopics)
        .where(and(inArray(catalogTopics.id, topicIds), eq(catalogTopics.status, "approved")));
      if (valid.length !== topicIds.length) throw new AppError("Tema do catálogo inválido.");
    }
    await tx.delete(userInterestAreas).where(eq(userInterestAreas.userId, userId));
    await tx.delete(userFollowedTopics).where(eq(userFollowedTopics.userId, userId));
    await tx.delete(userGoalTags).where(eq(userGoalTags.userId, userId));
    if (areaIds.length) await tx.insert(userInterestAreas).values(areaIds.map((areaId) => ({ userId, areaId })));
    if (topicIds.length) {
      await tx.insert(userFollowedTopics).values(topicIds.map((catalogTopicId) => ({ userId, catalogTopicId })));
    }
    if (goalIds.length) await tx.insert(userGoalTags).values(goalIds.map((tagId) => ({ userId, tagId })));
  });
}
