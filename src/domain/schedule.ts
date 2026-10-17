/**
 * Cronograma (gráfico de Gantt) de um projeto: tarefas com início e prazo, agrupadas por fase,
 * com dependências e progresso pelas horas registradas ÷ horas previstas.
 */
export type ScheduleTask = {
  id: string;
  title: string;
  phase: string | null;
  startDate: string | null;
  dueDate: string | null;
  targetMinutes: number | null;
  seconds: number;
  done: boolean;
  assigneeName: string | null;
  dependsOn: string[];
};

export type TaskStatus = "done" | "ontrack" | "late" | "todo";

export type ScheduleRow =
  | { kind: "phase"; name: string; start: string; end: string; progress: number; late: boolean }
  | ({ kind: "task"; status: TaskStatus; progress: number } & ScheduleTask & { startDate: string; dueDate: string });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && DATE_RE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Dias entre duas datas AAAA-MM-DD (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Progresso pelas horas: concluída = 100%; sem horas previstas = 0% até concluir. */
export function taskProgress(t: Pick<ScheduleTask, "done" | "targetMinutes" | "seconds">): number {
  if (t.done) return 1;
  if (!t.targetMinutes) return 0;
  return Math.min(1, t.seconds / (t.targetMinutes * 60));
}

/**
 * Situação da tarefa hoje:
 * - concluída;
 * - atrasada: o prazo passou sem concluir, ou o ritmo está muito abaixo do esperado
 *   (mais de 30 pontos atrás do tempo já decorrido);
 * - em dia: já começou (ou já tem horas);
 * - não iniciada.
 */
export function taskStatus(t: ScheduleTask & { startDate: string; dueDate: string }, today: string): TaskStatus {
  if (t.done) return "done";
  const progress = taskProgress(t);
  if (today > t.dueDate) return "late";
  if (today >= t.startDate && t.targetMinutes) {
    const span = Math.max(1, daysBetween(t.startDate, t.dueDate) + 1);
    const expected = Math.min(1, (daysBetween(t.startDate, today) + 1) / span);
    if (expected - progress > 0.3) return "late";
  }
  return today >= t.startDate || progress > 0 ? "ontrack" : "todo";
}

/** Monta as linhas do gráfico: fases (na ordem em que começam) com as tarefas por início. */
export function buildSchedule(tasks: ScheduleTask[], opts: { today: string; projectDue: string | null }) {
  const scheduled = tasks.filter(
    (t): t is ScheduleTask & { startDate: string; dueDate: string } => isIsoDate(t.startDate) && isIsoDate(t.dueDate),
  );
  const unscheduled = tasks.filter((t) => !isIsoDate(t.startDate) || !isIsoDate(t.dueDate));
  const sorted = [...scheduled].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.dueDate.localeCompare(b.dueDate));
  const phases: string[] = [];
  for (const t of sorted) {
    const key = t.phase?.trim() || "";
    if (!phases.includes(key)) phases.push(key);
  }
  // Tarefas sem fase ficam por último, sem linha de fase.
  phases.sort((a, b) => Number(a === "") - Number(b === ""));

  const rows: ScheduleRow[] = [];
  for (const phase of phases) {
    const items = sorted.filter((t) => (t.phase?.trim() || "") === phase);
    if (phase) {
      const totalTarget = items.reduce((a, t) => a + (t.targetMinutes ?? 0), 0);
      const progress = totalTarget
        ? items.reduce((a, t) => a + taskProgress(t) * (t.targetMinutes ?? 0), 0) / totalTarget
        : items.filter((t) => t.done).length / items.length;
      rows.push({
        kind: "phase",
        name: phase,
        start: items.reduce((m, t) => (t.startDate < m ? t.startDate : m), items[0].startDate),
        end: items.reduce((m, t) => (t.dueDate > m ? t.dueDate : m), items[0].dueDate),
        progress,
        late: items.some((t) => taskStatus(t, opts.today) === "late"),
      });
    }
    for (const t of items) rows.push({ kind: "task", ...t, progress: taskProgress(t), status: taskStatus(t, opts.today) });
  }

  const starts = scheduled.map((t) => t.startDate);
  const ends = [...scheduled.map((t) => t.dueDate), ...(opts.projectDue && isIsoDate(opts.projectDue) ? [opts.projectDue] : [])];
  const first = starts.length ? starts.reduce((m, d) => (d < m ? d : m)) : opts.today;
  const last = ends.length ? ends.reduce((m, d) => (d > m ? d : m)) : addDays(opts.today, 28);
  return {
    rows,
    unscheduled,
    /** Intervalo do gráfico com uma folga de alguns dias. */
    range: { start: addDays(first, -3), end: addDays(last > opts.today ? last : opts.today, 4) },
    milestones: { start: starts.length ? first : null, end: opts.projectDue && isIsoDate(opts.projectDue) ? opts.projectDue : null },
    counts: {
      late: rows.filter((r) => r.kind === "task" && r.status === "late").length,
      done: rows.filter((r) => r.kind === "task" && r.status === "done").length,
      total: scheduled.length,
    },
  };
}

export type Schedule = ReturnType<typeof buildSchedule>;

/** Uma dependência criaria ciclo? (A depende de B que depende de A…) */
export function createsCycle(edges: { taskId: string; dependsOn: string }[], taskId: string, dependsOn: string): boolean {
  const next = new Map<string, string[]>();
  for (const e of [...edges, { taskId, dependsOn }]) next.set(e.taskId, [...(next.get(e.taskId) ?? []), e.dependsOn]);
  const seen = new Set<string>();
  const stack = [dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === taskId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...(next.get(cur) ?? []));
  }
  return false;
}
