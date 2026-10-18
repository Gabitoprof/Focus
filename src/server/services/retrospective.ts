import { TZDate } from "@date-fns/tz";
import { addDays, addMonths, addYears, format, startOfISOWeek, startOfMonth, startOfYear } from "date-fns";
import type { AppContext } from "@/domain/contexts";
import { buildInsights, type RetroKind, type RetroSummary } from "@/domain/retrospective";
import { profiles } from "../db/schema";
import { eq } from "drizzle-orm";
import type { Ctx } from "./common";
import { getDashboard } from "./stats";

type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
const ymd = (d: Date) => format(d, "yyyy-MM-dd");

/**
 * Períodos (datas locais AAAA-MM-DD): o atual, até hoje, e o anterior **no mesmo trecho**
 * (ex.: mês até o dia 17 × mês passado até o dia 17), para a comparação ser justa.
 */
export function retroRanges(kind: RetroKind, tz: string, now: Date) {
  const today = new TZDate(now.getTime(), tz);
  // Mesmo número de dias desde o início do período, sem passar do fim do período anterior.
  const sameSpan = (start: Date, prevStart: Date) => {
    // Diferença de datas locais (AAAA-MM-DD lidas em UTC): independe do fuso do servidor.
    const elapsed = Math.round((Date.parse(ymd(today)) - Date.parse(ymd(start))) / 86_400_000);
    const prevEnd = addDays(start, -1);
    const to = addDays(prevStart, elapsed);
    return { from: ymd(prevStart), to: ymd(to > prevEnd ? prevEnd : to) };
  };
  switch (kind) {
    case "dia":
      return { cur: { from: ymd(today), to: ymd(today) }, prev: { from: ymd(addDays(today, -1)), to: ymd(addDays(today, -1)) } };
    case "semana": {
      const start = startOfISOWeek(today);
      return { cur: { from: ymd(start), to: ymd(today) }, prev: sameSpan(start, addDays(start, -7)) };
    }
    case "mes": {
      const start = startOfMonth(today);
      return { cur: { from: ymd(start), to: ymd(today) }, prev: sameSpan(start, addMonths(start, -1)) };
    }
    case "ano": {
      const start = startOfYear(today);
      return { cur: { from: ymd(start), to: ymd(today) }, prev: sameSpan(start, addYears(start, -1)) };
    }
  }
}

function summarize(d: Dashboard): RetroSummary {
  const p = d.period;
  const days = Math.max(1, Math.round((Date.parse(d.range.end) - Date.parse(d.range.start)) / 86_400_000) || 1);
  const best = d.perDay.reduce<{ day: string; seconds: number } | null>((b, x) => (x.seconds > (b?.seconds ?? 0) ? x : b), null);
  const peak = d.hourProfile.reduce((b, s, h) => (s > (d.hourProfile[b] ?? 0) ? h : b), 0);
  const top = <T extends { name: string; seconds: number }>(xs: T[]) => (xs[0] ? { name: xs[0].name, seconds: xs[0].seconds } : null);
  return {
    studied: p.studiedSeconds,
    planned: p.plannedSeconds,
    overtime: p.overtimeSeconds,
    paused: p.pausedSeconds,
    sessions: p.sessions,
    cycles: p.completedCycles,
    xp: p.xp,
    score: p.score.total,
    breaks: p.breaks.count,
    cleanBreaks: Math.round(p.score.cleanBreaks / 5),
    lateBreaks: p.breaks.penalties,
    overrun: p.breaks.overrunSeconds,
    activeDays: d.perDay.filter((x) => x.seconds >= 60).length,
    days,
    bestDay: best && best.seconds >= 60 ? best : null,
    peakHour: (d.hourProfile[peak] ?? 0) >= 60 ? peak : null,
    topCategory: top(d.byCategory),
    topTopic: top(d.byTopic),
  };
}

/**
 * Retrospectiva de um período (dia, semana, mês ou ano) comparada ao período anterior.
 * Reaproveita os cálculos do Painel (as mesmas regras de horas, pausas, intervalos e score).
 */
export async function getRetrospective(ctx: Ctx, userId: string, context: AppContext, kind: RetroKind) {
  const [profile] = await ctx.db.select({ tz: profiles.timezone }).from(profiles).where(eq(profiles.userId, userId));
  const tz = profile?.tz ?? "America/Sao_Paulo";
  const r = retroRanges(kind, tz, ctx.now());
  const [cur, prev] = await Promise.all([
    getDashboard(ctx, userId, { key: "custom", from: r.cur.from, to: r.cur.to }, context),
    getDashboard(ctx, userId, { key: "custom", from: r.prev.from, to: r.prev.to }, context),
  ]);
  const current = summarize(cur);
  const previous = summarize(prev);
  return {
    kind,
    timezone: tz,
    range: r,
    current,
    previous,
    hourProfile: cur.hourProfile,
    perDay: cur.perDay,
    ...buildInsights(current, previous),
  };
}
