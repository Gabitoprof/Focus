import Link from "next/link";
import { cx } from "@/components/ui";
import { addDays, daysBetween, type Schedule, type TaskStatus } from "@/domain/schedule";
import { formatDuration } from "@/domain/time";
import type { Dict } from "@/i18n";

const ROW = 44;
const HEAD = 40;

/** Cores pelo tema (claro/escuro) da plataforma. */
const BAR: Record<TaskStatus, { fill: string; stroke: string; progress: string; dashed: boolean }> = {
  done: { fill: "var(--color-accent)", stroke: "var(--color-accent)", progress: "var(--color-accent)", dashed: false },
  ontrack: { fill: "var(--color-accent-soft)", stroke: "var(--color-accent)", progress: "var(--color-accent)", dashed: true },
  late: { fill: "var(--color-danger-soft)", stroke: "var(--color-danger)", progress: "var(--color-danger)", dashed: true },
  todo: { fill: "var(--color-surface-2)", stroke: "var(--color-text-3)", progress: "var(--color-text-3)", dashed: true },
};

type Line =
  | { kind: "milestone"; label: string; date: string }
  | Schedule["rows"][number];

/**
 * Gráfico de Gantt do projeto (estilo aprovado): fases agrupando tarefas, setas de dependência,
 * parte feita sólida e restante tracejada, marcos de início/entrega e a linha de hoje.
 */
