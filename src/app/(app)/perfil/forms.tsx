"use client";

import { useMemo, useState, useTransition } from "react";
import { updateProfileAction } from "@/app/actions/profile";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Alert, Button, Card, Input, Label, Select } from "@/components/ui";
import { useI18n } from "@/i18n/client";
import { authClient } from "@/lib/auth-client";

export function ProfileForm({ displayName, timezone, email }: { displayName: string; timezone: string; email: string }) {
  const { t } = useI18n();
  const P = t.profile;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "good" | "danger"; text: string } | null>(null);
  const zones = useMemo(() => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [timezone];
    }
  }, [timezone]);

  return (
    <Card>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">{P.data}</h2>
        <LanguageSwitcher />
      </div>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          start(async () => {
            const res = await updateProfileAction({
              displayName: String(f.get("displayName")),
              timezone: String(f.get("timezone")),
            });
            setMsg(res.ok ? { tone: "good", text: P.updated } : { tone: "danger", text: res.error });
          });
        }}
      >
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div>
          <Label htmlFor="email">{P.email}</Label>
          <Input id="email" value={email} disabled />
          <p className="mt-1 text-xs text-text-3">{P.emailPrivate}</p>
        </div>
        <div>
          <Label htmlFor="displayName">{P.displayName}</Label>
          <Input id="displayName" name="displayName" defaultValue={displayName} minLength={2} maxLength={40} required />
        </div>
        <div>
          <Label htmlFor="timezone">{P.timezone}</Label>
          <Select id="timezone" name="timezone" defaultValue={timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
          <p className="mt-1 text-xs text-text-3">{P.timezoneHint}</p>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? t.common.saving : t.common.save}
        </Button>
      </form>
    </Card>
  );
}

export function PasswordForm() {
  const { t } = useI18n();
  const P = t.profile;
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "danger"; text: string } | null>(null);

  return (
    <Card>
      <h2 className="mb-4 font-semibold">{P.passwordTitle}</h2>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          const formEl = e.currentTarget;
          const f = new FormData(formEl);
          const newPassword = String(f.get("new"));
          if (newPassword !== String(f.get("confirm"))) {
            setMsg({ tone: "danger", text: t.auth.passwordsDontMatch });
            return;
          }
          setPending(true);
          const { error } = await authClient.changePassword({
            currentPassword: String(f.get("current")),
            newPassword,
            revokeOtherSessions: true,
          });
          setPending(false);
          if (error) {
            setMsg({ tone: "danger", text: error.code === "INVALID_PASSWORD" ? P.wrongPassword : P.changeFailed });
          } else {
            formEl.reset();
            setMsg({ tone: "good", text: P.changed });
          }
        }}
      >
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div>
          <Label htmlFor="current">{P.currentPassword}</Label>
          <Input id="current" name="current" type="password" required autoComplete="current-password" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new">{P.newPassword}</Label>
            <Input id="new" name="new" type="password" minLength={8} required autoComplete="new-password" />
          </div>
          <div>
            <Label htmlFor="confirm">{P.confirm}</Label>
            <Input id="confirm" name="confirm" type="password" minLength={8} required autoComplete="new-password" />
          </div>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? P.changing : P.change}
        </Button>
      </form>
    </Card>
  );
}
