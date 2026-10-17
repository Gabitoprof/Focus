"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createProjectAction, decideMoveRequestAction, respondInviteAction } from "@/app/actions/projects";
import type { ActionResult } from "@/app/actions/result";
import { Alert, Button, CATEGORY_COLORS, Input, Label, cx } from "@/components/ui";
import type { AppContext, ProjectStatus } from "@/domain/contexts";
import { formatDuration } from "@/domain/time";
import { useI18n } from "@/i18n/client";

type Project = {
  id: string;
  name: string;
  color: string;
  status: ProjectStatus;
  role: "owner" | "member";
  targetMinutes: number | null;
  dueDate: string | null;
  totalSeconds: number;
  mySeconds: number;
  members: number;
  tasks: { total: number; done: number };
};
type Invite = { projectId: string; name: string; context: AppContext; color: string; ownerName: string; invitedAt: string };
type MoveRequest = {
  id: string;
  projectName: string;
  requestedBy: string;
  approver: "owner" | "manager";
  targetContext: AppContext;
  targetLabel: string | null;
};

export function ProjectsBoard({
  context,
  projects,
  invites,
  moveRequests,
}: {
  context: AppContext;
  projects: Project[];
  invites: Invite[];
  moveRequests: MoveRequest[];
}) {
  const { t } = useI18n();
  const P = t.projects;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", targetHours: "", dueDate: "", description: "" });

  const run = (fn: () => Promise<ActionResult<unknown>>, after?: () => void) =>
    start(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error);
      else {
        setError(null);
        after?.();
      }
    });

  return (
    <div className="space-y-5">
      {invites.length > 0 && (
        <section className="rounded-xl border border-accent/40 bg-accent-soft/40 p-4" aria-label={P.invitesTitle}>
          <h2 className="mb-2 text-sm font-semibold">{P.invitesTitle}</h2>
          <ul className="space-y-2">
            {invites.map((i) => (
              <li key={i.projectId} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3">
                <span aria-hidden className="h-3 w-3 rounded-full" style={{ background: i.color }} />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{i.name}</p>
                  <p className="text-xs text-text-2">{P.invitedBy(i.ownerName, t.contexts.names[i.context])}</p>
                </div>
                <Button size="sm" disabled={pending} onClick={() => run(() => respondInviteAction(i.projectId, true))}>
                  {P.accept}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => respondInviteAction(i.projectId, false))}>
                  {P.decline}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {moveRequests.length > 0 && (
        <section className="rounded-xl border border-warn/40 bg-warn-soft/40 p-4" aria-label={P.moveRequests.title}>
          <h2 className="mb-2 text-sm font-semibold">{P.moveRequests.title}</h2>
          <ul className="space-y-2">
            {moveRequests.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-surface p-3">
                <p className="min-w-0 flex-1 text-sm">
                  {P.moveRequests.line(
                    m.requestedBy,
                    m.projectName,
                    t.contexts.names[m.targetContext] + (m.targetLabel ? ` · ${m.targetLabel}` : ""),
                  )}
                  <span className="block text-xs text-text-3">
                    {m.approver === "owner" ? P.moveRequests.asOwner : P.moveRequests.asManager}
                  </span>
                </p>
                <Button size="sm" disabled={pending} onClick={() => run(() => decideMoveRequestAction(m.id, true))}>
                  {P.accept}
                </Button>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => decideMoveRequestAction(m.id, false))}>
                  {P.decline}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <form
        className="grid gap-3 rounded-xl border border-border bg-surface p-4 sm:grid-cols-[1fr_140px_170px]"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          const hours = form.targetHours.trim() ? Number(form.targetHours.replace(",", ".")) : null;
          run(
            () =>
              createProjectAction({
                name: form.name,
                description: form.description || null,
                targetHours: hours,
                dueDate: form.dueDate || null,
                color: CATEGORY_COLORS[projects.length % CATEGORY_COLORS.length],
              }),
            () => setForm({ name: "", targetHours: "", dueDate: "", description: "" }),
          );
        }}
      >
        <div>
          <Label htmlFor="p-name">{P.newName}</Label>
          <Input
            id="p-name"
            value={form.name}
            maxLength={80}
            placeholder={P.newPlaceholder[context]}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="p-hours">{P.targetHours}</Label>
          <Input
            id="p-hours"
            inputMode="decimal"
            value={form.targetHours}
            placeholder={P.optional}
            onChange={(e) => setForm((f) => ({ ...f, targetHours: e.target.value }))}
          />
        </div>
        <div>
          <Label htmlFor="p-due">{P.dueDate}</Label>
          <Input id="p-due" type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="p-desc">{P.description}</Label>
          <Input
            id="p-desc"
            value={form.description}
            maxLength={500}
            placeholder={P.optional}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </div>
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={pending || !form.name.trim()}>
            {P.create}
          </Button>
        </div>
      </form>

      {error && <Alert>{error}</Alert>}

      {projects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-text-2">{P.empty}</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {projects.map((p) => (
            <li key={p.id}>
              <ProjectCard project={p} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Progress({ seconds, targetMinutes, label }: { seconds: number; targetMinutes: number | null; label: string }) {
  if (!targetMinutes) return null;
  const pct = Math.min(100, Math.round((seconds / (targetMinutes * 60)) * 100));
  return (
    <div>
      <div
        className="h-2 overflow-hidden rounded-full bg-surface-2"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div className={cx("h-full rounded-full", pct >= 100 ? "bg-good" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function ProjectCard({ project: p }: { project: Project }) {
  const { t } = useI18n();
  const P = t.projects;
  return (
    <Link
      href={`/registro/projetos/${p.id}`}
      className="block h-full space-y-3 rounded-xl border border-border bg-surface p-4 hover:border-accent"
    >
      <div className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 h-3 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{p.name}</p>
          <p className="text-xs text-text-2">
            {p.role === "owner" ? P.roleOwner : P.roleMember} · {P.membersCount(p.members)}
            {p.status !== "active" && ` · ${P.statuses[p.status]}`}
          </p>
        </div>
      </div>
      <p className="text-sm tabular">
        <span className="font-semibold">{formatDuration(p.totalSeconds)}</span>
        {p.targetMinutes ? (
          <span className="text-text-2"> {P.ofTarget(formatDuration(p.targetMinutes * 60))}</span>
        ) : null}
      </p>
      <Progress seconds={p.totalSeconds} targetMinutes={p.targetMinutes} label={P.progress} />
      <p className="text-xs text-text-2 tabular">
        {P.mine(formatDuration(p.mySeconds))} · {P.tasksDone(p.tasks.done, p.tasks.total)}
        {p.dueDate && ` · ${P.due(p.dueDate)}`}
      </p>
    </Link>
  );
}
