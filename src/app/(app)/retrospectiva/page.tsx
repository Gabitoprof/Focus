import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton, cx } from "@/components/ui";
import { RETRO_KINDS, changeVsPrevious, type Insight, type RetroKind } from "@/domain/retrospective";
import { formatDuration } from "@/domain/time";
import { INTL_LOCALE } from "@/i18n";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getActiveContext } from "@/server/services/profile";
import { getRetrospective } from "@/server/services/retrospective";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.retro.title };
}

export default async function RetrospectivePage(props: PageProps<"/retrospectiva">) {
  const { t } = await getI18n();
  return (
    <>
      <Link href="/dashboard" className="mb-4 inline-block text-sm text-link hover:underline">
        ← {t.retro.back}
      </Link>
      <PageHeader title={t.retro.title} description={t.retro.description} />
      <Suspense fallback={<Skeleton className="h-[600px]" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/retrospectiva">["searchParams"] }) {
  const user = await requireUser();
  const { t, locale } = await getI18n();
  const R = t.retro;
  const sp = await searchParams;
  const kind: RetroKind = (RETRO_KINDS as readonly string[]).includes(String(sp.periodo)) ? (sp.periodo as RetroKind) : "semana";
  const ctx = await appCtx();
  const context = await getActiveContext(ctx, user.id);
  const r = await getRetrospective(ctx, user.id, context, kind);
  const c = r.current;
  const change = changeVsPrevious(c.studied, r.previous.studied);
  const prevName = R.prevName[kind];
  const dayFmt = new Intl.DateTimeFormat(INTL_LOCALE[locale], { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const bestDay = c.bestDay ? dayFmt.format(new Date(`${c.bestDay.day}T00:00:00Z`)) : null;
  const maxHour = Math.max(...r.hourProfile, 1);

  const tabs = (
    <nav aria-label={R.title} className="inline-flex gap-1 rounded-xl border border-border bg-surface p-1">
      {RETRO_KINDS.map((k) => (
        <Link
          key={k}
          href={`/retrospectiva?periodo=${k}`}
          aria-current={kind === k ? "page" : undefined}
          className={cx("rounded-lg px-4 py-2 text-sm font-medium", kind === k ? "bg-accent text-accent-ink" : "text-text-2 hover:text-text")}
        >
          {R.kinds[k]}
        </Link>
      ))}
    </nav>
  );

  if (c.studied < 60) {
    return (
      <div className="space-y-6">
        {tabs}
        <Card className="text-center">
          <p className="font-medium">{R.emptyTitle}</p>
          <p className="mt-1 text-sm text-text-2">{R.emptyText}</p>
          <Link href="/estudar" className="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
            {R.emptyCta}
          </Link>
        </Card>
      </div>
    );
  }

  const text = (i: Insight) => {
    const I = R.insights;
    switch (i.code) {
      case "studiedUp":
        return I.studiedUp(i.pct);
      case "firstFocus":
        return I.firstFocus;
      case "consistency":
        return I.consistency(i.active, i.days);
      case "completion":
        return I.completion(i.cycles, i.sessions);
      case "cleanBreaks":
        return I.cleanBreaks(i.n);
      case "lowPauses":
        return I.lowPauses;
      case "studiedDown":
        return I.studiedDown(i.pct);
      case "lowConsistency":
        return I.lowConsistency(i.active, i.days, i.peakHour);
      case "highPauses":
        return I.highPauses(i.pct);
      case "lateBreaks":
        return I.lateBreaks(i.n, i.minutes);
      case "lowCompletion":
        return I.lowCompletion(i.cycles, i.sessions);
      case "highOvertime":
        return I.highOvertime(i.pct);
      case "noBreaks":
        return I.noBreaks(i.sessions);
      case "keepGoing":
        return I.keepGoing;
    }
  };

  const summary =
    R.summaryMain(formatDuration(c.studied), c.sessions) +
    (change !== null ? R.summaryChange(change, prevName) : "") +
    "." +
    (kind !== "dia" && bestDay && c.bestDay ? R.summaryBest(bestDay.charAt(0).toLowerCase() + bestDay.slice(1), formatDuration(c.bestDay.seconds)) : "") +
    (c.peakHour !== null ? R.summaryPeak(c.peakHour) : "");

  return (
    <div className="space-y-6">
      {tabs}

      {/* Capa: o número principal do período, como num "wrapped". */}
      <section className="theme-black relative overflow-hidden rounded-2xl p-6 sm:p-8" aria-label={R.hero[kind]}>
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent opacity-40 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 left-10 h-64 w-64 rounded-full bg-accent opacity-20 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-medium text-text-2">{R.hero[kind]}</p>
          <p className="mt-2 text-5xl font-semibold tracking-tight tabular sm:text-6xl">{formatDuration(c.studied)}</p>
          <p
            className={cx(
              "mt-3 inline-flex rounded-full px-3 py-1 text-sm font-medium",
              change === null ? "bg-surface-2 text-text-2" : change >= 0 ? "bg-good-soft text-good" : "bg-danger-soft text-danger",
            )}
          >
            {change === null ? R.noCompare : R.vsPrev(change, prevName)}
          </p>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-text">{summary}</p>
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kind !== "dia" && (
          <Card>
            <p className="text-xs font-medium text-text-2">{R.bestDay}</p>
            <p className="mt-1 text-lg font-semibold first-letter:uppercase">{bestDay ?? "—"}</p>
            <p className="text-sm text-text-2 tabular">{c.bestDay ? formatDuration(c.bestDay.seconds) : ""}</p>
            <p className="mt-2 text-xs text-text-3">{R.activeDays(c.activeDays, c.days)}</p>
          </Card>
        )}
        <Card>
          <p className="text-xs font-medium text-text-2">{R.peakHour}</p>
          <p className="mt-1 text-lg font-semibold tabular">{c.peakHour !== null ? R.peakValue(c.peakHour) : "—"}</p>
          {/* Mini perfil das 24 horas: a barra mais alta é o horário de pico. */}
          <div aria-hidden className="mt-3 flex h-12 items-end gap-px">
            {r.hourProfile.map((sec, h) => (
              <span
                key={h}
                className={cx("flex-1 rounded-t-sm", h === c.peakHour ? "bg-accent" : "bg-surface-2")}
                style={{ height: `${Math.max(4, (sec / maxHour) * 100)}%` }}
              />
            ))}
          </div>
          <div aria-hidden className="mt-1 flex justify-between text-[10px] text-text-3 tabular">
            <span>0h</span>
            <span>12h</span>
            <span>23h</span>
          </div>
        </Card>
        <Card>
          <p className="text-xs font-medium text-text-2">{R.where}</p>
          <p className="mt-2 text-xs text-text-3">{R.topCategory}</p>
          <p className="truncate font-semibold">{c.topCategory?.name ?? "—"}</p>
          <p className="text-xs text-text-2 tabular">{c.topCategory ? formatDuration(c.topCategory.seconds) : ""}</p>
          <p className="mt-2 text-xs text-text-3">{R.topTopic}</p>
          <p className="truncate font-semibold">{c.topTopic?.name ?? "—"}</p>
          <p className="text-xs text-text-2 tabular">{c.topTopic ? formatDuration(c.topTopic.seconds) : ""}</p>
        </Card>
        <Card>
          <p className="text-xs font-medium text-text-2">{R.discipline}</p>
          <p className="mt-1 text-lg font-semibold">{R.cycles(c.cycles, c.sessions)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-xs text-text-3">{R.score}</dt>
              <dd className="font-semibold text-link tabular">{c.score} pts</dd>
            </div>
            <div>
              <dt className="text-xs text-text-3">{R.xp}</dt>
              <dd className="font-semibold tabular">+{c.xp}</dd>
            </div>
          </dl>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">{R.highlights}</h2>
          {r.highlights.length ? (
            <ul className="space-y-2">
              {r.highlights.map((i) => (
                <li key={i.code} className="flex gap-2 text-sm">
                  <span aria-hidden className="mt-0.5 text-good">✓</span>
                  <span>{text(i)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-2">—</p>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">{R.improvements}</h2>
          <ul className="space-y-2">
            {r.improvements.map((i) => (
              <li key={i.code} className="flex gap-2 text-sm">
                <span aria-hidden className={cx("mt-0.5", i.code === "keepGoing" ? "text-good" : "text-warn")}>
                  {i.code === "keepGoing" ? "✓" : "→"}
                </span>
                <span>{text(i)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}
