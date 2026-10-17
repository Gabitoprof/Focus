import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { compactNumber } from "@/domain/titles";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { AppError } from "@/server/services/common";
import { getAccess } from "@/server/services/entitlements";
import { getInstitutionProfile } from "@/server/services/ranking";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.institutionPage.title };
}

export default async function InstitutionPage(props: PageProps<"/instituicoes/[id]">) {
  const { t } = await getI18n();
  return (
    <>
      <Link href="/ranking?escopo=instituicoes" className="mb-4 inline-block text-sm text-link hover:underline">
        ← {t.institutionPage.back}
      </Link>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content params={props.params} />
      </Suspense>
    </>
  );
}

async function Content({ params }: { params: PageProps<"/instituicoes/[id]">["params"] }) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { t, locale } = await getI18n();
  const P = t.institutionPage;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  if (!(await getAccess(ctx, user.id, "ranking")).allowed) {
    return <Card className="text-center text-sm text-text-2">{P.premium}</Card>;
  }
  const inst = await getInstitutionProfile(ctx, user.id, id).catch((e: unknown) => {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  });
  const periods = [
    [P.week, inst.week],
    [P.month, inst.month],
    [P.all, inst.all],
  ] as const;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {inst.acronym ? `${inst.acronym} — ` : ""}
          {inst.name}
        </h1>
        <p className="text-sm text-text-2">
          {[inst.city, inst.uf].filter(Boolean).join("/")} · {inst.kind === "school" ? P.school : P.higher} · {P.members(inst.members)}
          {inst.verified && <span className="ml-2 rounded-full bg-good-soft px-2 py-0.5 text-xs font-medium text-good">{P.verified}</span>}
        </p>
      </header>

      <section aria-label={P.medalsTitle} className="flex flex-wrap gap-3">
        {(
          [
            ["gold", "🥇", P.gold],
            ["silver", "🥈", P.silver],
            ["bronze", "🥉", P.bronze],
          ] as const
        ).map(([k, icon, label]) => (
          <Card key={k} className="flex items-center gap-3 p-4">
            <span aria-hidden className="text-2xl">
              {icon}
            </span>
            <div>
              <p className="text-2xl font-semibold tabular">{inst.medals[k]}</p>
              <p className="text-xs text-text-2">{label}</p>
            </div>
          </Card>
        ))}
        <p className="w-full text-xs text-text-3">{P.medalsHint}</p>
      </section>

      <div className="grid gap-4 sm:grid-cols-3">
        {periods.map(([label, s]) => (
          <Card key={label} className="space-y-1 p-4">
            <p className="text-xs font-medium text-text-2">{label}</p>
            <p className="text-2xl font-semibold tabular">{s.position ? t.ranking.position(s.position) : "—"}</p>
            <p className="text-xs text-text-2 tabular">
              {P.activeStudents(s.activeMembers)} · {formatDuration(s.totalSeconds)} · {compactNumber(s.totalXp, locale)} XP
            </p>
            <p className="text-xs text-text-3 tabular">{P.perStudent(formatDuration(s.averageSeconds))}</p>
          </Card>
        ))}
      </div>
      {inst.week.position === null && <p className="text-xs text-text-3">{P.minActive(inst.minActive)}</p>}

      {inst.page && (inst.page.about || inst.page.whyStudy || inst.page.website) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {inst.page.about && (
            <Card className="space-y-2 p-5">
              <h2 className="font-semibold">{P.about}</h2>
              <p className="whitespace-pre-line text-sm text-text-2">{inst.page.about}</p>
            </Card>
          )}
          {inst.page.whyStudy && (
            <Card className="space-y-2 p-5">
              <h2 className="font-semibold">{P.whyStudy}</h2>
              <p className="whitespace-pre-line text-sm text-text-2">{inst.page.whyStudy}</p>
            </Card>
          )}
          {inst.page.website && (
            <a href={inst.page.website} target="_blank" rel="noopener noreferrer nofollow" className="text-sm text-link hover:underline">
              {P.website} ↗
            </a>
          )}
        </div>
      ) : (
        <Card className="text-sm text-text-2">{inst.verified ? P.noPageYet : P.notVerified}</Card>
      )}

      <Link href="/perfil" className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
        {P.studyHere}
      </Link>
    </div>
  );
}
