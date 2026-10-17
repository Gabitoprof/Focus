import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { normalizeTerm } from "@/domain/catalog";
import { isRankedCategory, usageForContext, type AppContext, type Usage } from "@/domain/contexts";
import { catalogTopics, categories, knowledgeAreas, sessionSegments, studySessions, topics } from "../db/schema";
import { recordTermUsage } from "./catalog";
import { AppError, type Ctx } from "./common";

const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(e: unknown) {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === UNIQUE_VIOLATION || err?.cause?.code === UNIQUE_VIOLATION;
}

export type CategoryWithTopics = {
  id: string;
  name: string;
  color: string;
  areaId: string | null;
  context: AppContext;
  /** Área de utilização (no perfil Pessoal: pessoal, profissional ou acadêmica). */
  usage: Usage;
  /** Pode entrar no ranking acadêmico geral (perfil Acadêmico ou área Acadêmica do Pessoal). */
  ranked: boolean;
  archivedAt: Date | null;
  totalSeconds: number;
  topics: {
    id: string;
    name: string;
    archivedAt: Date | null;
    totalSeconds: number;
    sessions: number;
    catalogTopic: { id: string; name: string; areaId: string | null } | null;
  }[];
};

/** Categorias e temas do usuário (excluídos logicamente ficam de fora), com tempo acumulado. */
export async function listCategories(ctx: Ctx, userId: string, context?: AppContext): Promise<CategoryWithTopics[]> {
  const cats = await ctx.db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.userId, userId),
        isNull(categories.deletedAt),
        context ? eq(categories.context, context) : undefined,
      ),
    )
    .orderBy(asc(categories.name));
  const tps = await ctx.db
    .select()
    .from(topics)
    .where(and(eq(topics.userId, userId), isNull(topics.deletedAt)))
    .orderBy(asc(topics.name));
  // Tempo por tema a partir dos segmentos; o segmento aberto (sessão em andamento) conta até agora.
  const now = ctx.now();
  const seconds = await ctx.db
    .select({
      topicId: studySessions.topicId,
      seconds: sql<number>`coalesce(floor(sum(extract(epoch from (coalesce(${sessionSegments.endedAt}, ${now.toISOString()}::timestamptz) - ${sessionSegments.startedAt})))), 0)::int`,
    })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(and(eq(sessionSegments.userId, userId), isNotNull(studySessions.topicId)))
    .groupBy(studySessions.topicId);
  const counts = await ctx.db
    .select({ topicId: studySessions.topicId, sessions: sql<number>`count(*)::int` })
    .from(studySessions)
    .where(and(eq(studySessions.userId, userId), isNotNull(studySessions.endedAt), isNotNull(studySessions.topicId)))
    .groupBy(studySessions.topicId);
  const countByTopic = new Map(counts.map((t) => [t.topicId, Number(t.sessions)]));
  const byTopic = new Map(
    seconds.map((t) => [t.topicId, { seconds: Number(t.seconds), sessions: countByTopic.get(t.topicId) ?? 0 }]),
  );
  const linkedIds = [...new Set(tps.map((t) => t.catalogTopicId).filter((id): id is string => Boolean(id)))];
  const linked = linkedIds.length
    ? await ctx.db
        .select({ id: catalogTopics.id, name: catalogTopics.name, areaId: catalogTopics.areaId })
        .from(catalogTopics)
        .where(inArray(catalogTopics.id, linkedIds))
    : [];
  const catalogById = new Map(linked.map((c) => [c.id, c]));

  return cats.map((c) => {
    const own = tps
      .filter((t) => t.categoryId === c.id)
      .map((t) => ({
        id: t.id,
        name: t.name,
        archivedAt: t.archivedAt,
        totalSeconds: Number(byTopic.get(t.id)?.seconds ?? 0),
        sessions: Number(byTopic.get(t.id)?.sessions ?? 0),
        catalogTopic: t.catalogTopicId ? (catalogById.get(t.catalogTopicId) ?? null) : null,
      }));
    return {
      id: c.id,
      name: c.name,
      color: c.color,
      areaId: c.areaId,
      context: c.context,
      usage: c.usage,
      ranked: isRankedCategory(c),
      archivedAt: c.archivedAt,
      totalSeconds: own.reduce((acc, t) => acc + t.totalSeconds, 0),
      topics: own,
    };
  });
}

