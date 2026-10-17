"use client";

import { useState, useTransition } from "react";
import { updateTaskAction } from "@/app/actions/projects";
import { Alert, Button, Input, Label, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";

type Task = {
  id: string;
  title: string;
  targetMinutes: number | null;
  assigneeUserId: string | null;
  startDate: string | null;
  dueDate: string | null;
  phase: string | null;
  dependsOn: string[];
};

/** Edição de uma tarefa pelo dono do projeto: dados, datas do cronograma, fase e dependências. */
export function TaskEditor({
  projectId,
  task,
  tasks,
  members,
  phases,
  onDone,
}: {
  projectId: string;
  task: Task;
  tasks: { id: string; title: string }[];
  members: { userId: string; displayName: string }[];
  phases: string[];
  onDone: () => void;
}) {
  const { t } = useI18n();
  const S = t.schedule;
  const P = t.projects;
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({
    title: task.title,
    hours: task.targetMinutes ? String(+(task.targetMinutes / 60).toFixed(2)) : "",
    assignee: task.assigneeUserId ?? "",
    startDate: task.startDate ?? "",
    dueDate: task.dueDate ?? "",
    phase: task.phase ?? "",
    dependsOn: new Set(task.dependsOn),
  });
  const listId = `phases-${task.id}`;
  return (
    <form
      className="mt-2 grid w-full gap-2 rounded-lg border border-border bg-surface-2 p-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const res = await updateTaskAction(projectId, task.id, {
            title: f.title,
            targetHours: f.hours.trim() ? Number(f.hours.replace(",", ".")) : null,
            assigneeUserId: f.assignee || null,
            startDate: f.startDate || null,
            dueDate: f.dueDate || null,
            phase: f.phase || null,
            dependsOn: [...f.dependsOn],
          });
          if (!res.ok) setError(res.error);
          else onDone();
        });
      }}
    >
      <div className="sm:col-span-2">
        <Label htmlFor={`t-${task.id}`}>{P.newTask}</Label>
        <Input id={`t-${task.id}`} value={f.title} maxLength={120} onChange={(e) => setF((s) => ({ ...s, title: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor={`s-${task.id}`}>{S.startDate}</Label>
        <Input id={`s-${task.id}`} type="date" value={f.startDate} onChange={(e) => setF((s) => ({ ...s, startDate: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor={`d-${task.id}`}>{S.dueDate}</Label>
        <Input id={`d-${task.id}`} type="date" value={f.dueDate} onChange={(e) => setF((s) => ({ ...s, dueDate: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor={`h-${task.id}`}>{P.taskHours}</Label>
        <Input id={`h-${task.id}`} inputMode="decimal" value={f.hours} onChange={(e) => setF((s) => ({ ...s, hours: e.target.value }))} />
      </div>
      <div>
        <Label htmlFor={`a-${task.id}`}>{P.assignee}</Label>
        <Select id={`a-${task.id}`} value={f.assignee} onChange={(e) => setF((s) => ({ ...s, assignee: e.target.value }))}>
          <option value="">{P.noAssignee}</option>
          {members.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.displayName}
            </option>
          ))}
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label htmlFor={`p-${task.id}`}>{S.phase}</Label>
        <Input id={`p-${task.id}`} list={listId} value={f.phase} maxLength={60} placeholder={S.phasePlaceholder} onChange={(e) => setF((s) => ({ ...s, phase: e.target.value }))} />
        <datalist id={listId}>
          {phases.map((ph) => (
            <option key={ph} value={ph} />
          ))}
        </datalist>
      </div>
      {tasks.length > 0 && (
        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium text-text-2">{S.dependsOn}</legend>
          <div className="flex flex-wrap gap-2">
            {tasks.map((o) => (
              <label key={o.id} className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-xs">
                <input
                  type="checkbox"
                  checked={f.dependsOn.has(o.id)}
                  onChange={() =>
                    setF((s) => {
                      const n = new Set(s.dependsOn);
                      if (n.has(o.id)) n.delete(o.id);
                      else n.add(o.id);
                      return { ...s, dependsOn: n };
                    })
                  }
                />
                {o.title}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {error && (
        <div className="sm:col-span-2">
          <Alert>{error}</Alert>
        </div>
      )}
      <div className="flex gap-2 sm:col-span-2">
        <Button size="sm" type="submit" disabled={pending || !f.title.trim()}>
          {t.common.save}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={onDone}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
