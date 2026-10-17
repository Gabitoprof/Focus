import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { PROJECT_LIMITS, type AppContext, type ProjectStatus } from "@/domain/contexts";
import { createsCycle, isIsoDate } from "@/domain/schedule";
import { clippedSeconds, type Range } from "@/domain/time";
import {
  profiles,
  projectMembers,
  projectTaskDependencies,
  projectTasks,
  projects,
  sessionSegments,
  studyMethods,
  studySessions,
} from "../db/schema";
import { AppError, type Ctx, type Tx } from "./common";
import type { DB } from "../db";

type Db = DB | Tx;
type ProjectRow = typeof projects.$inferSelect;

/** Projeto em que o usuário é participante ativo (dono ou membro). Senão, "não encontrado". */
export async function activeMembership(db: Db, userId: string, projectId: string) {
  const [row] = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
        eq(projectMembers.status, "active"),
        isNull(projects.deletedAt),
      ),
    );
  if (!row) throw new AppError("Projeto não encontrado.", "not_found");
  return row;
}

async function ownedProject(db: Db, userId: string, projectId: string) {
  const m = await activeMembership(db, userId, projectId);
  if (m.role !== "owner") throw new AppError("Só o dono do projeto pode fazer isso.", "forbidden");
  return m.project;
}

/** Segundos de foco por projeto (todos os participantes), por tarefa e por participante. */
async function secondsFor(db: Db, projectIds: string[], now: Date, range?: Range) {
  if (projectIds.length === 0) return [];
  const where = [inArray(studySessions.projectId, projectIds)];
  if (range) {
    where.push(lt(sessionSegments.startedAt, range.end));
    where.push(or(isNull(sessionSegments.endedAt), gt(sessionSegments.endedAt, range.start))!);
  }
  const rows = await db
    .select({
      projectId: studySessions.projectId,
      taskId: studySessions.taskId,
      userId: sessionSegments.userId,
      start: sessionSegments.startedAt,
      end: sessionSegments.endedAt,
    })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(and(...where));
  return rows.map((r) => {
    const end = r.end ?? now;
    const seconds = range ? clippedSeconds(r.start, end, range) : Math.max(0, (end.getTime() - r.start.getTime()) / 1000);
    return { projectId: r.projectId!, taskId: r.taskId, userId: r.userId, seconds };
  });
}

const sum = <T,>(rows: T[], pick: (r: T) => boolean, value: (r: T) => number) =>
  Math.floor(rows.filter(pick).reduce((a, r) => a + value(r), 0));

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  context: AppContext;
  status: ProjectStatus;
  role: "owner" | "member";
  targetMinutes: number | null;
  dueDate: string | null;
  totalSeconds: number;
  mySeconds: number;
  members: number;
  tasks: { total: number; done: number };
  openTasks: { id: string; title: string }[];
};

