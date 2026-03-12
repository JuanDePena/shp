import { Pool } from "pg";

import { runPanelDatabaseMigrations } from "./migrations.js";

function readDatabaseUrl(): string {
  const url = process.env.SHP_DATABASE_URL ?? process.env.DATABASE_URL;

  if (!url || url.trim().length === 0) {
    throw new Error("SHP_DATABASE_URL or DATABASE_URL must be set.");
  }

  return url.trim();
}

async function main(): Promise<void> {
  const pool = new Pool({
    connectionString: readDatabaseUrl(),
    application_name: "simplehost-panel-migrate"
  });

  try {
    const applied = await runPanelDatabaseMigrations(pool);
    console.log(
      JSON.stringify(
        {
          appliedMigrations: applied.length,
          latestVersion: applied.at(-1)?.version ?? null
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
