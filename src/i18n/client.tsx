"use client";

import { createContext, useContext, useEffect } from "react";
import { DEFAULT_LOCALE, type Locale } from "./config";
import { getDict } from "./index";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/** Disponibiliza o idioma para os componentes do navegador e ajusta o atributo lang da página. */
export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const locale = useContext(I18nContext);
  return { locale, t: getDict(locale) };
}
