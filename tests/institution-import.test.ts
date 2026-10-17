import { describe, expect, it } from "vitest";
import { parseCsv, parseEmecHtml, parseInepCsv, parseInstitutionFile } from "@/server/import/institution-files";
import { schoolSearchExtras } from "@/server/services/institutions";

// Amostras no formato real dos arquivos oficiais (dados de exemplo, não registros reais).
const EMEC = `<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<div>Minist&eacute;rio da Educa&ccedil;&atilde;o</div>
<table><tr><th>Código Mantenedora</th><th>Razão Social</th><th>CNPJ</th><th>Código IES</th><th>Instituição(IES)</th><th>Sigla</th><th>e-Mail</th><th>Município</th><th>UF</th><th>Situação da IES</th></tr>
<tr><td>1</td><td>MANTENEDORA X</td><td>00.000.000/0001-00</td><td>9001</td><td>UNIVERSIDADE EXEMPLO DE MINAS (UEM)</td><td>UEM</td><td>contato@exemplo.br</td><td>Belo Horizonte</td><td>MG</td><td>Ativa</td></tr>
<tr><td>2</td><td>MANTENEDORA Y</td><td>00.000.000/0002-00</td><td>9002</td><td>FACULDADE S&Atilde;O TESTE</td><td>-</td><td></td><td></td><td></td><td>Extinta</td></tr>
</table>`;

const INEP = `﻿Restrição de Atendimento,Escola,Código INEP,UF,Município,Etapas e Modalidade de Ensino Oferecidas,Telefone
ESCOLA EM FUNCIONAMENTO E SEM RESTRIÇÃO DE ATENDIMENTO,"COLEGIO EXEMPLO, UNIDADE 1",99000001,MG,Contagem,"Ensino Fundamental, Ensino Médio",(31) 0000-0000
ESCOLA EM FUNCIONAMENTO E SEM RESTRIÇÃO DE ATENDIMENTO,EMEI PEQUENOS,99000002,MG,Contagem,Educação Infantil,
ESCOLA PARALISADA,EE ANTIGA,99000003,BA,Salvador,Educação de Jovens Adultos,
`;

describe("Importação de instituições", () => {
  it("e-MEC: lê a tabela HTML, remove a sigla repetida e descarta contatos", () => {
    const rows = parseEmecHtml(EMEC);
    expect(rows).toEqual([
      { kind: "higher", source: "emec", sourceCode: "9001", name: "UNIVERSIDADE EXEMPLO DE MINAS", acronym: "UEM", city: "Belo Horizonte", uf: "MG", isActive: true },
      { kind: "higher", source: "emec", sourceCode: "9002", name: "FACULDADE SÃO TESTE", acronym: null, city: null, uf: null, isActive: false },
    ]);
    expect(JSON.stringify(rows)).not.toContain("contato@exemplo.br");
    expect(JSON.stringify(rows)).not.toContain("00.000.000");
  });

  it("INEP: mantém só Ensino Médio, técnico ou EJA; paralisadas ficam inativas", () => {
    const rows = parseInepCsv(INEP);
    expect(rows.map((r) => [r.sourceCode, r.name, r.isActive])).toEqual([
      ["99000001", "COLEGIO EXEMPLO, UNIDADE 1", true],
      ["99000003", "EE ANTIGA", false],
    ]);
    expect(parseInepCsv(INEP, { allSchools: true })).toHaveLength(3);
  });

  it("detecta o formato pelo conteúdo", () => {
    expect(parseInstitutionFile(EMEC)[0].source).toBe("emec");
    expect(parseInstitutionFile(INEP)[0].source).toBe("inep");
    expect(() => parseInstitutionFile("a,b\n1,2")).toThrow(/Formato não reconhecido/);
  });

  it("expande abreviações do INEP para a busca", () => {
    expect(schoolSearchExtras("ee professor joao")).toContain("escola estadual");
    expect(schoolSearchExtras("emef vila nova")).toContain("escola municipal");
    expect(schoolSearchExtras("pedro ii c e def m")).toContain("colegio estadual");
    expect(schoolSearchExtras("colegio bandeirantes")).toBe("");
    // "em" no meio do nome é preposição, não "escola municipal".
    expect(schoolSearchExtras("centro de estudos aperf em odontologia")).toBe("");
    expect(schoolSearchExtras("belo horizonte c eef m profis")).toContain("colegio estadual");
  });

  it("CSV com vírgulas e aspas dentro do campo", () => {
    expect(parseCsv('a,b\n"x, ""y""",2\n')).toEqual([["a", "b"], ['x, "y"', "2"]]);
  });
});
