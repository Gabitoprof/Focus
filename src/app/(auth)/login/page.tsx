"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")).trim(),
      password: String(form.get("password")),
    });
    setPending(false);
    if (error) {
      setError(error.status === 401 ? t.auth.wrongCredentials : t.auth.loginFailed);
      return;
    }
    router.replace("/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <title>{`${t.meta.titles.login} · Focus`}</title>
      <h1 className="text-xl font-semibold">{t.auth.loginTitle}</h1>
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <div>
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.signingIn : t.auth.signIn}
      </Button>
      <div className="flex justify-between text-sm">
        <Link href="/esqueci-senha" className="text-text-2 hover:text-text">
          {t.auth.forgot}
        </Link>
        <Link href="/cadastro" className="font-medium text-link">
          {t.auth.createAccount}
        </Link>
      </div>
    </form>
  );
}
