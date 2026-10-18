/**
 * Retrospectiva (estilo "wrapped"): resumo de um período com destaques e pontos a melhorar.
 * As regras ficam aqui, sem texto: devolvem códigos com números, e a tela escreve no idioma da pessoa.
 */
export const RETRO_KINDS = ["dia", "semana", "mes", "ano"] as const;
export type RetroKind = (typeof RETRO_KINDS)[number];

export type RetroSummary = {
  studied: number;
  planned: number;
  overtime: number;
  paused: number;
  sessions: number;
  cycles: number;
  xp: number;
  score: number;
  breaks: number;
  cleanBreaks: number;
  lateBreaks: number;
  overrun: number;
  /** Dias com pelo menos 1 min de estudo e dias já decorridos no período. */
  activeDays: number;
  days: number;
  bestDay: { day: string; seconds: number } | null;
  peakHour: number | null;
  topCategory: { name: string; seconds: number } | null;
  topTopic: { name: string; seconds: number } | null;
};

export type Insight =
  | { code: "studiedUp"; pct: number }
  | { code: "firstFocus" }
  | { code: "consistency"; active: number; days: number }
  | { code: "completion"; cycles: number; sessions: number }
  | { code: "cleanBreaks"; n: number }
  | { code: "lowPauses" }
  | { code: "studiedDown"; pct: number }
  | { code: "lowConsistency"; active: number; days: number; peakHour: number | null }
  | { code: "highPauses"; pct: number }
  | { code: "lateBreaks"; n: number; minutes: number }
  | { code: "lowCompletion"; cycles: number; sessions: number }
  | { code: "highOvertime"; pct: number }
  | { code: "noBreaks"; sessions: number }
  | { code: "keepGoing" };

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

export function buildInsights(cur: RetroSummary, prev: RetroSummary | null): { highlights: Insight[]; improvements: Insight[] } {
  const highlights: Insight[] = [];
  const improvements: Insight[] = [];
  if (cur.studied < 60) return { highlights, improvements };

  // Comparação com o período anterior.
  if (prev && prev.studied >= 60) {
    const change = pct(cur.studied - prev.studied, prev.studied);
    if (change >= 10) highlights.push({ code: "studiedUp", pct: change });
    else if (change <= -10) improvements.push({ code: "studiedDown", pct: -change });
  } else if (prev) {
    highlights.push({ code: "firstFocus" });
  }

  // Constância (só faz sentido com vários dias).
  if (cur.days >= 3) {
    const ratio = cur.activeDays / cur.days;
    if (ratio >= 0.7) highlights.push({ code: "consistency", active: cur.activeDays, days: cur.days });
    else if (ratio < 0.5) improvements.push({ code: "lowConsistency", active: cur.activeDays, days: cur.days, peakHour: cur.peakHour });
  }

  // Ciclos concluídos x sessões.
  if (cur.sessions >= 2) {
    const done = cur.cycles / cur.sessions;
    if (done >= 0.8) highlights.push({ code: "completion", cycles: cur.cycles, sessions: cur.sessions });
    else if (done < 0.6) improvements.push({ code: "lowCompletion", cycles: cur.cycles, sessions: cur.sessions });
  }

  // Pausas dentro das sessões.
  const pauseShare = pct(cur.paused, cur.studied + cur.paused);
  if (pauseShare >= 15) improvements.push({ code: "highPauses", pct: pauseShare });
  else if (cur.sessions >= 2 && pauseShare < 5) highlights.push({ code: "lowPauses" });

  // Intervalos.
  if (cur.lateBreaks > 0) improvements.push({ code: "lateBreaks", n: cur.lateBreaks, minutes: Math.round(cur.overrun / 60) });
  else if (cur.cleanBreaks > 0) highlights.push({ code: "cleanBreaks", n: cur.cleanBreaks });
  if (cur.sessions >= 3 && cur.breaks === 0) improvements.push({ code: "noBreaks", sessions: cur.sessions });

  // Excedente muito alto: o planejado está curto para o que a pessoa realmente faz.
  const overShare = pct(cur.overtime, cur.studied);
  if (overShare >= 25) improvements.push({ code: "highOvertime", pct: overShare });

  if (improvements.length === 0) improvements.push({ code: "keepGoing" });
  return { highlights, improvements };
}

/** Variação percentual em relação ao período anterior (null quando não há base de comparação). */
export function changeVsPrevious(cur: number, prev: number | null | undefined): number | null {
  if (!prev || prev < 60) return null;
  return Math.round(((cur - prev) / prev) * 100);
}