/** Projetos do usuário (ativos como dono ou membro) no contexto. */
export async function listProjects(ctx: Ctx, userId: string, context: AppContext): Promise<ProjectSummary[]> {
  const rows = await ctx.db
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .where(
      and(
        eq(projectMembers.userId, userId),
        eq(projectMembers.status, "active"),
        eq(projects.context, context),
        isNull(projects.deletedAt),
      ),
    )
    .orderBy(asc(projects.name));
  const ids = rows.map((r) => r.project.id);
  if (ids.length === 0) return [];
  const [secs, memberCounts, taskRows] = await Promise.all([
    secondsFor(ctx.db, ids, ctx.now()),
    ctx.db
      .select({ projectId: projectMembers.projectId, n: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(and(inArray(projectMembers.projectId, ids), eq(projectMembers.status, "active")))
      .groupBy(projectMembers.projectId),
    ctx.db
      .select({ id: projectTasks.id, projectId: projectTasks.projectId, title: projectTasks.title, doneAt: projectTasks.doneAt })
      .from(projectTasks)
      .where(and(inArray(projectTasks.projectId, ids), isNull(projectTasks.deletedAt)))
      .orderBy(asc(projectTasks.createdAt)),
  ]);
  const membersBy = new Map(memberCounts.map((m) => [m.projectId, Number(m.n)]));
  return rows.map(({ project: p, role }) => {
    const tasks = taskRows.filter((t) => t.projectId === p.id);
    return {
      id: p.id,
      name: p.name,
      color: p.color,
      context: p.context,
      status: p.status,
      role,
      targetMinutes: p.targetMinutes,
      dueDate: p.dueDate,
      totalSeconds: sum(secs, (s) => s.projectId === p.id, (s) => s.seconds),
      mySeconds: sum(secs, (s) => s.projectId === p.id && s.userId === userId, (s) => s.seconds),
      members: membersBy.get(p.id) ?? 1,
      tasks: { total: tasks.length, done: tasks.filter((t) => t.doneAt).length },
      openTasks: tasks.filter((t) => !t.doneAt).map((t) => ({ id: t.id, title: t.title })),
    };
  });
}

/** Convites pendentes recebidos pelo usuário (de qualquer contexto). */
export async function listInvites(ctx: Ctx, userId: string) {
  return ctx.db
    .select({
      projectId: projects.id,
      name: projects.name,
      context: projects.context,
      color: projects.color,
      invitedAt: projectMembers.invitedAt,
      ownerName: profiles.displayName,
    })
    .from(projectMembers)
    .innerJoin(projects, eq(projects.id, projectMembers.projectId))
    .innerJoin(profiles, eq(profiles.userId, projects.ownerUserId))
    .where(and(eq(projectMembers.userId, userId), eq(projectMembers.status, "invited"), isNull(projects.deletedAt)))
    .orderBy(desc(projectMembers.invitedAt));
}

/**
 * Detalhe do projeto para um participante: tarefas, participantes, ranking do período e
 * atividade recente (quem focou, em quê, por quanto tempo e com qual método).
 */
export async function getProject(ctx: Ctx, userId: string, projectId: string, range?: Range) {
  const { project: p, role } = await activeMembership(ctx.db, userId, projectId);
  const now = ctx.now();
  const [members, tasks, allSecs, periodSecs, recent] = await Promise.all([
    ctx.db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        status: projectMembers.status,
        joinedAt: projectMembers.joinedAt,
        displayName: profiles.displayName,
        publicCode: profiles.publicCode,
      })
      .from(projectMembers)
      .innerJoin(profiles, eq(profiles.userId, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId)),
    ctx.db
      .select()
      .from(projectTasks)
      .where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)))
      .orderBy(asc(projectTasks.createdAt)),
    secondsFor(ctx.db, [projectId], now),
    range ? secondsFor(ctx.db, [projectId], now, range) : Promise.resolve(null),
    ctx.db
      .select({
        id: studySessions.id,
        userId: studySessions.userId,
        taskId: studySessions.taskId,
        methodName: studyMethods.name,
        activeSeconds: studySessions.activeSeconds,
        endedAt: studySessions.endedAt,
        correction: studySessions.correction,
        originalActiveSeconds: studySessions.originalActiveSeconds,
      })
      .from(studySessions)
      .innerJoin(studyMethods, eq(studyMethods.id, studySessions.methodId))
      .where(and(eq(studySessions.projectId, projectId), isNotNull(studySessions.endedAt)))
      .orderBy(desc(studySessions.endedAt))
      .limit(20),
  ]);
  const nameOf = new Map(members.map((m) => [m.userId, m.displayName]));
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));
  const deps = tasks.length
    ? await ctx.db
        .select()
        .from(projectTaskDependencies)
        .where(inArray(projectTaskDependencies.taskId, tasks.map((t) => t.id)))
    : [];
  const active = members.filter((m) => m.status === "active");
  const rankingSecs = periodSecs ?? allSecs;
  const ranking = active
    .map((m) => ({
      userId: m.userId,
      displayName: m.displayName,
      publicCode: m.publicCode,
      seconds: sum(rankingSecs, (s) => s.userId === m.userId, (s) => s.seconds),
      isViewer: m.userId === userId,
    }))
    .sort((a, b) => b.seconds - a.seconds || a.displayName.localeCompare(b.displayName))
    .map((r, i) => ({ ...r, position: i + 1 }));

  return {
    id: p.id,
    name: p.name,
    description: p.description,
    color: p.color,
    context: p.context,
    organizationId: p.organizationId,
    status: p.status,
    targetMinutes: p.targetMinutes,
    dueDate: p.dueDate,
    role,
    isOwner: role === "owner",
    totalSeconds: sum(allSecs, () => true, (s) => s.seconds),
    mySeconds: sum(allSecs, (s) => s.userId === userId, (s) => s.seconds),
    members: members.map((m) => ({ ...m, isViewer: m.userId === userId })),
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      targetMinutes: t.targetMinutes,
      assigneeUserId: t.assigneeUserId,
      assigneeName: t.assigneeUserId ? (nameOf.get(t.assigneeUserId) ?? null) : null,
      createdBy: t.createdBy,
      canDelete: role === "owner" || t.createdBy === userId,
      startDate: t.startDate,
      dueDate: t.dueDate,
      phase: t.phase,
      dependsOn: deps.filter((d) => d.taskId === t.id).map((d) => d.dependsOnTaskId),
      done: Boolean(t.doneAt),
      seconds: sum(allSecs, (s) => s.taskId === t.id, (s) => s.seconds),
    })),
    ranking,
    recent: recent.map((r) => ({
      id: r.id,
      who: nameOf.get(r.userId) ?? "—",
      task: r.taskId ? (taskTitle.get(r.taskId) ?? null) : null,
      methodName: r.methodName,
      activeSeconds: r.activeSeconds,
      endedAt: r.endedAt!,
      /** Correção feita pela própria pessoa (visível ao grupo): tempo reduzido ou sessão excluída. */
      correction: r.correction,
      originalSeconds: r.originalActiveSeconds,
    })),
  };
}

