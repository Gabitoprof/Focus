"use client";

import { useMemo } from "react";
import { Area, AreaChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDuration, localDayKey } from "@/domain/time";
import { INTL_LOCALE } from "@/i18n";
import { useI18n } from "@/i18n/client";

const axisTick = { fill: "var(--text-2)", fontSize: 12 };

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; payload: { label?: string } }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium">{payload[0].payload.label ?? label}</p>
      <p className="text-text-2 tabular">{formatDuration(payload[0].value * 60)}</p>
    </div>
  );
}

/** Minutos por dia (série única). Dias sem estudo aparecem como zero. */
export function DailyChart({
  data,
  rangeStart,
  rangeEnd,
  timezone,
}: {
  data: { day: string; seconds: number }[];
  rangeStart: string;
  rangeEnd: string;
  timezone: string;
}) {
  const { locale, t } = useI18n();
  const rows = useMemo(() => {
    const byDay = new Map(data.map((d) => [d.day, d.seconds]));
    const out: { day: string; label: string; short: string; minutes: number }[] = [];
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
      out.push({ day: key, label: fmtLong.format(date), short: fmtShort.format(date), minutes: Math.round((byDay.get(key) ?? 0) / 60) });
    }
    return out;
  }, [data, rangeStart, rangeEnd, timezone, locale]);

  // Rótulo em todos os pontos só quando cabem (até 10 dias); senão, só o maior e o último.
  const labeled = useMemo(() => {
    if (rows.length <= 10) return new Set(rows.map((_, i) => i).filter((i) => rows[i].minutes > 0));
    let max = 0;
    rows.forEach((r, i) => {
      if (r.minutes > rows[max].minutes) max = i;
    });
    return new Set([max, rows.length - 1].filter((i) => rows[i].minutes > 0));
  }, [rows]);

  return (
    <div className="h-64" role="img" aria-label={t.dashboard.chartLabel(rows.map((r) => `${r.short} ${r.minutes} min`).join(", "))}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 24, right: 20, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="daily-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.45} />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="short" tick={axisTick} tickLine={false} axisLine={{ stroke: "var(--border)" }} minTickGap={12} />
          <YAxis tick={axisTick} tickLine={false} axisLine={false} allowDecimals={false} width={48} />
          <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--text-3)", strokeDasharray: "3 3" }} />
          <Area
            type="monotone"
            dataKey="minutes"
            stroke="var(--accent)"
            strokeWidth={2}
            fill="url(#daily-fill)"
            dot={rows.length <= 14 ? { r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 } : false}
            activeDot={{ r: 6, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="minutes"
              content={({ x, y, value, index }) =>
                typeof index === "number" && labeled.has(index) ? (
                  <text x={Number(x)} y={Number(y) - 12} textAnchor="middle" fill="var(--text-2)" fontSize={11} className="tabular">
                    {formatDuration(Number(value) * 60)}
                  </text>
                ) : null
              }
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
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

