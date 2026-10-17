/**
 * Concede (ou revoga, com --revoke) o papel de administrador a um usuário já cadastrado.
 * Uso: npm run admin:grant -- voce@exemplo.com [--revoke]
 *      npm run admin:grant -- voce@exemplo.com --master   (console master: dono da plataforma)
 * Requer acesso direto ao banco — não existe rota web para isso.
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "../src/server/db";
import { auditLogs, user, userRoles } from "../src/server/db/schema";

async function main() {
  const email = process.argv.find((a) => a.includes("@"));
  const revoke = process.argv.includes("--revoke");
  const role = process.argv.includes("--master") ? ("master" as const) : ("admin" as const);
  if (!email) throw new Error("Informe o e-mail: npm run admin:grant -- voce@exemplo.com");
  const db = await getDb();
  const [u] = await db.select().from(user).where(eq(user.email, email.toLowerCase()));
  if (!u) throw new Error(`Usuário ${email} não encontrado. Cadastre-se na plataforma primeiro.`);
  if (revoke) {
    await db.delete(userRoles).where(and(eq(userRoles.userId, u.id), eq(userRoles.role, role)));
  } else {
    await db.insert(userRoles).values({ userId: u.id, role, grantedBy: "cli" }).onConflictDoNothing();
  }
  await db.insert(auditLogs).values({
    action: revoke ? `${role}.revoked` : `${role}.granted`,
    entityType: "user",
    entityId: u.id,
    metadata: { via: "cli" },
  });
  console.log(`${revoke ? `Papel ${role} removido de` : `Papel ${role} concedido a`} ${email}.`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
