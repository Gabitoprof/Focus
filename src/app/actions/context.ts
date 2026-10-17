"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { CONTEXTS } from "@/domain/contexts";
import { appCtx, requireUser } from "@/server/auth/session";
import { setActiveContext } from "@/server/services/profile";
import { toResult } from "./result";

/** Troca o contexto em uso (Acadêmico, Pessoal ou Profissional). */
export async function setActiveContextAction(context: string) {
  return toResult(async () => {
    const user = await requireUser();
    await setActiveContext(await appCtx(), user.id, z.enum(CONTEXTS, "Contexto inválido.").parse(context));
    revalidatePath("/", "layout");
  });
}
