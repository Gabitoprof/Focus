import { TZDate } from "@date-fns/tz";
import { addDays, addHours, format, startOfDay, startOfHour, startOfISOWeek, startOfMonth } from "date-fns";

export const RANGE_KEYS = ["today", "7d", "30d", "month", "custom"] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type Range = { start: Date; end: Date };

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Início do dia local (no fuso `tz`) de uma data no formato AAAA-MM-DD. */
export function localDayStart(day: string, tz: string): Date {
  if (!DAY_RE.test(day)) throw new Error("Data inválida.");
  const [y, m, d] = day.split("-").map(Number);
  return new Date(new TZDate(y, m - 1, d, tz).getTime());
}

export function localDayKey(date: Date, tz: string): string {
  return format(new TZDate(date.getTime(), tz), "yyyy-MM-dd");
}

/** Converte um filtro de período em instantes UTC, respeitando o fuso do usuário. */
export function resolveRange(key: RangeKey, tz: string, now: Date, from?: string, to?: string): Range {
  const local = new TZDate(now.getTime(), tz);
  const today = startOfDay(local);
  const at = (d: Date) => new Date(d.getTime());
  switch (key) {
    case "today":
      return { start: at(today), end: now };
    case "7d":
      return { start: at(addDays(today, -6)), end: now };
    case "30d":
      return { start: at(addDays(today, -29)), end: now };
    case "month":
      return { start: at(startOfMonth(local)), end: now };
    case "custom": {
      if (!from || !to) throw new Error("Informe as datas inicial e final.");
      const start = localDayStart(from, tz);
      const endDayStart = localDayStart(to, tz);
      if (endDayStart < start) throw new Error("A data final deve ser posterior à inicial.");
      const end = new Date(addDays(new TZDate(endDayStart.getTime(), tz), 1).getTime());
      return { start, end: end > now ? now : end };
    }
  }
}

export function weekRange(tz: string, now: Date): Range {
  return { start: new Date(startOfISOWeek(new TZDate(now.getTime(), tz)).getTime()), end: now };
}

/**
 * Distribui intervalos de tempo pelos dias locais do fuso `tz`, recortando no período.
 * Um estudo das 23:40 às 00:30 conta 20 min para um dia e 30 min para o seguinte.
 */
export function secondsByLocalDay(
  intervals: { start: Date; end: Date }[],
  tz: string,
  clip?: Range,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const it of intervals) {
    let start = it.start.getTime();
    let end = it.end.getTime();
    if (clip) {
      start = Math.max(start, clip.start.getTime());
      end = Math.min(end, clip.end.getTime());
    }
    while (start < end) {
      const nextMidnight = addDays(startOfDay(new TZDate(start, tz)), 1).getTime();
      const sliceEnd = Math.min(end, nextMidnight);
      const key = localDayKey(new Date(start), tz);
      out.set(key, (out.get(key) ?? 0) + (sliceEnd - start) / 1000);
      start = sliceEnd;
    }
  }
  for (const [k, v] of out) out.set(k, Math.floor(v));
  return out;
}

/** Hora local (0–23) de um instante, no fuso `tz`. */
export function localHour(date: Date, tz: string): number {
  return new TZDate(date.getTime(), tz).getHours();
}

/**
 * Como `secondsByLocalDay`, mas por hora local (0–23), para o gráfico de "Hoje".
 * Um estudo das 14:40 às 15:20 conta 20 min para as 14h e 20 min para as 15h.
 */
export function secondsByLocalHour(intervals: { start: Date; end: Date }[], tz: string, clip?: Range): Map<number, number> {
  const out = new Map<number, number>();
  for (const it of intervals) {
    let start = it.start.getTime();
    let end = it.end.getTime();
    if (clip) {
      start = Math.max(start, clip.start.getTime());
      end = Math.min(end, clip.end.getTime());
    }
    while (start < end) {
      const nextHour = addHours(startOfHour(new TZDate(start, tz)), 1).getTime();
      const sliceEnd = Math.min(end, nextHour);
      const h = localHour(new Date(start), tz);
      out.set(h, (out.get(h) ?? 0) + (sliceEnd - start) / 1000);
      start = sliceEnd;
    }
  }
  for (const [k, v] of out) out.set(k, Math.floor(v));
  return out;
}

export function clippedSeconds(start: Date, end: Date, clip: Range): number {
  const s = Math.max(start.getTime(), clip.start.getTime());
  const e = Math.min(end.getTime(), clip.end.getTime());
  return e > s ? (e - s) / 1000 : 0;
}

/** Sequência atual e maior sequência de dias (AAAA-MM-DD) consecutivos. */
export function computeStreaks(days: string[], todayKey: string): { current: number; longest: number } {
  const set = new Set(days);
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    run = prev && nextDayKey(prev) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  // A sequência atual continua viva se o usuário estudou hoje ou ontem.
  let cursor = set.has(todayKey) ? todayKey : prevDayKey(todayKey);
  let current = 0;
  while (set.has(cursor)) {
    current++;
    cursor = prevDayKey(cursor);
  }
  return { current, longest };
}

function shiftDayKey(key: string, delta: number) {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return dt.toISOString().slice(0, 10);
}
const nextDayKey = (k: string) => shiftDayKey(k, 1);
const prevDayKey = (k: string) => shiftDayKey(k, -1);

/** Formata segundos como "5h30" / "45min". */
export function formatDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Formata segundos como relógio "MM:SS" ou "H:MM:SS". */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
