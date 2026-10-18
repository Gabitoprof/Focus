/**
 * Monta o arquivo .env.vercel (para colar em Vercel → Settings → Environment Variables → Import)
 * a partir de .env.nuvem (endereços do banco no Supabase) e .env.local (chaves de API).
 * Gera segredos NOVOS para produção. Nunca imprime valores, só os nomes.
 *
 *   node scripts/cloud-env.mjs [https://endereco-do-site.vercel.app]
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const parse = (file) =>
  existsSync(file)
    ? Object.fromEntries(
        readFileSync(file, "utf8")
          .split(/\r?\n/)
          .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^"(.*)"$/, "$1")]),
      )
    : null;

const nuvem = parse(".env.nuvem");
const local = parse(".env.local") ?? {};
if (!nuvem?.DATABASE_URL) {
  console.error("Falta o arquivo .env.nuvem com DATABASE_URL (endereço 'Transaction pooler', porta 6543, do Supabase).");
  process.exit(1);
}
const previous = parse(".env.vercel") ?? {};
const secret = (name, bytes = 32) => previous[name] || randomBytes(bytes).toString("base64url");
const siteUrl = process.argv[2] || previous.BETTER_AUTH_URL || "https://TROCAR-PELO-ENDERECO.vercel.app";

const vars = {
  DATABASE_URL: nuvem.DATABASE_URL,
  BETTER_AUTH_URL: siteUrl.replace(/\/$/, ""),
  // Segredos de produção: gerados uma vez e mantidos (IDENTITY_HMAC_SECRET nunca pode mudar depois que houver usuários).
  BETTER_AUTH_SECRET: secret("BETTER_AUTH_SECRET"),
  IDENTITY_HMAC_SECRET: secret("IDENTITY_HMAC_SECRET", 48),
  CRON_SECRET: secret("CRON_SECRET", 24),
  RESEND_API_KEY: local.RESEND_API_KEY,
  MAIL_FROM: local.MAIL_FROM,
  CNPJ_API_KEY: local.CNPJ_API_KEY,
  CPFHUB_API_KEY: local.CPFHUB_API_KEY,
};
const lines = Object.entries(vars)
  .filter(([, v]) => v)
  .map(([k, v]) => `${k}=${/[\s#"<>]/.test(v) ? JSON.stringify(v) : v}`);
writeFileSync(
  ".env.vercel",
  `# Gerado por scripts/cloud-env.mjs — cole em Vercel → Settings → Environment Variables (não vai para o GitHub)\n${lines.join("\n")}\n`,
);
console.log("Gravado .env.vercel com:", lines.map((l) => l.split("=")[0]).join(", "));
const missing = Object.entries(vars).filter(([, v]) => !v).map(([k]) => k);
if (missing.length) console.log("Sem valor (ficam de fora):", missing.join(", "));
