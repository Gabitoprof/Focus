/**
 * Importa a Tabela de Áreas do Conhecimento (CNPq/CAPES) para o catálogo de temas.
 *
 *   npm run catalog:import-cnpq -- data/cnpq/tabela-areas-2022.doc [--dry-run]
 *
 * Áreas, subáreas e especialidades viram temas oficiais (nível "faculdade"), na grande área
 * correspondente; a área-mãe entra como "curso", então buscar "Medicina" também traz as
 * subáreas e especialidades dela. Idempotente: rodar de novo não duplica nada.
 * No PGlite (desenvolvimento), pare o `npm run dev` antes (exceto com --dry-run).
 */
import { readFileSync } from "node:fs";
import { parseCnpqDoc } from "../src/server/import/cnpq-table";

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith("--"));
  if (!file) throw new Error("Informe o arquivo: npm run catalog:import-cnpq -- data/cnpq/tabela.doc");
  const items = parseCnpqDoc(readFileSync(file));
  const count = (lv: string) => items.filter((i) => i.level === lv).length;
  console.log(
    `${file}: ${items.length} itens — ${count("grande_area")} grandes áreas, ${count("area")} áreas, ${count("subarea")} subáreas, ${count("especialidade")} especialidades`,
  );
  const topics = items
    .filter((i) => i.level !== "grande_area")
    .map((i) => ({
      name: i.name,
      areaId: i.areaId,
      levels: ["faculdade"],
      courses: i.level === "area" ? [i.name] : i.parentArea ? [i.parentArea] : [],
    }));
  if (process.argv.includes("--dry-run")) {
    for (const t of topics.slice(0, 15)) console.log(`  ${t.name} · ${t.areaId} · ${t.courses.join(", ")}`);
    console.log(`(simulação) ${topics.length} temas seriam gravados.`);
    process.exit(0);
  }
  const { getDb } = await import("../src/server/db");
  const { upsertCatalogTopics } = await import("../src/server/db/seed");
  const { auditLogs } = await import("../src/server/db/schema");
  const db = await getDb();
  const written = await upsertCatalogTopics(db, topics);
  await db.insert(auditLogs).values({ action: "catalog.cnpq_imported", entityType: "catalog", metadata: { file, items: items.length, written } });
  console.log(`${written} temas gravados ou atualizados no catálogo.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
