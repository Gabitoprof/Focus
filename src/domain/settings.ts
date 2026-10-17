import { z } from "zod";

export const timerSettingsSchema = z.object({
  /** Segundos de tolerância após o fim planejado do intervalo. */
  breakToleranceSeconds: z.number().int().min(0),
  /** XP debitado (uma única vez) quando o intervalo excede a tolerância. */
  breakPenaltyXp: z.number().int().min(0),
  /** Sem heartbeat por este tempo, a sessão em andamento é encerrada como abandonada. */
  staleHeartbeatMinutes: z.number().int().positive(),
  /** Sessão pausada por mais que isso é encerrada no momento da pausa. */
  maxPausedHours: z.number().int().positive(),
  /** Intervalo aberto além de planejado + este tempo é encerrado automaticamente. */
  abandonedBreakMinutes: z.number().int().positive(),
  /** Sessões com mais tempo efetivo que isso são sinalizadas para revisão (não descartadas). */
  suspiciousSessionHours: z.number().positive(),
  /** Pausa máxima entre ciclos para continuar a contagem do Pomodoro (intervalo longo). */
  cycleChainGapMinutes: z.number().int().positive(),
  /** Mínimo de minutos no dia para contar na sequência. */
  streakMinMinutes: z.number().int().positive(),
});
export type TimerSettings = z.infer<typeof timerSettingsSchema>;

export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  breakToleranceSeconds: 30,
  breakPenaltyXp: 5,
  staleHeartbeatMinutes: 10,
  maxPausedHours: 12,
  abandonedBreakMinutes: 120,
  suspiciousSessionHours: 6,
  cycleChainGapMinutes: 60,
  streakMinMinutes: 25,
};

export const audioSettingsSchema = z.object({
  url: z.string().min(1),
});
export type AudioSettings = z.infer<typeof audioSettingsSchema>;

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = { url: "/sounds/alarm.mp3" };

/** Penalidade de intervalo: no máximo uma, e só acima da tolerância. */
export function computeBreakPenalty(
  settings: Pick<TimerSettings, "breakToleranceSeconds" | "breakPenaltyXp">,
  overrunSeconds: number,
): number {
  return overrunSeconds > settings.breakToleranceSeconds ? settings.breakPenaltyXp : 0;
}