export type ProjectDetail = Awaited<ReturnType<typeof getProject>>;

type ProjectInput = {
  name: string;
  description?: string | null;
  color?: string;
  targetMinutes?: number | null;
  dueDate?: string | null;
};

function checkTarget(minutes: number | null | undefined) {
  if (minutes == null) return;
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > PROJECT_LIMITS.maxTargetMinutes) {
    throw new AppError("Horas a cumprir inválidas.");
  }
}

export async function createProject(ctx: Ctx, userId: string, input: ProjectInput & { context: AppContext }) {
  checkTarget(input.targetMinutes);
  const now = ctx.now();
  return ctx.db.transaction(async (tx) => {
    const [p] = await tx
      .insert(projects)
      .values({
        ownerUserId: userId,
        context: input.context,
        name: input.name.trim(),
        description: input.description?.trim() || null,
        ...(input.color ? { color: input.color } : {}),
        targetMinutes: input.targetMinutes ?? null,
        dueDate: input.dueDate || null,
      })
      .returning();
    await tx
      .insert(projectMembers)
      .values({ projectId: p.id, userId, role: "owner", status: "active", invitedBy: userId, invitedAt: now, joinedAt: now });
    return p;
  });
}

export async function updateProject(
  ctx: Ctx,
  userId: string,
  projectId: string,
  input: Partial<ProjectInput> & { status?: ProjectStatus },
) {
  await ownedProject(ctx.db, userId, projectId);
  checkTarget(input.targetMinutes);
  const set: Partial<ProjectRow> = { updatedAt: ctx.now() };
  if (input.name !== undefined) set.name = input.name.trim();
  if (input.description !== undefined) set.description = input.description?.trim() || null;
  if (input.color) set.color = input.color;
  if (input.targetMinutes !== undefined) set.targetMinutes = input.targetMinutes;
  if (input.dueDate !== undefined) set.dueDate = input.dueDate || null;
  if (input.status) set.status = input.status;
  await ctx.db.update(projects).set(set).where(eq(projects.id, projectId));
}

