import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { formatCnpj } from "@/domain/organizations";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { listPendingOrganizations } from "@/server/services/organizations";
import { isAdmin } from "@/server/services/profile";
import { ReviewButtons } from "./review-buttons";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.org.adminTitle };
}

export default async function AdminOrganizationsPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.org.adminTitle} description={t.org.adminDescription} />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requireUser();
  const ctx = await appCtx();
  if (!(await isAdmin(ctx.db, user.id))) notFound();
  const { t } = await getI18n();
  const O = t.org;
  const pending = await listPendingOrganizations(ctx);
  if (pending.length === 0) return <Card className="text-center text-sm text-text-2">{O.adminEmpty}</Card>;
  return (
    <ul className="space-y-3">
      {pending.map(({ org, requesterName, requesterCode }) => {
        const snap = (org.cnpjSnapshot ?? {}) as { mainActivity?: { id: number; text: string }; emailDomains?: string[]; city?: string; uf?: string };
        return (
          <li key={org.id}>
            <Card className="space-y-3 p-4">
              <div>
                <p className="font-semibold">
                  {org.alias} <span className="text-sm font-normal text-text-2">· {O.kinds[org.kind]}</span>
                </p>
                <p className="text-xs text-text-2">
                  {org.legalName} · CNPJ {formatCnpj(org.cnpj)} · {snap.city}/{snap.uf}
                </p>
                <p className="text-xs text-text-2">
                  {O.adminRequester(requesterName, requesterCode ?? "", org.requesterRole)} · {org.contactEmail}
                </p>
                {snap.mainActivity && <p className="text-xs text-text-3">CNAE {snap.mainActivity.id} — {snap.mainActivity.text}</p>}
                <p className="text-xs text-text-3">{O.adminDomains((snap.emailDomains ?? []).join(", ") || "—")}</p>
              </div>
              <ul className="flex flex-wrap gap-2 text-xs">
                {(Object.keys(O.checks) as (keyof typeof O.checks)[]).map((k) => {
                  const v = org.checks[k];
                  if (v === null) return null;
                  return (
                    <li key={k} className={v ? "rounded-full bg-good-soft px-2 py-0.5 text-good" : "rounded-full bg-danger-soft px-2 py-0.5 text-danger"}>
                      {v ? "✓" : "✗"} {O.checks[k]}
                    </li>
                  );
                })}
              </ul>
              <blockquote className="border-l-2 border-border pl-3 text-sm text-text-2">{org.message}</blockquote>
              <ReviewButtons orgId={org.id} />
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
