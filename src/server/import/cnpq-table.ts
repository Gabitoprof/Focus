/**
 * Leitura da Tabela de Áreas do Conhecimento (CNPq/CAPES), arquivo .doc oficial. O texto fica no
 * documento como pares "código de 8 dígitos" + nome, separados por marcas de célula do Word.
 * Código: G AA SS EE D — grande área (AA=00), área (SS=00, EE=00), subárea (EE=00), especialidade.
 */
export type CnpqLevel = "grande_area" | "area" | "subarea" | "especialidade";
export type CnpqItem = { code: string; name: string; level: CnpqLevel; areaId: string; parentArea: string | null };

/** Primeiro dígito do código → grande área usada na Focus. */
const GRANDE_AREA: Record<string, string> = {
  "1": "exatas",
  "2": "biologicas",
  "3": "engenharias",
  "4": "saude",
  "5": "agrarias",
  "6": "sociais_aplicadas",
  "7": "humanas",
  "8": "letras_artes",
  "9": "multidisciplinar",
};

const SMALL_WORDS = new Set(["a", "à", "ao", "aos", "as", "às", "com", "da", "das", "de", "do", "dos", "e", "em", "na", "nas", "no", "nos", "o", "os", "ou", "para", "por", "sem", "sob"]);
const ROMAN = /^(i{1,3}|iv|v|vi{0,3}|ix|x)$/i;

/** "ANÁLISE DE ALGORITMOS E COMPLEXIDADE" → "Análise de Algoritmos e Complexidade". */
export function titleCasePt(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("pt-BR")
    .split(" ")
    .map((w, i) => {
      if (ROMAN.test(w)) return w.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(w)) return w;
      return w.replace(/^(\p{L})/u, (c) => c.toLocaleUpperCase("pt-BR")).replace(/([-/(]\p{L})/gu, (m) => m.toLocaleUpperCase("pt-BR"));
    })
    .join(" ");
}

export function levelOf(code: string): CnpqLevel {
  const [aa, ss, ee] = [code.slice(1, 3), code.slice(3, 5), code.slice(5, 7)];
  if (aa === "00") return "grande_area";
  if (ss === "00" && ee === "00") return "area";
  if (ee === "00") return "subarea";
  return "especialidade";
}

/** Extrai os itens da tabela a partir do conteúdo bruto do .doc. */
export function parseCnpqDoc(buffer: Buffer): CnpqItem[] {
  const text = buffer.toString("latin1");
  const re = /(\d{8})\x07\r?([^\x07\r]{2,200})/g;
  const seen = new Map<string, CnpqItem>();
  let currentArea: string | null = null;
  for (const m of text.matchAll(re)) {
    const code = m[1];
    const areaId = GRANDE_AREA[code[0]];
    if (!areaId) continue;
    const rawName = m[2].replace(/\s+/g, " ").trim();
    if (!/\p{L}/u.test(rawName) || /^ÁREA DE AVALIAÇÃO/i.test(rawName)) continue;
    const level = levelOf(code);
    const name = titleCasePt(rawName);
    if (level === "area") currentArea = name;
    if (level === "grande_area") currentArea = null;
    if (!seen.has(code)) seen.set(code, { code, name, level, areaId, parentArea: level === "area" ? null : currentArea });
  }
  return [...seen.values()];
}
