"use client";

import { useEffect, useState, useTransition } from "react";
import {
  joinInstitutionAction,
  registerCpfAction,
  requestInstitutionAction,
  searchInstitutionsAction,
} from "@/app/actions/identity";
import { Alert, Button, Card, Input, Label, Select, cx } from "@/components/ui";
import { INTL_LOCALE } from "@/i18n";
import { useI18n } from "@/i18n/client";

type Kind = "higher" | "school";
type Found = { id: string; kind: Kind; name: string; acronym: string | null; city: string | null; uf: string | null };

export type InstitutionPanelProps = {
  publicCode: string | null;
  identity: { hasCpf: true; masked: string } | { hasCpf: false };
  membership: {
    name: string;
    acronym: string | null;
    city: string | null;
    uf: string | null;
    kind: Kind;
    nextChangeAt: string;
    /** A instituição tem conta na Focus e ainda não aceitou o vínculo. */
    pending: boolean;
  } | null;
  catalogSize: { higher: number; school: number };
};

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");

function formatCpf(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

const place = (i: { city: string | null; uf: string | null }) => [i.city, i.uf].filter(Boolean).join("/");

export function InstitutionPanel({ publicCode, identity, membership, catalogSize }: InstitutionPanelProps) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [kind, setKind] = useState<Kind>(membership?.kind ?? "higher");
  const [uf, setUf] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Found[]>([]);
  const [chosen, setChosen] = useState<Found | null>(null);
  const [enrollment, setEnrollment] = useState("");
  const [requesting, setRequesting] = useState(false);
  const empty = catalogSize[kind] === 0;

  // Busca com pequeno atraso enquanto digita.
  useEffect(() => {
    if (query.trim().length < 2 || chosen) return;
    const t = setTimeout(async () => {
      const res = await searchInstitutionsAction({ query, kind, uf: uf || undefined });
      setResults(res.ok ? res.data : []);
    }, 250);
    return () => clearTimeout(t);
  }, [query, kind, uf, chosen]);

  const done = (ok: boolean, text: string) => setMsg({ tone: ok ? "good" : "danger", text });
  const { locale, t: d } = useI18n();
  const I = d.identity;

  return (
    <Card>
      <h2 className="font-semibold">{I.title}</h2>
      <p className="mt-1 text-sm text-text-2">{I.description}</p>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div className="rounded-lg bg-surface-2 p-3">
          <dt className="text-xs text-text-2">{I.code}</dt>
          <dd className="mt-0.5 font-mono font-semibold tracking-wide">{publicCode ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-surface-2 p-3">
          <dt className="text-xs text-text-2">{I.cpf}</dt>
          <dd className="mt-0.5 font-mono">{identity.hasCpf ? identity.masked : I.cpfNone}</dd>
        </div>
      </dl>

      {msg && (
        <div className="mt-4">
          <Alert tone={msg.tone}>{msg.text}</Alert>
        </div>
      )}

      {!identity.hasCpf && (
        <form
          className="mt-5 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              const res = await registerCpfAction({ cpf, birthDate });
              if (res.ok) {
                setCpf("");
                setBirthDate("");
              }
              done(res.ok, res.ok ? I.cpfLinked : res.error);
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
            <div>
              <Label htmlFor="cpf">{I.cpf}</Label>
              <Input
                id="cpf"
                inputMode="numeric"
                autoComplete="off"
                placeholder="000.000.000-00"
                value={cpf}
                onChange={(e) => setCpf(formatCpf(e.target.value))}
              />
            </div>
            <div>
              <Label htmlFor="birth">{I.birthDate}</Label>
              <Input
                id="birth"
                type="date"
                autoComplete="bday"
                min="1900-01-01"
                max={new Date().toISOString().slice(0, 10)}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={pending || cpf.replace(/\D/g, "").length !== 11 || !birthDate}
              className="shrink-0"
            >
              {pending ? I.verifying : I.verify}
            </Button>
          </div>
          <p className="text-xs text-text-3">{I.cpfHint}</p>
        </form>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <h3 className="text-sm font-semibold">{I.institution}</h3>
        {membership && (
          <p className="mt-1 text-sm">
            {membership.acronym ? `${membership.acronym} — ` : ""}
            {membership.name}
            <span className="text-text-2"> · {place(membership)}</span>
            {membership.pending && (
              <span className="mt-1 block rounded-lg bg-warn-soft px-2 py-1 text-xs text-warn">{I.pendingAcceptance}</span>
            )}
            <span className="block text-xs text-text-3">
              {I.nextChange(new Date(membership.nextChangeAt).toLocaleDateString(INTL_LOCALE[locale]))}
            </span>
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={I.kindGroup}>
          {(
            [
              ["higher", I.higher],
              ["school", I.school],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="radio"
              aria-checked={kind === k}
              onClick={() => {
                setKind(k);
                setChosen(null);
                setResults([]);
              }}
              className={cx(
                "rounded-full border px-3 py-1.5 text-xs font-medium",
                kind === k ? "border-accent bg-accent text-accent-ink" : "border-border hover:border-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {empty ? (
          <p className="mt-3 text-sm text-text-2">{I.notLoaded(kind === "higher")}</p>
        ) : chosen ? (
          <form
            className="mt-3 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const res = await joinInstitutionAction({ institutionId: chosen.id, enrollment });
                if (res.ok) {
                  setChosen(null);
                  setEnrollment("");
                  setQuery("");
                }
                done(res.ok, res.ok ? (res.data.status === "pending" ? I.sentForAcceptance : I.saved) : res.error);
              });
            }}
          >
            <p className="rounded-lg border border-accent bg-accent-soft p-3 text-sm">
              {chosen.acronym ? `${chosen.acronym} — ` : ""}
              {chosen.name} <span className="text-text-2">· {place(chosen)}</span>
              <button type="button" className="ml-2 text-xs text-link underline" onClick={() => setChosen(null)}>
                {I.change}
              </button>
            </p>
            <div>
              <Label htmlFor="enrollment">{I.enrollment}</Label>
              <Input id="enrollment" value={enrollment} maxLength={40} onChange={(e) => setEnrollment(e.target.value)} />
              <p className="mt-1 text-xs text-text-3">{I.enrollmentHint}</p>
            </div>
            <Button type="submit" disabled={pending || !identity.hasCpf || enrollment.trim().length < 3}>
              {identity.hasCpf ? I.saveInstitution : I.needCpf}
            </Button>
          </form>
        ) : (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  aria-label={I.search}
                  placeholder={kind === "higher" ? I.searchHigher : I.searchSchool}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    if (e.target.value.trim().length < 2) setResults([]);
                  }}
                />
              </div>
              <div className="w-24 flex-none">
                <Select aria-label={I.uf} value={uf} onChange={(e) => setUf(e.target.value)}>
                  <option value="">{I.uf}</option>
                  {UFS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            {results.length > 0 && (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {results.map((r) => (
                  <li key={r.id}>
                    <button type="button" onClick={() => setChosen(r)} className="w-full px-3 py-2 text-left text-sm hover:bg-surface-2">
                      {r.acronym ? <strong>{r.acronym} — </strong> : null}
                      {r.name}
                      <span className="text-text-2"> · {place(r)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {query.trim().length >= 2 && results.length === 0 && <p className="text-xs text-text-3">{I.noResults}</p>}
          </div>
        )}

        {!chosen &&
          (requesting ? (
            <RequestForm
              kind={kind}
              pending={pending}
              onCancel={() => setRequesting(false)}
              onSubmit={(data) =>
                start(async () => {
                  const res = await requestInstitutionAction({ kind, ...data });
                  if (res.ok) setRequesting(false);
                  done(res.ok, res.ok ? I.requestSent : res.error);
                })
              }
            />
          ) : (
            <button type="button" className="mt-3 text-xs text-link underline" onClick={() => setRequesting(true)}>
              {I.notListed}
            </button>
          ))}
      </div>
    </Card>
  );
}

function RequestForm({
  kind,
  pending,
  onCancel,
  onSubmit,
}: {
  kind: Kind;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (d: { name: string; city: string; uf: string }) => void;
}) {
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [uf, setUf] = useState("");
  const { t: d } = useI18n();
  const I = d.identity;
  return (
    <form
      className="mt-3 grid gap-2 rounded-lg bg-surface-2 p-3 sm:grid-cols-[1fr_160px_90px]"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, city, uf });
      }}
    >
      <Input aria-label={I.requestNameLabel} placeholder={I.requestName(kind === "higher")} value={name} onChange={(e) => setName(e.target.value)} />
      <Input aria-label={I.city} placeholder={I.city} value={city} onChange={(e) => setCity(e.target.value)} />
      <Select aria-label={I.uf} value={uf} onChange={(e) => setUf(e.target.value)}>
        <option value="">{I.uf}</option>
        {UFS.map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </Select>
      <div className="flex gap-2 sm:col-span-3">
        <Button size="sm" type="submit" disabled={pending || name.trim().length < 3 || city.trim().length < 2 || !uf}>
          {I.sendRequest}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onCancel}>
          {d.common.cancel}
        </Button>
      </div>
    </form>
  );
}
