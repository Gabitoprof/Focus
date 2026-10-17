"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondOrgInviteAction } from "@/app/actions/organizations";
import { Alert, Button } from "@/components/ui";
import type { OrgRole, OrganizationKind } from "@/domain/organizations";
import { useI18n } from "@/i18n/client";

type Invite = { id: string; alias: string; kind: OrganizationKind; role: OrgRole; area: string | null };

export function OrgInvites({ invites }: { invites: Invite[] }) {
  const { t } = useI18n();
  const O = t.org;
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const respond = (id: string, accept: boolean) =>
    start(async () => {
      const res = await respondOrgInviteAction(id, accept);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  return (
    <section className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4" aria-label={O.invites}>
      <h2 className="mb-2 text-sm font-semibold">{O.invites}</h2>
      {error && <Alert>{error}</Alert>}
      <ul className="space-y-2">
        {invites.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3">
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-medium">{i.alias}</p>
              <p className="text-xs text-text-2">
                {O.kinds[i.kind]} · {O.roles[i.role]}
                {i.area && ` · ${i.area}`}
              </p>
              <p className="mt-1 text-xs text-text-3">{O.inviteNote}</p>
            </div>
            <Button size="sm" disabled={pending} onClick={() => respond(i.id, true)}>
              {t.projects.accept}
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => respond(i.id, false)}>
              {t.projects.decline}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
