/**
 * Concede (ou revoga, com --revoke) acesso premium manual a um usuário — para testes e cortesias.
 * Uso: npm run premium:grant -- email@exemplo.com [--days 30] [--revoke]
 * Requer acesso direto ao banco (pare o `npm run dev` antes, no PGlite).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { auditLogs, subscriptions, user } from "../src/server/db/schema";

async function main() {
  const email = process.argv.find((a) => a.includes("@"));
  const revoke = process.argv.includes("--revoke");
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 30;
  if (!email) throw new Error("Informe o e-mail: npm run premium:grant -- voce@exemplo.com [--days 30]");
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days precisa ser um número positivo.");

  const db = await getDb();
  const [u] = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
  if (!u) throw new Error(`Usuário ${email} não encontrado.`);

  if (revoke) {
    await db
      .update(subscriptions)
      .set({ status: "expired", updatedAt: new Date() })
      .where(and(eq(subscriptions.userId, u.id), eq(subscriptions.provider, "manual")));
  } else {
    await db.insert(subscriptions).values({
      userId: u.id,
      planId: "premium",
      provider: "manual",
      status: "active",
      currentPeriodEnd: new Date(Date.now() + days * 86_400_000),
    });
  }
  await db.insert(auditLogs).values({
    action: revoke ? "premium.manual_revoked" : "premium.manual_granted",
    entityType: "user",
    entityId: u.id,
    metadata: { via: "cli", days: revoke ? null : days },
  });
  console.log(revoke ? `Premium manual revogado de ${email}.` : `Premium manual concedido a ${email} por ${days} dias.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
