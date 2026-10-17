import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { formatCnpj } from "@/domain/organizations";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { listMyOrganizations } from "@/server/services/organizations";
import { CompanyLink } from "./company-link";
import { OrgInvites } from "./org-invites";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.org.title };
}

export default async function OrganizationsPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        title={t.org.title}
        description={t.org.description}
        actions={
          <Link
            href="/organizacao/nova"
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink"
          >
            {t.org.register}
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-64" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requireUser();
  const { t } = await getI18n();
  const O = t.org;
  const mine = await listMyOrganizations(await appCtx(), user.id);
  const empty = mine.organizations.length + mine.invites.length + mine.requests.length === 0;
  return (
    <div className="space-y-6">
      {mine.invites.length > 0 && <OrgInvites invites={mine.invites.map((i) => ({ id: i.id, alias: i.alias, kind: i.kind, role: i.role, area: i.area }))} />}

      {mine.organizations.length > 0 && (
        <section aria-label={O.mine}>
          <h2 className="mb-3 font-semibold">{O.mine}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {mine.organizations.map((o) => (
              <li key={o.id}>
                <Link href={`/organizacao/${o.id}`} className="block rounded-xl border border-border bg-surface p-4 hover:border-accent">
                  <p className="font-semibold">{o.alias}</p>
                  <p className="text-xs text-text-2">
                    {O.kinds[o.kind]} · {O.roles[o.role]}
                    {o.area && ` · ${o.area}`}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.requests.length > 0 && (
        <section aria-label={O.requests}>
          <h2 className="mb-3 font-semibold">{O.requests}</h2>
          <ul className="space-y-2">
            {mine.requests.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-center gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.alias}</p>
                    <p className="text-xs text-text-2">
                      {O.kinds[r.kind]} · CNPJ {formatCnpj(r.cnpj)}
                    </p>
                    {r.reviewNote && r.status === "rejected" && <p className="mt-1 text-xs text-danger">{r.reviewNote}</p>}
                  </div>
                  <span
                    className={cx(
                      "rounded-full px-2.5 py-1 text-xs font-medium",
                      r.status === "rejected" ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn",
                    )}
                  >
                    {O.statuses[r.status]}
                  </span>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      <CompanyLink pending={mine.pendingLinks.map((p) => ({ id: p.id, alias: p.alias }))} />

      {empty && (
        <Card className="text-center">
          <p className="font-medium">{O.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-2">{O.emptyText}</p>
        </Card>
      )}
    </div>
  );
}
