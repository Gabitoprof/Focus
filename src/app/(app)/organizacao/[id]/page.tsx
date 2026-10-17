import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { resolveRange, weekRange, type Range } from "@/domain/time";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { AppError } from "@/server/services/common";
import { getOrganization } from "@/server/services/organizations";
import { getProfile } from "@/server/services/profile";
import { listMemberRequests } from "@/server/services/membership";
import { OrgAdminPanel } from "./admin-panel";
import { OrgView } from "./org-view";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.org.title };
}

const PERIODS = ["semana", "mes", "tudo"] as const;
type Period = (typeof PERIODS)[number];

export default async function OrganizationPage(props: PageProps<"/organizacao/[id]">) {
  const { t } = await getI18n();
  return (
    <>
      <Link href="/organizacao" className="mb-4 inline-block text-sm text-link hover:underline">
        ← {t.org.title}
      </Link>
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Content params={props.params} searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({
  params,
  searchParams,
}: {
  params: PageProps<"/organizacao/[id]">["params"];
  searchParams: PageProps<"/organizacao/[id]">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await searchParams;
  const period: Period = (PERIODS as readonly string[]).includes(String(sp.periodo)) ? (sp.periodo as Period) : "semana";
  const area = typeof sp.area === "string" ? sp.area : null;
  const profile = await getProfile(ctx, user.id);
  const now = ctx.now();
  const range: Range | undefined =
    period === "semana" ? weekRange(profile.timezone, now) : period === "mes" ? resolveRange("month", profile.timezone, now) : undefined;
  const org = await getOrganization(ctx, user.id, id, range).catch((e: unknown) => {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  });
  const requests = org.canManage ? await listMemberRequests(ctx, user.id, id) : [];
  return (
    <div className="space-y-8">
      <OrgView org={org} period={period} area={area && org.areas.includes(area) ? area : null} />
      {org.canManage && (
        <OrgAdminPanel
          orgId={org.id}
          kind={org.kind}
          isOwner={org.isOwner}
          institution={org.institution}
          page={org.page}
          requests={requests.map((r) => ({ ...r, requestedAt: r.requestedAt ? r.requestedAt.toISOString() : null }))}
        />
      )}
    </div>
  );
}
