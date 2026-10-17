import { appCtx, requireUser } from "@/server/auth/session";
import { isMaster } from "@/server/services/profile";
import { AppNav } from "./nav";

/** Menu lateral com a aba Master só para quem tem o papel "master". */
export async function AppNavWithRoles() {
  const user = await requireUser();
  const ctx = await appCtx();
  return <AppNav showMaster={await isMaster(ctx.db, user.id)} />;
}
