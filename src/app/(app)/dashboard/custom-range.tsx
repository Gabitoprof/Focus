"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function CustomRange({ active, from, to }: { active: boolean; from?: string; to?: string }) {
  const router = useRouter();
  const D = useI18n().t.dashboard;
  const [open, setOpen] = useState(active);
  const [de, setDe] = useState(from ?? "");
  const [ate, setAte] = useState(to ?? "");

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx("h-9 rounded-lg border px-3 text-sm", active ? "border-accent bg-accent-soft text-link" : "border-border bg-surface hover:bg-surface-2")}
      >
        {D.ranges.custom}
      </button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (de && ate) router.push(`/dashboard?periodo=custom&de=${de}&ate=${ate}`);
      }}
    >
      <label className="sr-only" htmlFor="de">{D.from}</label>
      <input id="de" type="date" value={de} onChange={(e) => setDe(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" required />
      <span className="text-sm text-text-2">{D.until}</span>
      <label className="sr-only" htmlFor="ate">{D.to}</label>
      <input id="ate" type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="h-9 rounded-lg border border-border bg-surface px-2 text-sm" required />
      <Button size="sm" type="submit">{D.apply}</Button>
    </form>
  );
}
