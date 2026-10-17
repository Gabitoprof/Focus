"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className="mt-2 text-xs text-text-2 underline-offset-2 hover:text-text hover:underline"
      onClick={async () => {
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      {t.nav.signOut}
    </button>
  );
}
