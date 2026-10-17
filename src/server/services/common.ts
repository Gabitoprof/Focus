import { eq } from "drizzle-orm";
import { DEFAULT_TIMER_SETTINGS, timerSettingsSchema, type TimerSettings } from "@/domain/settings";
import type { DB } from "../db";
import { appSettings, profiles } from "../db/schema";

/** Contexto injetado nos serviços: permite testes com relógio controlado. */
export type Ctx = { db: DB; now: () => Date };

/** Executor dentro de uma transação. */
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

/** Erro com mensagem segura para exibir ao usuário. */
export class AppError extends Error {
  constructor(
    message: string,
    public code: "not_found" | "invalid" | "conflict" | "forbidden" = "invalid",
  ) {
    super(message);
  }
}

export const secondsBetween = (from: Date, to: Date) =>
  Math.max(0, Math.floor((to.getTime() - from.getTime()) / 1000));

/** Trava a linha do perfil: serializa as operações concorrentes do mesmo usuário. */
export async function lockProfile(tx: Tx, userId: string) {
  const [profile] = await tx.select().from(profiles).where(eq(profiles.userId, userId)).for("update");
  if (!profile) throw new AppError("Perfil não encontrado.", "not_found");
  return profile;
}

export async function getTimerSettings(db: DB | Tx): Promise<TimerSettings> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, "timer"));
  const parsed = timerSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...DEFAULT_TIMER_SETTINGS, ...(parsed.success ? parsed.data : {}) };
}
