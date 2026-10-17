import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageHeader, Skeleton, cx } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { listAreas, searchCatalogTopics } from "@/server/services/catalog";
import { listCategories } from "@/server/services/categories";
import { getActiveContext } from "@/server/services/profile";
import { listMoveRequests } from "@/server/services/project-moves";
import { listInvites, listProjects } from "@/server/services/projects";
import { CategoryManager } from "./manager";
import { ProjectsBoard } from "./projects-board";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.categories };
}

type Mode = "estude" | "projetos";

export default async function CategoriesPage(props: PageProps<"/registro">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.categories.title} description={t.categories.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/registro">["searchParams"] }) {
  const user = await requireUser();
  const { t } = await getI18n();
  const ctx = await appCtx();
  const sp = await searchParams;
  const mode: Mode = sp.modo === "projetos" ? "projetos" : "estude";
  const context = await getActiveContext(ctx, user.id);

  return (
    <div className="space-y-5">
      <ModeTabs mode={mode} labels={t.categories.modes} />
      {mode === "estude" ? <StudyMode userId={user.id} /> : <ProjectsMode userId={user.id} context={context} />}
    </div>
  );
}

function ModeTabs({ mode, labels }: { mode: Mode; labels: { study: string; projects: string } }) {
  const tabs: { id: Mode; label: string; icon: string }[] = [
    { id: "estude", label: labels.study, icon: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14ZM20 17v4H6.5A2.5 2.5 0 0 1 4 18.5" },
    { id: "projetos", label: labels.projects, icon: "M3 7h18v13H3zM8 7V4h8v3M3 12h18" },
  ];
  return (
    <nav className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1" aria-label={labels.study + " / " + labels.projects}>
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.id === "estude" ? "/registro" : "/registro?modo=projetos"}
          aria-current={mode === tab.id ? "page" : undefined}
          className={cx(
            "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium",
            mode === tab.id ? "bg-accent text-accent-ink" : "text-text-2 hover:text-text",
          )}
        >
          <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            <path d={tab.icon} />
          </svg>
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

async function StudyMode({ userId }: { userId: string }) {
  const { t } = await getI18n();
  const ctx = await appCtx();
  const context = await getActiveContext(ctx, userId);
  const [cats, areas, catalog] = await Promise.all([
    listCategories(ctx, userId, context),
    listAreas(ctx),
    searchCatalogTopics(ctx),
  ]);
  return (
    <CategoryManager
      context={context}
      areas={areas.map((a) => ({ ...a, name: t.areas[a.id] ?? a.name }))}
      catalog={catalog}
      categories={cats.map((c) => ({
        ...c,
        archived: Boolean(c.archivedAt),
        topics: c.topics.map((t) => ({ ...t, archived: Boolean(t.archivedAt) })),
      }))}
    />
  );
}

async function ProjectsMode({ userId, context }: { userId: string; context: Awaited<ReturnType<typeof getActiveContext>> }) {
  const ctx = await appCtx();
  const [projects, invites, moves] = await Promise.all([
    listProjects(ctx, userId, context),
    listInvites(ctx, userId),
    listMoveRequests(ctx, userId),
  ]);
  return (
    <ProjectsBoard
      context={context}
      projects={projects}
      invites={invites.map((i) => ({ ...i, invitedAt: i.invitedAt.toISOString() }))}
      moveRequests={moves.map((m) => ({
        id: m.id,
        projectName: m.projectName,
        requestedBy: m.requestedBy,
        approver: m.approver,
        targetContext: m.targetContext,
        targetLabel: m.targetLabel,
      }))}
    />
  );
}
