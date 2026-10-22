import { randomBytes } from "node:crypto";
import { createPool } from "../../lib/database.mjs";

// Only temporary schemas are created/dropped. Never use a running storefront's schema.
export async function createTestDatabase() {
  const schema = `test_${process.pid}_${randomBytes(8).toString("hex")}`;
  const admin = createPool();
  let pool;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = createPool({ schema });
  } catch (error) {
    await admin.end();
    throw new Error(
      "PostgreSQL test database is unavailable. Start the documented local PostgreSQL service or set DATABASE_URL.",
      { cause: error },
    );
  }
  let closed = false;
  return {
    pool,
    schema,
    async cleanup() {
      if (closed) return;
      closed = true;
      await pool.end();
      try {
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      } finally {
        await admin.end();
      }
    },
  };
}

export async function closeServer(server) {
  if (!server?.listening) return;
  server.closeIdleConnections?.();
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
}
