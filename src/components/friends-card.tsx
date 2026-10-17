"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { removeFriendAction, respondFriendRequestAction, sendFriendRequestAction } from "@/app/actions/friends";
import type { ActionResult } from "@/app/actions/result";
import { useConfirm } from "./confirm";
import { Alert, Button, Card, Input } from "./ui";
import { useI18n } from "@/i18n/client";

type Person = { displayName: string; publicCode: string };

/** Amigos: adicionar pelo código público, responder pedidos e desfazer amizades. */
export function FriendsCard({ friends, incoming, outgoing }: { friends: Person[]; incoming: Person[]; outgoing: Person[] }) {
  const { t } = useI18n();
  const F = t.friends;
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const run = <T,>(fn: () => Promise<ActionResult<T>>, ok: (d: T) => string) =>
    start(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: ok(res.data) } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });

  return (
    <Card className="space-y-4 p-5">
      <div>
        <h2 className="font-semibold">{F.title}</h2>
        <p className="text-xs text-text-2">{F.hint}</p>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!code.trim()) return;
          run(() => sendFriendRequestAction(code), (d) => {
            setCode("");
            return d.status === "accepted" ? F.nowFriends : F.sent;
          });
        }}
      >
        <Input aria-label={F.codeLabel} placeholder="FCS-XXXXXXXX" value={code} maxLength={20} onChange={(e) => setCode(e.target.value)} />
        <Button type="submit" variant="secondary" disabled={pending || !code.trim()} className="shrink-0">
          {F.add}
        </Button>
      </form>
      {message && <Alert tone={message.ok ? "good" : "danger"}>{message.text}</Alert>}

      {incoming.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">{F.incoming}</h3>
          {incoming.map((p) => (
            <div key={p.publicCode} className="flex items-center gap-2 rounded-lg bg-accent-soft/50 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                {p.displayName} <span className="text-text-3">· {p.publicCode}</span>
              </span>
              <Button size="sm" disabled={pending} onClick={() => run(() => respondFriendRequestAction(p.publicCode, true), () => F.nowFriends)}>
                {t.projects.accept}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => respondFriendRequestAction(p.publicCode, false), () => F.declined)}>
                {t.projects.decline}
              </Button>
            </div>
          ))}
        </section>
      )}

      <section className="space-y-1">
        <h3 className="text-sm font-medium">{F.list(friends.length)}</h3>
        {friends.length === 0 && <p className="text-sm text-text-3">{F.empty}</p>}
        {friends.map((p) => (
          <div key={p.publicCode} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1">
              {p.displayName} <span className="text-text-3">· {p.publicCode}</span>
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger"
              disabled={pending}
              onClick={async () => {
                const ok = await confirm({
                  title: F.removeTitle(p.displayName),
                  message: F.removeText,
                  confirmLabel: F.remove,
                  cancelLabel: t.common.cancel,
                  danger: true,
                });
                if (ok) run(() => removeFriendAction(p.publicCode), () => F.removed);
              }}
            >
              {F.remove}
            </Button>
          </div>
        ))}
        {outgoing.map((p) => (
          <div key={p.publicCode} className="flex items-center gap-2 text-sm text-text-2">
            <span className="min-w-0 flex-1">
              {p.displayName} <span className="text-text-3">· {F.waiting}</span>
            </span>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => removeFriendAction(p.publicCode), () => F.cancelled)}>
              {t.common.cancel}
            </Button>
          </div>
        ))}
      </section>
    </Card>
  );
}
