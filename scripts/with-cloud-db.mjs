/**
 * Roda um comando apontando para o banco da nuvem (Supabase), sem mexer no banco local.
 * Usa DATABASE_URL_DIRECT do .env.nuvem (Session pooler, porta 5432 — bom para migrações e importações).
 *
 *   node scripts/with-cloud-db.mjs npm run db:migrate
 *   node scripts/with-cloud-db.mjs npm run admin:grant -- email@exemplo.com --master
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.nuvem", "utf8")
    .split(/\r?\n/)
    .map((l) => l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((m) => [m[1], m[2]]),
);
const url = env.DATABASE_URL_DIRECT || env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL_DIRECT no .env.nuvem");
  process.exit(1);
}
const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("Informe o comando. Ex.: node scripts/with-cloud-db.mjs npm run db:migrate");
  process.exit(1);
}
const r = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32", env: { ...process.env, DATABASE_URL: url } });
process.exit(r.status ?? 1);
