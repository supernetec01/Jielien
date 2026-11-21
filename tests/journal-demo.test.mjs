import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { createApp } from "../server.mjs";
import { createPool } from "../lib/database.mjs";
import { seedJournalDemo } from "../db/seed-journal-demo.mjs";
import { closeServer, createTestDatabase } from "./support/database.mjs";

test("journal demo seed rejects a schema without the explicit demo name", async () => {
  const db = await createTestDatabase();
  try {
    await assert.rejects(seedJournalDemo(db.pool, "/unused"), /schema jielien_journal_demo/);
  } finally {
    await db.cleanup();
  }
});

test("journal demo seed loads the fixture once and serves only public articles", async () => {
  const schema = "jielien_journal_demo_test_" + randomBytes(6).toString("hex");
  const bootstrap = createPool();
  const directory = await mkdtemp(join(tmpdir(), "jielien-journal-"));
  let pool, app;
  try {
    await bootstrap.query(`CREATE SCHEMA "${schema}"`);
    pool = createPool({ schema });
    const first = await seedJournalDemo(pool, directory);
    assert.deepEqual(first, { loaded: true, schema, products: 8, articles: 6, banners: 6 });
    const totals = async () => (await pool.query(`
      SELECT (SELECT count(*) FROM articles) AS articles,
        (SELECT count(*) FROM article_revisions) AS revisions,
        (SELECT count(*) FROM products) AS products,
        (SELECT count(*) FROM product_variants) AS variants,
        (SELECT count(*) FROM page_banners) AS banners,
        (SELECT count(*) FROM demo_ad_stats_daily) AS stats,
        (SELECT count(*) FROM article_categories) AS categories,
        (SELECT count(*) FROM article_tags) AS tags,
        (SELECT count(*) FROM users) AS authors,
        (SELECT count(*) FROM media_assets) AS media,
        (SELECT count(*) FROM seo_redirects) AS redirects
    `)).rows[0];
    const before = await totals();
    assert.deepEqual(before, {
      articles: 6, revisions: 6, products: 8, variants: 8, banners: 6, stats: 42,
      categories: 5, tags: 9, authors: 3, media: 26, redirects: 1,
    });
    assert.equal((await readdir(directory)).length, before.media);
    assert.equal((await seedJournalDemo(pool, directory)).loaded, false);
    assert.deepEqual(await totals(), before);
    const states = (await pool.query("SELECT status,count(*) FROM articles GROUP BY status")).rows;
    assert.deepEqual(Object.fromEntries(states.map(({ status, count }) => [status, count])), {
      draft: 1, in_review: 1, published: 4,
    });
    const skus = (await pool.query("SELECT sku FROM product_variants WHERE sku IN ('DEMO-BT-BINH-SUA','DEMO-YL-S12','DEMO-SS-3M')")).rows;
    assert.equal(skus.length, 3);
    assert.equal((await pool.query("SELECT count(*) FROM users WHERE status='active'")).rows[0].count, 0);
    assert.deepEqual((await pool.query(`
      SELECT jsonb_array_length(fixture->'ad_placements') AS placements,
             jsonb_array_length(fixture->'redirects') AS redirects
      FROM demo_journal_seed`
    )).rows[0].placements, 7);

    app = await createApp({ pool, mediaDirectory: directory, legacyPath: null });
    app.listen(0, "127.0.0.1");
    await once(app, "listening");
    const origin = `http://127.0.0.1:${app.address().port}`;
    const index = await fetch(origin + "/api/news").then((r) => r.json());
    assert.equal(index.items.length, 4);
    for (const slug of ["canh-bao-khi-mua-hang-online", "chon-thuc-an-hat-cho-cho"])
      assert.equal((await fetch(origin + "/tin-tuc/" + slug)).status, 404);
    const article = await fetch(origin + "/tin-tuc/cach-chon-loa-bluetooth");
    assert.equal(article.status, 200);
    const markup = await article.text();
    assert.match(markup, /Youlisn S12/);
    const image = markup.match(/class="journal-cover"[^>]+src="([^"]+)"/)[1];
    const picture = await fetch(origin + image);
    assert.equal(picture.headers.get("content-type"), "image/webp");
    await picture.arrayBuffer();
    const old = await fetch(origin + "/tin-tuc/chon-non-bao-hiem", { redirect: "manual" });
    assert.equal(old.status, 301);
    assert.equal(old.headers.get("location"), "/tin-tuc/cach-chon-non-bao-hiem");
  } finally {
    await closeServer(app);
    await pool?.end();
    await bootstrap.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await bootstrap.end();
    await rm(directory, { recursive: true, force: true });
  }
});
