"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import { setActiveContextAction } from "@/app/actions/context";
import { cx } from "@/components/ui";
import { CONTEXTS, type AppContext } from "@/domain/contexts";
import { useI18n } from "@/i18n/client";

const ICONS: Record<AppContext, string> = {
  academic: "M3 9l9-5 9 5-9 5-9-5Zm4 2.5V16c0 1.5 2.5 3 5 3s5-1.5 5-3v-4.5",
  personal: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21a8 8 0 0 1 16 0",
  professional: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
};

export function ContextTabs({
  current,
  access,
  compact,
}: {
  current: AppContext;
  access: Record<AppContext, boolean>;
  compact: boolean;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [shown, setShown] = useOptimistic(current);
  return (
    <div
      role="radiogroup"
      aria-label={t.contexts.label}
      className={cx("grid grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1", pending && "opacity-80")}
    >
      {CONTEXTS.map((c) => {
        const on = c === shown;
        const locked = !access[c];
        return (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={locked}
            title={locked ? t.contexts.locked[c] : t.contexts.names[c]}
            onClick={() =>
              !on &&
              !locked &&
              start(async () => {
                setShown(c);
                await setActiveContextAction(c);
                router.refresh();
              })
            }
            className={cx(
              "flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 font-medium",
              compact ? "text-[10px]" : "text-[11px]",
              on ? "bg-accent text-accent-ink" : locked ? "cursor-not-allowed text-text-3 opacity-60" : "text-text-2 hover:text-text",
            )}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS[c]} />
            </svg>
            {t.contexts.short[c]}
          </button>
        );
      })}
    </div>
  );
}
