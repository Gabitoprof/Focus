import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { compactNumber } from "@/domain/titles";
import { getMasterOverview } from "@/server/services/master";
import { masterContext } from "./guard";

export const metadata: Metadata = { title: "Focus", robots: { index: false, follow: false } };

export default function MasterPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Visão geral</h1>
      <p className="mb-6 text-sm text-text-2">Números agregados da plataforma. Nenhum dado individual de estudo aparece aqui.</p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-text-2">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-text-3">{hint}</p>}
    </Card>
  );
}

async function Content() {
  const { ctx, userId } = await masterContext();
  const o = await getMasterOverview(ctx, userId);
  const ctxLabel: Record<string, string> = { academic: "Acadêmico", personal: "Pessoal", professional: "Profissional" };
  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Contas" value={compactNumber(o.users.total, "pt-BR")} hint={`+${o.users.new7} em 7 dias · +${o.users.new30} em 30`} />
        <Stat label="Ativos em 7 dias" value={compactNumber(o.last7.activeUsers, "pt-BR")} hint={`${o.last7.sessions} sessões`} />
        <Stat label="Foco em 7 dias" value={formatDuration(o.last7.seconds)} hint={`${compactNumber(o.last7.xp, "pt-BR")} XP ganhos`} />
        <Stat label="Assinaturas ativas" value={String(o.subscriptionsActive)} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Instituições verificadas" value={String(o.organizations.institutions)} />
        <Stat label="Empresas verificadas" value={String(o.organizations.companies)} />
        <Stat
          label="Cadastros aguardando"
          value={String(o.organizations.pendingReview)}
          hint={`${o.organizations.pendingEmail} esperando confirmação de e-mail`}
        />
        <Stat label="Vínculos com instituições" value={String(o.memberships.active)} hint={`${o.memberships.pending} pendentes de aceite`} />
      </section>
      <section className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="mb-2 text-sm font-semibold">Foco por perfil (7 dias)</p>
          <ul className="space-y-1 text-sm">
            {Object.entries(o.last7.byContext).map(([k, v]) => (
              <li key={k} className="flex justify-between tabular">
                <span className="text-text-2">{ctxLabel[k] ?? k}</span>
                <span>{formatDuration(v)}</span>
              </li>
            ))}
            {Object.keys(o.last7.byContext).length === 0 && <li className="text-text-3">Sem sessões na semana.</li>}
          </ul>
        </Card>
        <Stat label="Catálogo de temas" value={compactNumber(o.catalog.approved, "pt-BR")} hint={`${o.catalog.pending} termos da comunidade em votação`} />
      </section>
    </div>
  );
}
