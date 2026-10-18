"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import { setShowcase } from "@/server/services/achievements";
import { toResult } from "./result";

/** Salva as conquistas da vitrine do ranking (até 3, só as desbloqueadas). */
export async function setShowcaseAction(ids: string[]) {
  return toResult(async () => {
    const user = await requireUser();
    const list = z.array(z.string().max(40)).max(10).parse(ids);
    const saved = await setShowcase(await appCtx(), user.id, list);
    revalidatePath("/conquistas");
    revalidatePath("/ranking");
    return saved;
  });
}
