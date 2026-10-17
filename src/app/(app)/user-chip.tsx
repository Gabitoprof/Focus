import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getProfile } from "@/server/services/profile";
import { SignOutButton } from "./sign-out-button";

export async function UserChip({ compact = false }: { compact?: boolean }) {
  const user = await requireUser();
  const profile = await getProfile(await appCtx(), user.id);
  const { t } = await getI18n();
  if (compact) {
    return (
      <span className="rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-link tabular">
        {t.user.xp(profile.xpBalance)}
      </span>
    );
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="truncate text-sm font-medium">{profile.displayName}</p>
      <p className="text-xs text-text-2 tabular">{t.user.xp(profile.xpBalance)}</p>
      <SignOutButton />
    </div>
  );
}
