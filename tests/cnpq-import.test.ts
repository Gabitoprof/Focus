import { describe, expect, it } from "vitest";
import { levelOf, parseCnpqDoc, titleCasePt } from "@/server/import/cnpq-table";

/** Trecho no formato do .doc oficial: código, marca de célula (\x07), nome. */
const sample = Buffer.from(
  "lixo\x00\x00\r10000003\x07\rCIÊNCIAS EXATAS E DA TERRA\x07\x07ÁREA DE AVALIAÇÃO: MATEMÁTICA\r\x07\r" +
    "10100008\x07\rMATEMÁTICA\x07\x0710101004\x07ALGEBRA\x07\x0710101012\x07CONJUNTOS\x07\x07" +
    "40000001\x07\rCIÊNCIAS DA SAÚDE\x07\x0740100006\x07\rMEDICINA\x07\x0740101002\x07CLÍNICA MÉDICA\x07\x07" +
    "40101010\x07ANGIOLOGIA\x07\x0710101004\x07ALGEBRA\x07\x07",
  "latin1",
);

describe("Tabela de Áreas do Conhecimento (CNPq)", () => {
  it("identifica o nível pelo código", () => {
    expect(levelOf("10000003")).toBe("grande_area");
    expect(levelOf("10100008")).toBe("area");
    expect(levelOf("10101004")).toBe("subarea");
    expect(levelOf("40101010")).toBe("especialidade");
  });

  it("nomes em maiúsculas viram título em português", () => {
    expect(titleCasePt("ANÁLISE DE ALGORITMOS E COMPLEXIDADE DE COMPUTAÇÃO")).toBe("Análise de Algoritmos e Complexidade de Computação");
    expect(titleCasePt("HISTÓRIA DO BRASIL II")).toBe("História do Brasil II");
    expect(titleCasePt("SAÚDE MATERNO-INFANTIL")).toBe("Saúde Materno-Infantil");
  });

  it("lê área-mãe e grande área, ignora o resto e não repete códigos", () => {
    const items = parseCnpqDoc(sample);
    expect(items.map((i) => [i.code, i.name, i.level, i.areaId, i.parentArea])).toEqual([
      ["10000003", "Ciências Exatas e da Terra", "grande_area", "exatas", null],
      ["10100008", "Matemática", "area", "exatas", null],
      ["10101004", "Algebra", "subarea", "exatas", "Matemática"],
      ["10101012", "Conjuntos", "especialidade", "exatas", "Matemática"],
      ["40000001", "Ciências da Saúde", "grande_area", "saude", null],
      ["40100006", "Medicina", "area", "saude", null],
      ["40101002", "Clínica Médica", "subarea", "saude", "Medicina"],
      ["40101010", "Angiologia", "especialidade", "saude", "Medicina"],
    ]);
  });
});
