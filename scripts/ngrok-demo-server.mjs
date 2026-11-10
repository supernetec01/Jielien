// Explicit demo server in its own persistent schema; never seeds the storefront schema.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPool } from "../lib/database.mjs";
import { createApp } from "../server.mjs";
if (process.env.NODE_ENV === "production")
  throw new Error(
    "demo:server chỉ dùng cho demo, không chạy với NODE_ENV=production.",
  );
const schema = process.env.NGROK_DEMO_SCHEMA || "jielien_ngrok_demo";
if (!/^jielien_ngrok_demo(?:_[a-z0-9_]{1,30})?$/.test(schema))
  throw new Error("NGROK_DEMO_SCHEMA cần bắt đầu bằng jielien_ngrok_demo.");
const port = Number(process.env.NGROK_LOCAL_PORT || 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("NGROK_LOCAL_PORT không hợp lệ.");
process.env.DEMO_MODE = "true";
process.env.COOKIE_SECURE = "true";
process.env.SEO_INDEXING_ENABLED = "false";
const bootstrap = createPool();
try {
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
} finally {
  await bootstrap.end();
}
const pool = createPool({ schema });
let app;
try {
  app = await createApp({
    pool,
    legacyPath: null,
    catalogPath: fileURLToPath(
      new URL("../db/fixtures/catalog.json", import.meta.url),
    ),
    mediaDirectory: resolve("data/ngrok-demo-media"),
  });
  app.listen(port, "127.0.0.1", () =>
    console.log(
      `Jielien demo local: http://127.0.0.1:${port} · schema demo riêng · chia sẻ qua HTTPS ngrok.`,
    ),
  );
  app.on("error", async (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Cổng đã được sử dụng. Giữ website hiện có hoặc chọn NGROK_LOCAL_PORT khác."
        : "Không khởi động được demo server.",
    );
    app.close(() => {});
    await app.recoveryIdle();
    await pool.end();
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      app.close(async () => {
        await app.recoveryIdle();
        await pool.end();
        process.exit(0);
      });
      app.closeIdleConnections();
    });
} catch (error) {
  await pool.end();
  console.error(error.message);
  process.exitCode = 1;
}
