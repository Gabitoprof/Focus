/**
 * Aplica as migrações e os dados de referência.
 * - Com DATABASE_URL: no Postgres de produção/homologação.
 * - Sem DATABASE_URL: no PGlite local (.data/pglite).
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { getDb, MIGRATIONS_FOLDER, schema, type DB } from "../src/server/db";
import { seedReferenceData } from "../src/server/db/seed";

async function main() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    await seedReferenceData(db as unknown as DB);
    await pool.end();
  } else {
    await getDb(); // PGlite migra e semeia ao conectar
  }
  console.log("Migrações aplicadas.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
