import {
  tx,
  text,
  id,
  slug,
  version,
  reject,
  audit,
  blocks,
  permit,
} from "./commerce-common.mjs";
function referenceIds(value, label) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20)
    reject(400, "validation_error", `${label} cần danh sách tối đa 20 ID.`);
  return [...new Set(value.map(v => {
    if (typeof v !== "number" && !(typeof v === "string" && /^\d+$/.test(v)))
      reject(400, "validation_error", `${label} chứa ID không hợp lệ.`);
    return id(v);
  }))];
}
export function createCms(pool) {
  const publicSql = `SELECT a.id,a.published_at,r.created_at AS updated_at,r.snapshot,u.full_name AS author FROM articles a JOIN article_revisions r ON r.id=a.published_revision_id JOIN users u ON u.id=a.author_id WHERE a.status<>'archived' AND a.published_at<=now()`;
  function dto(row) {
    return {
      ...row.snapshot,
      id: row.id,
      author: row.author,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
    };
  }
  async function get(articleId, user, c = pool) {
    const a = (
      await c.query("SELECT * FROM articles WHERE id=$1", [id(articleId)])
    ).rows[0];
    if (!a) reject(404, "not_found", "Không tìm thấy bài.");
    if (
      !user.permissions.includes("content.manage") &&
      !user.permissions.includes("content.approve") &&
      !user.permissions.includes("audit.read") &&
      a.author_id !== user.id
    )
      reject(403, "permission_denied", "Chỉ được sửa bài của mình.");
    return a;
  }
  async function list(user, q = {}) {
    const search = text(q.q || "", "Tìm kiếm", 120),
      status = text(q.status || "", "Trạng thái", 30);
    const global =
      user.permissions.includes("content.manage") ||
      user.permissions.includes("content.approve") ||
      user.permissions.includes("audit.read");
    return (
      await pool.query(
        "SELECT id,title,slug,status,version,author_id,scheduled_at,published_at FROM articles WHERE ($1 OR author_id=$2) AND ($3='' OR title ILIKE '%'||$3||'%') AND ($4='' OR status=$4) ORDER BY id DESC LIMIT 100",
        [global, user.id, search, status],
      )
    ).rows;
  }
  async function sanitize(b, c) {
    if (
      (b.tagIds !== undefined && !Array.isArray(b.tagIds)) ||
      (b.relatedProductIds !== undefined && !Array.isArray(b.relatedProductIds))
    )
      reject(
        400,
        "validation_error",
        "Tags/sản phẩm liên quan phải là danh sách.",
      );
    const snapshot = {
      title: text(b.title, "Tiêu đề", 200, 3),
      slug: slug(b.slug),
      excerpt: text(b.excerpt || "", "Tóm tắt", 1000),
      contentBlocks: blocks(b.contentBlocks === undefined ? [] : b.contentBlocks),
      coverUrl: text(b.coverUrl || "", "Ảnh bìa", 200),
      coverAlt: text(b.coverAlt || "", "Mô tả ảnh", 250),
      seoTitle: text(b.seoTitle || "", "SEO title", 200),
      seoDescription: text(b.seoDescription || "", "SEO description", 500),
      categoryId: b.categoryId ? id(b.categoryId) : null,
      tagIds: referenceIds(b.tagIds, "Tag"),
      relatedProductIds: referenceIds(b.relatedProductIds, "Sản phẩm liên quan"),
    };
    if (
      snapshot.coverUrl &&
      (!/^\/media\/[a-f0-9-]{36}\.webp$/.test(snapshot.coverUrl) ||
        !(
          await c.query("SELECT 1 FROM media_assets WHERE storage_key=$1", [
            snapshot.coverUrl.slice(7),
          ])
        ).rowCount)
    )
      reject(400, "invalid_media", "Chọn ảnh từ thư viện.");
    for (const block of snapshot.contentBlocks)
      if (
        block.type === "image" &&
        !(
          await c.query("SELECT 1 FROM media_assets WHERE storage_key=$1", [
            block.url.slice(7),
          ])
        ).rowCount
      )
        reject(400, "invalid_media", "Ảnh nội dung không tồn tại.");
    if (snapshot.tagIds.length > 20 || snapshot.relatedProductIds.length > 20)
      reject(400, "validation_error", "Tối đa 20 tag/sản phẩm liên quan.");
    return snapshot;
  }
  async function save(articleId, b, user) {
    permit(user, "content.write");
    return tx(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(836413)");
      let old;
      if (articleId) {
        await c.query("SELECT id FROM articles WHERE id=$1 FOR UPDATE", [
          id(articleId),
        ]);
        old = await get(articleId, user, c);
        if (
          old.author_id !== user.id &&
          !user.permissions.includes("content.manage") &&
          !user.permissions.includes("content.approve")
        )
          reject(403, "permission_denied", "Chỉ được sửa bài của mình.");
        version(old, b.version);
      }
      const snap = await sanitize(b, c);
      await c.query("SELECT pg_advisory_xact_lock(836413)");
      const reserved = await c.query(
        "SELECT a.id FROM articles a LEFT JOIN article_revisions r ON r.id=a.published_revision_id WHERE a.id<>$2 AND (a.slug=$1 OR r.snapshot->>'slug'=$1)",
        [snap.slug, old?.id || 0],
      );
      if (reserved.rowCount)
        reject(409, "duplicate_slug", "Slug đang được bài khác sử dụng.");
      const alias = (
        await c.query("SELECT new_path FROM seo_redirects WHERE old_path=$1", [
          "/tin-tuc/" + snap.slug,
        ])
      ).rows[0];
      const publicSnapshot = old?.published_revision_id
        ? (
            await c.query(
              "SELECT snapshot FROM article_revisions WHERE id=$1",
              [old.published_revision_id],
            )
          ).rows[0]?.snapshot
        : null;
      if (
        alias &&
        !["/tin-tuc/" + old?.slug, "/tin-tuc/" + publicSnapshot?.slug].includes(
          alias.new_path,
        )
      )
        reject(409, "reserved_slug", "Slug đã được giữ cho bài viết khác.");
      let a;
      if (old) {
        a = (
          await c.query(
            "UPDATE articles SET title=$2,slug=$3,snapshot=$4,category_id=$5,status='draft',version=version+1,scheduled_at=NULL,updated_at=now() WHERE id=$1 RETURNING *",
            [
              old.id,
              snap.title,
              snap.slug,
              JSON.stringify(snap),
              snap.categoryId,
            ],
          )
        ).rows[0];
        await c.query(
          "UPDATE article_publish_jobs SET state='cancelled' WHERE article_id=$1 AND state='pending'",
          [old.id],
        );
      } else
        a = (
          await c.query(
            "INSERT INTO articles(title,slug,snapshot,category_id,author_id) VALUES($1,$2,$3,$4,$5) RETURNING *",
            [
              snap.title,
              snap.slug,
              JSON.stringify(snap),
              snap.categoryId,
              user.id,
            ],
          )
        ).rows[0];
      const revision = (
        await c.query(
          "INSERT INTO article_revisions(article_id,version,snapshot,actor_id) VALUES($1,$2,$3,$4) RETURNING id",
          [a.id, a.version, JSON.stringify(snap), user.id],
        )
      ).rows[0];
      await c.query("UPDATE articles SET current_revision_id=$2 WHERE id=$1", [
        a.id,
        revision.id,
      ]);
      await c.query("DELETE FROM article_tag_links WHERE article_id=$1", [
        a.id,
      ]);
      for (const tag of new Set(snap.tagIds))
        await c.query("INSERT INTO article_tag_links VALUES($1,$2)", [
          a.id,
          tag,
        ]);
      await c.query("DELETE FROM article_product_links WHERE article_id=$1", [
        a.id,
      ]);
      for (const product of new Set(snap.relatedProductIds))
        await c.query("INSERT INTO article_product_links VALUES($1,$2)", [
          a.id,
          product,
        ]);
      await audit(c, user.id, "cms.saved", "article", a.id, {
        version: a.version,
      });
      return get(a.id, user, c);
    });
  }
  function ready(s) {
    if (
      !s.contentBlocks.length ||
      !s.excerpt ||
      !s.coverUrl ||
      !s.coverAlt ||
      !s.seoTitle ||
      !s.seoDescription ||
      !s.categoryId
    )
      reject(
        422,
        "publish_incomplete",
        "Cần nội dung, tóm tắt, chuyên mục, ảnh bìa/alt và SEO trước xuất bản.",
      );
  }
  async function publish(c, a, actor, revisionId = a.current_revision_id) {
    const revision = (
      await c.query("SELECT snapshot FROM article_revisions WHERE id=$1", [
        revisionId,
      ])
    ).rows[0];
    ready(revision.snapshot);
    const existing = a.published_revision_id
      ? (
          await c.query("SELECT snapshot FROM article_revisions WHERE id=$1", [
            a.published_revision_id,
          ])
        ).rows[0]
      : null;
    const old = existing?.snapshot.slug,
      next = revision.snapshot.slug;
    if (old && old !== next) {
      await c.query("DELETE FROM seo_redirects WHERE old_path=$1", [
        "/tin-tuc/" + next,
      ]);
      await c.query("UPDATE seo_redirects SET new_path=$2 WHERE new_path=$1", [
        "/tin-tuc/" + old,
        "/tin-tuc/" + next,
      ]);
      await c.query(
        "INSERT INTO seo_redirects(old_path,new_path) VALUES($1,$2) ON CONFLICT(old_path) DO UPDATE SET new_path=excluded.new_path",
        ["/tin-tuc/" + old, "/tin-tuc/" + next],
      );
    }
    await c.query(
      "UPDATE articles SET status='published',published_revision_id=$2,published_at=COALESCE(published_at,now()),scheduled_at=NULL,updated_at=now(),version=version+1 WHERE id=$1",
      [a.id, revisionId],
    );
    await c.query(
      "INSERT INTO article_workflow_events(article_id,from_status,to_status,actor_id) VALUES($1,$2,'published',$3)",
      [a.id, a.status, actor],
    );
    await audit(c, actor, "cms.published", "article", a.id, {
      revision: revisionId,
    });
  }
  async function action(articleId, action, b, user) {
    const permissions = {
      submit: "content.write",
      approve: "content.approve",
      publish: "content.publish",
      archive: "content.publish",
      reject: "content.approve",
    };
    if (!permissions[action])
      reject(400, "invalid_transition", "Thao tác không hợp lệ.");
    permit(user, permissions[action]);
    return tx(pool, async (c) => {
      await c.query("SELECT id FROM articles WHERE id=$1 FOR UPDATE", [
        id(articleId),
      ]);
      const a = await get(articleId, user, c);
      version(a, b.version);
      const expected = {
        submit: "draft",
        approve: "in_review",
        publish: "approved",
      };
      if (
        !["archive", "reject"].includes(action) &&
        a.status !== expected[action]
      )
        reject(
          409,
          "invalid_transition",
          "Cần thực hiện đúng thứ tự nháp → duyệt → phê duyệt → xuất bản.",
        );
      if (action === "reject" && a.status !== "in_review")
        reject(409, "invalid_transition", "Chỉ trả lại bài đang chờ duyệt.");
      if (action === "publish") {
        ready(a.snapshot);
        if (b.scheduledAt) {
          const when = new Date(b.scheduledAt);
          if (
            !Number.isFinite(+when) ||
            +when <= Date.now() ||
            +when > Date.now() + 366 * 86400000
          )
            reject(
              400,
              "invalid_schedule",
              "Lịch xuất bản phải ở tương lai, tối đa một năm.",
            );
          await c.query(
            "INSERT INTO article_publish_jobs(article_id,revision_id,due_at) VALUES($1,$2,$3)",
            [a.id, a.current_revision_id, when],
          );
          await c.query(
            "UPDATE articles SET status='scheduled',scheduled_at=$2,version=version+1 WHERE id=$1",
            [a.id, when],
          );
          await c.query(
            "INSERT INTO article_workflow_events(article_id,from_status,to_status,actor_id) VALUES($1,$2,'scheduled',$3)",
            [a.id, a.status, user.id],
          );
          await audit(c, user.id, "cms.scheduled", "article", a.id, {
            dueAt: when.toISOString(),
            revision: a.current_revision_id,
          });
        } else await publish(c, a, user.id);
      } else {
        const status = {
          submit: "in_review",
          approve: "approved",
          archive: "archived",
          reject: "draft",
        }[action];
        await c.query(
          "UPDATE articles SET status=$2,version=version+1,updated_at=now() WHERE id=$1",
          [a.id, status],
        );
        await c.query(
          "INSERT INTO article_workflow_events(article_id,from_status,to_status,actor_id) VALUES($1,$2,$3,$4)",
          [a.id, a.status, status, user.id],
        );
        if (action === "archive")
          await c.query(
            "UPDATE article_publish_jobs SET state='cancelled' WHERE article_id=$1 AND state='pending'",
            [a.id],
          );
        await audit(c, user.id, "cms." + status, "article", a.id);
      }
      return get(a.id, user, c);
    });
  }
  async function restore(articleId, b, user) {
    permit(user, "content.write");
    await get(articleId, user);
    const revision = (
      await pool.query(
        "SELECT snapshot FROM article_revisions WHERE id=$1 AND article_id=$2",
        [id(b.revisionId), id(articleId)],
      )
    ).rows[0];
    if (!revision)
      reject(404, "not_found", "Không tìm thấy phiên bản thuộc bài viết.");
    return save(articleId, { ...revision.snapshot, version: b.version }, user);
  }
  async function runDue() {
    return tx(pool, async (c) => {
      // Article-first lock ordering matches edits and prevents scheduler/edit deadlocks.
      const due = (
        await c.query(
          "SELECT a.* FROM articles a WHERE a.status='scheduled' AND a.scheduled_at<=now() ORDER BY a.id FOR UPDATE SKIP LOCKED LIMIT 20",
        )
      ).rows;
      for (const a of due) {
        const job = (
          await c.query(
            "SELECT * FROM article_publish_jobs WHERE article_id=$1 AND state='pending' FOR UPDATE",
            [a.id],
          )
        ).rows[0];
        if (job) {
          await publish(c, a, null, job.revision_id);
          await c.query(
            "UPDATE article_publish_jobs SET state='done' WHERE id=$1",
            [job.id],
          );
        }
      }
      return due.length;
    });
  }
  async function publicList(q = {}) {
    const page = Math.max(1, Math.min(100000, Math.floor(Number(q.page) || 1))),
      search = text(q.q || "", "Tìm", 120);
    const rows = (
      await pool.query(
        publicSql +
          ` AND ($1='' OR r.snapshot->>'title' ILIKE '%'||$1||'%') AND ($2='' OR r.snapshot->>'categoryId'=$2) AND ($4::jsonb IS NULL OR r.snapshot->'tagIds' @> $4::jsonb) ORDER BY a.published_at DESC,a.id DESC LIMIT 12 OFFSET $3`,
        [
          search,
          q.category || "",
          (page - 1) * 12,
          q.tag ? JSON.stringify([id(q.tag)]) : null,
        ],
      )
    ).rows;
    return { items: rows.map(dto), page };
  }
  async function publicGet(path) {
    const row = (
      await pool.query(publicSql + " AND r.snapshot->>'slug'=$1", [path])
    ).rows[0];
    if (!row) reject(404, "not_found", "Không tìm thấy bài viết.");
    return dto(row);
  }
  async function taxonomy(kind) {
    return (
      await pool.query(
        `SELECT * FROM ${kind === "categories" ? "article_categories" : "article_tags"} ORDER BY id`,
      )
    ).rows;
  }
  async function saveTaxonomy(kind, b, user) {
    permit(user, "content.manage");
    return tx(pool, async (c) => {
      const table =
        kind === "categories" ? "article_categories" : "article_tags";
      const row = (
        await c.query(
          `INSERT INTO ${table}(name,slug) VALUES($1,$2) RETURNING *`,
          [text(b.name, "Tên", 150, 2), slug(b.slug)],
        )
      ).rows[0];
      await audit(c, user.id, "cms.taxonomy_created", table, row.id);
      return row;
    });
  }
  return {
    get,
    list,
    save,
    action,
    runDue,
    restore,
    publicList,
    publicGet,
    taxonomy,
    saveTaxonomy,
    revisions: async (articleId, user) => {
      await get(articleId, user);
      return (
        await pool.query(
          "SELECT id,version,snapshot,created_at FROM article_revisions WHERE article_id=$1 ORDER BY version DESC",
          [id(articleId)],
        )
      ).rows;
    },
  };
}