export function ScheduleChart({
  schedule,
  today,
  scale,
  locale,
  d,
  scaleHref,
}: {
  schedule: Schedule;
  today: string;
  scale: "semana" | "mes";
  locale: string;
  d: Dict;
  scaleHref: (s: "semana" | "mes") => string;
}) {
  const S = d.schedule;
  const ppd = scale === "semana" ? 22 : 7;
  const { start, end } = schedule.range;
  const days = daysBetween(start, end) + 1;
  const width = days * ppd;
  const x = (date: string) => daysBetween(start, date) * ppd;
  const fmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const fmtMonth = new Intl.DateTimeFormat(locale, { month: "short", year: "2-digit", timeZone: "UTC" });
  const short = (date: string) => fmt.format(new Date(`${date}T00:00:00Z`));

  const lines: Line[] = [
    ...(schedule.milestones.start ? [{ kind: "milestone" as const, label: S.start, date: schedule.milestones.start }] : []),
    ...schedule.rows,
    ...(schedule.milestones.end ? [{ kind: "milestone" as const, label: S.end(short(schedule.milestones.end)), date: schedule.milestones.end }] : []),
  ];
  const height = HEAD + lines.length * ROW + 8;

  // Colunas: semanas (segunda-feira) ou meses.
  const columns: { at: string; label: string }[] = [];
  if (scale === "semana") {
    const dow = new Date(`${start}T00:00:00Z`).getUTCDay();
    let cur = addDays(start, (8 - dow) % 7);
    if (cur > start) columns.push({ at: start, label: short(start) });
    for (; cur <= end; cur = addDays(cur, 7)) columns.push({ at: cur, label: short(cur) });
  } else {
    columns.push({ at: start, label: fmtMonth.format(new Date(`${start}T00:00:00Z`)) });
    let [yy, mm] = start.split("-").map(Number);
    for (;;) {
      mm++;
      if (mm > 12) {
        mm = 1;
        yy++;
      }
      const at = `${yy}-${String(mm).padStart(2, "0")}-01`;
      if (at > end) break;
      columns.push({ at, label: fmtMonth.format(new Date(`${at}T00:00:00Z`)) });
    }
  }

  const rowY = (i: number) => HEAD + i * ROW;
  const indexOf = new Map<string, number>();
  lines.forEach((l, i) => {
    if (l.kind === "task") indexOf.set(l.id, i);
  });
  const statusLabel: Record<TaskStatus, string> = { done: S.done, ontrack: S.ontrack, late: S.late, todo: S.todo };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="mr-auto text-sm text-text-2">
          {S.summary(schedule.counts.total, schedule.counts.done)}
          {schedule.counts.late > 0 && <span className="ml-2 font-medium text-danger">{S.lateCount(schedule.counts.late)}</span>}
        </p>
        <nav className="inline-flex gap-1 rounded-lg border border-border bg-surface p-1 text-sm" aria-label={S.scale}>
          {(["semana", "mes"] as const).map((k) => (
            <Link
              key={k}
              href={scaleHref(k)}
              aria-current={scale === k ? "page" : undefined}
              className={cx("rounded-md px-3 py-1", scale === k ? "bg-accent text-accent-ink" : "text-text-2 hover:text-text")}
            >
              {k === "semana" ? S.weeks : S.months}
            </Link>
          ))}
        </nav>
      </div>

      {schedule.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-2">{S.empty}</div>
      ) : (
        <div className="flex overflow-hidden rounded-xl border border-border bg-surface">
          {/* Tabela à esquerda */}
          <div className="w-72 shrink-0 border-r border-border text-sm">
            <div className="flex items-center gap-2 border-b border-border px-3 text-xs font-medium text-text-2" style={{ height: HEAD }}>
              <span className="flex-1">{S.task}</span>
              <span className="w-10 text-right">%</span>
            </div>
            {lines.map((l, i) => (
              <div key={i} className="flex items-center gap-2 px-3" style={{ height: ROW }}>
                {l.kind === "milestone" ? (
                  <span className="flex-1 truncate text-xs font-semibold text-text-2">◆ {l.label}</span>
                ) : l.kind === "phase" ? (
                  <>
                    <span className="flex-1 truncate font-semibold">{l.name}</span>
                    <span className={cx("w-10 text-right text-xs font-semibold tabular", l.late ? "text-danger" : "text-text-2")}>
                      {Math.round(l.progress * 100)}%
                    </span>
                  </>
                ) : (
                  <>
                    <span className={cx("min-w-0 flex-1", l.phase ? "pl-4" : "")}>
                      <span className={cx("block truncate", l.status === "done" && "text-text-2")}>{l.title}</span>
                      <span className="block truncate text-[11px] text-text-3">{l.assigneeName ?? S.noAssignee}</span>
                    </span>
                    <span className={cx("w-10 text-right text-xs font-semibold tabular", l.status === "late" ? "text-danger" : "text-text-2")}>
                      {Math.round(l.progress * 100)}%
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Linha do tempo */}
          <div className="min-w-0 flex-1 overflow-x-auto">
            <svg width={width} height={height} role="img" aria-label={S.chartLabel} className="block">
              <defs>
                <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" style={{ fill: "var(--color-text-3)" }} />
                </marker>
              </defs>
              {columns.map((c, i) => {
                const cx0 = x(c.at);
                const next = columns[i + 1] ? x(columns[i + 1].at) : width;
                return (
                  <g key={c.at}>
                    {i % 2 === 1 && <rect x={cx0} y={HEAD} width={next - cx0} height={height - HEAD} style={{ fill: "var(--color-surface-2)" }} opacity={0.6} />}
                    <line x1={cx0} x2={cx0} y1={0} y2={height} style={{ stroke: "var(--color-border)" }} />
                    <text x={cx0 + 6} y={25} fontSize={11} style={{ fill: "var(--color-text-2)" }}>
                      {c.label}
                    </text>
                  </g>
                );
              })}
              <line x1={0} x2={width} y1={HEAD} y2={HEAD} style={{ stroke: "var(--color-border)" }} />

              {/* Setas de dependência */}
              {lines.map((l, i) =>
                l.kind === "task"
                  ? l.dependsOn.map((dep) => {
                      const j = indexOf.get(dep);
                      if (j == null) return null;
                      const from = lines[j];
                      if (from.kind !== "task") return null;
                      const x1 = x(addDays(from.dueDate, 1));
                      const y1 = rowY(j) + ROW / 2;
                      const x2 = x(l.startDate);
                      const y2 = rowY(i) + ROW / 2;
                      const path =
                        x2 - x1 >= 16
                          ? `M${x1},${y1} H${x1 + 8} V${y2} H${x2 - 2}`
                          : `M${x1},${y1} H${x1 + 8} V${(y1 + y2) / 2} H${x2 - 12} V${y2} H${x2 - 2}`;
                      return <path key={`${dep}-${l.id}`} d={path} fill="none" strokeWidth={1.5} style={{ stroke: "var(--color-text-3)" }} markerEnd="url(#dep-arrow)" />;
                    })
                  : null,
              )}

              {lines.map((l, i) => {
                const y = rowY(i);
                if (l.kind === "milestone") {
                  const mx = x(l.date) + ppd / 2;
                  return (
                    <g key={i}>
                      <title>{`${l.label} · ${short(l.date)}`}</title>
                      <rect x={mx - 8} y={y + ROW / 2 - 8} width={16} height={16} transform={`rotate(45 ${mx} ${y + ROW / 2})`} style={{ fill: "var(--color-link)" }} />
                    </g>
                  );
                }
                if (l.kind === "phase") {
                  const bx = x(l.start);
                  const bw = (daysBetween(l.start, l.end) + 1) * ppd;
                  return (
                    <g key={i}>
                      <title>{`${l.name} · ${short(l.start)}–${short(l.end)} · ${Math.round(l.progress * 100)}%`}</title>
                      <rect x={bx} y={y + 16} width={bw} height={12} rx={4} style={{ fill: l.late ? "var(--color-danger)" : "var(--color-accent)" }} opacity={0.35} />
                      <rect x={bx} y={y + 16} width={bw * l.progress} height={12} rx={4} style={{ fill: l.late ? "var(--color-danger)" : "var(--color-accent)" }} />
                    </g>
                  );
                }
                const c = BAR[l.status];
                const bx = x(l.startDate);
                const bw = (daysBetween(l.startDate, l.dueDate) + 1) * ppd;
                const hours = `${formatDuration(l.seconds)}${l.targetMinutes ? ` ${S.of} ${formatDuration(l.targetMinutes * 60)}` : ""}`;
                return (
                  <g key={i}>
                    <title>{`${l.title} · ${short(l.startDate)}–${short(l.dueDate)} · ${hours} · ${statusLabel[l.status]}`}</title>
                    <rect
                      x={bx}
                      y={y + 10}
                      width={bw}
                      height={24}
                      rx={6}
                      strokeWidth={1.2}
                      strokeDasharray={c.dashed ? "5 4" : undefined}
                      style={{ fill: c.fill, stroke: c.stroke }}
                    />
                    {l.progress > 0 && l.status !== "done" && (
                      <rect x={bx} y={y + 10} width={Math.max(6, bw * l.progress)} height={24} rx={6} style={{ fill: c.progress }} />
                    )}
                  </g>
                );
              })}

              {today >= start && today <= end && (
                <g>
                  <line x1={x(today) + ppd / 2} x2={x(today) + ppd / 2} y1={HEAD - 6} y2={height} strokeWidth={2} strokeDasharray="6 4" style={{ stroke: "var(--color-danger)" }} />
                  <rect x={x(today) + ppd / 2 - 22} y={4} width={44} height={16} rx={8} style={{ fill: "var(--color-danger)" }} />
                  <text x={x(today) + ppd / 2} y={15.5} fontSize={10} fontWeight={700} textAnchor="middle" fill="#fff">
                    {S.today}
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      )}

      <ul className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-text-2">
        {(["done", "ontrack", "late", "todo"] as const).map((k) => (
          <li key={k} className="flex items-center gap-2">
            <span className="inline-block h-3 w-6 rounded" style={{ background: BAR[k].progress, border: `1px dashed ${BAR[k].stroke}` }} />
            {statusLabel[k]}
          </li>
        ))}
        <li className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rotate-45 bg-link" />
          {S.milestone}
        </li>
      </ul>
      <p className="text-xs text-text-3">{S.legendHint}</p>

      {schedule.unscheduled.length > 0 && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm font-medium">{S.unscheduledTitle(schedule.unscheduled.length)}</p>
          <p className="mb-2 text-xs text-text-2">{S.unscheduledHint}</p>
          <ul className="flex flex-wrap gap-2 text-xs">
            {schedule.unscheduled.map((t) => (
              <li key={t.id} className="rounded-full bg-surface-2 px-2.5 py-1">
                {t.title}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
