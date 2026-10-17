"use client";

import { useState, useTransition } from "react";
import { sendFriendRequestAction } from "@/app/actions/friends";
import { useI18n } from "@/i18n/client";

/**
 * Nome no ranking: ao tocar, mostra o cartão público da pessoa (título, instituição, horas,
 * objetivos) e a opção de adicionar como amigo. Mensagens e feed chegam com a rede social.
 */
export function PersonCard({
  name,
  publicCode,
  isViewer,
  details,
}: {
  name: string;
  publicCode: string | null;
  isViewer: boolean;
  details: { title: string; institution: string; hours: string; goals: string[] };
}) {
  const { t } = useI18n();
  const F = t.friends;
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  return (
    <span className="relative inline-block">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="font-medium hover:underline">
        {name}
      </button>
      {open && (
        <span
          role="dialog"
          aria-label={name}
          className="absolute left-0 top-full z-20 mt-1 block w-64 space-y-1 rounded-xl border border-border bg-surface p-3 text-left text-xs shadow-lg"
        >
          <span className="block text-sm font-semibold">{name}</span>
          <span className="block text-link">{details.title}</span>
          <span className="block text-text-2">{details.institution}</span>
          <span className="block text-text-2">{F.hoursInPeriod(details.hours)}</span>
          {details.goals.length > 0 && <span className="block text-text-3">{details.goals.join(" · ")}</span>}
          {publicCode && <span className="block text-text-3">{publicCode}</span>}
          {!isViewer && publicCode && (
            <button
              type="button"
              disabled={pending || Boolean(status)}
              onClick={() =>
                start(async () => {
                  const res = await sendFriendRequestAction(publicCode);
                  setStatus(res.ok ? (res.data.status === "accepted" ? F.nowFriends : F.sent) : res.error);
                })
              }
              className="mt-1 w-full rounded-lg bg-accent px-3 py-1.5 font-medium text-accent-ink disabled:opacity-60"
            >
              {F.add}
            </button>
          )}
          {status && <span className="block text-text-2">{status}</span>}
          <span className="block text-[11px] text-text-3">{F.soon}</span>
        </span>
      )}
    </span>
  );
}
