import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_SEED } from "@/domain/catalog-seed";
import { normalizeTerm } from "@/domain/catalog";
import { parseCnpqDoc } from "@/server/import/cnpq-table";

/**
 * O catálogo próprio não pode contradizer a Tabela de Áreas do CNPq, exceto em escolhas
 * deliberadas (abaixo). Um tema novo numa grande área diferente da oficial quebra este teste.
 */
const DELIBERATE: Record<string, string> = {
  // Disciplina de física do ensino médio/vestibular; no CNPq também aparece em Engenharia Mecânica.
  termodinamica: "exatas",
  // Na faculdade, contam para os cursos da Saúde (no CNPq ficam em Ciências Biológicas).
  anatomia: "saude",
  "anatomia humana": "saude",
  fisiologia: "saude",
  farmacologia: "saude",
  cinesiologia: "saude",
  toxicologia: "saude",
  // Geografia escolar (Humanas); no CNPq, Geografia Física fica em Geociências.
  "geografia fisica": "humanas",
  climatologia: "humanas",
  biotecnologia: "biologicas",
  // Homônimo: aqui é a Morfologia da Língua Portuguesa (no CNPq há a Morfologia biológica).
  morfologia: "letras_artes",
};

describe("Catálogo × Tabela de Áreas do CNPq", () => {
  const cnpq = new Map<string, Set<string>>();
  for (const i of parseCnpqDoc(readFileSync("data/cnpq/tabela-areas-2022.doc"))) {
    if (i.level === "grande_area") continue;
    const k = normalizeTerm(i.name);
    cnpq.set(k, (cnpq.get(k) ?? new Set()).add(i.areaId));
  }

  it("cada tema do catálogo próprio está na mesma grande área do CNPq (ou numa exceção documentada)", () => {
    const wrong: string[] = [];
    for (const g of CATALOG_SEED) {
      for (const t of g.topics) {
        const k = normalizeTerm(t);
        const areas = cnpq.get(k);
        if (!areas || areas.has(g.area)) continue;
        if (DELIBERATE[k] === g.area) continue;
        wrong.push(`${t}: catálogo=${g.area}, CNPq=${[...areas].join("/")}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it("Sistemas de Informação fica em Ciências Exatas e da Terra", () => {
    const groups = CATALOG_SEED.filter((g) => g.topics.some((t) => normalizeTerm(t) === "sistemas de informacao"));
    expect(groups.map((g) => g.area)).toEqual(["exatas"]);
    expect(cnpq.get("sistemas de informacao")).toEqual(new Set(["exatas"]));
  });
});
