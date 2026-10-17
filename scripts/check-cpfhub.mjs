/**
 * Confere se a chave do CPFHub configurada em .env.local é aceita, usando GET /quota
 * (não consome crédito e não envia CPF). Nunca imprime a chave.
 * Uso: node scripts/check-cpfhub.mjs
 */
import { readFileSync } from "node:fs";

const env = readFileSync(".env.local", "utf8");
const key = env.match(/^CPFHUB_API_KEY=(.+)$/m)?.[1]?.trim();
if (!key) {
  console.log("CPFHUB_API_KEY não encontrada em .env.local.");
  process.exit(1);
}
const res = await fetch("https://api.cpfhub.io/quota", { headers: { "x-api-key": key } });
const body = await res.json().catch(() => ({}));
const data = body?.data ?? body;
console.log(`HTTP ${res.status}`);
if (res.ok) {
  const pick = Object.fromEntries(Object.entries(data).filter(([k]) => !/key|token|email|cpf/i.test(k)));
  console.log("Saldo/plano:", JSON.stringify(pick));
} else {
  console.log("Resposta:", typeof body?.error === "string" ? body.error : body?.error?.message ?? "sem detalhes");
}
