"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import { listAreas } from "@/server/services/catalog";
import { USAGES } from "@/domain/contexts";
import * as svc from "@/server/services/categories";
import { AppError } from "@/server/services/common";
import { getActiveContext } from "@/server/services/profile";
import { toResult } from "./result";

const id = z.uuid("Identificador inválido.");
const name = z.string().trim().min(1, "Informe um nome.").max(80, "Nome muito longo (máx. 80).");
const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida.");

async function assertArea(ctx: Awaited<ReturnType<typeof appCtx>>, areaId: string) {
  const areas = await listAreas(ctx);
  if (!areas.some((a) => a.id === areaId)) throw new AppError("Área do conhecimento inválida.");
}

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof appCtx>>, userId: string) => Promise<T>) {
  return toResult(async () => {
    const user = await requireUser();
    const result = await fn(await appCtx(), user.id);
    revalidatePath("/registro");
    revalidatePath("/estudar");
    return result;
  });
}

export async function createCategoryAction(input: { name: string; color?: string; usage?: string | null }) {
  return run(async (ctx, uid) => {
    const data = z
      .object({ name, color: color.optional(), usage: z.enum(USAGES, "Área de utilização inválida.").nullish() })
      .parse(input);
    // A categoria nasce no contexto em uso (Acadêmico, Pessoal ou Profissional).
    await svc.createCategory(ctx, uid, { ...data, context: await getActiveContext(ctx, uid) });
  });
}

export async function updateCategoryAction(categoryId: string, input: { name?: string; color?: string }) {
  return run((ctx, uid) =>
    svc.updateCategory(ctx, uid, id.parse(categoryId), z.object({ name: name.optional(), color: color.optional() }).parse(input)),
  );
}

export async function archiveCategoryAction(categoryId: string, archived: boolean) {
  return run((ctx, uid) => svc.setCategoryArchived(ctx, uid, id.parse(categoryId), z.boolean().parse(archived)));
}

export async function deleteCategoryAction(categoryId: string) {
  return run((ctx, uid) => svc.deleteCategory(ctx, uid, id.parse(categoryId)));
}

export async function createTopicAction(input: { categoryId: string; name: string; areaId?: string | null }) {
  return run(async (ctx, uid) => {
    const data = z.object({ categoryId: id, name, areaId: z.string().min(1).max(64).nullish() }).parse(input);
    if (data.areaId) await assertArea(ctx, data.areaId);
    const t = await svc.createTopic(ctx, uid, data);
    return { id: t.id };
  });
}

export async function updateTopicAction(topicId: string, input: { name: string }) {
  return run((ctx, uid) => svc.updateTopic(ctx, uid, id.parse(topicId), z.object({ name }).parse(input)));
}

export async function archiveTopicAction(topicId: string, archived: boolean) {
  return run((ctx, uid) => svc.setTopicArchived(ctx, uid, id.parse(topicId), z.boolean().parse(archived)));
}

export async function deleteTopicAction(topicId: string) {
  return run((ctx, uid) => svc.deleteTopic(ctx, uid, id.parse(topicId)));
}

export async function makeCategoryPersonalAction(categoryId: string) {
  return run((ctx, uid) => svc.makeCategoryPersonal(ctx, uid, id.parse(categoryId)));
}

export async function setCategoryUsageAction(categoryId: string, usage: string) {
  return run((ctx, uid) =>
    svc.setCategoryUsage(ctx, uid, id.parse(categoryId), z.enum(USAGES, "Área de utilização inválida.").parse(usage)),
  );
}
