import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { profiles, studySessions, xpTransactions } from "@/server/db/schema";
import { createCategory, createTopic } from "@/server/services/categories";
import { getActiveContext, setActiveContext } from "@/server/services/profile";
import {
  createProject,
  createTask,
  getHoursBank,
  getProject,
  inviteMember,
  listInvites,
  listProjects,
  removeMember,
  respondInvite,
  setTaskDone,
  updateProject,
} from "@/server/services/projects";
import { getDashboard } from "@/server/services/stats";
import { finishSession, heartbeat, startSession } from "@/server/services/timer";
import { createUser, setup } from "./helpers";

type Env = Awaited<ReturnType<typeof setup>>;
let env: Env;

beforeEach(async () => {
  env = await setup();
});

async function codeOf(userId: string) {
  const [p] = await env.db.select({ code: profiles.publicCode }).from(profiles).where(eq(profiles.userId, userId));
  return p.code!;
}

/** Foca `seconds` com heartbeats a cada minuto e encerra. */
async function focus(userId: string, input: { projectId?: string; taskId?: string | null; topicId?: string }, seconds: number) {
  const s = await startSession(env.ctx, userId, { ...input, methodId: "custom", plannedMinutes: Math.max(1, Math.round(seconds / 60)) });
  let left = seconds;
  while (left > 0) {
    const step = Math.min(60, left);
    env.clock.advance(step);
    left -= step;
    await heartbeat(env.ctx, userId, s.session!.id);
  }
  await finishSession(env.ctx, userId, s.session!.id);
  return s.session!.id;
}

async function team() {
  const owner = await createUser(env.ctx, "Ana");
  const member = await createUser(env.ctx, "Bruno");
  const p = await createProject(env.ctx, owner.id, { context: "personal", name: "Ler 12 livros", targetMinutes: 600 });
  await inviteMember(env.ctx, owner.id, p.id, await codeOf(member.id));
  await respondInvite(env.ctx, member.id, p.id, true);
  return { owner, member, p };
}

describe("Contextos", () => {
  it("sem aceite de organização só o Pessoal fica liberado; valores inválidos são recusados", async () => {
    const u = await createUser(env.ctx);
    expect(await getActiveContext(env.ctx, u.id)).toBe("personal");
    await expect(setActiveContext(env.ctx, u.id, "professional")).rejects.toThrow(/liberado quando uma instituição ou empresa/);
    await setActiveContext(env.ctx, u.id, "personal");
    expect(await getActiveContext(env.ctx, u.id)).toBe("personal");
    await expect(setActiveContext(env.ctx, u.id, "outro" as never)).rejects.toThrow(/Contexto inválido/);
  });

  it("o tempo de um contexto não aparece no painel de outro", async () => {
    const u = await createUser(env.ctx);
    const cat = await createCategory(env.ctx, u.id, { name: "Leitura", context: "personal" });
    const topic = await createTopic(env.ctx, u.id, { categoryId: cat.id, name: "Romances" });
    await focus(u.id, { topicId: u.topic.id }, 25 * 60);
    await focus(u.id, { topicId: topic.id }, 10 * 60);
    const academic = await getDashboard(env.ctx, u.id, { key: "today" }, "academic");
    const personal = await getDashboard(env.ctx, u.id, { key: "today" }, "personal");
    expect(academic.totals.todaySeconds).toBe(25 * 60);
    expect(personal.totals.todaySeconds).toBe(10 * 60);
    expect(personal.byCategory.map((c) => c.name)).toEqual(["Leitura"]);
  });
});

