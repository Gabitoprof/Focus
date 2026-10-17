import { z } from "zod";

export const METHOD_IDS = ["pomodoro_classic", "custom", "deep_work"] as const;
export type MethodId = (typeof METHOD_IDS)[number];

const durationRuleSchema = z.object({
  /** Quando definido, o usuário não escolhe a duração. */
  fixedMinutes: z.number().int().positive().nullable(),
  minMinutes: z.number().int().positive(),
  maxMinutes: z.number().int().positive(),
  presets: z.array(z.number().int().positive()),
});

export const methodRulesSchema = z.object({
  study: durationRuleSchema,
  break: durationRuleSchema.extend({
    longBreakMinutes: z.number().int().positive().nullable(),
    /** Intervalo longo a cada N ciclos concluídos. */
    longBreakEvery: z.number().int().positive().nullable(),
  }),
  xp: z.object({
    perMinute: z.number().nonnegative(),
    /** Faixa de duração planejada que gera XP. Fora dela o tempo conta, mas não pontua. */
    minEligibleMinutes: z.number().int().positive(),
    maxEligibleMinutes: z.number().int().positive(),
  }),
});

export type MethodRules = z.infer<typeof methodRulesSchema>;

export const DEFAULT_METHODS: {
  id: MethodId;
  name: string;
  description: string;
  sortOrder: number;
  rules: MethodRules;
}[] = [
  {
    id: "pomodoro_classic",
    name: "Pomodoro clássico",
    description: "25 minutos de estudo e 5 de intervalo. A cada 4 ciclos, intervalo longo de 15 minutos.",
    sortOrder: 1,
    rules: {
      study: { fixedMinutes: 25, minMinutes: 25, maxMinutes: 25, presets: [25] },
      break: {
        fixedMinutes: 5,
        minMinutes: 5,
        maxMinutes: 15,
        presets: [5],
        longBreakMinutes: 15,
        longBreakEvery: 4,
      },
      xp: { perMinute: 1, minEligibleMinutes: 25, maxEligibleMinutes: 25 },
    },
  },
  {
    id: "custom",
    name: "Estudo personalizado",
    description: "Você escolhe a duração do estudo e do intervalo.",
    sortOrder: 2,
    rules: {
      study: { fixedMinutes: null, minMinutes: 1, maxMinutes: 240, presets: [30, 45, 50, 60] },
      break: {
        fixedMinutes: null,
        minMinutes: 1,
        maxMinutes: 60,
        presets: [5, 10, 15],
        longBreakMinutes: null,
        longBreakEvery: null,
      },
      xp: { perMinute: 1, minEligibleMinutes: 20, maxEligibleMinutes: 60 },
    },
  },
  {
    id: "deep_work",
    name: "Deep Work",
    description: "Sessões longas de foco profundo (60 a 90 minutos) com intervalo maior.",
    sortOrder: 3,
    rules: {
      study: { fixedMinutes: null, minMinutes: 60, maxMinutes: 90, presets: [60, 75, 90] },
      break: {
        fixedMinutes: null,
        minMinutes: 10,
        maxMinutes: 30,
        presets: [15, 20],
        longBreakMinutes: null,
        longBreakEvery: null,
      },
      xp: { perMinute: 1, minEligibleMinutes: 60, maxEligibleMinutes: 90 },
    },
  },
];

export class RuleViolation extends Error {}

/** Resolve a duração de estudo pedida pelo usuário de acordo com o método. */
export function resolveStudyMinutes(rules: MethodRules, requested: number | undefined): number {
  const r = rules.study;
  if (r.fixedMinutes != null) return r.fixedMinutes;
  if (requested == null || !Number.isInteger(requested)) {
    throw new RuleViolation("Informe a duração do estudo em minutos.");
  }
  if (requested < r.minMinutes || requested > r.maxMinutes) {
    throw new RuleViolation(`A duração deve estar entre ${r.minMinutes} e ${r.maxMinutes} minutos.`);
  }
  return requested;
}

/**
 * Resolve a duração do intervalo. `completedCycleIndex` é o número do ciclo que acabou
 * de ser concluído (para métodos com intervalo longo).
 */
export function resolveBreak(
  rules: MethodRules,
  requested: number | undefined,
  completedCycleIndex: number | null,
): { minutes: number; kind: "short" | "long" } {
  const r = rules.break;
  const isLong =
    r.longBreakEvery != null &&
    r.longBreakMinutes != null &&
    completedCycleIndex != null &&
    completedCycleIndex > 0 &&
    completedCycleIndex % r.longBreakEvery === 0;
  if (isLong) return { minutes: r.longBreakMinutes!, kind: "long" };
  if (r.fixedMinutes != null) return { minutes: r.fixedMinutes, kind: "short" };
  if (requested == null || !Number.isInteger(requested)) {
    throw new RuleViolation("Informe a duração do intervalo em minutos.");
  }
  if (requested < r.minMinutes || requested > r.maxMinutes) {
    throw new RuleViolation(`O intervalo deve estar entre ${r.minMinutes} e ${r.maxMinutes} minutos.`);
  }
  return { minutes: requested, kind: "short" };
}

/**
 * XP de um ciclo: concedido somente se o tempo efetivo alcançou o planejado e a duração
 * planejada está na faixa elegível. O excedente nunca gera XP.
 */
export function computeCycleXp(rules: MethodRules, plannedSeconds: number, activeSeconds: number): number {
  if (activeSeconds < plannedSeconds) return 0;
  const plannedMinutes = Math.floor(plannedSeconds / 60);
  if (plannedMinutes < rules.xp.minEligibleMinutes || plannedMinutes > rules.xp.maxEligibleMinutes) return 0;
  return Math.floor(plannedMinutes * rules.xp.perMinute);
}
