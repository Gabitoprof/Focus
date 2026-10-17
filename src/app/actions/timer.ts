"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import * as corrections from "@/server/services/corrections";
import * as timer from "@/server/services/timer";
import { toResult } from "./result";

/** Ações que mudam XP ou totais: atualiza o layout (saldo de XP no menu) e as páginas de dados. */
function refreshViews() {
  revalidatePath("/", "layout");
}

const id = z.uuid("Identificador inválido.");
const minutes = z.number().int().positive().max(600).optional();
/** Assunto: tema (Estude) ou projeto com tarefa opcional (Projetos). */
const startInput = z
  .object({
    topicId: id.optional(),
    projectId: id.optional(),
    taskId: id.nullish(),
    methodId: z.string().min(1).max(64),
    plannedMinutes: minutes,
  })
  .refine((v) => Boolean(v.topicId) !== Boolean(v.projectId), "Tema inválido.");

export async function getTimerStateAction() {
  return toResult(async () => {
    const user = await requireUser();
    return timer.getTimerState(await appCtx(), user.id);
  });
}

export async function startSessionAction(input: z.input<typeof startInput>) {
  return toResult(async () => {
    const user = await requireUser();
    const state = await timer.startSession(await appCtx(), user.id, startInput.parse(input));
    refreshViews(); // pode encerrar um intervalo (e aplicar penalidade)
    return state;
  });
}

export async function pauseSessionAction(sessionId: string) {
  return toResult(async () => {
    const user = await requireUser();
    return timer.pauseSession(await appCtx(), user.id, id.parse(sessionId));
  });
}

export async function resumeSessionAction(sessionId: string) {
  return toResult(async () => {
    const user = await requireUser();
    return timer.resumeSession(await appCtx(), user.id, id.parse(sessionId));
  });
}

export async function heartbeatAction(sessionId: string) {
  return toResult(async () => {
    const user = await requireUser();
    return timer.heartbeat(await appCtx(), user.id, id.parse(sessionId));
  });
}

export async function finishSessionAction(sessionId: string, opts: { startBreak?: boolean; breakMinutes?: number } = {}) {
  return toResult(async () => {
    const user = await requireUser();
    const parsed = z.object({ startBreak: z.boolean().optional(), breakMinutes: minutes }).parse(opts);
    const state = await timer.finishSession(await appCtx(), user.id, id.parse(sessionId), parsed);
    refreshViews();
    return state;
  });
}

export async function startBreakAction(breakMinutes?: number) {
  return toResult(async () => {
    const user = await requireUser();
    const state = await timer.startBreak(await appCtx(), user.id, { minutes: minutes.parse(breakMinutes) });
    refreshViews();
    return state;
  });
}

export async function finishBreakAction(breakId: string, backToStudy?: z.input<typeof startInput>) {
  return toResult(async () => {
    const user = await requireUser();
    const state = await timer.finishBreak(
      await appCtx(),
      user.id,
      id.parse(breakId),
      backToStudy ? startInput.parse(backToStudy) : undefined,
    );
    refreshViews(); // penalidade de intervalo altera o XP
    return state;
  });
}

/** Correção da própria sessão (só para menos): reduzir o tempo ou excluir. */
export async function trimSessionAction(sessionId: string, minutes: number) {
  return toResult(async () => {
    const user = await requireUser();
    const r = await corrections.trimSession(await appCtx(), user.id, id.parse(sessionId), z.number().int().parse(minutes));
    refreshViews();
    return r;
  });
}

export async function deleteSessionAction(sessionId: string) {
  return toResult(async () => {
    const user = await requireUser();
    const r = await corrections.deleteSession(await appCtx(), user.id, id.parse(sessionId));
    refreshViews();
    return r;
  });
}
