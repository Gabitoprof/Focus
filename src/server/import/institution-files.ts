/**
 * Leitura das bases oficiais de instituições. Funções puras (texto → registros), sem banco.
 * Importa apenas o necessário para busca e ranking: código, nome, sigla, município, UF e
 * situação. Contatos, CNPJ e dirigentes presentes nos arquivos são descartados (minimização).
 */

export type InstitutionRow = {
  kind: "higher" | "school";
  source: "emec" | "inep";
  sourceCode: string;
  name: string;
  acronym: string | null;
  city: string | null;
  uf: string | null;
  isActive: boolean;
};

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  atilde: "ã", otilde: "õ", Atilde: "Ã", Otilde: "Õ",
  acirc: "â", ecirc: "ê", ocirc: "ô", Acirc: "Â", Ecirc: "Ê", Ocirc: "Ô",
  agrave: "à", Agrave: "À", ccedil: "ç", Ccedil: "Ç", uuml: "ü", Uuml: "Ü",
  ordm: "º", ordf: "ª",
};

function decodeHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const clean = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t && t !== "-" ? t : null;
};

/** Remove a sigla repetida no fim do nome: "PONTIFÍCIA ... GERAIS (PUC MINAS)" → "PONTIFÍCIA ... GERAIS". */
function stripTrailingAcronym(name: string, acronym: string | null) {
  if (!acronym) return name;
  const suffix = `(${acronym})`;
  return name.toUpperCase().endsWith(suffix.toUpperCase()) ? name.slice(0, -suffix.length).trim() : name;
}

/** Exportação da "consulta pública avançada" do e-MEC: tabela HTML salva como .xls. */
export function parseEmecHtml(html: string): InstitutionRow[] {
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) =>
    [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => decodeHtml(c[1])),
  );
  const headerIndex = rows.findIndex((r) => r.includes("Código IES"));
  if (headerIndex < 0) throw new Error("Arquivo do e-MEC sem a coluna 'Código IES'.");
  const h = rows[headerIndex];
  const col = (name: string) => {
    const i = h.indexOf(name);
    if (i < 0) throw new Error(`Arquivo do e-MEC sem a coluna '${name}'.`);
    return i;
  };
  const [code, name, acronym, city, uf, status] = [
    col("Código IES"),
    col("Instituição(IES)"),
    col("Sigla"),
    col("Município"),
    col("UF"),
    col("Situação da IES"),
  ];
  return rows
    .slice(headerIndex + 1)
    .filter((r) => r.length === h.length && /^\d+$/.test(r[code]))
    .map((r) => {
      const sigla = clean(r[acronym]);
      return {
        kind: "higher" as const,
        source: "emec" as const,
        sourceCode: r[code],
        name: stripTrailingAcronym(r[name], sigla),
        acronym: sigla,
        city: clean(r[city]),
        uf: clean(r[uf])?.toUpperCase() ?? null,
        isActive: (r[status] ?? "").toLowerCase().startsWith("ativa"),
      };
    });
}

/** CSV (vírgula, aspas duplas) → linhas. */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** Etapas que interessam ao público da plataforma (quem estuda com metas de prova). */
const SCHOOL_STAGES = /Ensino Médio|Educação Profissional|Educação de Jovens Adultos/i;

/**
 * Catálogo de Escolas do INEP ("Tabela da lista das escolas - Detalhado").
 * Por padrão mantém só escolas com Ensino Médio, técnico ou EJA; `allSchools` importa todas.
 * Escolas paralisadas entram como inativas.
 */
export function parseInepCsv(text: string, opts: { allSchools?: boolean } = {}): InstitutionRow[] {
  const rows = parseCsv(text);
  const h = rows[0];
  const col = (name: string) => {
    const i = h.indexOf(name);
    if (i < 0) throw new Error(`Arquivo do INEP sem a coluna '${name}'.`);
    return i;
  };
  const [name, code, uf, city, stages, status] = [
    col("Escola"),
    col("Código INEP"),
    col("UF"),
    col("Município"),
    col("Etapas e Modalidade de Ensino Oferecidas"),
    col("Restrição de Atendimento"),
  ];
  return rows
    .slice(1)
    .filter((r) => /^\d{8}$/.test(r[code] ?? ""))
    .filter((r) => opts.allSchools || SCHOOL_STAGES.test(r[stages] ?? ""))
    .map((r) => ({
      kind: "school" as const,
      source: "inep" as const,
      sourceCode: r[code],
      name: r[name].trim(),
      acronym: null,
      city: clean(r[city]),
      uf: clean(r[uf])?.toUpperCase() ?? null,
      isActive: !/PARALISADA|EXTINTA/i.test(r[status] ?? ""),
    }));
}

/** Detecta o formato pelo conteúdo. */
export function parseInstitutionFile(text: string, opts: { allSchools?: boolean } = {}): InstitutionRow[] {
  const head = text.slice(0, 4000);
  if (/<t[dr][\s>]/i.test(head) || /<meta|<table|<div/i.test(head)) return parseEmecHtml(text);
  if (head.includes("Código INEP")) return parseInepCsv(text, opts);
  throw new Error("Formato não reconhecido: esperado a exportação do e-MEC (HTML/.xls) ou o CSV de escolas do INEP.");
}
