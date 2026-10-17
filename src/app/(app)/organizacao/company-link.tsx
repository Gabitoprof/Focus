"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { requestCompanyLinkAction, searchCompaniesAction } from "@/app/actions/membership";
import { Alert, Button, Card, Input, Label, cx } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/**
 * Funcionário pede vínculo com uma empresa verificada: escolhe a empresa e informa a matrícula
 * (ou registro). Aceite automático se a empresa enviou a lista; senão, fica pendente.
 */
export function CompanyLink({ pending: pendingLinks }: { pending: { id: string; alias: string }[] }) {
  const { t } = useI18n();
  const C = t.org.companyLink;
  const router = useRouter();
  const [busy, start] = useTransition();
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; alias: string; legalName: string }[]>([]);
  const [chosen, setChosen] = useState<{ id: string; alias: string } | null>(null);
  const [registration, setRegistration] = useState("");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <Card className="space-y-3 p-4">
      <div>
        <h2 className="font-semibold">{C.title}</h2>
        <p className="text-xs text-text-2">{C.hint}</p>
      </div>
      {pendingLinks.length > 0 && (
        <ul className="space-y-1">
          {pendingLinks.map((p) => (
            <li key={p.id} className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
              {C.waiting(p.alias)}
            </li>
          ))}
        </ul>
      )}
      {message && <Alert tone={message.ok ? "good" : "danger"}>{message.text}</Alert>}
      {!chosen ? (
        <>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await searchCompaniesAction(query);
                if (res.ok) setFound(res.data);
                else setMessage({ ok: false, text: res.error });
              });
            }}
          >
            <Input aria-label={C.search} placeholder={C.search} value={query} onChange={(e) => setQuery(e.target.value)} />
            <Button type="submit" variant="secondary" disabled={busy || query.trim().length < 2} className="shrink-0">
              {t.org.admin.search}
            </Button>
          </form>
          <ul className="space-y-1">
            {found.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setChosen({ id: c.id, alias: c.alias })}
                  className={cx("w-full rounded-lg border border-border px-3 py-2 text-left text-sm hover:border-accent")}
                >
                  <span className="font-medium">{c.alias}</span> <span className="text-text-3">· {c.legalName}</span>
                </button>
              </li>
            ))}
            {found.length === 0 && query.trim().length >= 2 && !busy && <li className="text-xs text-text-3">{C.none}</li>}
          </ul>
        </>
      ) : (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await requestCompanyLinkAction(chosen.id, registration);
              if (res.ok) {
                setMessage({ ok: true, text: res.data.status === "active" ? C.accepted(chosen.alias) : C.sent(chosen.alias) });
                setChosen(null);
                setRegistration("");
                router.refresh();
              } else setMessage({ ok: false, text: res.error });
            });
          }}
        >
          <p className="rounded-lg border border-accent bg-accent-soft p-2 text-sm">{chosen.alias}</p>
          <Label htmlFor="reg">{C.registration}</Label>
          <Input id="reg" value={registration} maxLength={40} onChange={(e) => setRegistration(e.target.value)} />
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || !registration.trim()}>
              {C.send}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setChosen(null)}>
              {t.common.cancel}
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
