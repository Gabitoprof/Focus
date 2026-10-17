"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { Area, CartesianGrid, ComposedChart, LabelList, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration, localDayKey } from "@/domain/time";
import { INTL_LOCALE } from "@/i18n";
import { useI18n } from "@/i18n/client";

const axisTick = { fill: "var(--text-2)", fontSize: 12 };

type SeriesKey = "studied" | "planned" | "overtime" | "paused" | "breaks";
type Row = { day: string; label: string; short: string } & Record<SeriesKey, number>;

/**
 * Linhas do gráfico. Cores validadas (daltonismo e contraste) nos temas claro e escuro: só três
 * matizes; "planejado" usa o azul do estudado tracejado (é a meta do mesmo tempo) e "pausas" o cinza.
 */
const SERIES: { key: SeriesKey; color: string; dash?: string }[] = [
  { key: "studied", color: "var(--chart-1)" },
  { key: "planned", color: "var(--chart-1)", dash: "6 4" },
  { key: "overtime", color: "var(--chart-2)" },
  { key: "breaks", color: "var(--chart-3)" },
  { key: "paused", color: "var(--text-3)", dash: "2 3" },
];
const STORAGE_KEY = "focus.dailyChart.series";
const subscribeStorage = (cb: () => void) => {
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
};
const readStorage = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

function ChartTooltip({
  active,
  payload,
  names,
}: {
  active?: boolean;
  payload?: { dataKey: SeriesKey; value: number; color: string; payload: Row }[];
  names: Record<SeriesKey, string>;
}) {
  if (!active || !payload?.length) return null;
  const seen = new Set<SeriesKey>();
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="mb-1 font-medium">{payload[0].payload.label}</p>
      {payload
        .filter((p) => !seen.has(p.dataKey) && seen.add(p.dataKey))
        .map((p) => (
          <p key={p.dataKey} className="flex items-center gap-2 text-text-2 tabular">
            <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: SERIES.find((s) => s.key === p.dataKey)?.color }} />
            <span className="mr-auto">{names[p.dataKey]}</span>
            <span className="text-text">{formatDuration(p.value * 60)}</span>
          </p>
        ))}
    </div>
  );
}

