"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { acceptTermsAction } from "@/app/actions/profile";
import { Alert, Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** Caixa "Li e aceito" + botão; usado no pedido de aceite para contas já existentes. */
export function AcceptTermsForm() {
  const { t } = useI18n();
  const L = t.legal;
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="mt-5 space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!checked) return;
        start(async () => {
          const res = await acceptTermsAction();
          if (!res.ok) setError(res.error);
          else router.refresh();
        });
      }}
    >
      <TermsCheckbox checked={checked} onChange={setChecked} />
      {error && <Alert>{error}</Alert>}
      <Button type="submit" disabled={!checked || pending}>
        {L.accept}
      </Button>
      <p className="text-xs text-text-3">{L.contactHint}</p>
    </form>
  );
}

/** "Li e aceito os Termos de Uso e a Política de Privacidade" (links abrem em outra aba). */
export function TermsCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const { t } = useI18n();
  const L = t.legal;
  return (
    <label className="flex items-start gap-2 text-sm">
      <input type="checkbox" required className="mt-1 accent-[var(--accent)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {L.agreePrefix}{" "}
        <Link href="/termos" target="_blank" className="text-link underline">
          {L.terms}
        </Link>{" "}
        {L.and}{" "}
        <Link href="/privacidade" target="_blank" className="text-link underline">
          {L.privacy}
        </Link>
        .
      </span>
    </label>
  );
}
