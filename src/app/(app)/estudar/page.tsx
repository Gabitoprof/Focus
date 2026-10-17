import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { DEFAULT_AUDIO_SETTINGS, audioSettingsSchema } from "@/domain/settings";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { appSettings } from "@/server/db/schema";
import { listCategories } from "@/server/services/categories";
import { projectKey, taskKey } from "@/domain/contexts";
import { getActiveContext, getProfile } from "@/server/services/profile";
import { listProjects } from "@/server/services/projects";
import { getTimerState, listMethods } from "@/server/services/timer";
import { eq } from "drizzle-orm";
import { TimerClient as Timer } from "./timer-client";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.study };
}

export default async function StudyPage(props: PageProps<"/estudar">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.study.title} description={t.study.description} />
      <Suspense fallback={<Skeleton className="h-[480px]" />}>
        <StudyContent searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function StudyContent({ searchParams }: { searchParams: PageProps<"/estudar">["searchParams"] }) {
  const user = await requireUser();
  const ctx = await appCtx();
  const { t } = await getI18n();
  const sp = await searchParams;
  const context = await getActiveContext(ctx, user.id);
  const [state, methods, cats, projects, profile, audioRow] = await Promise.all([
    getTimerState(ctx, user.id),
    listMethods(ctx),
    listCategories(ctx, user.id, context),
    listProjects(ctx, user.id, context),
    getProfile(ctx, user.id),
    ctx.db.select().from(appSettings).where(eq(appSettings.key, "audio")),
  ]);
  const audio = audioSettingsSchema.safeParse(audioRow[0]?.value);
  const categories = [
    ...cats
      .filter((c) => !c.archivedAt)
      .map((c) => ({
        id: c.id,
        name: c.name,
        color: c.color,
        kind: "study" as const,
        topics: c.topics.filter((t) => !t.archivedAt).map((t) => ({ id: t.id, name: t.name })),
      })),
    // Projetos ativos: foco no projeto em geral ou numa tarefa aberta.
    ...projects
      .filter((p) => p.status === "active")
      .map((p) => ({
        id: projectKey(p.id),
        name: p.name,
        color: p.color,
        kind: "project" as const,
        topics: [
          { id: projectKey(p.id), name: t.projects.general },
          ...p.openTasks.map((task) => ({ id: taskKey(task.id), name: task.title })),
        ],
      })),
  ];

  if (categories.length === 0 && !state.session && !state.break) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="font-medium">{t.study.noTopicsTitle}</p>
        <p className="mt-1 text-sm text-text-2">{t.study.noTopicsText}</p>
        <Link
          href="/registro"
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink"
        >
          {t.study.noTopicsCta}
        </Link>
      </div>
    );
  }

  return (
    <Timer
      initialState={state}
      methods={methods}
      categories={categories}
      alarmUrl={audio.success ? audio.data.url : DEFAULT_AUDIO_SETTINGS.url}
      initialVolume={profile.alarmVolume}
      preferProjectId={typeof sp.projeto === "string" ? sp.projeto : undefined}
    />
  );
}
