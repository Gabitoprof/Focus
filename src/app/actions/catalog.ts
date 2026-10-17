"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import * as catalog from "@/server/services/catalog";
import { toResult } from "./result";

const id = z.uuid("Identificador inválido.");
const areaId = z.string().min(1).max(64);

export async function linkTopicAction(topicId: string, catalogTopicId: string | null) {
  return toResult(async () => {
    const user = await requireUser();
    await catalog.linkTopicToCatalog(await appCtx(), user.id, id.parse(topicId), catalogTopicId ? id.parse(catalogTopicId) : null);
    revalidatePath("/registro");
  });
}

const tagsInput = z.object({
  areaIds: z.array(areaId).max(20),
  catalogTopicIds: z.array(id).max(50),
  goalIds: z.array(z.string().min(1).max(32)).max(20),
});

export async function setProfileTagsAction(input: z.input<typeof tagsInput>) {
  return toResult(async () => {
    const user = await requireUser();
    await catalog.setProfileTags(await appCtx(), user.id, tagsInput.parse(input));
    revalidatePath("/perfil");
  });
}