/** Exclusão lógica: some das listas; sessões e XP continuam no histórico de cada participante. */
export async function deleteProject(ctx: Ctx, userId: string, projectId: string) {
  await ownedProject(ctx.db, userId, projectId);
  await ctx.db.update(projects).set({ deletedAt: ctx.now(), updatedAt: ctx.now() }).where(eq(projects.id, projectId));
}

/** Convida pelo código público da conta (ex.: FCS-7K2Q9XMP). Só o dono convida. */
export async function inviteMember(ctx: Ctx, userId: string, projectId: string, publicCode: string) {
  await ownedProject(ctx.db, userId, projectId);
  const code = publicCode.trim().toUpperCase();
  const [target] = await ctx.db.select({ userId: profiles.userId }).from(profiles).where(eq(profiles.publicCode, code));
  if (!target) throw new AppError("Nenhuma conta com esse código.", "not_found");
  if (target.userId === userId) throw new AppError("Você já participa deste projeto.", "conflict");
  return ctx.db.transaction(async (tx) => {
    const [{ n }] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(projectMembers)
      .where(eq(projectMembers.projectId, projectId));
    if (Number(n) >= PROJECT_LIMITS.maxMembers) {
      throw new AppError(`O projeto já tem o máximo de ${PROJECT_LIMITS.maxMembers} participantes.`, "conflict");
    }
    const inserted = await tx
      .insert(projectMembers)
      .values({ projectId, userId: target.userId, role: "member", status: "invited", invitedBy: userId, invitedAt: ctx.now() })
      .onConflictDoNothing()
      .returning();
    if (inserted.length === 0) throw new AppError("Essa pessoa já participa ou já foi convidada.", "conflict");
  });
}

export async function respondInvite(ctx: Ctx, userId: string, projectId: string, accept: boolean) {
  const where = and(
    eq(projectMembers.projectId, projectId),
    eq(projectMembers.userId, userId),
    eq(projectMembers.status, "invited"),
  );
  const [invite] = await ctx.db.select().from(projectMembers).where(where);
  if (!invite) throw new AppError("Convite não encontrado.", "not_found");
  if (accept) {
    await ctx.db.update(projectMembers).set({ status: "active", joinedAt: ctx.now() }).where(where);
  } else {
    await ctx.db.delete(projectMembers).where(where);
  }
}

/**
 * Remove um participante (o dono remove qualquer membro; o membro pode sair). O dono não sai do
 * próprio projeto. O tempo já registrado continua no projeto e no histórico de quem saiu.
 */
export async function removeMember(ctx: Ctx, userId: string, projectId: string, memberUserId: string) {
  if (memberUserId !== userId) await ownedProject(ctx.db, userId, projectId);
  const [m] = await ctx.db
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)));
  if (!m) throw new AppError("Participante não encontrado.", "not_found");
  if (m.role === "owner") throw new AppError("O dono não pode sair do próprio projeto.", "invalid");
  await ctx.db
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, memberUserId)));
  await ctx.db
    .update(projectTasks)
    .set({ assigneeUserId: null })
    .where(and(eq(projectTasks.projectId, projectId), eq(projectTasks.assigneeUserId, memberUserId)));
}

async function checkAssignee(db: Db, projectId: string, assigneeUserId: string | null | undefined) {
  if (!assigneeUserId) return;
  const [m] = await db
    .select()
    .from(projectMembers)
    .where(
      and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, assigneeUserId),
        eq(projectMembers.status, "active"),
      ),
    );
  if (!m) throw new AppError("Responsável precisa participar do projeto.");
}

