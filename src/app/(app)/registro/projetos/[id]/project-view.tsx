"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  createTaskAction,
  deleteProjectAction,
  deleteTaskAction,
  inviteMemberAction,
  moveProjectAction,
  removeMemberAction,
  setTaskDoneAction,
  updateProjectAction,
} from "@/app/actions/projects";
import type { ActionResult } from "@/app/actions/result";
import { useConfirm } from "@/components/confirm";
import { Alert, Button, Card, Input, Label, Select, cx } from "@/components/ui";
import { PROJECT_STATUSES, type AppContext, type ProjectStatus } from "@/domain/contexts";
import { formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";
import { Progress } from "../../projects-board";
import { OrgMemberPicker } from "./member-picker";
import { TaskEditor } from "./task-editor";

type Project = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  context: AppContext;
  status: ProjectStatus;
  targetMinutes: number | null;
  dueDate: string | null;
  isOwner: boolean;
  totalSeconds: number;
  mySeconds: number;
  members: { userId: string; role: "owner" | "member"; status: "invited" | "active"; displayName: string; publicCode: string | null; isViewer: boolean }[];
  tasks: {
    id: string;
    title: string;
    targetMinutes: number | null;
    assigneeUserId: string | null;
    assigneeName: string | null;
    done: boolean;
    seconds: number;
    canDelete: boolean;
    startDate: string | null;
    dueDate: string | null;
    phase: string | null;
    dependsOn: string[];
  }[];
  organizationId: string | null;
  ranking: { userId: string; displayName: string; publicCode: string | null; seconds: number; isViewer: boolean; position: number }[];
  recent: {
    id: string;
    who: string;
    task: string | null;
    methodName: string;
    activeSeconds: number;
    endedAt: string;
    correction: "trimmed" | "deleted" | null;
    originalSeconds: number | null;
  }[];
};

type Target = { context: AppContext; organizationId: string | null; label: string | null };

