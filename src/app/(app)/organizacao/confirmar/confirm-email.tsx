"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { confirmOrganizationEmailAction } from "@/app/actions/organizations";
import { Alert, Button } from "@/components/ui";
import { useI18n } from "@/i18n/client";

/** Confirmação por botão (não na abertura do link): leitores de e-mail que abrem links não confirmam sozinhos. */
export function ConfirmEmail({ token }: { token: string }) {
  const { t } = useI18n();
  const O = t.org;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { id: string; status: "approved" | "pending_review" }>(null);

  if (done) {
    return (
      <Alert tone="good">
        <p className="font-medium">{done.status === "approved" ? O.approvedTitle : O.reviewTitle}</p>
        <p className="mt-1">{done.status === "approved" ? O.approvedText : O.reviewText}</p>
        {done.status === "approved" && (
          <Link href={`/organizacao/${done.id}`} className="mt-2 inline-block font-medium underline">
            {O.openOrg}
          </Link>
        )}
      </Alert>
    );
  }
  return (
    <div className="max-w-xl space-y-3 rounded-xl border border-border bg-surface p-5">
      <p className="text-sm text-text-2">{O.confirmText}</p>
      {error && <Alert>{error}</Alert>}
      <Button
        disabled={pending || !token}
        onClick={() =>
          start(async () => {
            const res = await confirmOrganizationEmailAction(token);
            if (!res.ok) setError(res.error);
            else setDone(res.data);
          })
        }
      >
        {O.confirmButton}
      </Button>
    </div>
  );
}
