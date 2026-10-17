"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reviewOrganizationAction } from "@/app/actions/organizations";
import { Alert, Button, Input } from "@/components/ui";
import { useI18n } from "@/i18n/client";

export function ReviewButtons({ orgId }: { orgId: string }) {
  const { t } = useI18n();
  const O = t.org;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const decide = (approve: boolean) =>
    start(async () => {
      const res = await reviewOrganizationAction(orgId, approve, note);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  return (
    <div className="space-y-2">
      <Input aria-label={O.adminNote} placeholder={O.adminNote} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      {error && <Alert>{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => decide(true)}>
          {O.approve}
        </Button>
        <Button size="sm" variant="ghost" className="text-danger" disabled={pending || !note.trim()} onClick={() => decide(false)}>
          {O.reject}
        </Button>
      </div>
    </div>
  );
}
