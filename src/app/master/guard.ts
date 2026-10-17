import "server-only";
import { notFound } from "next/navigation";
import { appCtx, requireUser } from "@/server/auth/session";
import { isMaster } from "@/server/services/profile";

/** Página do console master: só para o papel "master"; para os demais, a rota não existe. */
export async function masterContext() {
  const user = await requireUser();
  const ctx = await appCtx();
  if (!(await isMaster(ctx.db, user.id))) notFound();
  return { ctx, userId: user.id };
}
