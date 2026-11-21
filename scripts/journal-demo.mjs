import { resolve } from "node:path";
import { createPool } from "../lib/database.mjs";
import { createApp } from "../server.mjs";
import { journalDemoSchema, seedJournalDemo } from "../db/seed-journal-demo.mjs";

const schema = process.env.JIELIEN_JOURNAL_DEMO_SCHEMA || "jielien_journal_demo";
if (process.env.NODE_ENV === "production" || !journalDemoSchema.test(schema))
  throw Error("Demo Tin tức cần schema jielien_journal_demo riêng và môi trường ngoài production.");

const serve = process.argv.includes("--serve");
const port = Number(process.env.JIELIEN_JOURNAL_DEMO_PORT || 3011);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Cổng demo Tin tức không hợp lệ.");
const bind = process.env.JIELIEN_JOURNAL_DEMO_BIND || "127.0.0.1";
if (!["127.0.0.1", "0.0.0.0"].includes(bind))
  throw Error("Địa chỉ nghe demo Tin tức không hợp lệ.");
const mediaDirectory = resolve("data/journal-demo", schema, "media");
const bootstrap = createPool();
try {
  await bootstrap.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
} finally {
  await bootstrap.end();
}
const pool = createPool({ schema });
let app;
try {
  console.log(await seedJournalDemo(pool, mediaDirectory));
  if (serve) {
    process.env.DEMO_MODE = "true";
    process.env.COOKIE_SECURE = "false";
    process.env.STAFF_NOTIFY_ENABLED = "false";
    process.env.ORDER_EXPIRY_ENABLED = "false";
    process.env.SENTRY_DSN_FRONTEND = "";
    app = await createApp({
      pool, legacyPath: null, catalogPath: null, mediaDirectory, bankConfig: null,
      seoConfiguration: {}, passwordRecoveryDelivery: null,
    });
    await new Promise((ready, fail) => {
      app.once("error", fail);
      app.listen(port, bind, ready);
    });
    console.log(`Tin tức demo: http://localhost:${port}/tin-tuc`);
    for (const signal of ["SIGINT", "SIGTERM"])
      process.once(signal, () => {
        app.close(async () => {
          await app.recoveryIdle();
          await pool.end();
        });
        app.closeIdleConnections();
      });
  }
} catch (error) {
  if (app?.listening) {
    await new Promise((resolve) => app.close(resolve));
    await app.recoveryIdle();
  }
  throw error;
} finally {
  if (!app?.listening) await pool.end();
}
