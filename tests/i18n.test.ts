import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, matchAcceptLanguage } from "@/i18n/config";
import { hasTranslation, translateMessage } from "@/i18n/errors";
import { getDict } from "@/i18n";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith(".ts") ? [p] : [];
  });
}

/** Mensagens lançadas ao usuário pelo servidor (AppError, RuleViolation, Error do domínio). */
function serverMessages(): string[] {
  const out = new Set<string>();
  for (const file of [...walk("src/server"), ...walk("src/domain")]) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/new (?:AppError|RuleViolation|Error)\(\s*("([^"]+)"|`([^`]+)`)/g)) {
      const text = m[2] ?? m[3];
      // Erros internos de configuração/infra não chegam ao usuário.
      if (/IDENTITY_HMAC_SECRET|Falha ao enviar e-mail|Banco local|Arquivo do|Formato não|Não foi possível gerar|sem áudio|useConfirm/.test(text)) continue;
      out.add(text.replace(/\$\{[^}]+\}/g, "{x}"));
    }
  }
  return [...out];
}

describe("Idiomas", () => {
  it("detecta o idioma do navegador", () => {
    expect(matchAcceptLanguage("en-US,en;q=0.9")).toBe("en");
    expect(matchAcceptLanguage("es-AR,es;q=0.9,en;q=0.5")).toBe("es");
    expect(matchAcceptLanguage("pt-PT,pt;q=0.9")).toBe("pt-BR");
    expect(matchAcceptLanguage("fr-FR,de;q=0.8,en;q=0.3")).toBe("en");
    expect(matchAcceptLanguage("ja-JP")).toBe("pt-BR");
    expect(matchAcceptLanguage(null)).toBe("pt-BR");
  });

  it("todos os idiomas têm as mesmas chaves do dicionário de referência", () => {
    const keys = (o: unknown, prefix = ""): string[] =>
      o && typeof o === "object" && !Array.isArray(o)
        ? Object.entries(o).flatMap(([k, v]) => keys(v, `${prefix}${k}.`))
        : [prefix];
    const ref = keys(getDict("pt-BR")).sort();
    for (const l of LOCALES) expect(keys(getDict(l)).sort()).toEqual(ref);
  });

  it("traduz mensagens fixas e com valores variáveis", () => {
    expect(translateMessage("Tema não encontrado.", "en")).toBe("Topic not found.");
    expect(translateMessage("Tema não encontrado.", "pt-BR")).toBe("Tema não encontrado.");
    expect(translateMessage("A duração deve estar entre 20 e 60 minutos.", "es")).toBe(
      "La duración debe estar entre 20 y 60 minutos.",
    );
    expect(translateMessage("Você poderá trocar de instituição a partir de 10/06/2026.", "en")).toBe(
      "You can switch institutions from 10/06/2026.",
    );
    // Mensagem desconhecida: devolve o original em vez de quebrar.
    expect(translateMessage("Mensagem nova", "en")).toBe("Mensagem nova");
  });

  it("toda mensagem de erro do servidor tem tradução em inglês e espanhol", () => {
    const sample = (msg: string) => msg.replace(/\{x\}/g, "7");
    const missing = serverMessages().filter((m) => !hasTranslation(sample(m)));
    expect(missing).toEqual([]);
  });
});
