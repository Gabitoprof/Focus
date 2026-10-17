"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { appCtx, requireUser } from "@/server/auth/session";
import * as svc from "@/server/services/friends";
import { toResult } from "./result";

const code = z.string().trim().min(4, "Informe o código da conta.").max(20, "Informe o código da conta.");

async function run<T>(fn: (ctx: Awaited<ReturnType<typeof appCtx>>, userId: string) => Promise<T>) {
  return toResult(async () => {
    const user = await requireUser();
    const result = await fn(await appCtx(), user.id);
    revalidatePath("/perfil");
    revalidatePath("/ranking");
    return result;
  });
}

export async function sendFriendRequestAction(publicCode: string) {
  return run((ctx, uid) => svc.sendFriendRequest(ctx, uid, code.parse(publicCode)));
}

export async function respondFriendRequestAction(publicCode: string, accept: boolean) {
  return run((ctx, uid) => svc.respondFriendRequest(ctx, uid, code.parse(publicCode), z.boolean().parse(accept)));
}

export async function removeFriendAction(publicCode: string) {
  return run((ctx, uid) => svc.removeFriend(ctx, uid, code.parse(publicCode)));
}
