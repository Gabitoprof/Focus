"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setLocaleAction } from "@/app/actions/locale";
import { LOCALES, LOCALE_NAMES, type Locale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { cx } from "./ui";

/** Seletor de idioma (rodapé público, painel lateral e perfil). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <label className={cx("inline-flex items-center gap-2 text-sm text-text-2", className)}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8}>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
      </svg>
      <span className="sr-only">{t.language.label}</span>
      <select
        value={locale}
        disabled={pending}
        aria-label={t.language.label}
        onChange={(e) =>
          start(async () => {
            await setLocaleAction(e.target.value as Locale);
            router.refresh();
          })
        }
        className="h-8 rounded-lg border border-border bg-surface px-2 text-sm text-text"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
