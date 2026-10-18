"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setShowcaseAction } from "@/app/actions/achievements";
import { SHOWCASE_MAX } from "@/domain/achievements";
import { cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/**
 * Coloca/tira uma conquista da vitrine do ranking. `variant="remove"` é o ✕ da própria vitrine.
 */
export function ShowcaseToggle({ id, name, showcase, variant = "toggle" }: { id: string; name: string; showcase: string[]; variant?: "toggle" | "remove" }) {
  const { t } = useI18n();
  const S = t.achievements.showcase;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const selected = showcase.includes(id);
  const full = !selected && showcase.length >= SHOWCASE_MAX;
  const toggle = () =>
    start(async () => {
      const next = selected ? showcase.filter((x) => x !== id) : [...showcase, id];
      const res = await setShowcaseAction(next);
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        router.refresh();
      }
    });

  if (variant === "remove") {
    return (
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={S.remove(name)}
        title={S.remove(name)}
        className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-[11px] text-text-2 hover:text-danger"
      >
        ✕
      </button>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending || full}
        aria-pressed={selected}
        title={full ? S.full(SHOWCASE_MAX) : undefined}
        className={cx(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
          selected ? "border-accent bg-accent text-accent-ink" : "border-border text-text-2 hover:border-accent hover:text-link",
          (pending || full) && "opacity-50",
        )}
      >
        <span aria-hidden>{selected ? "★" : "☆"}</span>
        {selected ? S.inShowcase : S.add}
      </button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </span>
  );
}
