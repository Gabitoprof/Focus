import Link from "next/link";
import { BRAND, Logo } from "@/components/brand";
import { LanguageSwitcher } from "@/components/language-switcher";
import { getI18n } from "@/i18n/server";

export default async function Home() {
  const { t } = await getI18n();
  return (
    <div className="min-h-screen">
      <header className="theme-black">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-6">
          <Logo />
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/login" className="rounded-full px-4 py-2 font-medium text-text-2 hover:text-text">
              {t.landing.signIn}
            </Link>
            <Link href="/cadastro" className="rounded-full bg-accent px-4 py-2 font-medium text-accent-ink hover:opacity-90">
              {t.landing.signUp}
            </Link>
          </nav>
        </div>

        <section className="mx-auto max-w-6xl px-4 pb-24 pt-16 md:pb-32 md:pt-24">
          <h1 className="max-w-3xl text-5xl font-semibold leading-[1.05] tracking-[-0.03em] sm:text-7xl">
            {t.landing.headline1}
            <br />
            <span className="text-brand">{t.landing.headline2}</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg text-text-2">{t.landing.subtitle}</p>
          <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-accent-soft px-4 py-1.5 text-base font-semibold text-link">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
            {t.landing.audience}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link
              href="/cadastro"
              className="inline-flex h-12 items-center rounded-full bg-accent px-7 font-medium text-accent-ink hover:opacity-90"
            >
              {t.landing.startFree}
            </Link>
            <Link
              href="/login"
              className="inline-flex h-12 items-center rounded-full border border-border px-7 font-medium hover:bg-surface-2"
            >
              {t.landing.haveAccount}
            </Link>
          </div>
        </section>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-20">
        <ol className="grid gap-10 md:grid-cols-3">
          {t.landing.features.map((f, i) => (
            <li key={f.title}>
              <span className="text-sm font-semibold text-link tabular">0{i + 1}</span>
              <h2 className="mt-3 text-xl font-semibold tracking-tight">{f.title}</h2>
              <p className="mt-2 text-text-2">{f.text}</p>
            </li>
          ))}
        </ol>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-text-3">
          <Logo size="sm" />
          <LanguageSwitcher />
          <span>© {BRAND.name}</span>
        </div>
      </footer>
    </div>
  );
}
