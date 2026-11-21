export async function queueStaffNotification(client, order, kind, eventKey, enabled = process.env.STAFF_NOTIFY_ENABLED === "true") {
  if (!enabled) return;
  await client.query("INSERT INTO staff_notifications(event_key,kind,order_id,amount) VALUES($1,$2,$3,$4) ON CONFLICT(event_key) DO NOTHING", [eventKey, kind, order.id, order.grand_total]);
}

export function createStaffNotifications(pool, { env = process.env, request = fetch } = {}) {
  const enabled = env.STAFF_NOTIFY_ENABLED === "true";
  let running;
  async function flush() {
    if (!enabled) return;
    const client = await pool.connect();
    try {
      // Bounded batch and network timeout; no network requests run inside order transactions.
      for (let i = 0; i < 10; i++) {
        await client.query("BEGIN");
        const row = (await client.query("SELECT n.*,o.order_number FROM staff_notifications n JOIN orders o ON o.id=n.order_id WHERE n.status='pending' AND n.next_attempt_at<=now() ORDER BY n.id FOR UPDATE OF n SKIP LOCKED LIMIT 1")).rows[0];
        if (!row) { await client.query("COMMIT"); break; }
        let sent = false;
        try {
          const origin = new URL(env.PUBLIC_BASE_URL);
          if (origin.protocol !== "https:" || origin.pathname !== "/" || origin.username || origin.password || origin.search || origin.hash || !env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) throw Error("notification_not_configured");
          const link = `${origin.origin}/quan-tri?order=${encodeURIComponent(row.order_number)}`;
          const text = `${row.kind === "bank_order" ? "Đơn chuyển khoản mới" : "Khách báo đã chuyển khoản"}\nMã đơn: ${row.order_number}\nSố tiền: ${Number(row.amount).toLocaleString("vi-VN")} đ\n${link}`;
          const response = await request(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, link_preview_options: { is_disabled: true } }),
          });
          const result = await response.json(); sent = response.ok && result.ok === true;
        } catch { /* Never log tokens, request URLs, message bodies or provider responses. */ }
        await client.query("UPDATE staff_notifications SET attempts=attempts+1,status=CASE WHEN $2 THEN 'sent' WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,sent_at=CASE WHEN $2 THEN now() ELSE NULL END,next_attempt_at=now()+interval '5 minutes' WHERE id=$1", [row.id, sent]);
        await client.query("COMMIT");
      }
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return { kick() {
    if (!enabled) return Promise.resolve();
    if (!running) running = flush().catch(() => { console.error("Chưa gửi được thông báo cho nhân viên; sẽ thử lại sau."); }).finally(() => { running = undefined; });
    return running;
  }, idle: () => running || Promise.resolve() };
}
