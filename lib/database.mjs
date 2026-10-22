import pg from "pg";

// All monetary values are integral VND; identifiers are checked before SQL use.
pg.types.setTypeParser(20, (value) => {
  const number = Number(value);
  if (!Number.isSafeInteger(number))
    throw new Error("Database integer exceeds JavaScript safe range.");
  return number;
});
export const databaseUrl = () =>
  process.env.DATABASE_URL ||
  "postgresql:///jielien?host=%2Fworkspace%2F.postgres%2Fsocket&port=5433&user=agent";
export function createPool({ connectionString = databaseUrl(), schema } = {}) {
  if (schema && !/^[a-z_][a-z0-9_]{0,62}$/.test(schema))
    throw new Error("Invalid database schema name.");
  return new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    ...(schema ? { options: `-c search_path=${schema}` } : {}),
  });
}