export async function createTask(
  ctx: Ctx,
  userId: string,
  projectId: string,
  input: {
    title: string;
    targetMinutes?: number | null;
    assigneeUserId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    phase?: string | null;
  },
) {
  checkDates(input.startDate, input.dueDate);
  // Qualquer participante acrescenta tarefas; só o dono designa outra pessoa.
  const { role } = await activeMembership(ctx.db, userId, projectId);
  if (role !== "owner" && input.assigneeUserId && input.assigneeUserId !== userId) {
    throw new AppError("Só o dono do projeto pode designar tarefas para outras pessoas.", "forbidden");
  }
  checkTarget(input.targetMinutes);
  await checkAssignee(ctx.db, projectId, input.assigneeUserId);
  const [{ n }] = await ctx.db
    .select({ n: sql<number>`count(*)::int` })
    .from(projectTasks)
    .where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)));
  if (Number(n) >= PROJECT_LIMITS.maxTasks) {
    throw new AppError(`O projeto já tem o máximo de ${PROJECT_LIMITS.maxTasks} tarefas.`, "conflict");
  }
  const [t] = await ctx.db
    .insert(projectTasks)
    .values({
      projectId,
      title: input.title.trim(),
      targetMinutes: input.targetMinutes ?? null,
      assigneeUserId: input.assigneeUserId || null,
      startDate: input.startDate || null,
      dueDate: input.dueDate || null,
      phase: input.phase?.trim() || null,
      createdBy: userId,
    })
    .returning();
  return t;
}

async function projectTask(db: Db, projectId: string, taskId: string) {
  const [t] = await db
    .select()
    .from(projectTasks)
    .where(and(eq(projectTasks.id, taskId), eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)));
  if (!t) throw new AppError("Tarefa não encontrada.", "not_found");
  return t;
}

export async function updateTask(
  ctx: Ctx,
  userId: string,
  projectId: string,
  taskId: string,
  input: {
    title?: string;
    targetMinutes?: number | null;
    assigneeUserId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    phase?: string | null;
    dependsOn?: string[];
  },
) {
  await ownedProject(ctx.db, userId, projectId);
  const current = await projectTask(ctx.db, projectId, taskId);
  checkTarget(input.targetMinutes);
  checkDates(
    input.startDate !== undefined ? input.startDate : current.startDate,
    input.dueDate !== undefined ? input.dueDate : current.dueDate,
  );
  await checkAssignee(ctx.db, projectId, input.assigneeUserId);
  const changes = {
    ...(input.title !== undefined ? { title: input.title.trim() } : {}),
    ...(input.targetMinutes !== undefined ? { targetMinutes: input.targetMinutes } : {}),
    ...(input.assigneeUserId !== undefined ? { assigneeUserId: input.assigneeUserId || null } : {}),
    ...(input.startDate !== undefined ? { startDate: input.startDate || null } : {}),
    ...(input.dueDate !== undefined ? { dueDate: input.dueDate || null } : {}),
    ...(input.phase !== undefined ? { phase: input.phase?.trim() || null } : {}),
  };
  await ctx.db.transaction(async (tx) => {
    if (Object.keys(changes).length) await tx.update(projectTasks).set(changes).where(eq(projectTasks.id, taskId));
    if (input.dependsOn) {
      const wanted = [...new Set(input.dependsOn)].filter((d) => d !== taskId);
      const siblings = await tx
        .select({ id: projectTasks.id })
        .from(projectTasks)
        .where(and(eq(projectTasks.projectId, projectId), isNull(projectTasks.deletedAt)));
      if (wanted.some((d) => !siblings.some((x) => x.id === d))) throw new AppError("Tarefa não encontrada.", "not_found");
      const edges = (
        await tx
          .select()
          .from(projectTaskDependencies)
          .where(inArray(projectTaskDependencies.taskId, siblings.map((x) => x.id)))
      )
        .filter((e) => e.taskId !== taskId)
        .map((e) => ({ taskId: e.taskId, dependsOn: e.dependsOnTaskId }));
      for (const d of wanted) {
        if (createsCycle(edges, taskId, d)) throw new AppError("Essa dependência criaria um ciclo entre as tarefas.", "invalid");
        edges.push({ taskId, dependsOn: d });
      }
      await tx.delete(projectTaskDependencies).where(eq(projectTaskDependencies.taskId, taskId));
      if (wanted.length) {
        await tx.insert(projectTaskDependencies).values(wanted.map((d) => ({ taskId, dependsOnTaskId: d })));
      }
    }
  });
}

