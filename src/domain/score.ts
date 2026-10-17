/**
 * Score de foco: pontos calculados a partir do que foi registrado no período. Diferente do XP
 * (que vem só de ciclos concluídos), o score mede a qualidade do foco: estudar dentro do
 * planejado vale mais que o excedente, respeitar o intervalo dá um bônus e pausas tiram pontos.
 */
export const SCORE_WEIGHTS = {
  /** Por minuto estudado dentro do tempo planejado. */
  plannedMinute: 1,
  /** Por minuto excedente (estudo além do planejado): conta, mas vale menos. */
  overtimeMinute: 0.5,
  /** Por intervalo encerrado dentro do tempo (sem atraso além da tolerância). */
  cleanBreak: 5,
  /** Por minuto de pausa durante a sessão. */
  pausedMinute: -0.5,
  /** Por minuto de atraso no intervalo. */
  breakOverrunMinute: -1,
} as const;

export type ScoreInput = {
  /** Segundos estudados (inclui o excedente). */
  activeSeconds: number;
  overtimeSeconds: number;
  pausedSeconds: number;
  cleanBreaks: number;
  breakOverrunSeconds: number;
};

export type ScoreBreakdown = {
  total: number;
  planned: number;
  overtime: number;
  cleanBreaks: number;
  paused: number;
  breakOverrun: number;
};

const min = (s: number) => Math.max(0, s) / 60;

export function computeScore(i: ScoreInput, w = SCORE_WEIGHTS): ScoreBreakdown {
  const withinPlan = Math.max(0, i.activeSeconds - i.overtimeSeconds);
  const parts = {
    planned: min(withinPlan) * w.plannedMinute,
    overtime: min(i.overtimeSeconds) * w.overtimeMinute,
    cleanBreaks: Math.max(0, i.cleanBreaks) * w.cleanBreak,
    paused: min(i.pausedSeconds) * w.pausedMinute,
    breakOverrun: min(i.breakOverrunSeconds) * w.breakOverrunMinute,
  };
  const round = (v: number) => Math.round(v);
  const total = Math.max(0, round(parts.planned + parts.overtime + parts.cleanBreaks + parts.paused + parts.breakOverrun));
  return {
    total,
    planned: round(parts.planned),
    overtime: round(parts.overtime),
    cleanBreaks: round(parts.cleanBreaks),
    paused: round(parts.paused),
    breakOverrun: round(parts.breakOverrun),
  };
}
