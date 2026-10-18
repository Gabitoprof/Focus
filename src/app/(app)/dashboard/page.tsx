import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { RANGE_KEYS, formatDuration, type RangeKey } from "@/domain/time";
import { translateMessage } from "@/i18n/errors";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getActiveContext } from "@/server/services/profile";
import { getViewerAreaPositions, getViewerGlobalPosition } from "@/server/services/ranking";
import { listCorrectableSessions } from "@/server/services/corrections";
import { getDashboard } from "@/server/services/stats";
import { AutoRefresh } from "./auto-refresh";
import { CategoryBars, DailyChart } from "./charts";
import { CustomRange } from "./custom-range";
import { SessionCorrections } from "./session-corrections";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.dashboard };
}

export default async function DashboardPage(props: PageProps<"/dashboard">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader
        title={t.dashboard.title}
        description={t.dashboard.description}
        actions={
          <Link
            href="/retrospectiva"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink hover:opacity-90"
          >
            <span aria-hidden>✦</span>
            {t.retro.open}
          </Link>
        }
      />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/dashboard">["searchParams"] }) {
  const user = await requireUser();
  const { locale, t: d } = await getI18n();
  const D = d.dashboard;
  const sp = await searchParams;
  const raw = typeof sp.periodo === "string" ? sp.periodo : "7d";
  const key: RangeKey = (RANGE_KEYS as readonly string[]).includes(raw) ? (raw as RangeKey) : "7d";
  const from = typeof sp.de === "string" ? sp.de : undefined;
  const to = typeof sp.ate === "string" ? sp.ate : undefined;

  const context = await getActiveContext(await appCtx(), user.id);
  const academic = context === "academic";
  let data;
  let rangeError: string | null = null;
  try {
    data = await getDashboard(await appCtx(), user.id, { key, from, to }, context);
  } catch (e) {
    rangeError = translateMessage(e instanceof Error ? e.message : "Data inválida.", locale);
    data = await getDashboard(await appCtx(), user.id, { key: "7d" }, context);
  }
  // Rankings gerais só existem no contexto Acadêmico; nos outros, o painel mostra o banco de horas.
  // Pessoal também disputa o ranking acadêmico geral (pela área Acadêmica).
  const ranks = context !== "professional";
  const [position, areaPositions] = ranks
    ? await Promise.all([getViewerGlobalPosition(await appCtx(), user.id), getViewerAreaPositions(await appCtx(), user.id)])
    : [null, null];
  const correctable = await listCorrectableSessions(await appCtx(), user.id, context);
  const tot = data.totals;
  const p = data.period;
  const live = data.live;
  const empty = tot.sessions === 0 && !live;

  return (
    <div className="space-y-6">
      <AutoRefresh active={Boolean(live)} />
      {live && (
        <Link
          href="/estudar"
          className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-accent bg-accent-soft px-4 py-3 text-sm"
        >
          <span className="font-semibold text-link">
            {live.status === "paused" ? D.livePaused : live.overtimeSeconds > 0 ? D.liveOvertime : D.liveRunning}
          </span>
          <span>
            {live.categoryName} · <strong>{live.topicName}</strong>
          </span>
          <span className="text-text-2 tabular">
            {D.liveStudied(formatDuration(live.activeSeconds))}
            {live.overtimeSeconds > 0 && D.liveOvertimePart(formatDuration(live.overtimeSeconds))}
            {live.pausedSeconds > 0 && D.livePausedPart(formatDuration(live.pausedSeconds))}
          </span>
          <span className="ml-auto text-xs text-text-2">{D.liveIncluded}</span>
        </Link>
      )}
      {/* Gráfico no topo (logo abaixo da sessão em andamento); segue o período escolhido mais abaixo. */}
      {!empty && (
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">
            {data.perHour ? D.perHour : D.perDay} <span className="text-sm font-normal text-text-3">· {D.ranges[key]}</span>
          </h2>
          <p className="mb-4 text-xs text-text-2">{D.timezone(data.timezone)}</p>
          <DailyChart data={data.perDay} extra={data.perDayExtra} hourly={data.perHour} rangeStart={data.range.start} rangeEnd={data.range.end} timezone={data.timezone} />
        </Card>
        <Card>
          <div className="mb-5 grid grid-cols-2 gap-3">
            <Stat label={D.totalStudied} value={formatDuration(tot.allTimeSeconds)} />
            <Stat label={D.xp} value={d.user.xp(tot.xpBalance)} accent />
          </div>
          <h2 className="mb-4 font-semibold">{D.byCategory}</h2>
          {data.byCategory.length ? (
            <CategoryBars data={data.byCategory} />
          ) : (
            <p className="text-sm text-text-2">{D.noStudy}</p>
          )}
        </Card>
      </div>
      )}

      {empty ? (
        <Card className="text-center">
          <p className="font-medium">{D.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-2">{D.emptyText}</p>
          <Link href="/estudar" className="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
            {D.emptyCta}
          </Link>
        </Card>
      ) : (
        <>
          <nav aria-label={D.period} className="flex flex-wrap items-center gap-2">
            {RANGE_KEYS.filter((k) => k !== "custom").map((k) => (
              <Link
                key={k}
                href={`/dashboard?periodo=${k}`}
                aria-current={key === k ? "page" : undefined}
                className={cx(
                  "h-9 rounded-lg border px-3 text-sm leading-9",
                  key === k ? "border-accent bg-accent-soft font-medium text-link" : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                {D.ranges[k]}
              </Link>
            ))}
            <CustomRange active={key === "custom"} from={from} to={to} />
          </nav>
          {rangeError && <p className="text-sm text-danger">{D.rangeError(rangeError)}</p>}

          <section aria-label={D.summary} className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <Stat small label={D.studiedPeriod} value={formatDuration(p.studiedSeconds)} />
            <Stat small label={D.planned} value={formatDuration(p.plannedSeconds)} hint={D.endedSessions(p.sessions)} />
            <Stat small label={D.overtime} value={formatDuration(p.overtimeSeconds)} hint={D.overtimeHint} />
            <Stat small label={D.cycleXp} value={`+${p.xp}`} hint={D.cyclesCount(p.completedCycles)} />
            <Stat
              small
              label={D.pauses}
              value={formatDuration(p.pausedSeconds)}
              hint={p.pausedSessions ? D.pausesHint(p.pausedSessions) : D.noPauses}
            />
            <Stat
              small
              label={D.breaks}
              value={formatDuration(p.breaks.seconds)}
              hint={p.breaks.penalties ? D.breaksLate(p.breaks.penalties, p.breaks.penaltyXp) : D.breaksOk(p.breaks.count)}
            />
            <Stat small label={D.overrun} value={formatDuration(p.breaks.overrunSeconds)} hint={D.overrunHint(p.breaks.penalties)} />
          </section>

          {/* Score de foco do período: pontos pela qualidade do foco (detalhe de cada parte). */}
          <section aria-label={D.score.title} className="rounded-xl border border-border bg-surface p-4">
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3">
              <div>
                <p className="text-xs font-medium text-text-2">{D.score.title}</p>
                <p className={cx("mt-1 text-3xl font-semibold tabular", p.score.total < 0 ? "text-danger" : "text-link")}>{D.score.points(p.score.total)}</p>
              </div>
              <dl className="flex flex-wrap gap-2 text-xs">
                {(
                  [
                    ["planned", p.score.planned],
                    ["overtime", p.score.overtime],
                    ["cleanBreaks", p.score.cleanBreaks],
                    ["paused", p.score.paused],
                    ["breakOverrun", p.score.breakOverrun],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-surface-2 px-2.5 py-1.5">
                    <dt className="text-text-3">{D.score.parts[k]}</dt>
                    <dd className={cx("font-medium tabular", v > 0 ? "text-good" : v < 0 ? "text-danger" : "text-text-2")}>
                      {v > 0 ? `+${v}` : v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            <details className="mt-3 text-xs text-text-2">
              <summary className="cursor-pointer text-link">{D.score.howTitle}</summary>
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {D.score.how.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          </section>

          <section aria-label={D.overview} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat label={D.today} value={formatDuration(tot.todaySeconds)} />
            <Stat label={D.thisWeek} value={formatDuration(tot.weekSeconds)} />
            <Stat label={D.thisMonth} value={formatDuration(tot.monthSeconds)} />
            <Stat label={D.cycles} value={String(tot.completedCycles)} hint={D.sessionsTotal(tot.sessions)} />
            <Stat label={D.streak} value={d.common.days(tot.currentStreak)} hint={D.streakHint(d.common.days(tot.longestStreak))} />
            {!academic ? (
              <Link href="/ranking" className="rounded-xl border border-border bg-surface p-4 hover:border-accent">
                <p className="text-xs font-medium text-text-2">{D.hoursBank}</p>
                <p className="mt-1 text-2xl font-semibold tabular">{formatDuration(tot.allTimeSeconds)}</p>
                <p className="mt-0.5 text-xs text-text-3">{D.hoursBankHint(d.contexts.names[context])}</p>
              </Link>
            ) : (
            <Link href="/ranking" className="rounded-xl border border-border bg-surface p-4 hover:border-accent">
              <p className="text-xs font-medium text-text-2">{D.rankingPosition}</p>
              {position === null ? (
                <>
                  <p className="mt-1 text-2xl font-semibold text-link">{D.rankingPremium}</p>
                  <p className="mt-0.5 text-xs text-text-3">{D.rankingPremiumHint}</p>
                </>
              ) : position.position === null ? (
                <>
                  <p className="mt-1 text-2xl font-semibold">—</p>
                  <p className="mt-0.5 text-xs text-text-3">{D.rankingNone}</p>
                </>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-semibold tabular">{d.ranking.position(position.position)}</p>
                  <p className="mt-0.5 text-xs text-text-3">{D.rankingOf(position.participants)}</p>
                </>
              )}
            </Link>
            )}
          </section>

          {ranks && areaPositions && areaPositions.length > 0 && (
            <section aria-label={D.areasTitle} className="rounded-xl border border-border bg-surface p-4">
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-semibold">{D.areasTitle}</h2>
                <span className="text-xs text-text-3">{D.areasHint}</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {areaPositions.map((a) => (
                  <li key={a.areaId}>
                    <Link
                      href={`/ranking?escopo=filtro&area=${a.areaId}&periodo=semana`}
                      className="block rounded-lg bg-surface-2 p-3 hover:bg-accent-soft"
                    >
                      <p className="truncate text-xs text-text-2">{d.areas[a.areaId] ?? a.areaId}</p>
                      <p className="mt-0.5 text-lg font-semibold tabular">
                        {a.position ? d.ranking.position(a.position) : "—"}
                      </p>
                      <p className="text-xs text-text-3">
                        {a.position ? D.rankingOf(a.participants) : D.areaInsufficient(a.participants, a.minParticipants)}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Card>
            <h2 className="mb-4 font-semibold">{D.byTopic}</h2>
            {data.byCategory.length === 0 ? (
              <p className="text-sm text-text-2">{D.noStudy}</p>
            ) : (
              <div className="space-y-5">
                {data.byCategory.map((c) => (
                  <div key={c.id}>
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
                      <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: c.color }} />
                      {c.name}
                      <span className="font-normal text-text-2 tabular">· {formatDuration(c.seconds)}</span>
                    </h3>
                    <table className="w-full text-sm">
                      <thead className="sr-only">
                        <tr>
                          <th>{D.topicCol}</th>
                          <th>{D.timeCol}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {data.byTopic
                          .filter((tp) => tp.categoryId === c.id)
                          .map((tp) => (
                            <tr key={tp.id}>
                              <td className="py-1.5">{tp.name}</td>
                              <td className="py-1.5 text-right text-text-2 tabular">{formatDuration(tp.seconds)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
      <SessionCorrections
        sessions={correctable.map((s) => ({ ...s, startedAt: s.startedAt.toISOString() }))}
      />
    </div>
  );
}

function Stat({ label, value, hint, accent, small }: { label: string; value: string; hint?: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs font-medium text-text-2">{label}</p>
      <p className={cx("mt-1 font-semibold tabular", small ? "text-xl" : "text-2xl", accent && "text-link")}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-3">{hint}</p>}
    </div>
  );
}
