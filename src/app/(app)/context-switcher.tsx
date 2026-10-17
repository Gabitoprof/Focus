import { appCtx, requireUser } from "@/server/auth/session";
import { getContextAccess } from "@/server/services/membership";
import { getActiveContext } from "@/server/services/profile";
import { ContextTabs } from "./context-tabs";

/** Seletor de contexto (Acadêmico, Pessoal, Profissional) do usuário logado. */
export async function ContextSwitcher({ compact = false }: { compact?: boolean }) {
  const user = await requireUser();
  const ctx = await appCtx();
  const [current, access] = await Promise.all([getActiveContext(ctx, user.id), getContextAccess(ctx.db, user.id)]);
  return <ContextTabs current={current} access={access} compact={compact} />;
}
