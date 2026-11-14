import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../lib/database.mjs";
import { createStore } from "../db/store.mjs";
import { createOrderExpiry } from "../lib/order-expiry.mjs";
export async function expireOrders({ dryRun = false } = {}) {
  const pool = createPool();
  try {
    const store = await createStore({ pool, catalogPath: null, legacyPath: null, migrateSchema: false });
    return await createOrderExpiry(pool, store).run({ dryRun });
  } finally { await pool.end(); }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.slice(2).some(arg => arg !== "--dry-run")) throw Error("Chỉ hỗ trợ tùy chọn --dry-run.");
  try {
    const result = await expireOrders({ dryRun: process.argv.includes("--dry-run") });
    console.log(JSON.stringify(result));
    if (result.failed?.length) process.exitCode = 1;
  }
  catch { console.error("Chưa kiểm tra được các đơn hết hạn. Vui lòng kiểm tra kết nối database."); process.exitCode = 1; }
}
