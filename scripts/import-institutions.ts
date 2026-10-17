/**
 * Importa as bases oficiais de instituições para o banco.
 *
 *   npm run institutions:import -- data/emec-ies.xls data/inep-escolas.csv [mais arquivos...]
 *   npm run institutions:import -- data/inep-sp.csv --todas-escolas
 *
 * - e-MEC: exportação da consulta pública avançada (tabela HTML salva como .xls).
 * - INEP: CSV "Tabela da lista das escolas - Detalhado" (pode ser enviado em várias partes).
 * Idempotente: rodar de novo atualiza nomes/municípios/situação; nada é apagado.
 * No PGlite (desenvolvimento), pare o `npm run dev` antes.
 */
import { readFileSync } from "node:fs";
import { getDb } from "../src/server/db";
import { parseInstitutionFile, type InstitutionRow } from "../src/server/import/institution-files";
import { countInstitutions, upsertInstitutions } from "../src/server/services/institutions";
import { auditLogs } from "../src/server/db/schema";

async function main() {
  const allSchools = process.argv.includes("--todas-escolas");
  const files = process.argv.slice(2).filter((a) => !a.startsWith("--"));
  if (!files.length) throw new Error("Informe os arquivos: npm run institutions:import -- data/arquivo.xls data/escolas.csv");

  const byKey = new Map<string, InstitutionRow>();
  for (const file of files) {
    const rows = parseInstitutionFile(readFileSync(file, "utf8"), { allSchools });
    for (const r of rows) byKey.set(`${r.source}:${r.sourceCode}`, r); // partes repetidas não duplicam
    const ufs = new Set(rows.map((r) => r.uf).filter(Boolean));
    console.log(`${file}: ${rows.length} registros (${rows[0]?.source ?? "?"}, ${ufs.size} UFs)`);
  }

  const db = await getDb();
  const all = [...byKey.values()];
  await upsertInstitutions(db, all);
  await db.insert(auditLogs).values({
    action: "institutions.imported",
    entityType: "institution",
    metadata: { files, rows: all.length, allSchools },
  });
  const totals = await countInstitutions(db);
  console.log(`Importação concluída. Ativas no banco: ${totals.higher ?? 0} faculdades, ${totals.school ?? 0} escolas.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
