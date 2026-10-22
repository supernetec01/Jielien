import { resolve } from "node:path";
import { createPool } from "../lib/database.mjs";
import { migrate } from "../db/migrate.mjs";
import { createStore } from "../db/store.mjs";
const pool = createPool();
try {
  const command = process.argv[2] || "status";
  if (command === "migrate") {
    const result = await migrate(pool);
    console.log("Migrations applied:", result.applied.length ?? result.applied);
  } else if (command === "import") {
    await createStore({
      pool,
      catalogPath: resolve("public/catalog.json"),
      legacyPath: resolve("data/store.sqlite"),
    });
    const { rows } = await pool.query(
      "SELECT summary FROM legacy_imports ORDER BY imported_at DESC LIMIT 1",
    );
    const summary = rows[0]?.summary;
    console.log(
      "Legacy import complete.",
      summary
        ? {
            orders: summary.orders,
            orderItems: summary.orderItems,
            inventory: summary.inventory,
          }
        : "No legacy source found.",
    );
  } else if (command === "status") {
    const { rows } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema=current_schema() ORDER BY table_name",
    );
    console.log("Database: PostgreSQL. Tables:", rows.length);
    console.log(rows.map((row) => row.table_name).join(", "));
  } else throw new Error("Use status, migrate or import.");
} catch (error) {
  console.error(
    error.status
      ? error.message
      : "Database operation failed. Check PostgreSQL and migration status.",
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
