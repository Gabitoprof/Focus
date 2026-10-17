import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InstitutionPanel } from "@/components/institution-panel";
import { PageHeader, Skeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { appCtx, requireUser } from "@/server/auth/session";
import { loadInstitutionPanel } from "../institution-data";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.meta.titles.welcome };
}

/** Etapa logo após o cadastro: instituição (opcional), depois categorias. */
export default async function WelcomePage() {
  const { t } = await getI18n();
  return (
    <div className="max-w-3xl">
      <PageHeader title={t.welcome.title} description={t.welcome.description} />
      <Suspense fallback={<Skeleton className="h-80" />}>
        <Content />
      </Suspense>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href="/registro" className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-medium text-accent-ink">
          {t.welcome.continue}
        </Link>
        <Link href="/registro" className="inline-flex h-11 items-center rounded-full px-4 text-sm text-text-2 hover:text-text">
          {t.welcome.skip}
        </Link>
      </div>
    </div>
  );
}

async function Content() {
  const user = await requireUser();
  return <InstitutionPanel {...await loadInstitutionPanel(await appCtx(), user.id)} />;
}
