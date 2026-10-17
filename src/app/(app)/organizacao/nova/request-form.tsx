"use client";

import { useState, useTransition } from "react";
import { requestOrganizationAction } from "@/app/actions/organizations";
import { Alert, Button, Input, Label, cx } from "@/components/ui";
import { ORGANIZATION_KINDS, type OrganizationKind } from "@/domain/organizations";
import { useI18n } from "@/i18n/client";

export function OrgRequestForm() {
  const { t } = useI18n();
  const O = t.org;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [f, setF] = useState({ kind: "institution" as OrganizationKind, cnpj: "", alias: "", contactEmail: "", requesterRole: "", message: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  if (sentTo) {
    return (
      <Alert tone="good">
        <p className="font-medium">{O.sentTitle}</p>
        <p className="mt-1">{O.sentText(sentTo)}</p>
      </Alert>
    );
  }

  return (
    <form
      className="max-w-2xl space-y-4 rounded-xl border border-border bg-surface p-5"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await requestOrganizationAction(f);
          if (!res.ok) setError(res.error);
          else {
            setError(null);
            setSentTo(f.contactEmail);
          }
        });
      }}
    >
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium text-text-2">{O.kindLabel}</legend>
        <div className="grid grid-cols-2 gap-2">
          {ORGANIZATION_KINDS.map((k) => (
            <label
              key={k}
              className={cx(
                "cursor-pointer rounded-lg border p-3 text-sm",
                f.kind === k ? "border-accent bg-accent-soft" : "border-border",
              )}
            >
              <input type="radio" name="kind" className="sr-only" checked={f.kind === k} onChange={() => setF((s) => ({ ...s, kind: k }))} />
              <span className="font-medium">{O.kinds[k]}</span>
              <span className="mt-0.5 block text-xs text-text-2">{O.kindHints[k]}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="o-cnpj">CNPJ</Label>
          <Input id="o-cnpj" inputMode="numeric" placeholder="00.000.000/0000-00" value={f.cnpj} onChange={set("cnpj")} required />
        </div>
        <div>
          <Label htmlFor="o-alias">{O.alias}</Label>
          <Input id="o-alias" value={f.alias} maxLength={120} onChange={set("alias")} required />
        </div>
        <div>
          <Label htmlFor="o-email">{O.contactEmail}</Label>
          <Input id="o-email" type="email" value={f.contactEmail} maxLength={160} onChange={set("contactEmail")} required />
          <p className="mt-1 text-xs text-text-3">{O.contactEmailHint}</p>
        </div>
        <div>
          <Label htmlFor="o-role">{O.requesterRole}</Label>
          <Input id="o-role" value={f.requesterRole} maxLength={80} onChange={set("requesterRole")} required />
        </div>
      </div>
      <div>
        <Label htmlFor="o-msg">{O.message}</Label>
        <textarea
          id="o-msg"
          value={f.message}
          maxLength={1000}
          rows={4}
          onChange={set("message")}
          required
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text"
        />
      </div>
      <p className="text-xs text-text-3">{O.howItWorks}</p>
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={pending}>
        {pending ? O.sending : O.submit}
      </Button>
    </form>
  );
}
