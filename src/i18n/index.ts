import type { Locale } from "./config";
import { en } from "./dictionaries/en";
import { es } from "./dictionaries/es";
import { ptBR, type Dict } from "./dictionaries/pt-BR";

export type { Dict };

const DICTS: Record<Locale, Dict> = { "pt-BR": ptBR, en, es };

export function getDict(locale: Locale): Dict {
  return DICTS[locale];
}

/** Locale do Intl para datas e números. */
export const INTL_LOCALE: Record<Locale, string> = { "pt-BR": "pt-BR", en: "en-US", es: "es" };
