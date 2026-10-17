/**
 * Conquistas: metas com progresso visível. São calculadas a partir do que já está registrado
 * (sessões, intervalos, projetos, amigos, vínculos), então valem também para o histórico antigo.
 */
export const ACHIEVEMENT_CATEGORIES = ["inicio", "constancia", "horas", "metodo", "explorar", "equipe"] as const;
export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

export type AchievementMetric =
  | "sessions"
  | "cycles"
  | "longestStreak"
  | "totalHours"
  | "dayCycles"
  | "deepWork"
  | "pomodoroCycles"
  | "earlySession"
  | "lateSession"
  | "cleanBreaks"
  | "areas"
  | "linkedTopics"
  | "projectsDone"
  | "teamProjects"
  | "friends"
  | "institution";

export type AchievementDef = { id: string; category: AchievementCategory; metric: AchievementMetric; target: number };

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "primeiro_foco", category: "inicio", metric: "sessions", target: 1 },
  { id: "primeiro_ciclo", category: "inicio", metric: "cycles", target: 1 },
  { id: "dez_ciclos", category: "inicio", metric: "cycles", target: 10 },
  { id: "cem_ciclos", category: "inicio", metric: "cycles", target: 100 },

  { id: "sequencia_3", category: "constancia", metric: "longestStreak", target: 3 },
  { id: "sequencia_7", category: "constancia", metric: "longestStreak", target: 7 },
  { id: "sequencia_30", category: "constancia", metric: "longestStreak", target: 30 },
  { id: "sequencia_100", category: "constancia", metric: "longestStreak", target: 100 },

  { id: "horas_10", category: "horas", metric: "totalHours", target: 10 },
  { id: "horas_50", category: "horas", metric: "totalHours", target: 50 },
  { id: "horas_100", category: "horas", metric: "totalHours", target: 100 },
  { id: "horas_500", category: "horas", metric: "totalHours", target: 500 },
  { id: "horas_1000", category: "horas", metric: "totalHours", target: 1000 },
  { id: "maratona", category: "horas", metric: "dayCycles", target: 6 },

  { id: "pomodoro_25", category: "metodo", metric: "pomodoroCycles", target: 25 },
  { id: "deep_work", category: "metodo", metric: "deepWork", target: 1 },
  { id: "deep_work_10", category: "metodo", metric: "deepWork", target: 10 },
  { id: "intervalo_em_dia", category: "metodo", metric: "cleanBreaks", target: 10 },
  { id: "madrugador", category: "metodo", metric: "earlySession", target: 1 },
  { id: "coruja", category: "metodo", metric: "lateSession", target: 1 },

  { id: "explorador", category: "explorar", metric: "areas", target: 3 },
  { id: "polimata", category: "explorar", metric: "areas", target: 6 },
  { id: "catalogo", category: "explorar", metric: "linkedTopics", target: 5 },

  { id: "projeto_concluido", category: "equipe", metric: "projectsDone", target: 1 },
  { id: "em_equipe", category: "equipe", metric: "teamProjects", target: 1 },
  { id: "primeiro_amigo", category: "equipe", metric: "friends", target: 1 },
  { id: "turma", category: "equipe", metric: "friends", target: 5 },
  { id: "vinculo_institucional", category: "equipe", metric: "institution", target: 1 },
];

export type AchievementStatus = AchievementDef & { current: number; unlocked: boolean };

/** Junta as metas com os números da pessoa. */
export function evaluateAchievements(metrics: Record<AchievementMetric, number>): AchievementStatus[] {
  return ACHIEVEMENTS.map((a) => {
    const current = Math.max(0, Math.floor(metrics[a.metric] ?? 0));
    return { ...a, current: Math.min(current, a.target), unlocked: current >= a.target };
  });
}
