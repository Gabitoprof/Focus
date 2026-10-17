"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import type { Dict } from "@/i18n";

type NavKey = keyof Pick<Dict["nav"], "study" | "dashboard" | "ranking" | "categories" | "history" | "org" | "achievements" | "profile" | "master">;

const items: { href: string; key: NavKey; icon: string }[] = [
  { href: "/estudar", key: "study", icon: "M12 8v4l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" },
  { href: "/dashboard", key: "dashboard", icon: "M4 19V10m6 9V5m6 14v-7m4 7H2" },
  { href: "/registro", key: "categories", icon: "M4 6h16M4 12h16M4 18h10" },
  { href: "/historico", key: "history", icon: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2" },
  { href: "/ranking", key: "ranking", icon: "M8 21h8m-4-4v4M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4a3 3 0 0 0 3 3m10-3h3a3 3 0 0 1-3 3" },
  { href: "/organizacao", key: "org", icon: "M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01" },
  { href: "/conquistas", key: "achievements", icon: "M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Zm-3.5 4.5L9 14m6.5 5.5L15 14M8.5 19.5 12 18l3.5 1.5" },
  { href: "/perfil", key: "profile", icon: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0" },
];

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Só para o dono da plataforma: atalho para o console master. */
const MASTER_ITEM: { href: string; key: NavKey; icon: string } = {
  href: "/master",
  key: "master",
  icon: "M12 3l7 4v5c0 4.5-3 8-7 9-4-1-7-4.5-7-9V7l7-4Zm0 6v4m0 3h.01",
};

export function AppNav({ showMaster = false }: { showMaster?: boolean }) {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t.nav.main} className="flex flex-col gap-1">
      {(showMaster ? [...items, MASTER_ITEM] : items).map((it) => {
        const active = path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
              active ? "bg-accent-soft text-link" : "text-text-2 hover:bg-surface-2 hover:text-text",
            )}
          >
            <Icon d={it.icon} />
            {t.nav[it.key]}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav aria-label={t.nav.main} className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-8 border-t border-border bg-surface md:hidden">
      {items.map((it) => {
        const active = path.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx("flex flex-col items-center gap-0.5 py-2 text-[11px]", active ? "text-link" : "text-text-2")}
          >
            <Icon d={it.icon} />
            {t.nav[it.key]}
          </Link>
        );
      })}
    </nav>
  );
}
