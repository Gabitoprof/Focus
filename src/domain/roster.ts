/**
 * Lê matrículas/registros de um arquivo de texto ou planilha salva como CSV.
 * - Uma por linha (.txt) ou em colunas (.csv separado por vírgula, ponto e vírgula ou tab).
 * - Se a primeira linha for um cabeçalho com "matrícula", "registro", "RA" ou "código",
 *   usa essa coluna; senão, usa a primeira coluna. Linhas vazias e repetidas são ignoradas.
 */
export function extractEnrollments(text: string): string[] {
  const lines = text
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const sep = [";", "\t", ","].find((s) => lines[0].includes(s));
  const cells = (l: string) => (sep ? l.split(sep) : [l]).map((c) => c.trim().replace(/^"(.*)"$/, "$1").trim());
  const header = cells(lines[0]).map((c) => c.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase());
  const col = header.findIndex((h) => /^(matricula|registro|ra|codigo|cod|n[ºo°]?\s*matricula|id)\b/.test(h));
  // Cabeçalho = primeira linha sem nenhum dígito (ex.: "Nome;Matrícula;Turma").
  const hasHeader = col >= 0 || !/\d/.test(lines[0]);
  const idx = col >= 0 ? col : 0;
  const out = new Set<string>();
  for (const l of hasHeader ? lines.slice(1) : lines) {
    const v = cells(l)[idx] ?? "";
    if (v && /\d/.test(v)) out.add(v);
  }
  return [...out];
}
