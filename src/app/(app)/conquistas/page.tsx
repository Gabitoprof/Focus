import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, cx } from "@/components/ui";
import { AchievementIcon, hasAchievementIcon } from "@/components/achievement-icon";
import { ACHIEVEMENT_CATEGORIES, SHOWCASE_MAX, type AchievementCategory } from "@/domain/achievements";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getAchievements } from "@/server/services/achievements";
import { ShowcaseToggle } from "./showcase-toggle";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.achievements.title };
}

/** Sem o arquivo do ícone, volta ao emoji da categoria. */
const ICONS: Record<AchievementCategory, string> = {
  inicio: "🚀",
  constancia: "🔥",
  horas: "⏱️",
  metodo: "🍅",
  explorar: "🧭",
  equipe: "🤝",
};

export default async function AchievementsPage() {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.achievements.title} description={t.achievements.description} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requireUser();
  const { t } = await getI18n();
  const A = t.achievements;
  const { list, unlocked, total, showcase } = await getAchievements(await appCtx(), user.id);
  const pct = Math.round((unlocked / total) * 100);
  return (
    <div className="space-y-8">
      <section aria-label={A.summary(unlocked, total)} className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-semibold">{A.summary(unlocked, total)}</p>
          <p className="text-sm text-text-2 tabular">{pct}%</p>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
        </div>
      </section>

      {/* Vitrine: as conquistas que aparecem ao lado do nome no Ranking. */}
      <section aria-label={A.showcase.title} className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">{A.showcase.title}</h2>
          <span className="text-xs text-text-3 tabular">
            {showcase.length}/{SHOWCASE_MAX}
          </span>
        </div>
        <p className="mt-1 text-xs text-text-2">{A.showcase.hint(SHOWCASE_MAX)}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {showcase.length === 0 && <p className="text-sm text-text-3">{unlocked ? A.showcase.empty : A.showcase.emptyLocked}</p>}
          {showcase.map((id) => {
            const name = A.items[id]?.name ?? id;
            return (
              <div key={id} className="relative flex w-20 flex-col items-center gap-1 text-center">
                {hasAchievementIcon("achievements", id) ? (
                  <AchievementIcon id={id} alt={name} size={48} />
                ) : (
                  <span aria-hidden className="text-4xl">
                    {ICONS[list.find((x) => x.id === id)?.category ?? "inicio"]}
                  </span>
                )}
                <span className="text-[11px] leading-tight text-text-2">{name}</span>
                <ShowcaseToggle id={id} name={name} showcase={showcase} variant="remove" />
              </div>
            );
          })}
        </div>
      </section>

      {ACHIEVEMENT_CATEGORIES.map((cat) => {
        const items = list.filter((a) => a.category === cat);
        return (
          <section key={cat} aria-label={A.categories[cat]} className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold">
              {hasAchievementIcon("achievement-categories", cat) ? (
                <AchievementIcon dir="achievement-categories" id={cat} alt="" size={24} />
              ) : (
                <span aria-hidden>{ICONS[cat]}</span>
              )}
              {A.categories[cat]}
              <span className="text-xs font-normal text-text-3">
                {items.filter((a) => a.unlocked).length}/{items.length}
              </span>
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((a) => {
                const info = A.items[a.id] ?? { name: a.id, how: "" };
                const progress = Math.round((a.current / a.target) * 100);
                return (
                  <li
                    key={a.id}
                    className={cx(
                      // Coluna com o rodapé preso embaixo: o botão da vitrine fica no mesmo lugar em todos os cards.
                      "flex flex-col gap-2 rounded-xl border p-4",
                      a.unlocked ? "border-accent bg-accent-soft/40" : "border-border bg-surface",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {hasAchievementIcon("achievements", a.id) ? (
                        <AchievementIcon id={a.id} alt={info.name} size={32} locked={!a.unlocked} />
                      ) : (
                        <span aria-hidden className={cx("text-2xl", !a.unlocked && "opacity-40 grayscale")}>
                          {ICONS[cat]}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{info.name}</p>
                        <p className="text-xs text-text-2">
                          <span className="font-medium">{A.how}</span> {info.how}
                        </p>
                      </div>
                    </div>
                    {a.unlocked && (
                      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-ink">{A.unlocked}</span>
                        <ShowcaseToggle id={a.id} name={info.name} showcase={showcase} />
                      </div>
                    )}
                    {!a.unlocked && (
                      <div className="mt-auto">
                        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={info.name}>
                          <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-text-3 tabular">{A.progress(a.current, a.target)}</p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
