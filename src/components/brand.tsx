import { cx } from "./ui";

export const BRAND = {
  name: "Focus",
  tagline: "Foque no que importa. Evolua todo dia.",
  blue: "#274DEA",
  black: "#0A0A0A",
} as const;

/**
 * Logotipo: o próprio nome, em Poppins SemiBold, azul da marca. Sem símbolo.
 * Versões em arquivo (vetor) ficam em public/brand/.
 */
export function Logo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" | "xl" }) {
  return (
    <span
      className={cx(
        "font-sans font-semibold tracking-[-0.02em] text-brand leading-none",
        size === "sm" && "text-lg",
        size === "md" && "text-2xl",
        size === "lg" && "text-3xl",
        size === "xl" && "text-5xl sm:text-6xl",
        className,
      )}
    >
      {BRAND.name}
    </span>
  );
}
