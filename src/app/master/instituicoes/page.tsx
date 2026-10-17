import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, Skeleton, cx } from "@/components/ui";
import { formatDuration } from "@/domain/time";
import { compactNumber } from "@/domain/titles";
import { getInstitutionStats } from "@/server/services/master";
import { masterContext } from "../guard";

export const metadata: Metadata = { title: "Focus", robots: { index: false, follow: false } };

const STATUS: Record<string, [string, string]> = {
  approved: ["Aprovada", "bg-good-soft text-good"],
  pending_review: ["Em análise", "bg-warn-soft text-warn"],
  pending_email: ["Aguardando e-mail", "bg-surface-2 text-text-2"],
  rejected: ["Recusada", "bg-danger-soft text-danger"],
};

export default function MasterInstitutionsPage() {
  return (
    <>
      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Instituições cadastradas</h1>
      <p className="mb-6 text-sm text-text-2">
        Toda instituição que pede cadastro entra aqui. Horas e XP: últimos 30 dias, só alunos com vínculo aceito.
      </p>
      <Suspense fallback={<Skeleton className="h-96" />}>
        <Content />
      </Suspense>
    </>
  );
}

async function Content() {
  const { ctx, userId } = await masterContext();
  const rows = await getInstitutionStats(ctx, userId);
  if (rows.length === 0) return <Card className="text-sm text-text-2">Nenhuma instituição pediu cadastro ainda.</Card>;
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="text-left text-xs text-text-2">
          <tr className="border-b border-border">
            <th className="px-4 py-2 font-medium">Instituição</th>
            <th className="px-2 py-2 font-medium">Situação</th>
            <th className="px-2 py-2 font-medium">Registro e-MEC/INEP</th>
            <th className="px-2 py-2 text-right font-medium">Alunos</th>
            <th className="px-2 py-2 text-right font-medium">Pendentes</th>
            <th className="px-2 py-2 text-right font-medium">Lista de matrículas</th>
            <th className="px-2 py-2 text-right font-medium">Horas (30d)</th>
            <th className="px-4 py-2 text-right font-medium">XP (30d)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const [label, cls] = STATUS[r.status] ?? [r.status, ""];
            return (
              <tr key={r.id}>
                <td className="px-4 py-2.5">
                  <span className="font-medium">{r.name}</span>
                  <span className="block text-xs text-text-3">
                    CNPJ {r.cnpj} · pedido em {date.format(r.createdAt)}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <span className={cx("rounded-full px-2 py-0.5 text-xs font-medium", cls)}>{label}</span>
                  {r.status === "pending_review" && (
                    <Link href="/admin/organizacoes" className="ml-2 text-xs text-link hover:underline">
                      analisar
                    </Link>
                  )}
                </td>
                <td className="px-2 py-2.5 text-xs text-text-2">{r.institutionName ?? "não ligado"}</td>
                <td className="px-2 py-2.5 text-right tabular">{r.studentsActive}</td>
                <td className="px-2 py-2.5 text-right tabular text-text-2">{r.studentsPending}</td>
                <td className="px-2 py-2.5 text-right tabular text-text-2">{compactNumber(r.rosterSize, "pt-BR")}</td>
                <td className="px-2 py-2.5 text-right tabular">{formatDuration(r.seconds30)}</td>
                <td className="px-4 py-2.5 text-right tabular">{compactNumber(r.xp30, "pt-BR")}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}
