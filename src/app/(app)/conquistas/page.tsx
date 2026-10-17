import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { PageHeader, Skeleton, cx } from "@/components/ui";
import { ACHIEVEMENT_CATEGORIES, type AchievementCategory } from "@/domain/achievements";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getAchievements } from "@/server/services/achievements";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.achievements.title };
}

/** Ícones gerados por `node scripts/achievement-icons.mjs`; sem o arquivo, usa o emoji da categoria. */
const hasIcon = (id: string) => existsSync(join(process.cwd(), "public", "achievements", `${id}.webp`));

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
  const { list, unlocked, total } = await getAchievements(await appCtx(), user.id);
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

      {ACHIEVEMENT_CATEGORIES.map((cat) => {
        const items = list.filter((a) => a.category === cat);
        return (
          <section key={cat} aria-label={A.categories[cat]} className="space-y-3">
            <h2 className="flex items-center gap-2 font-semibold">
              <span aria-hidden>{ICONS[cat]}</span>
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
                      "space-y-2 rounded-xl border p-4",
                      a.unlocked ? "border-accent bg-accent-soft/40" : "border-border bg-surface",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {hasIcon(a.id) ? (
                        // Ícone exclusivo (estilo Steam): colorido quando conquistado, cinza e apagado quando não.
                        <Image
                          src={`/achievements/${a.id}.webp`}
                          alt=""
                          width={64}
                          height={64}
                          className={cx(
                            "h-16 w-16 shrink-0 rounded-lg ring-1",
                            a.unlocked ? "ring-accent" : "opacity-45 ring-border grayscale",
                          )}
                        />
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
                      {a.unlocked && (
                        <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-ink">{A.unlocked}</span>
                      )}
                    </div>
                    {!a.unlocked && (
                      <div>
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
