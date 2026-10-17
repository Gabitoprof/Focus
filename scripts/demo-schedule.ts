/**
 * Cronograma de demonstração do "Projeto Integrador 2026/1" (contas @focus.demo): fases, datas
 * relativas a hoje, dependências e algumas horas registradas — o mesmo desenho aprovado no Figma.
 * Usado pelo `npm run demo:seed` e, sozinho, para atualizar um banco que já tem a demonstração:
 *   npm run demo:schedule   (com o servidor parado)
 */
import { and, eq, isNull } from "drizzle-orm";
import { addDays } from "../src/domain/schedule";
import { getDb } from "../src/server/db";
import { profiles, projectTasks, projects } from "../src/server/db/schema";
import type { Ctx } from "../src/server/services/common";
import { createTask, setTaskDone, updateProject, updateTask } from "../src/server/services/projects";
import { finishSession, heartbeat, startSession } from "../src/server/services/timer";

type Plan = { title: string; phase: string; who: string | null; from: number; to: number; hours: number; after?: string[]; done?: boolean };

const PLAN: Plan[] = [
  { title: "Levantamento de requisitos", phase: "Planejamento", who: "Ana Lima", from: 0, to: 9, hours: 10, done: true },
  { title: "Definição do escopo", phase: "Planejamento", who: "Clóvis Andrade", from: 10, to: 13, hours: 4, after: ["Levantamento de requisitos"], done: true },
  { title: "Protótipo navegável", phase: "Desenvolvimento", who: "Bruno Costa", from: 14, to: 30, hours: 15, after: ["Definição do escopo"] },
  { title: "Banco de dados", phase: "Desenvolvimento", who: "Carla Souza", from: 15, to: 26, hours: 12, after: ["Definição do escopo"] },
  { title: "Integração", phase: "Desenvolvimento", who: "Bruno Costa", from: 31, to: 35, hours: 6, after: ["Protótipo navegável", "Banco de dados"] },
  { title: "Testes com usuários", phase: "Validação", who: "Daniel Rocha", from: 36, to: 42, hours: 8, after: ["Integração"] },
  { title: "Ajustes", phase: "Validação", who: "Carla Souza", from: 43, to: 46, hours: 5, after: ["Testes com usuários"] },
  { title: "Relatório final", phase: "Entrega", who: "Ana Lima", from: 47, to: 50, hours: 10, after: ["Ajustes"] },
  { title: "Apresentação final", phase: "Entrega", who: null, from: 50, to: 51, hours: 5, after: ["Relatório final"] },
];

export async function applyDemoSchedule(ctx: Ctx, projectId: string) {
  const [p] = await ctx.db.select().from(projects).where(eq(projects.id, projectId));
  if (!p) throw new Error("Projeto de demonstração não encontrado.");
  const owner = p.ownerUserId;
  const today = new Date().toISOString().slice(0, 10);
  const start = addDays(today, -21); // hoje cai na 4ª semana, como no desenho aprovado
  const people = await ctx.db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles);
  const idOf = (name: string | null) => (name ? (people.find((x) => x.name === name)?.id ?? null) : null);

  const existing = await ctx.db
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)));
  const ids = new Map<string, string>();
  for (const step of PLAN) {
    const found = existing.find((t) => t.title === step.title);
    const fields = {
      startDate: addDays(start, step.from),
      dueDate: addDays(start, step.to),
      phase: step.phase,
      targetMinutes: step.hours * 60,
      assigneeUserId: idOf(step.who),
    };
    if (found) {
      await updateTask(ctx, owner, projectId, found.id, fields);
      ids.set(step.title, found.id);
    } else {
      const t = await createTask(ctx, owner, projectId, { title: step.title, ...fields });
      ids.set(step.title, t.id);
    }
  }
  for (const step of PLAN) {
    if (step.after?.length) {
      await updateTask(ctx, owner, projectId, ids.get(step.title)!, { dependsOn: step.after.map((a) => ids.get(a)!) });
    }
    if (step.done) await setTaskDone(ctx, owner, projectId, ids.get(step.title)!, true);
  }
  await updateProject(ctx, owner, projectId, { dueDate: addDays(start, 51) });
  return { ids, start };
}

/** Horas de exemplo no cronograma: banco de dados atrasado (Carla). */
export async function demoScheduleSessions(ctx: Ctx & { setNow: (t: number) => void }, projectId: string, ids: Map<string, string>, start: string) {
  const people = await ctx.db.select({ id: profiles.userId, name: profiles.displayName }).from(profiles);
  const idOf = (name: string) => people.find((x) => x.name === name)!.id;
  const run = async (who: string, task: string, day: string, minutes: number) => {
    const userId = idOf(who);
    const at = new Date(`${day}T23:05:00-03:00`).getTime();
    if (at + minutes * 60_000 > Date.now()) return;
    ctx.setNow(at);
    const s = await startSession(ctx, userId, { projectId, taskId: ids.get(task)!, methodId: "custom", plannedMinutes: minutes });
    for (let left = minutes; left > 0; left -= 8) {
      ctx.setNow(at + (minutes - left + Math.min(8, left)) * 60_000);
      await heartbeat(ctx, userId, s.session!.id);
    }
    await finishSession(ctx, userId, s.session!.id);
  };
  for (const d of [15, 17]) await run("Carla Souza", "Banco de dados", addDays(start, d), 60);
  ctx.setNow(Date.now());
}

async function main() {
  const db = await getDb();
  const clock = { t: Date.now() };
  const ctx = { db, now: () => new Date(clock.t), setNow: (t: number) => (clock.t = t) };
  const [p] = await db.select().from(projects).where(and(eq(projects.name, "Projeto Integrador 2026/1"), isNull(projects.deletedAt)));
  if (!p) throw new Error("Rode antes: npm run demo:seed");
  const { ids, start } = await applyDemoSchedule(ctx, p.id);
  await demoScheduleSessions(ctx, p.id, ids, start);
  console.log(`Cronograma de demonstração aplicado (${ids.size} tarefas).`);
  process.exit(0);
}

if (process.argv[1]?.includes("demo-schedule")) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
