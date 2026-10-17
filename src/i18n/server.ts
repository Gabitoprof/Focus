import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, matchAcceptLanguage, type Locale } from "./config";
import { getDict } from "./index";

/** Idioma da requisição: escolha salva (cookie) → idioma do navegador → português. */
export async function getLocale(): Promise<Locale> {
  try {
    const saved = (await cookies()).get(LOCALE_COOKIE)?.value;
    if (isLocale(saved)) return saved;
    return matchAcceptLanguage((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LOCALE; // fora de uma requisição (scripts, testes)
  }
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: getDict(locale) };
}
