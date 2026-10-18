import { needsTermsAcceptance } from "@/domain/legal";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { AcceptTermsForm } from "./accept-terms-form";

/**
 * Quem ainda não aceitou a versão vigente dos Termos e da Política de Privacidade vê o pedido
 * de aceite no lugar da tela, uma única vez; depois segue normalmente.
 */
export async function TermsGate({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const profile = await getProfile(await appCtx(), user.id).catch(() => null);
  if (!profile || !needsTermsAcceptance(profile.termsVersion)) return <>{children}</>;
  const { t } = await getI18n();
  const L = t.legal;
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-border bg-surface p-6 sm:p-8">
      <h1 className="text-xl font-semibold">{profile.termsVersion ? L.updatedTitle : L.gateTitle}</h1>
      <p className="mt-2 text-sm text-text-2">{profile.termsVersion ? L.updatedText : L.gateText}</p>
      <AcceptTermsForm />
    </div>
  );
}
