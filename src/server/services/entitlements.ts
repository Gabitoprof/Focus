import { eq } from "drizzle-orm";
import { subscriptionGrantsAccess, type Feature, type SubscriptionStatus } from "@/domain/entitlements";
import { plans, subscriptions } from "../db/schema";
import { AppError, type Ctx } from "./common";
import { isAdmin } from "./profile";

export type Access = { allowed: boolean; reason: "admin" | "subscription" | "none" };

/**
 * Verificação de acesso a um recurso pago, sempre no servidor.
 * Admin tem acesso ilimitado; os demais dependem do status real da assinatura.
 */
export async function getAccess(ctx: Ctx, userId: string, feature: Feature): Promise<Access> {
  if (await isAdmin(ctx.db, userId)) return { allowed: true, reason: "admin" };
  const now = ctx.now();
  const subs = await ctx.db
    .select({ status: subscriptions.status, currentPeriodEnd: subscriptions.currentPeriodEnd, features: plans.features })
    .from(subscriptions)
    .innerJoin(plans, eq(plans.id, subscriptions.planId))
    .where(eq(subscriptions.userId, userId));
  const ok = subs.some((s) => s.features.includes(feature) && subscriptionGrantsAccess(s, now));
  return ok ? { allowed: true, reason: "subscription" } : { allowed: false, reason: "none" };
}

export async function requireFeature(ctx: Ctx, userId: string, feature: Feature) {
  const access = await getAccess(ctx, userId, feature);
  if (!access.allowed) throw new AppError("Recurso exclusivo para assinantes Focus Premium.", "forbidden");
  return access;
}

/** Concessão manual (testes/cortesia): assinatura "manual" ativa até a data informada. */
export async function grantManualSubscription(ctx: Ctx, userId: string, until: Date, planId = "premium") {
  const [row] = await ctx.db
    .insert(subscriptions)
    .values({ userId, planId, provider: "manual", status: "active", currentPeriodEnd: until })
    .returning();
  return row;
}

export async function setSubscriptionStatus(
  ctx: Ctx,
  subscriptionId: string,
  status: SubscriptionStatus,
  currentPeriodEnd?: Date | null,
) {
  await ctx.db
    .update(subscriptions)
    .set({ status, ...(currentPeriodEnd !== undefined ? { currentPeriodEnd } : {}), updatedAt: ctx.now() })
    .where(eq(subscriptions.id, subscriptionId));
}
