import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Skeleton } from "@/components/ui";
import { resolveRange, weekRange, type Range } from "@/domain/time";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { AppError } from "@/server/services/common";
import { getProfile } from "@/server/services/profile";
import { moveTargets } from "@/server/services/project-moves";
import { getProject } from "@/server/services/projects";
import { cx } from "@/components/ui";
import { buildSchedule } from "@/domain/schedule";
import { localDayKey } from "@/domain/time";
import { orgAssignRights } from "@/server/services/organizations";
import { ProjectView } from "./project-view";
import { ScheduleChart } from "./schedule-chart";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.projects.pageTitle };
}

const PERIODS = ["semana", "mes", "tudo"] as const;
type Period = (typeof PERIODS)[number];

export default async function ProjectPage(props: PageProps<"/registro/projetos/[id]">) {
  const { t } = await getI18n();
  return (
    <>
      <Link href="/registro?modo=projetos" className="mb-4 inline-block text-sm text-link hover:underline">
        ← {t.projects.back}
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
  params: PageProps<"/registro/projetos/[id]">["params"];
  searchParams: PageProps<"/registro/projetos/[id]">["searchParams"];
}) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { id } = await params;
  const sp = await searchParams;
  const period: Period = (PERIODS as readonly string[]).includes(String(sp.periodo)) ? (sp.periodo as Period) : "semana";
  const profile = await getProfile(ctx, user.id);
  const now = ctx.now();
  const range: Range | undefined =
    period === "semana" ? weekRange(profile.timezone, now) : period === "mes" ? resolveRange("month", profile.timezone, now) : undefined;

  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  let project;
  try {
    project = await getProject(ctx, user.id, id, range);
  } catch (e) {
    if (e instanceof AppError && e.code === "not_found") notFound();
    throw e;
  }
  const { t, locale } = await getI18n();
  const tab = sp.aba === "cronograma" ? "cronograma" : "geral";
  const scale = sp.escala === "mes" ? "mes" : "semana";
  const tabs = (
    <nav className="mb-5 inline-flex gap-1 rounded-xl border border-border bg-surface p-1" aria-label={t.schedule.tabs}>
      {(["geral", "cronograma"] as const).map((k) => (
        <Link
          key={k}
          href={k === "geral" ? `/registro/projetos/${id}` : `/registro/projetos/${id}?aba=cronograma`}
          aria-current={tab === k ? "page" : undefined}
          className={cx(
            "rounded-lg px-4 py-2 text-sm font-medium",
            tab === k ? "bg-accent text-accent-ink" : "text-text-2 hover:text-text",
          )}
        >
          {k === "geral" ? t.schedule.overview : t.schedule.title}
        </Link>
      ))}
    </nav>
  );

  if (tab === "cronograma") {
    const today = localDayKey(now, profile.timezone);
    const schedule = buildSchedule(
      project.tasks.map((x) => ({
        id: x.id,
        title: x.title,
        phase: x.phase,
        startDate: x.startDate,
        dueDate: x.dueDate,
        targetMinutes: x.targetMinutes,
        seconds: x.seconds,
        done: x.done,
        assigneeName: x.assigneeName,
        dependsOn: x.dependsOn,
      })),
      { today, projectDue: project.dueDate },
    );
    return (
      <div>
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mb-4 text-sm text-text-2">{t.schedule.subtitle}</p>
        {tabs}
        <ScheduleChart
          schedule={schedule}
          today={today}
          scale={scale}
          locale={locale}
          d={t}
          scaleHref={(k) => `/registro/projetos/${id}?aba=cronograma&escala=${k}`}
        />
      </div>
    );
  }

  const [targets, orgPicker] = await Promise.all([
    moveTargets(ctx.db, user.id),
    orgAssignRights(ctx, user.id, {
      organizationId: project.organizationId,
      ownerUserId: project.members.find((m) => m.role === "owner")?.userId ?? "",
    }),
  ]);
  return (
    <div>
      {tabs}
      <ProjectView
        project={{ ...project, recent: project.recent.map((r) => ({ ...r, endedAt: r.endedAt.toISOString() })) }}
        period={period}
        targets={targets}
        orgPicker={orgPicker}
      />
    </div>
  );
}
