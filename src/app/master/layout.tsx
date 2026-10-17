import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { masterContext } from "./guard";

/**
 * Console master: área interna do dono da plataforma, separada das telas do produto
 * (layout próprio, fora do menu). Para quem não tem o papel "master", a área inteira não existe.
 */
export default function MasterLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg">
      <Suspense fallback={<div className="h-14 bg-black" />}>
        <Gate>{children}</Gate>
      </Suspense>
    </div>
  );
}

async function Gate({ children }: { children: React.ReactNode }) {
  await masterContext();
  const nav = [
    ["/master", "Visão geral"],
    ["/master/instituicoes", "Instituições"],
    ["/master/empresas", "Empresas"],
    ["/admin/organizacoes", "Pedidos de cadastro"],
  ] as const;
  return (
    <>
      <header className="theme-black border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <Link href="/master" className="flex items-center gap-2">
            <Logo size="sm" />
            <span className="rounded bg-danger px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">master</span>
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-1.5 text-text-2 hover:bg-surface-2 hover:text-text">
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className="ml-auto text-xs text-text-3 hover:text-text">
            Voltar ao produto →
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
