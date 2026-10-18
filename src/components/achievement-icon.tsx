import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Ícones das conquistas em imagem (fundo transparente), gerados por
 * `node scripts/process-achievement-icons.mjs`: public/achievements/<id>.webp (128px) e <id>@2x.webp
 * (256px); categorias em public/achievement-categories/. Só no servidor (confere se o arquivo existe).
 */
export const hasAchievementIcon = (dir: "achievements" | "achievement-categories", id: string) =>
  existsSync(join(process.cwd(), "public", dir, `${id}.webp`));

/** Bloqueado: o mesmo ícone, apagado só com CSS (sem arquivo extra). */
const LOCKED_FILTER = "grayscale(1) brightness(.55) opacity(.7)";

/** Ícone solto sobre o card: sem borda, fundo, sombra, cantos ou espaçamento. */
export function AchievementIcon({
  dir = "achievements",
  id,
  alt,
  size,
  locked,
  title,
}: {
  dir?: "achievements" | "achievement-categories";
  id: string;
  alt: string;
  size: number;
  locked?: boolean;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagem estática pequena com srcset 1x/2x próprio
    <img
      src={`/${dir}/${id}.webp`}
      srcSet={`/${dir}/${id}.webp 1x, /${dir}/${id}@2x.webp 2x`}
      width={size}
      height={size}
      alt={alt}
      title={title}
      loading="lazy"
      decoding="async"
      className="shrink-0"
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        border: 0,
        background: "none",
        boxShadow: "none",
        borderRadius: 0,
        padding: 0,
        filter: locked ? LOCKED_FILTER : undefined,
      }}
    />
  );
}
