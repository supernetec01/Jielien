import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createCatalog } from "../lib/catalog.mjs";
import { createCms } from "../lib/cms.mjs";
import { createOperations } from "../lib/operations.mjs";
import { escape, tx } from "../lib/commerce-common.mjs";
import { migrate } from "./migrate.mjs";

export const journalDemoSchema = /^jielien_journal_demo(?:_[a-z0-9_]{1,25})?$/;
const fixturePath = new URL("./fixtures/seed-demo.json", import.meta.url);
const slugify = (name) => name.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
  .replace(/đ/g, "d").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function fromFixtureHtml(html) {
  const plainText = (value) => value.replace(/<[^>]+>/g, "")
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (part) => ({
      "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'",
    })[part]).trim();
  return [...html.matchAll(/<(p|h2|h3|ul)>([\s\S]*?)<\/\1>/gi)].map(([, tag, body]) => {
    tag = tag.toLowerCase();
    if (tag === "ul")
      return { type: "list", items: [...body.matchAll(/<li>([\s\S]*?)<\/li>/gi)].map(([, item]) => plainText(item)) };
    if (tag === "p") return { type: "paragraph", text: plainText(body) };
    return { type: "heading", level: Number(tag[1]), text: plainText(body) };
  });
}

async function artwork(directory, name, label, width, height) {
  const key = createHash("sha256").update("jielien-journal-demo:" + name).digest("hex")
    .slice(0, 32).replace(/^(........)(....)(....)(....)(............)$/, "$1-$2-$3-$4-$5") + ".webp";
  const font = Math.min(width / 9, height * 0.24);
  const captionFont = Math.min(font * 0.55, width * 1.45 / label.length);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="100%" height="100%" fill="#0b1b34"/>
    <path d="M0 ${height} L${width} 0 V${height} Z" fill="#193655"/>
    <rect x="${width * 0.08}" y="${height * 0.10}" width="${width * 0.26}" height="${height * 0.035}" fill="#86b529"/>
    <text x="50%" y="48%" text-anchor="middle" font-size="${font}" font-family="sans-serif" font-weight="700" fill="#d9edaa">JIELIEN DEMO</text>
    <text x="50%" y="68%" text-anchor="middle" font-size="${captionFont}" font-family="sans-serif" fill="#ffffff">${escape(label)}</text>
  </svg>`;
  const buffer = await sharp(Buffer.from(svg)).webp({ quality: 84 }).toBuffer();
  await writeFile(join(directory, key), buffer, { flag: "wx", mode: 0o600 })
    .catch((error) => { if (error.code !== "EEXIST") throw error; });
  return [key, buffer.length, width, height];
}

async function seedAuthors(c, authors) {
  const result = new Map();
  for (const [index, author] of authors.entries()) {
    await c.query(
      `INSERT INTO users(full_name,phone,email,username,password_hash,status)
       VALUES($1,$2,$3,$4,$5,'inactive') ON CONFLICT DO NOTHING`,
      [author.display_name, "030900000" + index, author.email, "journal-demo-" + author.id,
        "disabled:" + randomBytes(24).toString("hex")],
    );
    const { rows: [user] } = await c.query(
      "SELECT id FROM users WHERE email=$1 AND username=$2 AND status='inactive'",
      [author.email, "journal-demo-" + author.id],
    );
    if (!user) throw Error("Tên tài khoản tác giả demo đang được sử dụng: " + author.email);
    result.set(author.id, {
      ...user,
      permissions: ["content.write", "content.approve", "content.publish"],
    });
  }
  return result;
}

async function taxonomyIds(c, fixture) {
  const categories = new Map(), tags = new Map();
  for (const category of fixture.categories) {
    await c.query(
      "INSERT INTO article_categories(name,slug,description) VALUES($1,$2,$3) ON CONFLICT(slug) DO NOTHING",
      [category.name, category.slug, category.description],
    );
    const { rows: [row] } = await c.query("SELECT id FROM article_categories WHERE slug=$1", [category.slug]);
    categories.set(category.id, row.id);
  }
  for (const tag of fixture.tags) {
    await c.query("INSERT INTO article_tags(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING", [tag.name, tag.slug]);
    const { rows: [row] } = await c.query("SELECT id FROM article_tags WHERE slug=$1", [tag.slug]);
    tags.set(tag.id, row.id);
  }
  return { categories, tags };
}

async function seedProducts(c, catalog, items, actor, asset) {
  const products = new Map();
  const { rows: [warehouse] } = await c.query(
    "INSERT INTO warehouses(name,type) VALUES('Kho mẫu Jielien','normal') RETURNING id",
  );
  for (const p of items) {
    await c.query("INSERT INTO brands(name) VALUES($1) ON CONFLICT(name) DO NOTHING", [p.brand]);
    const { rows: [brand] } = await c.query("SELECT id FROM brands WHERE name=$1", [p.brand]);
    await c.query("INSERT INTO categories(name,slug) VALUES($1,$2) ON CONFLICT(slug) DO NOTHING", [p.category, slugify(p.category)]);
    const { rows: [category] } = await c.query("SELECT id FROM categories WHERE slug=$1", [slugify(p.category)]);
    const parent = await catalog.saveEditor(null, {
      name: p.name, slug: p.slug, description: p.description, status: "active",
      brandId: brand.id, categoryIds: [category.id],
      variants: [{ name: p.name, sku: p.sku, slug: p.slug, price: p.price_vnd }],
      media: [{ assetId: (await asset(p.image, p.name, 640, 640)).id }],
    }, actor);
    await c.query(
      "INSERT INTO inventory_balances(warehouse_id,variant_id,on_hand) VALUES($1,$2,$3)",
      [warehouse.id, parent.variants[0].id, p.stock_demo],
    );
    await c.query(
      `INSERT INTO inventory_movements(warehouse_id,variant_id,quantity_change,reserved_change,movement_type,reference_type,reference_id,reason)
       VALUES($1,$2,$3,0,'opening','catalog',$4,'Tồn đầu kỳ giả lập')`,
      [warehouse.id, parent.variants[0].id, p.stock_demo, String(parent.variants[0].id)],
    );
    products.set(p.id, parent.id);
  }
  return products;
}

async function seedBanners(c, ops, fixture, actor, asset) {
  const ids = new Map();
  const placements = new Map(fixture.ad_placements.map((p) => [p.code, p]));
  for (const ad of fixture.ad_campaigns) {
    const place = placements.get(ad.placement_code);
    const desktop = await asset(ad.image_desktop, ad.alt, place.width, place.height);
    const mobile = ad.image_mobile
      ? await asset(ad.image_mobile, ad.alt, place.mobile_width, place.mobile_height) : null;
    const banner = await ops.saveBanner(null, {
      slot: place.code, assetId: desktop.id, assetMobileId: mobile?.id,
      status: ad.status === "paused" ? "draft" : "published",
      title: ad.name, alt: ad.alt, targetPath: ad.demo_path,
      startsAt: ad.start_at, endsAt: ad.end_at, sortOrder: 10 - ad.priority,
    }, { id: actor });
    ids.set(ad.id, banner.id);
    const { from, impressions, clicks } = ad.stats_7d;
    for (const [offset, count] of impressions.entries())
      await c.query(
        "INSERT INTO demo_ad_stats_daily VALUES($1,$2::date + $3::integer,$4,$5)",
        [banner.id, from, offset, count, clicks[offset]],
      );
  }
  return ids;
}

async function seedArticles(c, cms, fixture, refs, asset) {
  for (const article of fixture.articles) {
    const author = refs.authors.get(article.author_id);
    const profile = fixture.authors.find((a) => a.id === article.author_id);
    const cover = article.featured_image
      ? await asset(article.featured_image, article.featured_alt, 1200, 675) : null;
    const blocks = fromFixtureHtml(article.content_html);
    const inline = [
      ...(article.inline_product_ids || []).map((id) => ({ type: "product", productId: refs.products.get(id) })),
      ...(article.inline_banner_ids || []).map((id) => ({ type: "banner", bannerId: refs.banners.get(id) })),
    ];
    blocks.splice(3, 0, ...inline);
    blocks.push(...article.faq.map(({ q, a }) => ({ type: "faq", question: q, answer: a })));
    let saved = await cms.save(null, {
      title: article.title, slug: article.slug, excerpt: article.excerpt,
      quickSummary: article.quick_summary, authorBio: profile.bio,
      seoTitle: article.seo_title, seoDescription: article.meta_description,
      focusKeyword: article.focus_keyword, coverUrl: cover?.url, coverAlt: article.featured_alt,
      categoryId: refs.categories.get(article.category_id),
      tagIds: article.tag_ids.map((id) => refs.tags.get(id)),
      relatedProductIds: article.product_ids.map((id) => refs.products.get(id)),
      contentBlocks: blocks,
    }, author);
    const actions = { published: ["submit", "approve", "publish"], pending: ["submit"], draft: [] };
    for (const action of actions[article.status])
      saved = await cms.action(saved.id, action, { version: saved.version }, author);
    if (article.published_at)
      await c.query("UPDATE articles SET published_at=$2 WHERE id=$1", [saved.id, article.published_at]);
  }
}

export async function seedJournalDemo(pool, mediaDirectory) {
  const { rows: [{ schema }] } = await pool.query("SELECT current_schema() AS schema");
  if (process.env.NODE_ENV === "production" || !journalDemoSchema.test(schema))
    throw Error("Seed Tin tức chỉ được chạy trong schema jielien_journal_demo riêng.");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  await migrate(pool);
  await mkdir(mediaDirectory, { recursive: true });
  return tx(pool, async (c) => {
    await c.query("SELECT pg_advisory_xact_lock(hashtext(current_schema() || ':journal-demo'))");
    await c.query(`
      CREATE TABLE IF NOT EXISTS demo_journal_seed(
        code TEXT PRIMARY KEY, fixture JSONB NOT NULL, loaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS demo_ad_stats_daily(
        banner_id BIGINT REFERENCES page_banners(id), day DATE, impressions INTEGER NOT NULL,
        clicks INTEGER NOT NULL CHECK(clicks BETWEEN 0 AND impressions), PRIMARY KEY(banner_id, day)
      )`);
    const code = "journal-v1";
    if ((await c.query("SELECT 1 FROM demo_journal_seed WHERE code=$1", [code])).rowCount)
      return { loaded: false, schema };
    const authors = await seedAuthors(c, fixture.authors);
    const actor = authors.get(fixture.authors[0].id).id;
    const asset = async (name, label, width, height) => {
      const values = await artwork(mediaDirectory, name, label, width, height);
      await c.query(
        `INSERT INTO media_assets(storage_key,mime_type,size_bytes,width,height,alt_text,created_by)
         VALUES($1,'image/webp',$2,$3,$4,$5,$6) ON CONFLICT(storage_key) DO NOTHING`,
        [...values, label, actor],
      );
      const { rows: [row] } = await c.query("SELECT id FROM media_assets WHERE storage_key=$1", [values[0]]);
      return { id: row.id, url: "/media/" + values[0] };
    };
    for (const author of fixture.authors) await asset(author.avatar, author.display_name, 160, 160);
    await asset(fixture.house_ad.image, fixture.house_ad.title, 728, 90);
    const taxonomy = await taxonomyIds(c, fixture);
    const ops = createOperations(c);
    const products = await seedProducts(c, createCatalog(c), fixture.products, actor, asset);
    const banners = await seedBanners(c, ops, fixture, actor, asset);
    await seedArticles(c, createCms(c), fixture, { ...taxonomy, authors, products, banners }, asset);
    for (const redirect of fixture.redirects) {
      // Links to private articles stay in the fixture until the destination is public.
      if (fixture.articles.some((a) => a.status === "published" && "/tin-tuc/" + a.slug === redirect.new_path))
        await ops.saveRedirect({ oldPath: redirect.old_path, newPath: redirect.new_path }, { id: actor });
    }
    await c.query("INSERT INTO demo_journal_seed(code,fixture) VALUES($1,$2)", [code, JSON.stringify(fixture)]);
    return { loaded: true, schema, products: products.size, articles: fixture.articles.length, banners: banners.size };
  });
}
