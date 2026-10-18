/**
 * Copia os dados de UMA conta do banco local (PGlite) para a mesma conta no banco da nuvem
 * (Supabase), identificada pelo e-mail. Mantém o login da nuvem (e-mail e senha) e acrescenta:
 * papéis, preferências do perfil, registros, temas, projetos próprios, sessões, pausas,
 * intervalos e XP. Pode rodar de novo: atualiza o que mudou, sem duplicar (usa os mesmos ids).
 *
 * Não copia: CPF e matrícula (a chave secreta de produção é outra; refaça a verificação na nuvem),
 * vínculos com organizações/instituições, amizades e projetos de outras pessoas (essas contas não
 * existem na nuvem).
 *
 *   (pare o `npm run dev` antes — o PGlite aceita um processo por vez)
 *   npx tsx scripts/sync-account-to-cloud.ts email@exemplo.com
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { and, eq, getTableColumns, inArray, isNull, sql } from "drizzle-orm";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgTable } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import { pgPoolConfig } from "../src/server/db";
import * as s from "../src/server/db/schema";

const email = process.argv[2];
if (!email) throw new Error("Informe o e-mail da conta.");

const nuvem = Object.fromEntries(
  readFileSync(".env.nuvem", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/))
    .filter((m): m is RegExpMatchArray => Boolean(m))
    .map((m) => [m[1], m[2]]),
);

type Row = Record<string, unknown>;

async function main() {
  const local = drizzlePglite(new PGlite(path.join(process.cwd(), ".data", "pglite")), { schema: s });
  const pool = new Pool(pgPoolConfig(nuvem.DATABASE_URL_DIRECT ?? nuvem.DATABASE_URL));
  const cloud = drizzlePg(pool, { schema: s });

  const [lu] = await local.select().from(s.user).where(sql`lower(${s.user.email}) = lower(${email})`);
  const [cu] = await cloud.select().from(s.user).where(sql`lower(${s.user.email}) = lower(${email})`);
  if (!lu) throw new Error("Conta não encontrada no banco local.");
  if (!cu) throw new Error("Conta não encontrada na nuvem: crie a conta no site primeiro.");
  const L = lu.id;
  const C = cu.id;
  const otherLocalUsers = new Set((await local.select({ id: s.user.id }).from(s.user)).map((u) => u.id).filter((id) => id !== L));

  // Ids do catálogo diferem entre os bancos: casa pelo nome normalizado.
  const localCat = new Map((await local.select({ id: s.catalogTopics.id, n: s.catalogTopics.normalizedName }).from(s.catalogTopics)).map((r) => [r.id, r.n]));
  const cloudCat = new Map((await cloud.select({ id: s.catalogTopics.id, n: s.catalogTopics.normalizedName }).from(s.catalogTopics)).map((r) => [r.n, r.id]));
  const cat = (id: unknown) => (typeof id === "string" ? (cloudCat.get(localCat.get(id) ?? "") ?? null) : null);

  /** Troca a conta local pela da nuvem; ids de outras contas locais viram null (não existem na nuvem). */
  const fixUsers = (row: Row) => {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) out[k] = v === L ? C : typeof v === "string" && otherLocalUsers.has(v) ? null : v;
    return out;
  };
  const upsert = async (table: PgTable, rows: Row[], target: unknown) => {
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      const cols = getTableColumns(table) as Record<string, { name: string }>;
      const set = Object.fromEntries(Object.keys(chunk[0] ?? {}).filter((k) => cols[k]).map((k) => [k, sql.raw(`excluded."${cols[k].name}"`)]));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (chunk.length) await (cloud.insert(table as any).values(chunk as any) as any).onConflictDoUpdate({ target, set });
    }
  };
  const report: Record<string, number> = {};

  // 1) Papéis e preferências do perfil (o login da nuvem continua o mesmo).
  const roles = await local.select().from(s.userRoles).where(eq(s.userRoles.userId, L));
  for (const r of roles) await cloud.insert(s.userRoles).values({ ...r, userId: C }).onConflictDoNothing();
  report.papeis = roles.length;
  const [lp] = await local.select().from(s.profiles).where(eq(s.profiles.userId, L));
  if (lp) {
    await cloud
      .update(s.profiles)
      .set({ displayName: lp.displayName, timezone: lp.timezone, locale: lp.locale, alarmVolume: lp.alarmVolume, activeContext: lp.activeContext })
      .where(eq(s.profiles.userId, C));
  }
  for (const r of await local.select().from(s.userInterestAreas).where(eq(s.userInterestAreas.userId, L)))
    await cloud.insert(s.userInterestAreas).values({ ...r, userId: C }).onConflictDoNothing();
  for (const r of await local.select().from(s.userGoalTags).where(eq(s.userGoalTags.userId, L)))
    await cloud.insert(s.userGoalTags).values({ ...r, userId: C }).onConflictDoNothing();
  for (const r of await local.select().from(s.userFollowedTopics).where(eq(s.userFollowedTopics.userId, L))) {
    const id = cat(r.catalogTopicId);
    if (id) await cloud.insert(s.userFollowedTopics).values({ ...r, userId: C, catalogTopicId: id }).onConflictDoNothing();
  }
  for (const r of await local.select().from(s.catalogTermUsage).where(eq(s.catalogTermUsage.userId, L)))
    await cloud.insert(s.catalogTermUsage).values({ ...r, userId: C }).onConflictDoNothing();

  // 2) Registros (categorias) e temas — se já houver um com o mesmo nome na nuvem, reaproveita.
  const catIdMap = new Map<string, string>();
  const cats = await local.select().from(s.categories).where(eq(s.categories.userId, L));
  const cloudCats = await cloud.select().from(s.categories).where(and(eq(s.categories.userId, C), isNull(s.categories.deletedAt)));
  const toCopyCats: Row[] = [];
  for (const c of cats) {
    const same = !c.deletedAt && cloudCats.find((x) => x.id !== c.id && x.name.toLowerCase() === c.name.toLowerCase());
    catIdMap.set(c.id, same ? same.id : c.id);
    if (!same) toCopyCats.push(fixUsers(c));
  }
  await upsert(s.categories, toCopyCats, s.categories.id);
  report.registros = cats.length;

  const topicIdMap = new Map<string, string>();
  const tops = await local.select().from(s.topics).where(eq(s.topics.userId, L));
  const cloudTops = await cloud.select().from(s.topics).where(and(eq(s.topics.userId, C), isNull(s.topics.deletedAt)));
  const toCopyTops: Row[] = [];
  for (const t of tops) {
    const categoryId = catIdMap.get(t.categoryId) ?? t.categoryId;
    const same = !t.deletedAt && cloudTops.find((x) => x.id !== t.id && x.categoryId === categoryId && x.name.toLowerCase() === t.name.toLowerCase());
    topicIdMap.set(t.id, same ? same.id : t.id);
    if (!same) toCopyTops.push({ ...fixUsers(t), categoryId, catalogTopicId: cat(t.catalogTopicId) });
  }
  await upsert(s.topics, toCopyTops, s.topics.id);
  report.temas = tops.length;

  // 3) Projetos próprios (sem organização: as organizações não existem na nuvem).
  const projs = await local.select().from(s.projects).where(eq(s.projects.ownerUserId, L));
  const projIds = new Set(projs.map((p) => p.id));
  await upsert(
    s.projects,
    projs.map((p) => ({ ...fixUsers(p), organizationId: null, movedFromOrganizationId: null })),
    s.projects.id,
  );
  if (projIds.size) {
    const members = await local.select().from(s.projectMembers).where(and(inArray(s.projectMembers.projectId, [...projIds]), eq(s.projectMembers.userId, L)));
    for (const m of members) await cloud.insert(s.projectMembers).values({ ...fixUsers(m), userId: C } as typeof s.projectMembers.$inferInsert).onConflictDoNothing();
    const tasks = await local.select().from(s.projectTasks).where(inArray(s.projectTasks.projectId, [...projIds]));
    await upsert(s.projectTasks, tasks.map(fixUsers), s.projectTasks.id);
    const taskIds = new Set(tasks.map((t) => t.id));
    const deps = await local.select().from(s.projectTaskDependencies);
    for (const d of deps.filter((d) => taskIds.has(d.taskId) && taskIds.has(d.dependsOnTaskId)))
      await cloud.insert(s.projectTaskDependencies).values(d).onConflictDoNothing();
  }
  report.projetos = projs.length;

  // 4) Sessões, trechos de tempo, intervalos e XP.
  const sessions = (await local.select().from(s.studySessions).where(eq(s.studySessions.userId, L))).filter(
    (x) => !x.projectId || projIds.has(x.projectId),
  );
  report.sessoesIgnoradas = (await local.select({ id: s.studySessions.id }).from(s.studySessions).where(eq(s.studySessions.userId, L))).length - sessions.length;
  const sessionIds = new Set(sessions.map((x) => x.id));
  await upsert(
    s.studySessions,
    sessions.map((x) => ({
      ...fixUsers(x),
      topicId: x.topicId ? (topicIdMap.get(x.topicId) ?? x.topicId) : null,
      categoryId: x.categoryId ? (catIdMap.get(x.categoryId) ?? x.categoryId) : null,
      catalogTopicId: cat(x.catalogTopicId),
    })),
    s.studySessions.id,
  );
  report.sessoes = sessions.length;
  const segs = (await local.select().from(s.sessionSegments).where(eq(s.sessionSegments.userId, L))).filter((g) => sessionIds.has(g.sessionId));
  await upsert(s.sessionSegments, segs.map(fixUsers), s.sessionSegments.id);
  const brks = await local.select().from(s.breaks).where(eq(s.breaks.userId, L));
  await upsert(
    s.breaks,
    brks.map((b) => ({ ...fixUsers(b), sessionId: b.sessionId && sessionIds.has(b.sessionId) ? b.sessionId : null })),
    s.breaks.id,
  );
  report.intervalos = brks.length;
  const xps = await local.select().from(s.xpTransactions).where(eq(s.xpTransactions.userId, L));
  await upsert(s.xpTransactions, xps.map((x) => ({ ...fixUsers(x), catalogTopicId: cat(x.catalogTopicId) })), s.xpTransactions.id);
  report.lancamentosXp = xps.length;

  // Saldo de XP = soma do extrato na nuvem.
  const [{ total }] = await cloud
    .select({ total: sql<number>`coalesce(sum(${s.xpTransactions.amount}), 0)::int` })
    .from(s.xpTransactions)
    .where(eq(s.xpTransactions.userId, C));
  await cloud.update(s.profiles).set({ xpBalance: Math.max(0, Number(total)) }).where(eq(s.profiles.userId, C));
  report.xpNaNuvem = Number(total);

  console.log("Sincronizado para a nuvem:", report);
  await pool.end();
  process.exit(0);
}


main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