async function ownedCategory(ctx: Ctx, userId: string, id: string) {
  const [c] = await ctx.db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.userId, userId), isNull(categories.deletedAt)));
  if (!c) throw new AppError("Registro não encontrado.", "not_found");
  return c;
}

async function ownedTopic(ctx: Ctx, userId: string, id: string) {
  const [t] = await ctx.db
    .select()
    .from(topics)
    .where(and(eq(topics.id, id), eq(topics.userId, userId), isNull(topics.deletedAt)));
  if (!t) throw new AppError("Tema não encontrado.", "not_found");
  return t;
}

export async function createCategory(
  ctx: Ctx,
  userId: string,
  input: { name: string; color?: string; areaId?: string | null; context?: AppContext; usage?: Usage | null },
) {
  const context = input.context ?? "academic";
  const usage = usageForContext(context, input.usage);
  // Fora do ranking acadêmico não há área.
  if (!isRankedCategory({ context, usage })) input = { ...input, areaId: null };
  if (input.areaId) {
    const [area] = await ctx.db.select().from(knowledgeAreas).where(eq(knowledgeAreas.id, input.areaId));
    if (!area) throw new AppError("Área do conhecimento inválida.");
  }
  try {
    const [c] = await ctx.db
      .insert(categories)
      .values({
        userId,
        name: input.name.trim(),
        ...(input.color ? { color: input.color } : {}),
        ...(input.areaId ? { areaId: input.areaId } : {}),
        context,
        usage,
      })
      .returning();
    return c;
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("Já existe um registro com esse nome.", "conflict");
    throw e;
  }
}

export async function updateCategory(ctx: Ctx, userId: string, id: string, input: { name?: string; color?: string }) {
  await ownedCategory(ctx, userId, id);
  try {
    await ctx.db
      .update(categories)
      .set({ ...(input.name ? { name: input.name.trim() } : {}), ...(input.color ? { color: input.color } : {}), updatedAt: ctx.now() })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("Já existe um registro com esse nome.", "conflict");
    throw e;
  }
}

export async function setCategoryArchived(ctx: Ctx, userId: string, id: string, archived: boolean) {
  await ownedCategory(ctx, userId, id);
  await ctx.db
    .update(categories)
    .set({ archivedAt: archived ? ctx.now() : null, updatedAt: ctx.now() })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

/**
 * Torna a categoria pessoal (fora de todos os rankings). Mão única: uma categoria pessoal nunca
 * volta para o ranking. Remove a área e os vínculos com o catálogo; vale para sessões futuras.
 */
export async function makeCategoryPersonal(ctx: Ctx, userId: string, id: string) {
  const c = await ownedCategory(ctx, userId, id);
  if (c.context !== "academic") return;
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    await tx.update(categories).set({ context: "personal", usage: "personal", areaId: null, updatedAt: now }).where(eq(categories.id, id));
    await tx
      .update(topics)
      .set({ catalogTopicId: null, updatedAt: now })
      .where(and(eq(topics.categoryId, id), eq(topics.userId, userId)));
  });
}

/**
 * Muda a área de utilização de uma categoria do perfil Pessoal (pessoal, profissional ou
 * acadêmica). Vale para as próximas sessões: o que já foi registrado fica onde aconteceu.
 */
export async function setCategoryUsage(ctx: Ctx, userId: string, id: string, usage: Usage) {
  const c = await ownedCategory(ctx, userId, id);
  if (c.context !== "personal") throw new AppError("A área de utilização só muda no perfil Pessoal.", "invalid");
  await ctx.db
    .update(categories)
    .set({ usage, ...(usage !== "academic" ? { areaId: null } : {}), updatedAt: ctx.now() })
    .where(and(eq(categories.id, id), eq(categories.userId, userId)));
}

