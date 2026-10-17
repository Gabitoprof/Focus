import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { Pool } from "pg";
import * as schema from "./schema";
import { seedReferenceData } from "./seed";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DB = PgDatabase<PgQueryResultHKT, typeof schema, any>;

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

const BACKUP_DIR = path.join(process.cwd(), ".data", "backups");
const BACKUP_EVERY_MS = 24 * 3_600_000;
const BACKUPS_TO_KEEP = 5;

/**
 * Cópia de segurança do banco local (desenvolvimento): no máximo uma por dia, mantendo as
 * últimas 5. Restaurar: `new PGlite(dir, { loadDataDir: arquivo })` (ver README).
 */
async function backupIfDue(client: PGlite) {
  try {
    mkdirSync(BACKUP_DIR, { recursive: true });
    const files = readdirSync(BACKUP_DIR)
      .filter((f) => f.endsWith(".tar.gz"))
      .map((f) => ({ f, t: statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    if (files[0] && Date.now() - files[0].t < BACKUP_EVERY_MS) return;
    const dump = await client.dumpDataDir("gzip");
    const name = `pglite-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`;
    writeFileSync(path.join(BACKUP_DIR, name), Buffer.from(await dump.arrayBuffer()));
    for (const old of files.slice(BACKUPS_TO_KEEP - 1)) unlinkSync(path.join(BACKUP_DIR, old.f));
  } catch (e) {
    console.warn("[db] não foi possível criar a cópia de segurança local:", (e as Error).message);
  }
}

/**
 * Produção: Postgres real via DATABASE_URL (migrações com `npm run db:migrate`).
 * Desenvolvimento: PGlite gravado em disco, migrado automaticamente na primeira conexão.
 */
async function createDb(): Promise<DB> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url, max: 10 });
    return drizzlePg(pool, { schema }) as unknown as DB;
  }
  // O PGlite aceita um único processo por pasta: o build de produção nunca pode abri-la
  // (rodar `next build` com o `next dev` ligado corromperia o banco local).
  if (process.env.NEXT_PHASE === "phase-production-build") {
    throw new Error("Banco local (PGlite) indisponível durante o build: configure DATABASE_URL ou evite consultas no build.");
  }
  const dir = process.env.PGLITE_DIR ?? path.join(process.cwd(), ".data", "pglite");
  const isNew = !existsSync(path.join(dir, "PG_VERSION"));
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  // Fecha o banco de forma limpa ao encerrar o processo (evita arquivos pela metade).
  const close = () => {
    void client.close().catch(() => {});
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
  process.once("beforeExit", close);

  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedReferenceData(db as unknown as DB);
  // Ponto de controle limpo logo após migrar, e cópia de segurança diária.
  await client.exec("CHECKPOINT");
  if (!isNew) void backupIfDue(client);
  return db as unknown as DB;
}

/** Banco em memória para testes, já migrado e com dados de referência. */
export async function createTestDb(): Promise<DB> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, { migrationsFolder: MIGRATIONS_FOLDER });
  await seedReferenceData(db as unknown as DB);
  return db as unknown as DB;
}

// Uma única instância por processo (sobrevive ao hot reload do Next em desenvolvimento).
const globalForDb = globalThis as unknown as { __focusDb?: Promise<DB> };

export function getDb(): Promise<DB> {
  globalForDb.__focusDb ??= createDb().catch((err) => {
    globalForDb.__focusDb = undefined;
    throw err;
  });
  return globalForDb.__focusDb;
}

export { schema };
