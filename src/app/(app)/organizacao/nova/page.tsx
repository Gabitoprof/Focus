import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, PageHeader, Skeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { getIdentity } from "@/server/services/identity";
import { OrgRequestForm } from "./request-form";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.org.register };
}

export default async function NewOrganizationPage() {
  const { t } = await getI18n();
  return (
    <>
      <Link href="/organizacao" className="mb-4 inline-block text-sm text-link hover:underline">
        ← {t.org.title}
      </Link>
      <PageHeader title={t.org.register} description={t.org.registerDescription} />
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const user = await requireUser();
  const { t } = await getI18n();
  const identity = await getIdentity(await appCtx(), user.id);
  if (!identity.hasCpf) {
    return (
      <Card className="text-center">
        <p className="font-medium">{t.org.needsCpfTitle}</p>
        <p className="mt-1 text-sm text-text-2">{t.org.needsCpfText}</p>
        <Link href="/perfil" className="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-medium text-accent-ink">
          {t.org.needsCpfCta}
        </Link>
      </Card>
    );
  }
  return <OrgRequestForm />;
}
