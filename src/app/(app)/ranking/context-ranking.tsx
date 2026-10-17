import Link from "next/link";
import { Card, cx } from "@/components/ui";
import type { AppContext } from "@/domain/contexts";
import { formatDuration, resolveRange, weekRange } from "@/domain/time";
import { getI18n } from "@/i18n/server";
import { appCtx } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { getFriendsRanking } from "@/server/services/friends";
import { getHoursBank, getProject, listProjects } from "@/server/services/projects";

/**
 * Ranking dos contextos Pessoal e Profissional: banco de horas do próprio usuário e ranking
 * de cada projeto entre os participantes (na semana). Rankings gerais ficam no Acadêmico.
 */
export async function ContextRanking({ userId, context }: { userId: string; context: Exclude<AppContext, "academic"> }) {
  const { t } = await getI18n();
  const P = t.projects;
  const R = t.ranking;
  const ctx = await appCtx();
  const profile = await getProfile(ctx, userId);
  const now = ctx.now();
  const week = weekRange(profile.timezone, now);
  const month = resolveRange("month", profile.timezone, now);
  const [bank, projects] = await Promise.all([
    getHoursBank(ctx, userId, context, { week, month }),
    listProjects(ctx, userId, context),
  ]);
  const details = await Promise.all(projects.map((p) => getProject(ctx, userId, p.id, week)));
  const friends = context === "personal" ? await getFriendsRanking(ctx, userId, "week") : null;

  return (
    <div className="space-y-6">
      <section aria-label={R.hoursBankTitle}>
        <h2 className="mb-3 font-semibold">
          {R.hoursBankTitle} · {t.contexts.names[context]}
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            [R.bankWeek, bank.weekSeconds],
            [R.bankMonth, bank.monthSeconds],
            [R.bankAll, bank.allSeconds],
            [R.bankProjects, bank.projectSeconds],
          ].map(([label, seconds]) => (
            <Card key={label as string} className="p-4">
              <p className="text-xs text-text-2">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular">{formatDuration(seconds as number)}</p>
            </Card>
          ))}
        </div>
      </section>

      {friends && (
        <section aria-label={t.friends.rankingTitle} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">{t.friends.rankingTitle}</h2>
            <span className="text-xs text-text-3">{t.friends.rankingHint}</span>
          </div>
          <Card className="p-0">
            <ol className="divide-y divide-border">
              {friends.map((f) => (
                <li key={f.publicCode} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm", f.isViewer && "bg-accent-soft/50")}>
                  <span className="w-6 font-semibold tabular">{f.position}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {f.displayName}
                    <span className="ml-2 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] text-link">{R.titles[f.title]}</span>
                  </span>
                  <span className="text-xs text-text-2 tabular">{formatDuration(f.platformSeconds)}</span>
                  <span className="w-16 text-right font-semibold tabular">{f.xp} XP</span>
                </li>
              ))}
            </ol>
            {friends.length === 1 && (
              <p className="px-4 py-3 text-xs text-text-3">
                {t.friends.addHint}{" "}
                <Link href="/perfil" className="text-link hover:underline">
                  {t.friends.goProfile}
                </Link>
              </p>
            )}
          </Card>
        </section>
      )}

      <section aria-label={R.projectRankingsTitle} className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="font-semibold">{R.projectRankingsTitle}</h2>
          <span className="text-xs text-text-3">{R.projectRankingsHint}</span>
        </div>
        {details.length === 0 ? (
          <Card className="text-center text-sm text-text-2">
            {R.noProjects}{" "}
            <Link href="/registro?modo=projetos" className="text-link hover:underline">
              {R.createProject}
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {details.map((p) => (
              <Card key={p.id} className="p-0">
                <Link
                  href={`/registro/projetos/${p.id}`}
                  className="flex items-center gap-2 border-b border-border px-4 py-3 hover:bg-surface-2"
                >
                  <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                  <span className="font-semibold">{p.name}</span>
                  <span className="ml-auto text-xs text-text-2">{P.membersCount(p.ranking.length)}</span>
                </Link>
                <ol className="divide-y divide-border">
                  {p.ranking.slice(0, 5).map((r) => (
                    <li key={r.userId} className={cx("flex items-center gap-3 px-4 py-2 text-sm", r.isViewer && "bg-accent-soft/50")}>
                      <span className="w-6 font-semibold tabular">{r.position}</span>
                      <span className="min-w-0 flex-1 truncate">{r.displayName}</span>
                      <span className="tabular">{formatDuration(r.seconds)}</span>
                    </li>
                  ))}
                  {(() => {
                    const me = p.ranking.find((r) => r.isViewer);
                    return me && me.position > 5 ? (
                      <li className="flex items-center gap-3 bg-accent-soft/50 px-4 py-2 text-sm">
                        <span className="w-6 font-semibold tabular">{me.position}</span>
                        <span className="min-w-0 flex-1 truncate">{me.displayName}</span>
                        <span className="tabular">{formatDuration(me.seconds)}</span>
                      </li>
                    ) : null;
                  })()}
                </ol>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
