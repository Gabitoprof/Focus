import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, Skeleton } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { compactNumber } from "@/domain/titles";
import { getCompanyStats } from "@/server/services/master";
import { masterContext } from "../guard";

export const metadata: Metadata = { title: "Focus", robots: { index: false, follow: false } };

export default function MasterCompaniesPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Ranking de empresas</h1>
      <p className="mb-6 text-sm text-text-2">
        Visível só aqui: empresas não disputam entre si no produto. Horas e XP contam os projetos de cada empresa.
      </p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { ctx, userId } = await masterContext();
  const rows = await getCompanyStats(ctx, userId);
  if (rows.length === 0) return <Card className="text-sm text-text-2">Nenhuma empresa verificada ainda.</Card>;
  const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[860px] text-sm">
        <thead className="text-left text-xs text-text-2">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-medium">#</th>
            <th className="px-2 py-2 font-medium">Empresa</th>
            <th className="px-2 py-2 text-right font-medium">Funcionários</th>
            <th className="px-2 py-2 text-right font-medium">Horas acumuladas</th>
            <th className="px-2 py-2 text-right font-medium">Últimos 30 dias</th>
            <th className="px-2 py-2 text-right font-medium">Projetos concluídos</th>
            <th className="px-2 py-2 text-right font-medium">XP</th>
            <th className="px-4 py-2 text-right font-medium">Receita média/mês</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5 font-semibold tabular text-text-2">{i + 1}</td>
              <td className="px-2 py-2.5">
                <span className="font-medium">{r.name}</span>
                <span className="block text-xs text-text-3">
                  CNPJ {r.cnpj}
                  {r.pendingRequests > 0 && ` · ${r.pendingRequests} pedidos de vínculo`}
                </span>
              </td>
              <td className="px-2 py-2.5 text-right tabular">{r.employees}</td>
              <td className="px-2 py-2.5 text-right tabular">{formatDuration(r.seconds)}</td>
              <td className="px-2 py-2.5 text-right tabular text-text-2">{formatDuration(r.seconds30)}</td>
              <td className="px-2 py-2.5 text-right tabular">
                {r.projectsDone}/{r.projects}
              </td>
              <td className="px-2 py-2.5 text-right tabular">{compactNumber(r.xp, "pt-BR")}</td>
              <td className="px-4 py-2.5 text-right tabular text-text-3" title="Preenchido quando existir cobrança para empresas">
                {r.monthlyRevenueCents == null ? "—" : brl.format(r.monthlyRevenueCents / 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