/** Minutos por dia: estudado (com área) e, à escolha, planejado, excedente, pausas e intervalos. */
export function DailyChart({
  data,
  extra,
  hourly = null,
  rangeStart,
  rangeEnd,
  timezone,
}: {
  data: { day: string; seconds: number }[];
  extra: { day: string; planned: number; overtime: number; paused: number; breaks: number }[];
  /** Só no filtro "Hoje": minutos hora a hora. */
  hourly?: { hour: number; studied: number; planned: number; overtime: number; paused: number; breaks: number }[] | null;
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
}) {
  const { locale, t } = useI18n();
  const D = t.dashboard;
  // Lembra a escolha de linhas neste navegador (conveniência; sem armazenamento, volta ao padrão).
  const saved = useSyncExternalStore(subscribeStorage, readStorage, () => null);
  const [picked, setPicked] = useState<SeriesKey[] | null>(null);
  const shown = useMemo<SeriesKey[]>(() => {
    if (picked) return picked;
    try {
      const v = JSON.parse(saved ?? "null");
      const keys = Array.isArray(v) ? v.filter((k): k is SeriesKey => SERIES.some((s) => s.key === k)) : [];
      if (keys.length) return keys;
    } catch {}
    return ["studied"];
  }, [picked, saved]);
  const toggle = (k: SeriesKey) => {
    const next = shown.includes(k) ? shown.filter((x) => x !== k) : [...shown, k];
    if (!next.length) return; // pelo menos uma linha
    setPicked(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  const rows = useMemo(() => {
    const min = (s: number | undefined) => Math.round((s ?? 0) / 60);
    // "Hoje": o dia hora a hora (um ponto só não forma linha).
    if (hourly) {
      return hourly.map((h): Row => {
        const hh = `${String(h.hour).padStart(2, "0")}h`;
        return {
          day: hh,
          label: `${String(h.hour).padStart(2, "0")}:00–${String(h.hour).padStart(2, "0")}:59`,
          short: hh,
          studied: min(h.studied),
          planned: min(h.planned),
          overtime: min(h.overtime),
          paused: min(h.paused),
          breaks: min(h.breaks),
        };
      });
    }
    const byDay = new Map(data.map((d) => [d.day, d.seconds]));
    const extraByDay = new Map(extra.map((d) => [d.day, d]));
    const out: Row[] = [];
    const end = Date.parse(rangeEnd);
    const seen = new Set<string>();
    // Datas no formato do idioma (dd/mm em português/espanhol, mm/dd em inglês).
    const fmtLong = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
    const fmtShort = new Intl.DateTimeFormat(INTL_LOCALE[locale], { day: "2-digit", month: "2-digit", timeZone: "UTC" });
    for (let ms = Date.parse(rangeStart); ms < end && out.length < 400; ms += 6 * 3600_000) {
      const key = localDayKey(new Date(ms), timezone);
      if (seen.has(key)) continue;
      seen.add(key);
      const [y, m, d] = key.split("-").map(Number);
      const date = new Date(Date.UTC(y, m - 1, d));
      const x = extraByDay.get(key);
      out.push({
        day: key,
        label: fmtLong.format(date),
        short: fmtShort.format(date),
        studied: min(byDay.get(key)),
        planned: min(x?.planned),
        overtime: min(x?.overtime),
        paused: min(x?.paused),
        breaks: min(x?.breaks),
      });
    }
    return out;
  }, [data, extra, hourly, rangeStart, rangeEnd, timezone, locale]);

  // Rótulos nos pontos só com a linha "estudado" sozinha (com várias linhas, a dica ao passar o mouse
  // mostra todos os valores). Até 10 dias, em todos os pontos; senão, no maior e no último.
  const onlyStudied = shown.length === 1 && shown[0] === "studied";
  const labeled = useMemo(() => {
    if (!onlyStudied) return new Set<number>();
    if (rows.length <= 10) return new Set(rows.map((_, i) => i).filter((i) => rows[i].studied > 0));
    let max = 0;
    rows.forEach((r, i) => {
      if (r.studied > rows[max].studied) max = i;
    });
    return new Set([max, rows.length - 1].filter((i) => rows[i].studied > 0));
  }, [rows, onlyStudied]);
  const dots = rows.length <= 14;
  const visible = SERIES.filter((s) => shown.includes(s.key));

  return (
    <div className="space-y-3">
      <fieldset className="flex flex-wrap gap-1.5">
        <legend className="sr-only">{D.chartPick}</legend>
        {SERIES.map((s) => {
          const on = shown.includes(s.key);
          return (
            <label
              key={s.key}
              className={
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs " +
                (on ? "border-text-3 bg-surface-2 text-text" : "border-border text-text-3 hover:text-text-2")
              }
            >
              <input type="checkbox" className="sr-only" checked={on} onChange={() => toggle(s.key)} />
              <svg aria-hidden width="16" height="6" className={on ? "" : "opacity-40"}>
                <line x1="1" y1="3" x2="15" y2="3" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={s.dash} />
              </svg>
              {D.chartSeries[s.key]}
            </label>
          );
        })}
      </fieldset>
      <div className="h-64" role="img" aria-label={D.chartLabel(rows.map((r) => `${r.short} ${r.studied} min`).join(", "))}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 24, right: 20, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="daily-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="short" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={12} />
            <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
            <Tooltip content={<ChartTooltip names={D.chartSeries} />} cursor={{ stroke: "var(--text-3)", strokeDasharray: "3 3" }} />
            {visible.map((s) =>
              s.key === "studied" ? (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey="studied"
                  stroke={s.color}
                  strokeWidth={2}
                  fill="url(#daily-fill)"
                  dot={dots ? { r: 4, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 } : false}
                  activeDot={{ r: 6, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey="studied"
                    content={({ x, y, value, index }) =>
                      typeof index === "number" && labeled.has(index) ? (
                        <text x={Number(x)} y={Number(y) - 12} textAnchor="middle" fill="var(--text-2)" fontSize={11} className="tabular">
                          {formatDuration(Number(value) * 60)}
                        </text>
                      ) : null
                    }
                  />
                </Area>
              ) : (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.color}
                  strokeWidth={2}
                  strokeDasharray={s.dash}
                  dot={dots ? { r: 3, fill: s.color, stroke: "var(--surface)", strokeWidth: 1.5 } : false}
                  activeDot={{ r: 5, fill: s.color, stroke: "var(--surface)", strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {shown.some((k) => k === "planned" || k === "overtime" || k === "paused") && <p className="text-xs text-text-3">{hourly ? D.chartSeriesHintHour : D.chartSeriesHint}</p>}
    </div>
  );
}

/** Tempo por categoria: barras horizontais com rótulo direto (cor = identidade da categoria). */
export function CategoryBars({ data }: { data: { id: string; name: string; color: string; seconds: number }[] }) {
  const max = Math.max(...data.map((d) => d.seconds), 1);
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.id}>
          <div className="mb-1 flex justify-between gap-2 text-sm">
            <span className="truncate">{d.name}</span>
            <span className="shrink-0 text-text-2 tabular">{formatDuration(d.seconds)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-2" aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (d.seconds / max) * 100)}%`, background: d.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