function checkDates(start: string | null | undefined, due: string | null | undefined) {
  if (start && !isIsoDate(start)) throw new AppError("Data inválida.");
  if (due && !isIsoDate(due)) throw new AppError("Data inválida.");
  if (start && due && start > due) throw new AppError("O início precisa ser antes do prazo.");
}

/** Qualquer participante ativo marca ou desmarca uma tarefa como concluída. */
export async function setTaskDone(ctx: Ctx, userId: string, projectId: string, taskId: string, done: boolean) {
  await activeMembership(ctx.db, userId, projectId);
  await projectTask(ctx.db, projectId, taskId);
  await ctx.db
    .update(projectTasks)
    .set(done ? { doneAt: ctx.now(), doneBy: userId } : { doneAt: null, doneBy: null })
    .where(eq(projectTasks.id, taskId));
}

/** Quem criou a tarefa (ou o dono do projeto) exclui. */
export async function deleteTask(ctx: Ctx, userId: string, projectId: string, taskId: string) {
  const { role } = await activeMembership(ctx.db, userId, projectId);
  const task = await projectTask(ctx.db, projectId, taskId);
  if (role !== "owner" && task.createdBy !== userId) {
    throw new AppError("Só quem criou a tarefa ou o dono do projeto pode excluí-la.", "forbidden");
  }
  await ctx.db.update(projectTasks).set({ deletedAt: ctx.now() }).where(eq(projectTasks.id, taskId));
}

/**
 * Valida o projeto/tarefa para iniciar uma sessão de foco: participante ativo, projeto ativo e
 * tarefa aberta do próprio projeto.
 */
export async function projectForSession(tx: Tx, userId: string, projectId: string, taskId: string | null) {
  const { project } = await activeMembership(tx, userId, projectId);
  if (project.status !== "active") throw new AppError("Este projeto não está ativo.", "invalid");
  let task: typeof projectTasks.$inferSelect | null = null;
  if (taskId) {
    task = await projectTask(tx, projectId, taskId);
    if (task.doneAt) throw new AppError("Esta tarefa já foi concluída.", "invalid");
  }
  return { project, task };
}

/**
 * Banco de horas do usuário num contexto: tempo de foco na semana, no mês e no total
 * (estudo e projetos juntos). A sessão em andamento conta até agora.
 */
export async function getHoursBank(ctx: Ctx, userId: string, context: AppContext, ranges: { week: Range; month: Range }) {
  const now = ctx.now();
  const rows = await ctx.db
    .select({ start: sessionSegments.startedAt, end: sessionSegments.endedAt, projectId: studySessions.projectId })
    .from(sessionSegments)
    .innerJoin(studySessions, eq(studySessions.id, sessionSegments.sessionId))
    .where(and(eq(sessionSegments.userId, userId), eq(studySessions.context, context)));
  const total = (range?: Range, onlyProjects = false) =>
    Math.floor(
      rows
        .filter((r) => !onlyProjects || r.projectId)
        .reduce((a, r) => {
          const end = r.end ?? now;
          return a + (range ? clippedSeconds(r.start, end, range) : (end.getTime() - r.start.getTime()) / 1000);
        }, 0),
    );
  return {
    weekSeconds: total(ranges.week),
    monthSeconds: total(ranges.month),
    allSeconds: total(),
    projectSeconds: total(undefined, true),
  };
}
