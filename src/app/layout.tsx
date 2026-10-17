import type { Metadata, Viewport } from "next";
import { Geist_Mono, Poppins } from "next/font/google";
import { Suspense } from "react";
import { I18nProvider } from "@/i18n/client";
import { getI18n } from "@/i18n/server";
import "./globals.css";

/** Tipografia da marca e da interface. */
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
});
/** Dígitos do cronômetro (largura fixa, não "pulam" a cada segundo). */
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: "Focus", template: "%s · Focus" },
    description: t.meta.description,
    applicationName: "Focus",
  };
}

export const viewport: Viewport = { themeColor: "#0A0A0A" };

/** O idioma vem do cookie/navegador (dado da requisição), por isso fica dentro de Suspense. */
async function I18nRoot({ children }: { children: React.ReactNode }) {
  const { locale } = await getI18n();
  return <I18nProvider locale={locale}>{children}</I18nProvider>;
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${poppins.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <Suspense fallback={null}>
          <I18nRoot>{children}</I18nRoot>
        </Suspense>
      </body>
    </html>
  );
}
