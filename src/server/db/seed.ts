import { DEFAULT_CATALOG_SETTINGS, KNOWLEDGE_AREAS, normalizeTerm } from "@/domain/catalog";
import { CATALOG_SEED } from "@/domain/catalog-seed";
import { DEFAULT_METHODS } from "@/domain/methods";
import { DEFAULT_AUDIO_SETTINGS, DEFAULT_TIMER_SETTINGS } from "@/domain/settings";
import type { DB } from "./index";
import { eq, isNull, sql } from "drizzle-orm";
import { DEFAULT_PLANS } from "@/domain/entitlements";
import { assignPublicCode } from "../services/profile";
import { appSettings, catalogTopics, knowledgeAreas, plans, profiles, studyMethods, topics } from "./schema";

/**
 * Dados de referência (métodos, configurações, áreas e temas iniciais do catálogo).
 * Idempotente: só insere o que ainda não existe, preservando alterações do administrador.
 */
export async function seedReferenceData(db: DB) {
  await db
    .insert(studyMethods)
    .values(DEFAULT_METHODS.map((m) => ({ ...m })))
    .onConflictDoNothing();
  await db
    .insert(appSettings)
    .values([
      { key: "timer", value: DEFAULT_TIMER_SETTINGS },
      { key: "audio", value: DEFAULT_AUDIO_SETTINGS },
      { key: "catalog", value: DEFAULT_CATALOG_SETTINGS },
    ])
    .onConflictDoNothing();
  await db.insert(plans).values(DEFAULT_PLANS).onConflictDoNothing();
  await db
    .insert(knowledgeAreas)
    .values(KNOWLEDGE_AREAS.map((a, i) => ({ ...a, sortOrder: i + 1 })))
    .onConflictDoNothing();

  await seedCatalog(db);

  // Contas criadas antes do código público recebem o seu.
  const withoutCode = await db.select({ userId: profiles.userId }).from(profiles).where(isNull(profiles.publicCode));
  for (const p of withoutCode) await assignPublicCode(db, p.userId);

  // Temas criados antes do catálogo: preenche o nome padronizado (usado nos vínculos).
  const pending = await db
    .select({ id: topics.id, name: topics.name })
    .from(topics)
    .where(isNull(topics.normalizedName));
  for (const t of pending) {
    await db.update(topics).set({ normalizedName: normalizeTerm(t.name) }).where(eq(topics.id, t.id));
  }
}

/**
 * Catálogo curado: o mesmo tema pode vir de vários grupos (ex.: "Genética" na escola, no
 * vestibular e na faculdade) — níveis e cursos são unidos. Tema já existente mantém nome e área
 * (o admin pode ter ajustado); termo da comunidade ainda pendente passa a ser oficial.
 */
async function seedCatalog(db: DB) {
  const byName = new Map<string, { name: string; areaId: string; levels: Set<string>; courses: Set<string> }>();
  for (const g of CATALOG_SEED) {
    for (const name of g.topics) {
      const key = normalizeTerm(name);
      const row = byName.get(key) ?? { name, areaId: g.area, levels: new Set<string>(), courses: new Set<string>() };
      g.levels.forEach((l) => row.levels.add(l));
      if (g.course) row.courses.add(g.course);
      byName.set(key, row);
    }
  }
  await upsertCatalogTopics(
    db,
    [...byName.values()].map((r) => ({ name: r.name, areaId: r.areaId, levels: [...r.levels], courses: [...r.courses] })),
  );
}

/**
 * Grava temas oficiais no catálogo sem duplicar: une níveis e cursos, mantém nome e área de quem
 * já existe e oficializa termos da comunidade que estavam pendentes. Usado pela base curada e
 * pela importação da tabela do CNPq.
 */
export async function upsertCatalogTopics(
  db: DB,
  input: { name: string; areaId: string; levels: string[]; courses: string[] }[],
) {
  const now = new Date();
  const merged = new Map<string, { name: string; areaId: string; levels: Set<string>; courses: Set<string> }>();
  for (const t of input) {
    const key = normalizeTerm(t.name);
    if (!key) continue;
    const row = merged.get(key) ?? { name: t.name, areaId: t.areaId, levels: new Set<string>(), courses: new Set<string>() };
    t.levels.forEach((l) => row.levels.add(l));
    t.courses.forEach((c) => row.courses.add(c));
    merged.set(key, row);
  }
  const rows = [...merged.entries()].map(([normalizedName, r]) => ({
    name: r.name,
    normalizedName,
    areaId: r.areaId,
    levels: [...r.levels],
    courses: [...r.courses],
    status: "approved" as const,
    source: "seed" as const,
    approvedAt: now,
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(catalogTopics)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: catalogTopics.normalizedName,
        set: {
          levels: sql`(select array(select distinct unnest(${catalogTopics.levels} || excluded.levels)))`,
          courses: sql`(select array(select distinct unnest(${catalogTopics.courses} || excluded.courses)))`,
          areaId: sql`coalesce(${catalogTopics.areaId}, excluded.area_id)`,
          status: sql`case when ${catalogTopics.status} = 'pending' then 'approved' else ${catalogTopics.status} end`,
          approvedAt: sql`coalesce(${catalogTopics.approvedAt}, excluded.approved_at)`,
        },
      });
  }
  return rows.length;
}
