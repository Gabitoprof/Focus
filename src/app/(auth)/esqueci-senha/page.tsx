"use client";

import Link from "next/link";
import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get("email")).trim();
    setPending(true);
    setError(null);
    const { error } = await authClient.requestPasswordReset({ email, redirectTo: "/redefinir-senha" });
    setPending(false);
    if (error) setError(t.auth.sendFailed);
    else setSent(true);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <title>{`${t.meta.titles.forgot} · Focus`}</title>
      <h1 className="text-xl font-semibold">{t.auth.forgotTitle}</h1>
      {sent ? (
        <Alert tone="good">{t.auth.forgotSent}</Alert>
      ) : (
        <>
          {error && <Alert>{error}</Alert>}
          <div>
            <Label htmlFor="email">{t.auth.email}</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <Button type="submit" className="w-full" disabled={pending}>
            {pending ? t.auth.sending : t.auth.sendLink}
          </Button>
        </>
      )}
      <p className="text-center text-sm">
        <Link href="/login" className="text-text-2 hover:text-text">
          {t.auth.backToLogin}
        </Link>
      </p>
    </form>
  );
}
