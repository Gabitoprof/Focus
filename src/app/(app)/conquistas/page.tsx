import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton, cx } from "@/components/ui";
import { ACHIEVEMENT_CATEGORIES, type AchievementCategory } from "@/domain/achievements";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getAchievements } from "@/server/services/achievements";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.achievements.title };
}

/**
 * Ícones em imagem (fundo transparente), gerados por `node scripts/process-achievement-icons.mjs`:
 * public/achievements/<id>.webp (128px) e <id>@2x.webp (256px); categorias em public/achievement-categories/.
 * Sem o arquivo, volta ao emoji da categoria.
 */
const iconFile = (dir: string, id: string) => existsSync(join(process.cwd(), "public", dir, `${id}.webp`));
/** Bloqueado: o mesmo ícone, apagado só com CSS (sem arquivo extra). */
const LOCKED_FILTER = "grayscale(1) brightness(.55) opacity(.7)";

/** Ícone solto sobre o card: sem borda, fundo, sombra, cantos ou espaçamento. */
function IconImg({ dir, id, alt, size, locked }: { dir: string; id: string; alt: string; size: number; locked?: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem estática pequena com srcset 1x/2x próprio
    <img
      src={`/${dir}/${id}.webp`}
      srcSet={`/${dir}/${id}.webp 1x, /${dir}/${id}@2x.webp 2x`}
      width={size}
      height={size}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="shrink-0"
      style={{ width: size, height: size, objectFit: "contain", border: 0, background: "none", boxShadow: "none", borderRadius: 0, padding: 0, filter: locked ? LOCKED_FILTER : undefined }}
    />
  );
}

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
              {iconFile("achievement-categories", cat) ? (
                <IconImg dir="achievement-categories" id={cat} alt="" size={24} />
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
                      "space-y-2 rounded-xl border p-4",
                      a.unlocked ? "border-accent bg-accent-soft/40" : "border-border bg-surface",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {iconFile("achievements", a.id) ? (
                        <IconImg dir="achievements" id={a.id} alt={info.name} size={32} locked={!a.unlocked} />
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
