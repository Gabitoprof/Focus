import { z } from "zod";
import { translateMessage } from "@/i18n/errors";
import { getLocale } from "@/i18n/server";
import { AppError } from "@/server/services/common";

export type ActionResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Converte erros em mensagens seguras, no idioma do usuário; erros inesperados não vazam
 * detalhes. As regras de negócio lançam mensagens em português; a tradução acontece aqui.
 */
export async function toResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    // redirect() do Next lança um erro especial que precisa seguir adiante.
    if (e && typeof e === "object" && "digest" in e) throw e;
    const locale = await getLocale();
    if (e instanceof AppError) return { ok: false, error: translateMessage(e.message, locale) };
    if (e instanceof z.ZodError) {
      return { ok: false, error: translateMessage(e.issues[0]?.message ?? "Dados inválidos.", locale) };
    }
    console.error(e);
    return { ok: false, error: translateMessage("Algo deu errado. Tente novamente.", locale) };
  }
}
