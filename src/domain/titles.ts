/**
 * Títulos do ranking, conquistados pelas horas de foco acumuladas na plataforma (todos os
 * perfis). Só sobem: quem chegou a um título não perde por ficar parado.
 */
export const TITLES = [
  { id: "iniciante", minHours: 0 },
  { id: "focado", minHours: 5 },
  { id: "dedicado", minHours: 25 },
  { id: "maratonista", minHours: 100 },
  { id: "mestre", minHours: 300 },
  { id: "lenda", minHours: 1000 },
] as const;
export type TitleId = (typeof TITLES)[number]["id"];

export function titleFor(totalSeconds: number): TitleId {
  const hours = totalSeconds / 3600;
  let current: TitleId = "iniciante";
  for (const t of TITLES) if (hours >= t.minHours) current = t.id;
  return current;
}

/** XP e contadores grandes abreviados: 1.234 → "1,2 mil", 1.000.000 → "1 mi" (pt-BR). */
export function compactNumber(n: number, locale: string): string {
  if (Math.abs(n) < 10_000) return new Intl.NumberFormat(locale).format(n);
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(n);
}
