import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/brand";
import { ConfirmProvider } from "@/components/confirm";
import { GlobalTimerShortcuts } from "@/components/timer-shortcuts";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";
import { ContextSwitcher } from "./context-switcher";
import { TermsGate } from "./terms-gate";
import { AppNav, MobileNav } from "./nav";
import { AppNavWithRoles } from "./nav-server";
import { UserChip } from "./user-chip";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <div className="min-h-screen md:flex">
      {/* Barra lateral preta com o nome da marca em azul */}
      <aside className="theme-black hidden w-60 shrink-0 flex-col p-4 md:sticky md:top-0 md:flex md:h-screen">
        <Link href="/dashboard" className="mb-6 px-3 pt-2" aria-label={t.nav.home}>
          <Logo />
        </Link>
        <div className="mb-4">
          <Suspense fallback={<div className="h-14" />}>
            <ContextSwitcher />
          </Suspense>
        </div>
        <Suspense fallback={<AppNav />}>
          <AppNavWithRoles />
        </Suspense>
        <div className="mt-auto space-y-3">
          <LanguageSwitcher className="px-3" />
          <p className="flex gap-3 px-3 text-[11px] text-text-3">
            <Link href="/termos" className="hover:text-text-2">
              {t.legal.terms}
            </Link>
            <Link href="/privacidade" className="hover:text-text-2">
              {t.legal.privacy}
            </Link>
          </p>
          <Suspense fallback={<div className="h-14" />}>
            <UserChip />
          </Suspense>
        </div>
      </aside>
      <header className="theme-black flex items-center justify-between px-4 py-3 md:hidden">
        <Link href="/dashboard" aria-label={t.nav.home}>
          <Logo size="sm" />
        </Link>
        <Suspense fallback={null}>
          <UserChip compact />
        </Suspense>
      </header>
      <div className="theme-black px-4 pb-3 md:hidden">
        <Suspense fallback={<div className="h-12" />}>
          <ContextSwitcher compact />
        </Suspense>
      </div>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-10 md:pt-8">
        <ConfirmProvider>
          <Suspense fallback={null}>
            <TermsGate>{children}</TermsGate>
          </Suspense>
        </ConfirmProvider>
      </main>
      {/* Atalhos do cronômetro em qualquer tela (configuráveis no Foque → Configurações). */}
      <GlobalTimerShortcuts />
      <MobileNav />
    </div>
  );
}
