"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { searchInstitutionsAction } from "@/app/actions/identity";
import { addToRosterAction, linkOrgToInstitutionAction, reviewMemberRequestsAction } from "@/app/actions/membership";
import { updateOrgPublicPageAction } from "@/app/actions/organizations";
import type { ActionResult } from "@/app/actions/result";
import { Alert, Button, Card, Input, cx } from "@/components/ui";
import type { OrganizationKind } from "@/domain/organizations";
import { extractEnrollments } from "@/domain/roster";
import { useI18n } from "@/i18n/client";

type Request = { userId: string; displayName: string; publicCode: string | null; enrollment: string | null; requestedAt: string | null; cpfVerified: boolean };

/**
 * Administração da organização (dono e gestores): pedidos de vínculo, lista de matrículas para
 * o aceite automático e, para instituições de ensino, o vínculo com o registro do e-MEC/INEP.
 */
export function OrgAdminPanel({
  orgId,
  kind,
  isOwner,
  institution,
  page,
  requests,
}: {
  page: { about: string | null; whyStudy: string | null; website: string | null };
  orgId: string;
  kind: OrganizationKind;
  isOwner: boolean;
  institution: { id: string; name: string; acronym: string | null } | null;
  requests: Request[];
}) {
  const { t, locale } = useI18n();
  const A = t.org.admin;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roster, setRoster] = useState("");
  const [fileNote, setFileNote] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; acronym: string | null; city: string | null; uf: string | null }[]>([]);
  const needsLink = kind === "institution" && !institution;
  const [pub, setPub] = useState({ about: page.about ?? "", whyStudy: page.whyStudy ?? "", website: page.website ?? "" });

  const run = <T,>(fn: () => Promise<ActionResult<T>>, ok: (data: T) => string) =>
    start(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: ok(res.data) } : { ok: false, text: res.error });
      if (res.ok) {
        setSelected(new Set());
        router.refresh();
      }
    });
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" });

  return (
    <div className="space-y-5">
      {message && <Alert tone={message.ok ? "good" : "danger"}>{message.text}</Alert>}

      {kind === "institution" && (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">{A.linkTitle}</h2>
          {institution ? (
            <p className="text-sm">
              {institution.acronym ? `${institution.acronym} — ` : ""}
              {institution.name}
            </p>
          ) : (
            <p className="text-sm text-warn">{A.linkMissing}</p>
          )}
          {isOwner && !institution && (
            <>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  start(async () => {
                    const res = await searchInstitutionsAction({ query });
                    if (res.ok) setFound(res.data);
                    else setMessage({ ok: false, text: res.error });
                  });
                }}
              >
                <Input aria-label={A.linkSearch} placeholder={A.linkSearch} value={query} onChange={(e) => setQuery(e.target.value)} />
                <Button type="submit" variant="secondary" disabled={pending || query.trim().length < 2} className="shrink-0">
                  {A.search}
                </Button>
              </form>
              <ul className="space-y-1">
                {found.map((i) => (
                  <li key={i.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1">
                      {i.acronym ? `${i.acronym} — ` : ""}
                      {i.name} <span className="text-text-3">· {[i.city, i.uf].filter(Boolean).join("/")}</span>
                    </span>
                    <Button size="sm" disabled={pending} onClick={() => run(() => linkOrgToInstitutionAction(orgId, i.id), () => A.linked)}>
                      {A.link}
                    </Button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <p className="text-xs text-text-3">{A.linkHint}</p>
        </Card>
      )}

      <Card className="p-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
          <h2 className="mr-auto font-semibold">
            {A.requestsTitle} {requests.length > 0 && <span className="text-text-2">({requests.length})</span>}
          </h2>
          {requests.length > 0 && (
            <>
              <Button size="sm" variant="ghost" onClick={() => setSelected(selected.size === requests.length ? new Set() : new Set(requests.map((r) => r.userId)))}>
                {selected.size === requests.length ? A.clearAll : A.selectAll}
              </Button>
              <Button
                size="sm"
                disabled={pending || selected.size === 0}
                onClick={() => run(() => reviewMemberRequestsAction(orgId, [...selected], true), (n) => A.accepted(n))}
              >
                {A.accept(selected.size)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending || selected.size === 0}
                onClick={() => run(() => reviewMemberRequestsAction(orgId, [...selected], false), (n) => A.rejected(n))}
              >
                {A.reject}
              </Button>
            </>
          )}
        </div>
        {needsLink ? (
          <p className="px-4 py-3 text-sm text-text-2">{A.requestsNeedLink}</p>
        ) : requests.length === 0 ? (
          <p className="px-4 py-3 text-sm text-text-2">{A.noRequests}</p>
        ) : (
          <ul className="divide-y divide-border">
            {requests.map((r) => (
              <li key={r.userId}>
                <label className={cx("flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm", selected.has(r.userId) && "bg-accent-soft/50")}>
                  <input type="checkbox" checked={selected.has(r.userId)} onChange={() => toggle(r.userId)} />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{r.displayName}</span>
                    <span className="text-text-3"> · {r.publicCode}</span>
                    <span className="block text-xs text-text-2">
                      {A.enrollment}: <b>{r.enrollment ?? "—"}</b> · {r.cpfVerified ? A.cpfOk : A.cpfMissing}
                    </span>
                  </span>
                  {r.requestedAt && <span className="text-xs text-text-3">{dateFmt.format(new Date(r.requestedAt))}</span>}
                </label>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {kind === "institution" && (
        <Card className="space-y-2 p-4">
          <h2 className="font-semibold">{A.pageTitle}</h2>
          <p className="text-xs text-text-2">{A.pageHint}</p>
          <label className="block text-sm">
            <span className="mb-1 block text-text-2">{A.pageAbout}</span>
            <textarea
              value={pub.about}
              maxLength={1200}
              rows={3}
              onChange={(e) => setPub((s) => ({ ...s, about: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-text-2">{A.pageWhy}</span>
            <textarea
              value={pub.whyStudy}
              maxLength={1200}
              rows={3}
              onChange={(e) => setPub((s) => ({ ...s, whyStudy: e.target.value }))}
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-text-2">{A.pageWebsite}</span>
            <Input value={pub.website} maxLength={200} placeholder="https://" onChange={(e) => setPub((s) => ({ ...s, website: e.target.value }))} />
          </label>
          <Button disabled={pending} onClick={() => run(() => updateOrgPublicPageAction(orgId, pub), () => A.pageSaved)}>
            {t.common.save}
          </Button>
        </Card>
      )}

      <Card className="space-y-2 p-4">
        <h2 className="font-semibold">{A.rosterTitle}</h2>
        <p className="text-xs text-text-2">{A.rosterHint(kind)}</p>
        <div className="flex flex-wrap items-center gap-2">
          <label
            className={cx(
              "inline-flex h-9 cursor-pointer items-center rounded-lg border border-border px-3 text-sm hover:border-accent",
              needsLink && "pointer-events-none opacity-50",
            )}
          >
            {A.rosterFile}
            <input
              type="file"
              accept=".csv,.txt,text/csv,text/plain"
              className="sr-only"
              disabled={needsLink}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                if (file.size > 3_000_000) {
                  setFileNote(A.rosterFileTooBig);
                  return;
                }
                const found = extractEnrollments(await file.text());
                const merged = [...new Set([...roster.split(/[\r\n,;]+/).map((v) => v.trim()).filter(Boolean), ...found])];
                setRoster(merged.join("\n"));
                setFileNote(found.length ? A.rosterFileLoaded(found.length, file.name) : A.rosterFileEmpty(file.name));
              }}
            />
          </label>
          <span className="text-xs text-text-3">{fileNote ?? A.rosterFileHint}</span>
        </div>
        <textarea
          aria-label={A.rosterTitle}
          value={roster}
          onChange={(e) => setRoster(e.target.value)}
          rows={4}
          disabled={needsLink}
          placeholder={"2024001\n2024002\n2024003"}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 font-mono text-sm text-text"
        />
        <Button
          disabled={pending || needsLink || !roster.trim()}
          onClick={() => run(() => addToRosterAction(orgId, roster), (r) => A.rosterSaved(r.added, r.accepted))}
        >
          {A.rosterSend}
        </Button>
      </Card>
    </div>
  );
}
