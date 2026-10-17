"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert, Button, Input, Label } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) {
      setError(t.auth.passwordsDontMatch);
      return;
    }
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email({
      name: String(form.get("name")).trim(),
      email: String(form.get("email")).trim(),
      password,
    });
    setPending(false);
    if (error) {
      setError(
        error.code === "USER_ALREADY_EXISTS" || error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL"
          ? t.auth.emailTaken
          : error.code === "PASSWORD_TOO_SHORT"
            ? t.auth.passwordTooShort
            : t.auth.signupFailed,
      );
      return;
    }
    router.replace("/boas-vindas");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <title>{`${t.meta.titles.signup} · Focus`}</title>
      <h1 className="text-xl font-semibold">{t.auth.signupTitle}</h1>
      {error && <Alert>{error}</Alert>}
      <div>
        <Label htmlFor="name">{t.auth.displayName}</Label>
        <Input id="name" name="name" required minLength={2} maxLength={40} autoComplete="nickname" />
        <p className="mt-1 text-xs text-text-3">{t.auth.displayNameHint}</p>
      </div>
      <div>
        <Label htmlFor="email">{t.auth.email}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div>
        <Label htmlFor="password">{t.auth.password}</Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <div>
        <Label htmlFor="confirm">{t.auth.confirmPassword}</Label>
        <Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" />
      </div>
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? t.auth.creating : t.auth.createAccount}
      </Button>
      <p className="text-center text-sm text-text-2">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="font-medium text-link">
          {t.auth.signIn}
        </Link>
      </p>
    </form>
  );
}
