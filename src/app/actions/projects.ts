"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { PROJECT_LIMITS, PROJECT_STATUSES } from "@/domain/contexts";
import { appCtx, requireUser } from "@/server/auth/session";
import { getActiveContext } from "@/server/services/profile";
import { createOrgProject, managedOrgForContext } from "@/server/services/organizations";
import * as svc from "@/server/services/projects";
import { toResult } from "./result";

const id = z.uuid("Identificador inválido.");
const name = z.string().trim().min(1, "Informe um nome.").max(80, "Nome muito longo (máx. 80).");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");
/** Horas a cumprir, recebidas em horas (aceita frações) e guardadas em minutos. */
const hours = z
  .number("Horas a cumprir inválidas.")
  .positive("Horas a cumprir inválidas.")
  .max(PROJECT_LIMITS.maxTargetMinutes / 60, "Horas a cumprir inválidas.")
  .transform((h) => Math.round(h * 60))
  .nullish();
const dueDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullish()
  .or(z.literal("").transform(() => null));
const description = z.string().trim().max(500, "Descrição muito longa (máx. 500).").nullish();

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof appCtx>>, userId: string) => Promise<T>) {
  return toResult(async () => {
    const user = await requireUser();
    const result = await fn(await appCtx(), user.id);
    revalidatePath("/registro", "layout");
    revalidatePath("/estudar");
    return result;
  });
}

export async function createProjectAction(input: {
  name: string;
  description?: string | null;
  color?: string;
  targetHours?: number | null;
  dueDate?: string | null;
}) {
  return run(async (ctx, uid) => {
    const data = z.object({ name, description, color: color.optional(), targetHours: hours, dueDate }).parse(input);
    const context = await getActiveContext(ctx, uid);
    const fields = {
      name: data.name,
      description: data.description,
      color: data.color,
      targetMinutes: data.targetHours ?? null,
      dueDate: data.dueDate ?? null,
    };
    // Gestor/dono de instituição (Acadêmico) ou empresa (Profissional): o projeto já nasce da
    // organização, e os participantes entram direto, sem precisar aceitar convite.
    const orgId = await managedOrgForContext(ctx.db, uid, context);
    const p = orgId ? await createOrgProject(ctx, uid, orgId, fields) : await svc.createProject(ctx, uid, { context, ...fields });
    return { id: p.id };
  });
}

export async function updateProjectAction(
  projectId: string,
  input: {
    name?: string;
    description?: string | null;
    color?: string;
    targetHours?: number | null;
    dueDate?: string | null;
    status?: string;
  },
) {
  return run(async (ctx, uid) => {
    const data = z
      .object({
        name: name.optional(),
        description,
        color: color.optional(),
        targetHours: hours,
        dueDate,
        status: z.enum(PROJECT_STATUSES).optional(),
      })
      .parse(input);
    await svc.updateProject(ctx, uid, id.parse(projectId), {
      name: data.name,
      description: data.description,
      color: data.color,
      ...("targetHours" in input ? { targetMinutes: data.targetHours ?? null } : {}),
      ...("dueDate" in input ? { dueDate: data.dueDate ?? null } : {}),
      status: data.status,
    });
  });
}

export async function deleteProjectAction(projectId: string) {
  return run((ctx, uid) => svc.deleteProject(ctx, uid, id.parse(projectId)));
}

export async function inviteMemberAction(projectId: string, publicCode: string) {
  return run((ctx, uid) =>
    svc.inviteMember(
      ctx,
      uid,
      id.parse(projectId),
      z.string().trim().min(4, "Informe o código da conta.").max(20, "Informe o código da conta.").parse(publicCode),
    ),
  );
}

export async function respondInviteAction(projectId: string, accept: boolean) {
  return run((ctx, uid) => svc.respondInvite(ctx, uid, id.parse(projectId), z.boolean().parse(accept)));
}

export async function removeMemberAction(projectId: string, memberUserId: string) {
  return run((ctx, uid) =>
    svc.removeMember(ctx, uid, id.parse(projectId), z.string().min(1).max(64).parse(memberUserId)),
  );
}

const taskTitle = z.string().trim().min(1, "Informe a tarefa.").max(120, "Tarefa muito longa (máx. 120).");
const taskDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.")
  .nullish()
  .or(z.literal("").transform(() => null));
const phase = z.string().trim().max(60, "Fase muito longa (máx. 60).").nullish();

export async function createTaskAction(
  projectId: string,
  input: {
    title: string;
    targetHours?: number | null;
    assigneeUserId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    phase?: string | null;
  },
) {
  return run(async (ctx, uid) => {
    const data = z
      .object({ title: taskTitle, targetHours: hours, assigneeUserId: z.string().max(64).nullish(), startDate: taskDate, dueDate: taskDate, phase })
      .parse(input);
    await svc.createTask(ctx, uid, id.parse(projectId), {
      title: data.title,
      targetMinutes: data.targetHours ?? null,
      assigneeUserId: data.assigneeUserId || null,
      startDate: data.startDate ?? null,
      dueDate: data.dueDate ?? null,
      phase: data.phase ?? null,
    });
  });
}

export async function updateTaskAction(
  projectId: string,
  taskId: string,
  input: {
    title?: string;
    targetHours?: number | null;
    assigneeUserId?: string | null;
    startDate?: string | null;
    dueDate?: string | null;
    phase?: string | null;
    dependsOn?: string[];
  },
) {
  return run(async (ctx, uid) => {
    const data = z
      .object({
        title: taskTitle.optional(),
        targetHours: hours,
        assigneeUserId: z.string().max(64).nullish(),
        startDate: taskDate,
        dueDate: taskDate,
        phase,
        dependsOn: z.array(id).max(50).optional(),
      })
      .parse(input);
    await svc.updateTask(ctx, uid, id.parse(projectId), id.parse(taskId), {
      title: data.title,
      ...("targetHours" in input ? { targetMinutes: data.targetHours ?? null } : {}),
      ...("assigneeUserId" in input ? { assigneeUserId: data.assigneeUserId || null } : {}),
      ...("startDate" in input ? { startDate: data.startDate ?? null } : {}),
      ...("dueDate" in input ? { dueDate: data.dueDate ?? null } : {}),
      ...("phase" in input ? { phase: data.phase ?? null } : {}),
      ...(data.dependsOn ? { dependsOn: data.dependsOn } : {}),
    });
  });
}

export async function setTaskDoneAction(projectId: string, taskId: string, done: boolean) {
  return run((ctx, uid) => svc.setTaskDone(ctx, uid, id.parse(projectId), id.parse(taskId), z.boolean().parse(done)));
}

export async function deleteTaskAction(projectId: string, taskId: string) {
  return run((ctx, uid) => svc.deleteTask(ctx, uid, id.parse(projectId), id.parse(taskId)));
}

export async function moveProjectAction(projectId: string, target: { context: string; organizationId: string | null }) {
  return run(async (ctx, uid) => {
    const { moveProject } = await import("@/server/services/project-moves");
    const t = z
      .object({ context: z.enum(["academic", "personal", "professional"], "Destino inválido para este projeto."), organizationId: id.nullable() })
      .parse(target);
    return moveProject(ctx, uid, id.parse(projectId), t);
  });
}

export async function decideMoveRequestAction(requestId: string, approve: boolean) {
  return run(async (ctx, uid) => {
    const { decideMoveRequest } = await import("@/server/services/project-moves");
    return decideMoveRequest(ctx, uid, id.parse(requestId), z.boolean().parse(approve));
  });
}