describe("Projetos", () => {
  it("convite pelo código da conta: aceitar entra no projeto; recusar some; só o dono convida", async () => {
    const owner = await createUser(env.ctx, "Ana");
    const b = await createUser(env.ctx, "Bruno");
    const c = await createUser(env.ctx, "Carla");
    const p = await createProject(env.ctx, owner.id, { context: "personal", name: "Violão" });

    await inviteMember(env.ctx, owner.id, p.id, (await codeOf(b.id)).toLowerCase());
    await inviteMember(env.ctx, owner.id, p.id, await codeOf(c.id));
    await expect(inviteMember(env.ctx, owner.id, p.id, await codeOf(b.id))).rejects.toThrow(/já participa ou já foi convidada/);
    await expect(inviteMember(env.ctx, owner.id, p.id, await codeOf(owner.id))).rejects.toThrow(/já participa/);
    await expect(inviteMember(env.ctx, owner.id, p.id, "FCS-NAOEXISTE")).rejects.toThrow(/Nenhuma conta/);

    expect((await listInvites(env.ctx, b.id)).map((i) => i.name)).toEqual(["Violão"]);
    // Convidado ainda não vê o projeto nem pode focar nele.
    await expect(getProject(env.ctx, b.id, p.id)).rejects.toThrow(/não encontrado/);

    await respondInvite(env.ctx, b.id, p.id, true);
    await respondInvite(env.ctx, c.id, p.id, false);
    expect((await listProjects(env.ctx, b.id, "personal")).map((x) => x.name)).toEqual(["Violão"]);
    expect(await listProjects(env.ctx, b.id, "academic")).toEqual([]);
    expect(await listInvites(env.ctx, c.id)).toEqual([]);

    // Membro não convida nem cria tarefas.
    await expect(inviteMember(env.ctx, b.id, p.id, await codeOf(c.id))).rejects.toThrow(/Só o dono/);
    // Membro acrescenta tarefas, mas não designa outras pessoas.
    await expect(createTask(env.ctx, b.id, p.id, { title: "Escalas", assigneeUserId: owner.id })).rejects.toThrow(/Só o dono/);
  });

  it("foco no projeto: soma de todos, horas por tarefa, ranking do projeto e fora dos rankings gerais", async () => {
    const { owner, member, p } = await team();
    const task = await createTask(env.ctx, owner.id, p.id, { title: "Dom Casmurro", targetMinutes: 120, assigneeUserId: member.id });

    await focus(owner.id, { projectId: p.id }, 20 * 60);
    const sid = await focus(member.id, { projectId: p.id, taskId: task.id }, 30 * 60);

    const [s] = await env.db.select().from(studySessions).where(eq(studySessions.id, sid));
    expect(s).toMatchObject({ context: "personal", ranked: false, areaId: null, topicId: null, projectId: p.id, taskId: task.id });
    const xp = await env.db.select().from(xpTransactions).where(eq(xpTransactions.userId, member.id));
    expect(xp.length).toBeGreaterThan(0);
    expect(xp.every((x) => x.ranked === false)).toBe(true);

    const d = await getProject(env.ctx, owner.id, p.id);
    expect(d.totalSeconds).toBe(50 * 60);
    expect(d.mySeconds).toBe(20 * 60);
    expect(d.tasks[0]).toMatchObject({ title: "Dom Casmurro", seconds: 30 * 60, assigneeName: "Bruno" });
    expect(d.ranking.map((r) => [r.displayName, r.seconds, r.position])).toEqual([
      ["Bruno", 30 * 60, 1],
      ["Ana", 20 * 60, 2],
    ]);
    expect(d.recent[0]).toMatchObject({ who: "Bruno", task: "Dom Casmurro", methodName: expect.any(String) });
  });

  it("não participante, tarefa concluída e projeto pausado não aceitam foco", async () => {
    const { owner, member, p } = await team();
    const stranger = await createUser(env.ctx, "Duda");
    const task = await createTask(env.ctx, owner.id, p.id, { title: "Capítulo 1" });
    await expect(focus(stranger.id, { projectId: p.id }, 60)).rejects.toThrow(/não encontrado/);
    await setTaskDone(env.ctx, member.id, p.id, task.id, true);
    await expect(focus(member.id, { projectId: p.id, taskId: task.id }, 60)).rejects.toThrow(/concluída/);
    await updateProject(env.ctx, owner.id, p.id, { status: "paused" });
    await expect(focus(member.id, { projectId: p.id }, 60)).rejects.toThrow(/não está ativo/);
  });

  it("quem sai do projeto mantém o tempo no projeto; o dono não sai", async () => {
    const { owner, member, p } = await team();
    await focus(member.id, { projectId: p.id }, 15 * 60);
    await removeMember(env.ctx, member.id, p.id, member.id);
    expect((await getProject(env.ctx, owner.id, p.id)).totalSeconds).toBe(15 * 60);
    await expect(removeMember(env.ctx, owner.id, p.id, owner.id)).rejects.toThrow(/dono não pode sair/);
  });

  it("banco de horas soma estudo e projetos do contexto", async () => {
    const { member, p } = await team();
    const cat = await createCategory(env.ctx, member.id, { name: "Hobby", context: "personal" });
    const topic = await createTopic(env.ctx, member.id, { categoryId: cat.id, name: "Xadrez" });
    await focus(member.id, { projectId: p.id }, 10 * 60);
    await focus(member.id, { topicId: topic.id }, 5 * 60);
    await focus(member.id, { topicId: member.topic.id }, 7 * 60); // acadêmico: fora
    const range = { start: new Date(0), end: env.clock.now() };
    const bank = await getHoursBank(env.ctx, member.id, "personal", { week: range, month: range });
    expect(bank).toEqual({ weekSeconds: 15 * 60, monthSeconds: 15 * 60, allSeconds: 15 * 60, projectSeconds: 10 * 60 });
  });
});
