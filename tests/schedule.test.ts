import { describe, expect, it, beforeEach } from "vitest";
import { buildSchedule, createsCycle, taskProgress, taskStatus, type ScheduleTask } from "@/domain/schedule";
import { createProject, createTask, getProject, updateTask } from "@/server/services/projects";
import { createUser, setup } from "./helpers";

const base: ScheduleTask = {
  id: "a",
  title: "A",
  phase: null,
  startDate: "2026-10-01",
  dueDate: "2026-10-10",
  targetMinutes: 600,
  seconds: 0,
  done: false,
  assigneeName: null,
  dependsOn: [],
};

describe("Cronograma — regras", () => {
  it("progresso pelas horas; concluída é 100%", () => {
    expect(taskProgress({ ...base, seconds: 300 * 60 })).toBe(0.5);
    expect(taskProgress({ ...base, seconds: 900 * 60 })).toBe(1);
    expect(taskProgress({ ...base, targetMinutes: null, seconds: 999 })).toBe(0);
    expect(taskProgress({ ...base, done: true })).toBe(1);
  });

  it("situação: não iniciada, em dia, atrasada (prazo ou ritmo) e concluída", () => {
    const t = { ...base, startDate: "2026-10-01", dueDate: "2026-10-10" } as const;
    expect(taskStatus(t, "2026-09-28")).toBe("todo");
    expect(taskStatus({ ...t, seconds: 120 * 60 }, "2026-10-02")).toBe("ontrack");
    expect(taskStatus({ ...t, seconds: 60 * 60 }, "2026-10-08")).toBe("late"); // 80% do tempo, 10% das horas
    expect(taskStatus({ ...t, seconds: 500 * 60 }, "2026-10-11")).toBe("late"); // prazo passou
    expect(taskStatus({ ...t, done: true }, "2026-10-20")).toBe("done");
  });

  it("agrupa por fase (na ordem em que começam), tarefas sem datas ficam de fora, marcos e contagens", () => {
    const s = buildSchedule(
      [
        { ...base, id: "dev", title: "Dev", phase: "Desenvolvimento", startDate: "2026-10-05", dueDate: "2026-10-20" },
        { ...base, id: "req", title: "Req", phase: "Planejamento", startDate: "2026-10-01", dueDate: "2026-10-04", done: true },
        { ...base, id: "solta", title: "Solta", phase: null, startDate: "2026-10-02", dueDate: "2026-10-03" },
        { ...base, id: "sem", title: "Sem datas", startDate: null, dueDate: null },
      ],
      { today: "2026-10-12", projectDue: "2026-11-11" },
    );
    expect(s.rows.map((r) => (r.kind === "phase" ? `fase:${r.name}` : r.id))).toEqual(["fase:Planejamento", "req", "fase:Desenvolvimento", "dev", "solta"]);
    expect(s.unscheduled.map((t) => t.id)).toEqual(["sem"]);
    expect(s.milestones).toEqual({ start: "2026-10-01", end: "2026-11-11" });
    expect(s.range).toEqual({ start: "2026-09-28", end: "2026-11-15" });
    expect(s.counts).toMatchObject({ total: 3, done: 1 });
  });

  it("detecta ciclo de dependências", () => {
    const edges = [
      { taskId: "b", dependsOn: "a" },
      { taskId: "c", dependsOn: "b" },
    ];
    expect(createsCycle(edges, "a", "c")).toBe(true);
    expect(createsCycle(edges, "c", "a")).toBe(false);
  });
});

describe("Cronograma — tarefas do projeto", () => {
  let env: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    env = await setup();
  });

  it("dono define datas, fase e dependências; recusa prazo antes do início e ciclos", async () => {
    const u = await createUser(env.ctx, "Ana");
    const p = await createProject(env.ctx, u.id, { context: "personal", name: "TCC" });
    const a = await createTask(env.ctx, u.id, p.id, { title: "Pesquisa", startDate: "2026-10-01", dueDate: "2026-10-10", phase: "Planejamento" });
    const b = await createTask(env.ctx, u.id, p.id, { title: "Escrita" });
    await updateTask(env.ctx, u.id, p.id, b.id, { startDate: "2026-10-11", dueDate: "2026-10-30", phase: "Escrita", dependsOn: [a.id] });
    await expect(updateTask(env.ctx, u.id, p.id, a.id, { dependsOn: [b.id] })).rejects.toThrow(/ciclo/);
    await expect(updateTask(env.ctx, u.id, p.id, a.id, { dueDate: "2026-09-01" })).rejects.toThrow(/início precisa ser antes/);
    await expect(createTask(env.ctx, u.id, p.id, { title: "X", startDate: "2026-13-40" })).rejects.toThrow(/Data inválida/);
    const d = await getProject(env.ctx, u.id, p.id);
    expect(d.tasks.find((t) => t.id === b.id)).toMatchObject({ startDate: "2026-10-11", dueDate: "2026-10-30", phase: "Escrita", dependsOn: [a.id] });
    await updateTask(env.ctx, u.id, p.id, b.id, { dependsOn: [] });
    expect((await getProject(env.ctx, u.id, p.id)).tasks.find((t) => t.id === b.id)?.dependsOn).toEqual([]);
  });
});
