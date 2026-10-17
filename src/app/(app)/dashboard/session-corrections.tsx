"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSessionAction, trimSessionAction } from "@/app/actions/timer";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, Card, Input } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";

export type CorrectableSession = {
  id: string;
  startedAt: string;
  plannedSeconds: number;
  activeSeconds: number;
  xpAwarded: number;
  correction: "trimmed" | "deleted" | null;
  originalActiveSeconds: number | null;
  topicName: string;
  categoryName: string;
  categoryColor: string;
};

/**
 * Correção das sessões da semana: reduzir o tempo (esqueceu o cronômetro) ou excluir.
 * Só para menos — nunca acrescenta horas.
 */
export function SessionCorrections({ sessions }: { sessions: CorrectableSession[] }) {
  const { t, locale } = useI18n();
  const C = t.corrections;
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const dt = new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  const trim = async (s: CorrectableSession) => {
    const m = Number(minutes);
    if (!Number.isInteger(m) || m < 1 || m * 60 >= s.activeSeconds) {
      setMessage({ ok: false, text: C.onlyLess });
      return;
    }
    const removed = s.activeSeconds - m * 60;
    const xpLoss = m * 60 < s.plannedSeconds ? s.xpAwarded : 0;
    // A confirmação fica fora da transição: dentro dela o React só mostraria o popup no fim.
    const ok = await confirm({
      title: C.trimTitle,
      message: C.trimConfirm(formatDuration(s.activeSeconds), formatDuration(m * 60), formatDuration(removed), xpLoss),
      confirmLabel: C.trim,
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await trimSessionAction(s.id, m);
      setMessage(res.ok ? { ok: true, text: C.trimmed(formatDuration(removed)) } : { ok: false, text: res.error });
      if (res.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  };

  const remove = async (s: CorrectableSession) => {
    const ok = await confirm({
      title: C.deleteTitle,
      message: C.deleteConfirm(formatDuration(s.activeSeconds), s.xpAwarded),
      confirmLabel: C.delete,
      danger: true,
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteSessionAction(s.id);
      setMessage(res.ok ? { ok: true, text: C.deleted } : { ok: false, text: res.error });
      if (res.ok) {
        setOpen(null);
        router.refresh();
      }
    });
  };

  return (
    <Card className="p-0">
      <div className="border-b border-border px-4 py-3">
        <h2 className="font-semibold">{C.title}</h2>
        <p className="text-xs text-text-2">{C.hint}</p>
      </div>
      {message && (
        <div className="px-4 pt-3">
          <Alert tone={message.ok ? "good" : "danger"}>{message.text}</Alert>
        </div>
      )}
      {sessions.length === 0 ? (
        <p className="px-4 py-3 text-sm text-text-2">{C.empty}</p>
      ) : (
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.id} className="px-4 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.categoryColor }} />
                <span className="min-w-0 flex-1">
                  {s.topicName}
                  <span className="block text-xs text-text-3">
                    {s.categoryName} · {dt.format(new Date(s.startedAt))}
                    {s.correction === "trimmed" && ` · ${C.was(formatDuration(s.originalActiveSeconds ?? 0))}`}
                  </span>
                </span>
                <span className="tabular">{formatDuration(s.activeSeconds)}</span>
                <span className={s.xpAwarded ? "w-14 text-right text-good tabular" : "w-14 text-right text-text-3 tabular"}>
                  {s.xpAwarded ? `+${s.xpAwarded}` : "0"} XP
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  aria-expanded={open === s.id}
                  onClick={() => {
                    setMessage(null);
                    setOpen(open === s.id ? null : s.id);
                    setMinutes("");
                  }}
                >
                  {C.fix}
                </Button>
              </div>
              {open === s.id && (
                <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg bg-surface-2 p-3">
                  {s.correction !== "trimmed" && s.activeSeconds >= 120 && (
                    <form
                      className="flex flex-wrap items-end gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        trim(s);
                      }}
                    >
                      <label className="text-xs text-text-2">
                        {C.realMinutes(Math.floor(s.activeSeconds / 60))}
                        <Input
                          type="number"
                          min={1}
                          max={Math.ceil(s.activeSeconds / 60) - 1}
                          inputMode="numeric"
                          value={minutes}
                          onChange={(e) => setMinutes(e.target.value)}
                          className="mt-1 w-28"
                        />
                      </label>
                      <Button type="submit" size="sm" variant="secondary" disabled={pending || !minutes}>
                        {C.trim}
                      </Button>
                    </form>
                  )}
                  <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => remove(s)}>
                    {C.delete}
                  </Button>
                  <p className="w-full text-xs text-text-3">{C.rules}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
