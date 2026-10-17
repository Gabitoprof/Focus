/**
 * Troca o e-mail de login de uma conta (suporte). Uso, com o servidor parado:
 * npm run user:email -- antigo@exemplo.com novo@exemplo.com
 */
import { eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { auditLogs, session, user } from "../src/server/db/schema";

async function main() {
  const [from, to] = process.argv.filter((a) => a.includes("@")).map((e) => e.trim().toLowerCase());
  if (!from || !to) throw new Error("Uso: npm run user:email -- antigo@exemplo.com novo@exemplo.com");
  const db = await getDb();
  const [u] = await db.select().from(user).where(eq(user.email, from));
  if (!u) throw new Error(`Usuário ${from} não encontrado.`);
  const [taken] = await db.select({ id: user.id }).from(user).where(eq(user.email, to));
  if (taken) throw new Error(`Já existe uma conta com ${to}.`);
  await db.transaction(async (tx) => {
    await tx.update(user).set({ email: to, emailVerified: false, updatedAt: new Date() }).where(eq(user.id, u.id));
    // Encerra as sessões abertas: o próximo login já usa o e-mail novo.
    await tx.delete(session).where(eq(session.userId, u.id));
    await tx.insert(auditLogs).values({
      action: "user.email_changed",
      entityType: "user",
      entityId: u.id,
      metadata: { via: "cli", from, to },
    });
  });
  console.log(`E-mail alterado: ${from} → ${to}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
