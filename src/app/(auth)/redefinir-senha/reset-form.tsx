"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export function ResetForm() {
  const { t } = useI18n();
  const params = useSearchParams();
  const token = params.get("token");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error") ? t.auth.invalidLink : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get("password"));
    if (newPassword !== String(form.get("confirm"))) return setError(t.auth.passwordsDontMatch);
    if (!token) return setError(t.auth.invalidLink);
    setPending(true);
    const { error } = await authClient.resetPassword({ newPassword, token });
    setPending(false);
    if (error) setError(t.auth.invalidLink);
    else setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="good">{t.auth.passwordChanged}</Alert>
        <Link href="/login" className="block text-center text-sm font-medium text-link">
          {t.auth.goToLogin}
        </Link>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <title>{`${t.meta.titles.reset} · Focus`}</title>
      <h1 className="text-xl font-semibold">{t.auth.resetTitle}</h1>
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="password">{t.auth.newPassword}</Label>
        <Input id="password" name="password" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor="confirm">{t.auth.confirmNewPassword}</Label>
        <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.common.saving : t.auth.savePassword}
      </Button>
    </form>
  );
}
