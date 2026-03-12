import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Pool, type PoolClient } from "pg";

export interface PanelDatabaseMigrationRecord {
  version: string;
  checksum: string;
  appliedAt: string;
}

export interface PanelDatabaseMigrationPlan {
  version: string;
  filename: string;
  checksum: string;
  sql: string;
}

const migrationsTableStatement = `CREATE TABLE IF NOT EXISTS shp_schema_migrations (
  version TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
)`;

function getPackageRoot(): string {
  return path.resolve(fileURLToPath(new URL("..", import.meta.url)));
}

async function readMigrationPlans(): Promise<PanelDatabaseMigrationPlan[]> {
  const migrationsDirectory = path.join(getPackageRoot(), "migrations");
  const entries = await readdir(migrationsDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  const plans: PanelDatabaseMigrationPlan[] = [];

  for (const filename of files) {
    const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const [version] = filename.split("_", 1);

    plans.push({
      version: version ?? filename,
      filename,
      checksum,
      sql
    });
  }

  return plans;
}

async function withTransaction<T>(
  client: PoolClient,
  action: () => Promise<T>
): Promise<T> {
  await client.query("BEGIN");

  try {
    const result = await action();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function getAppliedPanelMigrations(
  pool: Pool
): Promise<PanelDatabaseMigrationRecord[]> {
  await pool.query(migrationsTableStatement);

  const result = await pool.query<{
    version: string;
    checksum: string;
    applied_at: Date | string;
  }>(
    `SELECT version, checksum, applied_at
     FROM shp_schema_migrations
     ORDER BY version ASC`
  );

  return result.rows.map((row) => ({
    version: row.version,
    checksum: row.checksum,
    appliedAt:
      row.applied_at instanceof Date
        ? row.applied_at.toISOString()
        : new Date(row.applied_at).toISOString()
  }));
}

export async function runPanelDatabaseMigrations(
  pool: Pool
): Promise<PanelDatabaseMigrationRecord[]> {
  await pool.query(migrationsTableStatement);

  const appliedMigrations = new Map(
    (await getAppliedPanelMigrations(pool)).map((migration) => [
      migration.version,
      migration
    ])
  );
  const plans = await readMigrationPlans();

  for (const plan of plans) {
    const applied = appliedMigrations.get(plan.version);

    if (applied) {
      if (applied.checksum !== plan.checksum) {
        throw new Error(
          `Migration checksum mismatch for version ${plan.version}. Applied checksum ${applied.checksum} does not match ${plan.checksum}.`
        );
      }

      continue;
    }

    const client = await pool.connect();

    try {
      await withTransaction(client, async () => {
        await client.query(plan.sql);
        await client.query(
          `INSERT INTO shp_schema_migrations (version, checksum)
           VALUES ($1, $2)`,
          [plan.version, plan.checksum]
        );
      });
    } finally {
      client.release();
    }
  }

  return getAppliedPanelMigrations(pool);
}
