/** Recursos pagos. Novos recursos premium entram aqui e na lista `features` do plano. */
export const FEATURES = ["ranking"] as const;
export type Feature = (typeof FEATURES)[number];

/**
 * Recursos liberados para todos enquanto a Focus não cobra (fase de testes).
 * Para começar a cobrar, esvazie esta lista. Nos testes automáticos a cobrança vale sempre
 * (FOCUS_ENFORCE_PLANS=1), para a lógica de assinatura continuar verificada.
 */
export const FREE_DURING_TESTS: readonly Feature[] = ["ranking"];
export const isFreeForEveryone = (feature: Feature) =>
  process.env.FOCUS_ENFORCE_PLANS !== "1" && FREE_DURING_TESTS.includes(feature);

export const SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "canceled",
  "incomplete",
  "expired",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/**
 * Política de acesso pelo status real da assinatura:
 * - active / trialing: acesso liberado;
 * - past_due (cobrança falhou, provedor tentando de novo) e canceled: acesso até o fim do
 *   período já pago (`currentPeriodEnd`);
 * - incomplete / expired: sem acesso.
 */
export function subscriptionGrantsAccess(
  sub: { status: SubscriptionStatus; currentPeriodEnd: Date | null },
  now: Date,
): boolean {
  switch (sub.status) {
    case "active":
    case "trialing":
      return sub.currentPeriodEnd == null || sub.currentPeriodEnd > now;
    case "past_due":
    case "canceled":
      return sub.currentPeriodEnd != null && sub.currentPeriodEnd > now;
    default:
      return false;
  }
}

export const DEFAULT_PLANS = [
  {
    id: "premium",
    name: "Focus Premium",
    description: "Acesso aos rankings competitivos.",
    features: ["ranking"] as Feature[],
    priceCents: 1990,
    currency: "BRL",
    interval: "month" as const,
  },
];