/** Exclusão lógica: some das listas, mas sessões e XP continuam no histórico. */
export async function deleteCategory(ctx: Ctx, userId: string, id: string) {
  await ownedCategory(ctx, userId, id);
  const now = ctx.now();
  await ctx.db.transaction(async (tx) => {
    await tx
      .update(topics)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(topics.categoryId, id), eq(topics.userId, userId), isNull(topics.deletedAt)));
    await tx
      .update(categories)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(categories.id, id), eq(categories.userId, userId)));
  });
}

/**
 * Cria um tema. Se o nome corresponder a um tema aprovado do catálogo (ou sinônimo), já nasce
 * vinculado; senão, o termo entra na contagem da comunidade (promoção automática).
 */
/**
 * `areaId`: área do conhecimento do tema quando ele ainda não existe no catálogo (vale como voto
 * da comunidade para a área do futuro tema oficial). A área nunca vem de uma escolha solta da
 * categoria: ela é sempre a do tema.
 */
export async function createTopic(
  ctx: Ctx,
  userId: string,
  input: { categoryId: string; name: string; areaId?: string | null },
) {
  const category = await ownedCategory(ctx, userId, input.categoryId);
  const name = input.name.trim();
  try {
    return await ctx.db.transaction(async (tx) => {
      const [t] = await tx
        .insert(topics)
        .values({ userId, categoryId: input.categoryId, name, normalizedName: normalizeTerm(name) })
        .returning();
      // Temas de categorias pessoais não votam no catálogo nem se vinculam a ele.
      const catalogTopicId = !isRankedCategory(category)
        ? null
        : await recordTermUsage(tx, { userId, name, areaId: input.areaId ?? category.areaId }, ctx.now());
      if (catalogTopicId) {
        await tx.update(topics).set({ catalogTopicId }).where(eq(topics.id, t.id));
        return { ...t, catalogTopicId };
      }
      return t;
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("Já existe um tema com esse nome neste registro.", "conflict");
    throw e;
  }
}

/** Renomeia. Se o novo nome corresponder ao catálogo, o vínculo passa a ser esse; senão, mantém o atual. */
export async function updateTopic(ctx: Ctx, userId: string, id: string, input: { name: string }) {
  const topic = await ownedTopic(ctx, userId, id);
  const [category] = await ctx.db.select().from(categories).where(eq(categories.id, topic.categoryId));
  const name = input.name.trim();
  try {
    await ctx.db.transaction(async (tx) => {
      await tx
        .update(topics)
        .set({ name, normalizedName: normalizeTerm(name), updatedAt: ctx.now() })
        .where(and(eq(topics.id, id), eq(topics.userId, userId)));
      const catalogTopicId = !category || !isRankedCategory(category)
        ? null
        : await recordTermUsage(tx, { userId, name, areaId: category?.areaId ?? null }, ctx.now());
      if (catalogTopicId) await tx.update(topics).set({ catalogTopicId }).where(eq(topics.id, id));
    });
  } catch (e) {
    if (isUniqueViolation(e)) throw new AppError("Já existe um tema com esse nome neste registro.", "conflict");
    throw e;
  }
}

export async function setTopicArchived(ctx: Ctx, userId: string, id: string, archived: boolean) {
  await ownedTopic(ctx, userId, id);
  await ctx.db
    .update(topics)
    .set({ archivedAt: archived ? ctx.now() : null, updatedAt: ctx.now() })
    .where(and(eq(topics.id, id), eq(topics.userId, userId)));
}

export async function deleteTopic(ctx: Ctx, userId: string, id: string) {
  await ownedTopic(ctx, userId, id);
  await ctx.db
    .update(topics)
    .set({ deletedAt: ctx.now(), updatedAt: ctx.now() })
    .where(and(eq(topics.id, id), eq(topics.userId, userId)));
}
