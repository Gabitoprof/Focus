import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader, Skeleton } from "@/components/ui";
import { getI18n } from "@/i18n/server";
import { ConfirmEmail } from "./confirm-email";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getI18n()).t.org.confirmTitle };
}

export default async function ConfirmOrganizationPage(props: PageProps<"/organizacao/confirmar">) {
  const { t } = await getI18n();
  return (
    <>
      <PageHeader title={t.org.confirmTitle} />
      <Suspense fallback={<Skeleton className="h-32" />}>
        <Content searchParams={props.searchParams} />
      </Suspense>
    </>
  );
}

async function Content({ searchParams }: { searchParams: PageProps<"/organizacao/confirmar">["searchParams"] }) {
  const sp = await searchParams;
  return <ConfirmEmail token={typeof sp.token === "string" ? sp.token : ""} />;
}
