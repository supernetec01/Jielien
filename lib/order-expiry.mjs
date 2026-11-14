import { bankTransferPolicy } from "./bank-transfer-policy.mjs";

export function createOrderExpiry(pool, store, policy = bankTransferPolicy()) {
  let running;
  async function perform({ dryRun = false } = {}) {
    if (!policy.enabled && !dryRun) return { disabled: true, expired: [], failed: [] };
    const client = await pool.connect();
    let locked = false;
    try {
      locked = (await client.query("SELECT pg_try_advisory_lock(hashtextextended(current_schema()||':order-expiry',0)) AS locked")).rows[0].locked;
      if (!locked) return { busy: true, expired: [], failed: [] };
      const candidates = (await client.query(
        `SELECT o.order_number AS id,o.grand_total AS amount,COALESCE(o.bank_payment_due_at,o.created_at+($1*interval '1 hour')) AS deadline FROM orders o
         WHERE o.payment_method='bank_transfer' AND o.status IN ('pending','confirmed','processing')
         AND COALESCE(o.bank_payment_due_at,o.created_at+($1*interval '1 hour'))<=now()
         AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.method='bank_transfer' AND p.status='pending')
         AND NOT EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='paid') ORDER BY o.created_at,o.id`, [policy.hours],
      )).rows;
      if (dryRun) return { dryRun: true, candidates };
      const result = { expired: [], failed: [] };
      for (const order of candidates) {
        try {
          const changed = await store.updateOrderStatus(order.id, "cancelled", null, "Hết hạn thanh toán", { expireOnly: true, connection: client });
          if (changed) result.expired.push(order.id);
        } catch { result.failed.push(order.id); }
      }
      return result;
    } finally {
      try { if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended(current_schema()||':order-expiry',0))"); }
      finally { client.release(); }
    }
  }
  return { run(options) {
    if (running) return running;
    running = perform(options).finally(() => { running = undefined; });
    return running;
  }, idle: () => running || Promise.resolve() };
}
