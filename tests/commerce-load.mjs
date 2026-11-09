// Controlled development benchmark. Not real-user Core Web Vitals or a production capacity claim.
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createApp } from "./support/app.mjs";
import { createTestDatabase, closeServer } from "./support/database.mjs";
const db = await createTestDatabase();
let app;
try {
  app = await createApp({ pool: db.pool, legacyPath: null });
  app.listen(0, "127.0.0.1");
  await once(app, "listening");
  const base = `http://127.0.0.1:${app.address().port}`;
  const products = (await (await fetch(base + "/api/products")).json())
      .products,
    paths = ["/api/products", "/san-pham/" + products[0].slug, "/tin-tuc", "/"];
  const samples = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: 8 }, async () => {
      for (;;) {
        const i = next++;
        if (i >= 120) return;
        const start = performance.now();
        const r = await fetch(base + paths[i % paths.length]);
        assert.equal(r.status, 200);
        await r.arrayBuffer();
        samples.push(performance.now() - start);
      }
    }),
  );
  samples.sort((a, b) => a - b);
  const report = {
    recordedAt: new Date().toISOString(),
    environment: "Linux cloud isolated PostgreSQL schema, local HTTP",
    node: process.version,
    requests: 120,
    concurrency: 8,
    failures: 0,
    p50Ms: Math.round(samples[Math.floor(samples.length * 0.5)]),
    p95Ms: Math.round(samples[Math.floor(samples.length * 0.95)]),
    maxMs: Math.round(samples.at(-1)),
    limitations:
      "Development lab only; not production capacity, Lighthouse, LCP/INP/CLS p75 or Windows/LAN evidence.",
  };
  await mkdir("docs/validation", { recursive: true });
  await writeFile(
    "docs/validation/load.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
} finally {
  await closeServer(app);
  await db.cleanup();
}
