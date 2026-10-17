"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import { updateProfile } from "@/server/services/profile";
import { toResult } from "./result";

const profileInput = z.object({
  displayName: z.string().trim().min(2, "Nome muito curto.").max(40, "Nome muito longo (máx. 40).").optional(),
  timezone: z.string().min(1).max(64).optional(),
  alarmVolume: z.number().int().min(0).max(100).optional(),
});

export async function updateProfileAction(input: z.input<typeof profileInput>) {
  return toResult(async () => {
    const user = await requireUser();
    await updateProfile(await appCtx(), user.id, profileInput.parse(input));
    revalidatePath("/", "layout");
  });
}