export function ProjectView({
  project: p,
  period,
  targets,
  orgPicker = null,
}: {
  project: Project;
  period: "semana" | "mes" | "tudo";
  targets: Target[];
  /** Projeto de organização em que o viewer pode incluir membros direto (sem convite). */
  orgPicker?: { orgId: string; orgAlias: string; areas: string[] } | null;
}) {
  const { t, locale } = useI18n();
  const P = t.projects;
  const router = useRouter();
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [task, setTask] = useState({ title: "", hours: "", assignee: "" });
  const [editing, setEditing] = useState(false);
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const phases = [...new Set(p.tasks.map((x) => x.phase).filter((v): v is string => Boolean(v)))];
  const dateFmt2 = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const shortDate = (v: string) => dateFmt2.format(new Date(`${v}T00:00:00Z`));
  const [moveTo, setMoveTo] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [edit, setEdit] = useState({
    name: p.name,
    description: p.description ?? "",
    hours: p.targetMinutes ? String(+(p.targetMinutes / 60).toFixed(2)) : "",
    dueDate: p.dueDate ?? "",
  });

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        after?.();
        router.refresh();
      }
    });
  const parseHours = (v: string) => (v.trim() ? Number(v.replace(",", ".")) : null);
  const active = p.members.filter((m) => m.status === "active");
  const invited = p.members.filter((m) => m.status === "invited");
  const dateFmt = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start gap-3">
        <span aria-hidden className="mt-2 h-4 w-4 shrink-0 rounded-full" style={{ background: p.color }} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">{p.name}</h1>
          <p className="text-sm text-text-2">
            {t.contexts.names[p.context]} · {P.statuses[p.status]}
            {p.dueDate && ` · ${P.due(p.dueDate)}`}
          </p>
          {p.description && <p className="mt-1 text-sm text-text-2">{p.description}</p>}
        </div>
        {p.status === "active" && (
          <Link
            href={`/estudar?projeto=${p.id}`}
            className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink"
          >
            {P.focusNow}
          </Link>
        )}
      </header>

      {error && <Alert>{error}</Alert>}

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-text-2">{P.totalLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular">{formatDuration(p.totalSeconds)}</p>
          {p.targetMinutes ? (
            <>
              <p className="mb-2 text-xs text-text-2 tabular">{P.ofTarget(formatDuration(p.targetMinutes * 60))}</p>
              <Progress seconds={p.totalSeconds} targetMinutes={p.targetMinutes} label={P.progress} />
            </>
          ) : (
            <p className="text-xs text-text-3">{P.noTarget}</p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-2">{P.myLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular">{formatDuration(p.mySeconds)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-text-2">{P.tasksLabel}</p>
          <p className="mt-1 text-2xl font-semibold tabular">
            {p.tasks.filter((x) => x.done).length}/{p.tasks.length}
          </p>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-5">
          {/* Tarefas */}
          <Card className="p-0">
            <h2 className="border-b border-border px-4 py-3 font-semibold">{P.tasksTitle}</h2>
            <ul className="divide-y divide-border">
              {p.tasks.length === 0 && <li className="px-4 py-3 text-sm text-text-2">{P.noTasks}</li>}
              {p.tasks.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    aria-label={P.markDone(x.title)}
                    checked={x.done}
                    disabled={pending}
                    onChange={(e) => run(() => setTaskDoneAction(p.id, x.id, e.target.checked))}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cx("text-sm", x.done && "text-text-3 line-through")}>{x.title}</p>
                    <p className="text-xs text-text-2 tabular">
                      {formatDuration(x.seconds)}
                      {x.targetMinutes ? ` ${P.ofTarget(formatDuration(x.targetMinutes * 60))}` : ""}
                      {x.assigneeName ? ` · ${x.assigneeName}` : ""}
                      {x.startDate && x.dueDate ? ` · ${shortDate(x.startDate)}–${shortDate(x.dueDate)}` : ""}
                      {x.phase ? ` · ${x.phase}` : ""}
                    </p>
                  </div>
                  {p.isOwner && editingTask !== x.id && (
                    <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditingTask(x.id)}>
                      {t.common.edit}
                    </Button>
                  )}
                  {x.canDelete && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: P.deleteTaskTitle(x.title),
                          message: P.deleteTaskText,
                          confirmLabel: t.common.delete,
                          cancelLabel: t.common.cancel,
                          danger: true,
                        });
                        if (ok) run(() => deleteTaskAction(p.id, x.id));
                      }}
                    >
                      {t.common.delete}
                    </Button>
                  )}
                  {editingTask === x.id && (
                    <TaskEditor
                      projectId={p.id}
                      task={x}
                      tasks={p.tasks.filter((o) => o.id !== x.id).map((o) => ({ id: o.id, title: o.title }))}
                      members={active.map((m) => ({ userId: m.userId, displayName: m.displayName }))}
                      phases={phases}
                      onDone={() => {
                        setEditingTask(null);
                        router.refresh();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
            {p.status === "active" && (
              <form
                className={cx(
                  "grid gap-2 border-t border-border p-3",
                  p.isOwner ? "sm:grid-cols-[1fr_110px_160px_auto]" : "sm:grid-cols-[1fr_110px_auto]",
                )}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!task.title.trim()) return;
                  run(
                    () =>
                      createTaskAction(p.id, {
                        title: task.title,
                        targetHours: parseHours(task.hours),
                        assigneeUserId: task.assignee || null,
                      }),
                    () => setTask({ title: "", hours: "", assignee: "" }),
                  );
                }}
              >
                <Input
                  aria-label={P.newTask}
                  placeholder={P.newTask}
                  value={task.title}
                  maxLength={120}
                  onChange={(e) => setTask((s) => ({ ...s, title: e.target.value }))}
                />
                <Input
                  aria-label={P.taskHours}
                  placeholder={P.taskHours}
                  inputMode="decimal"
                  value={task.hours}
                  onChange={(e) => setTask((s) => ({ ...s, hours: e.target.value }))}
                />
                {p.isOwner && (
                  <Select aria-label={P.assignee} value={task.assignee} onChange={(e) => setTask((s) => ({ ...s, assignee: e.target.value }))}>
                    <option value="">{P.noAssignee}</option>
                    {active.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.displayName}
                      </option>
                    ))}
                  </Select>
                )}
                <Button type="submit" variant="secondary" disabled={pending || !task.title.trim()}>
                  {P.addTask}
                </Button>
              </form>
            )}
          </Card>

          {/* Atividade recente */}
          <Card className="p-0">
            <h2 className="border-b border-border px-4 py-3 font-semibold">{P.activityTitle}</h2>
            <ul className="divide-y divide-border">
              {p.recent.length === 0 && <li className="px-4 py-3 text-sm text-text-2">{P.noActivity}</li>}
              {p.recent.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-2.5 text-sm">
                  <span className={r.correction === "deleted" ? "text-text-3 line-through" : undefined}>
                    <span className="font-medium">{r.who}</span>
                    <span className="text-text-2"> · {r.task ?? P.general} · {r.methodName}</span>
                  </span>
                  <span className="text-xs text-text-2 tabular">
                    {r.correction === "deleted"
                      ? t.corrections.removedBy(r.who, formatDuration(r.originalSeconds ?? 0))
                      : r.correction === "trimmed"
                        ? `${formatDuration(r.activeSeconds)} (${t.corrections.was(formatDuration(r.originalSeconds ?? 0))})`
                        : formatDuration(r.activeSeconds)}{" "}
                    · {dateFmt.format(new Date(r.endedAt))}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-5">
          {/* Ranking do projeto */}
          <Card className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="font-semibold">{P.rankingTitle}</h2>
              <nav className="flex gap-1 text-xs">
                {(["semana", "mes", "tudo"] as const).map((k) => (
                  <Link
                    key={k}
                    href={`?periodo=${k}`}
                    aria-current={period === k ? "page" : undefined}
                    className={cx("rounded-md px-2 py-1", period === k ? "bg-accent-soft text-link" : "text-text-2 hover:text-text")}
                  >
                    {P.periods[k]}
                  </Link>
                ))}
              </nav>
            </div>
            <ol className="divide-y divide-border">
              {p.ranking.map((r) => (
                <li key={r.userId} className={cx("flex items-center gap-3 px-4 py-2.5 text-sm", r.isViewer && "bg-accent-soft/50")}>
                  <span className="w-6 font-semibold tabular">{r.position}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {r.displayName}
                    {r.isViewer && <span className="text-text-2"> ({P.you})</span>}
                  </span>
                  <span className="font-medium tabular">{formatDuration(r.seconds)}</span>
                </li>
              ))}
            </ol>
          </Card>

          {/* Participantes */}
          <Card className="p-0">
            <h2 className="border-b border-border px-4 py-3 font-semibold">{P.membersTitle}</h2>
            <ul className="divide-y divide-border">
              {[...active, ...invited].map((m) => (
                <li key={m.userId} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate">
                      {m.displayName}
                      {m.isViewer && <span className="text-text-2"> ({P.you})</span>}
                    </p>
                    <p className="text-xs text-text-3">
                      {m.publicCode} · {m.role === "owner" ? P.roleOwner : m.status === "invited" ? P.pendingInvite : P.roleMember}
                    </p>
                  </div>
                  {m.role !== "owner" && (p.isOwner || m.isViewer) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-danger"
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: m.isViewer ? P.leaveTitle : P.removeTitle(m.displayName),
                          message: P.removeText,
                          confirmLabel: m.isViewer ? P.leave : P.remove,
                          cancelLabel: t.common.cancel,
                          danger: true,
                        });
                        if (ok)
                          run(
                            () => removeMemberAction(p.id, m.userId),
                            m.isViewer ? () => router.push("/registro?modo=projetos") : undefined,
                          );
                      }}
                    >
                      {m.isViewer ? P.leave : P.remove}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {p.isOwner && (
              <form
                className="flex gap-2 border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!code.trim()) return;
                  run(() => inviteMemberAction(p.id, code), () => setCode(""));
                }}
              >
                <Input
                  aria-label={P.inviteLabel}
                  placeholder="FCS-XXXXXXXX"
                  value={code}
                  maxLength={20}
                  onChange={(e) => setCode(e.target.value)}
                />
                <Button type="submit" variant="secondary" disabled={pending || !code.trim()} className="shrink-0">
                  {P.invite}
                </Button>
              </form>
            )}
            {p.isOwner && <p className="px-4 pb-3 text-xs text-text-3">{orgPicker ? t.memberSearch.inviteOutsiders : P.inviteHint}</p>}
            {orgPicker && <OrgMemberPicker orgId={orgPicker.orgId} orgAlias={orgPicker.orgAlias} projectId={p.id} areas={orgPicker.areas} />}
          </Card>

          {/* Mover para outro perfil */}
          {targets.length > 1 && (
            <Card className="space-y-2 p-4">
              <h2 className="font-semibold">{P.move.title}</h2>
              <p className="text-xs text-text-2">{p.isOwner ? P.move.hintOwner : P.move.hintMember}</p>
              <div className="flex gap-2">
                <Select aria-label={P.move.title} value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
                  <option value="">{P.move.choose}</option>
                  {targets
                    .filter((tg) => !(tg.context === p.context && tg.organizationId === p.organizationId))
                    .map((tg) => (
                      <option key={tg.organizationId ?? "personal"} value={tg.organizationId ?? "personal"}>
                        {t.contexts.names[tg.context]}
                        {tg.label ? ` · ${tg.label}` : ""}
                      </option>
                    ))}
                </Select>
                <Button
                  variant="secondary"
                  disabled={pending || !moveTo}
                  onClick={async () => {
                    const tg = targets.find((x) => (x.organizationId ?? "personal") === moveTo);
                    if (!tg) return;
                    const intoOrg = Boolean(tg.organizationId);
                    // Aviso duplo ao levar algo do Pessoal para a instituição/empresa.
                    if (intoOrg) {
                      const first = await confirm({
                        title: P.move.confirmTitle(tg.label ?? ""),
                        message: P.move.confirmText,
                        confirmLabel: P.move.continue,
                        cancelLabel: t.common.cancel,
                      });
                      if (!first) return;
                      const second = await confirm({
                        title: P.move.confirmAgainTitle,
                        message: P.move.confirmAgainText(tg.label ?? ""),
                        confirmLabel: P.move.confirm,
                        cancelLabel: t.common.cancel,
                      });
                      if (!second) return;
                    }
                    start(async () => {
                      const res = await moveProjectAction(p.id, { context: tg.context, organizationId: tg.organizationId });
                      if (!res.ok) setError(res.error);
                      else {
                        setError(null);
                        setMoveTo("");
                        setNotice(res.data.status === "moved" ? P.move.moved : res.data.approver === "owner" ? P.move.requestedOwner : P.move.requestedManager);
                        router.refresh();
                      }
                    });
                  }}
                >
                  {P.move.action}
                </Button>
              </div>
              {notice && <p className="text-xs text-good">{notice}</p>}
            </Card>
          )}

          {/* Configurações (dono) */}
          {p.isOwner && (
            <Card className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{P.settingsTitle}</h2>
                {!editing && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
                    {t.common.edit}
                  </Button>
                )}
              </div>
              {editing && (
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(
                      () =>
                        updateProjectAction(p.id, {
                          name: edit.name,
                          description: edit.description || null,
                          targetHours: parseHours(edit.hours),
                          dueDate: edit.dueDate || null,
                        }),
                      () => setEditing(false),
                    );
                  }}
                >
                  <Label htmlFor="e-name">{P.newName}</Label>
                  <Input id="e-name" value={edit.name} maxLength={80} onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))} />
                  <Label htmlFor="e-desc">{P.description}</Label>
                  <Input id="e-desc" value={edit.description} maxLength={500} onChange={(e) => setEdit((s) => ({ ...s, description: e.target.value }))} />
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="e-hours">{P.targetHours}</Label>
                      <Input id="e-hours" inputMode="decimal" value={edit.hours} onChange={(e) => setEdit((s) => ({ ...s, hours: e.target.value }))} />
                    </div>
                    <div>
                      <Label htmlFor="e-due">{P.dueDate}</Label>
                      <Input id="e-due" type="date" value={edit.dueDate} onChange={(e) => setEdit((s) => ({ ...s, dueDate: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" type="submit" disabled={pending}>
                      {t.common.save}
                    </Button>
                    <Button size="sm" variant="ghost" type="button" onClick={() => setEditing(false)}>
                      {t.common.cancel}
                    </Button>
                  </div>
                </form>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor="e-status">{P.statusLabel}</Label>
                <Select
                  id="e-status"
                  className="w-auto"
                  value={p.status}
                  disabled={pending}
                  onChange={(e) => run(() => updateProjectAction(p.id, { status: e.target.value }))}
                >
                  {PROJECT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {P.statuses[s]}
                    </option>
                  ))}
                </Select>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="text-danger"
                disabled={pending}
                onClick={async () => {
                  const ok = await confirm({
                    title: P.deleteTitle(p.name),
                    message: P.deleteText,
                    confirmLabel: t.common.delete,
                    cancelLabel: t.common.cancel,
                    danger: true,
                  });
                  if (ok) run(() => deleteProjectAction(p.id), () => router.push("/registro?modo=projetos"));
                }}
              >
                {P.deleteProject}
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
