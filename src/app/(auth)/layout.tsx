import Link from "next/link";
import { Logo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getI18n();
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      {/* Painel da marca: preto com o nome em azul (oculto no celular) */}
      <section className="theme-black hidden flex-col p-12 lg:flex">
        <Link href="/" aria-label={t.nav.home}>
          <Logo />
        </Link>
        <div className="mt-auto max-w-md">
          <p className="text-5xl font-semibold leading-[1.05] tracking-[-0.03em]">
            {t.landing.headline1}
            <br />
            <span className="text-brand">{t.landing.headline2}</span>
          </p>
          <p className="mt-5 text-text-2">{t.landing.authAside}</p>
        </div>
      </section>

      <section className="flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <Link href="/" className="mb-10 flex justify-center lg:hidden" aria-label={t.nav.home}>
            <Logo size="lg" />
          </Link>
          {children}
          <div className="mt-10 flex flex-col items-center gap-3">
            <LanguageSwitcher />
            <p className="flex gap-4 text-xs text-text-3">
              <Link href="/termos" className="hover:text-text-2">
                {t.legal.terms}
              </Link>
              <Link href="/privacidade" className="hover:text-text-2">
                {t.legal.privacy}
              </Link>
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
