import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const migrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

/**
 * Apply immutable, checksummed migrations to the pool's current search_path.
 * The advisory lock serializes migration runners; all DDL and version records
 * commit together. No database, schema, catalog or live data is reset here.
 */
export async function migrate(pool) {
  const migrations = (await readdir(migrationDirectory))
    .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  if (!migrations.length) throw new Error("No database migrations found.");
  const client = await pool.connect();
  const applied = [];
  try {
    await client.query("BEGIN");
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended('jielien-schema-migrations', 0))",
    );
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const { rows } = await client.query(
      "SELECT version, checksum FROM schema_migrations ORDER BY version",
    );
    const known = new Map(rows.map((row) => [row.version, row.checksum]));
    const available = new Set(migrations);
    for (const version of known.keys()) {
      if (!available.has(version))
        throw new Error(
          `Applied migration ${version} is missing from this checkout; refusing an unsupported downgrade.`,
        );
    }
    for (const version of migrations) {
      const sql = await readFile(join(migrationDirectory, version), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (known.has(version)) {
        if (known.get(version) !== checksum)
          throw new Error(
            `Migration ${version} has changed after being applied. Add a new migration instead.`,
          );
        continue;
      }
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations(version, checksum) VALUES ($1, $2)",
        [version, checksum],
      );
      applied.push(version);
    }
    await client.query("COMMIT");
    return { applied, versions: migrations };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
