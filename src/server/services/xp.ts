import { and, desc, eq, sql } from "drizzle-orm";
import { profiles, xpTransactions, XP_REASONS } from "../db/schema";
import type { Ctx, Tx } from "./common";

type XpReason = (typeof XP_REASONS)[number];

/**
 * Lança uma transação de XP e atualiza o saldo. Idempotente por origem: se já existir
 * lançamento para (sourceType, sourceId, reason), nada acontece e retorna null.
 * Débitos são limitados ao saldo atual — o saldo nunca fica negativo.
 * Deve ser chamado dentro de uma transação com o perfil travado.
 */
export async function postXp(
  tx: Tx,
  input: {
    userId: string;
    amount: number;
    reason: XpReason;
    methodId: string | null;
    /** Área e tema do catálogo (rankings por área/tema). */
    areaId?: string | null;
    catalogTopicId?: string | null;
    /** Falso para XP de categorias pessoais: soma no saldo, mas nunca nos rankings. */
    ranked?: boolean;
    sourceType: "study_session" | "break" | "admin";
    sourceId: string | null;
    note?: string;
    /** Momento do evento que gerou o XP (fim do ciclo, fim do intervalo). Define o período do ranking. */
    at: Date;
  },
): Promise<{ amount: number; balanceAfter: number } | null> {
  const [profile] = await tx
    .select({ xpBalance: profiles.xpBalance })
    .from(profiles)
    .where(eq(profiles.userId, input.userId));
  const balance = profile?.xpBalance ?? 0;
  const amount = input.amount < 0 ? -Math.min(-input.amount, balance) : input.amount;
  const balanceAfter = balance + amount;

  const inserted = await tx
    .insert(xpTransactions)
    .values({
      userId: input.userId,
      amount,
      reason: input.reason,
      methodId: input.methodId,
      areaId: input.areaId ?? null,
      catalogTopicId: input.catalogTopicId ?? null,
      ranked: input.ranked ?? true,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      balanceAfter,
      createdAt: input.at,
      note:
        input.note ??
        (amount !== input.amount ? `Saldo insuficiente: debitado ${-amount} de ${-input.amount} XP.` : null),
    })
    .onConflictDoNothing()
    .returning({ id: xpTransactions.id });
  if (inserted.length === 0) return null;

  if (amount !== 0) {
    await tx
      .update(profiles)
      .set({ xpBalance: sql`${profiles.xpBalance} + ${amount}`, updatedAt: input.at })
      .where(eq(profiles.userId, input.userId));
  }
  return { amount, balanceAfter };
}

export async function listXpTransactions(ctx: Ctx, userId: string, limit = 50) {
  return ctx.db
    .select()
    .from(xpTransactions)
    .where(and(eq(xpTransactions.userId, userId)))
    .orderBy(desc(xpTransactions.createdAt))
    .limit(limit);
}
