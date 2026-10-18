import Link from "next/link";
import { Logo } from "@/components/brand";
import { LEGAL_CONTACT_EMAIL } from "@/domain/legal";

/** Páginas públicas de Termos de Uso e Política de Privacidade (sem login). */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="theme-black">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5">
          <Link href="/" aria-label="Focus — início">
            <Logo />
          </Link>
          <nav className="flex gap-4 text-sm text-text-2">
            <Link href="/termos" className="hover:text-text">
              Termos de Uso
            </Link>
            <Link href="/privacidade" className="hover:text-text">
              Privacidade
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10">
        <article className="legal space-y-4 text-[15px] leading-relaxed text-text-2 [&_h1]:text-3xl [&_h1]:font-semibold [&_h1]:tracking-tight [&_h1]:text-text [&_h2]:pt-4 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-text [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-text [&_a]:text-link [&_a]:underline">
          {children}
        </article>
      </main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-6 text-sm text-text-3">
          Dúvidas ou pedidos sobre seus dados: <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-link">{LEGAL_CONTACT_EMAIL}</a>
        </div>
      </footer>
    </div>
  );
}
