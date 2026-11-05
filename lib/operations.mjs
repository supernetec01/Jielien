import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { csvEncode } from "./csv.mjs";
import {
  tx,
  text,
  id,
  integer,
  version,
  reject,
  audit,
} from "./commerce-common.mjs";
export const safePath = (value) => {
  const path = text(value, "Đường dẫn", 200, 1);
  if (!/^\/(?:san-pham|danh-muc|tin-tuc)(?:\/[a-z0-9-]+)?$/.test(path))
    reject(
      400,
      "invalid_path",
      "Chỉ dùng đường dẫn catalog hoặc tin tức nội bộ.",
    );
  return path;
};
export function createOperations(pool) {
  const allowed = new Set([
    "companyName",
    "contactPhone",
    "contactEmail",
    "address",
    "footerText",
  ]);
  async function settings() {
    return (
      await pool.query(
        "SELECT key,value_json,version FROM site_settings ORDER BY key",
      )
    ).rows;
  }
  async function saveSetting(b, user) {
    if (!allowed.has(b.key))
      reject(
        400,
        "invalid_setting",
        "Cấu hình không được phép; không lưu secret tại đây.",
      );
    const value = text(b.value, "Giá trị", 500);
    return tx(pool, async (c) => {
      await c.query("SELECT pg_advisory_xact_lock(836412)");
      const old = (
        await c.query("SELECT * FROM site_settings WHERE key=$1 FOR UPDATE", [
          b.key,
        ])
      ).rows[0];
      if (old) version(old, b.version);
      const row = (
        await c.query(
          "INSERT INTO site_settings(key,value_json,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=site_settings.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING key,value_json,version",
          [b.key, JSON.stringify(value), user.id],
        )
      ).rows[0];
      await audit(c, user.id, "settings.saved", "setting", b.key);
      return row;
    });
  }
  async function reports(q) {
    const from = q.from
        ? new Date(q.from)
        : new Date(Date.now() - 30 * 86400000),
      to = q.to ? new Date(q.to) : new Date();
    if (
      !Number.isFinite(+from) ||
      !Number.isFinite(+to) ||
      to <= from ||
      to - from > 366 * 86400000
    )
      reject(400, "invalid_range", "Khoảng ngày phải hợp lệ, tối đa 366 ngày.");
    const r = (
      await pool.query(
        `SELECT count(*) AS orders,COALESCE(sum(grand_total) FILTER(WHERE status<>'cancelled'),0) AS gmv FROM orders WHERE created_at >= $1 AND created_at < $2`,
        [from, to],
      )
    ).rows[0];
    const paid = (
      await pool.query(
        "SELECT COALESCE(sum(amount),0) AS collected FROM payments WHERE status='paid' AND COALESCE(paid_at,created_at)>=$1 AND COALESCE(paid_at,created_at)<$2",
        [from, to],
      )
    ).rows[0];
    return {
      ...r,
      ...paid,
      from,
      to,
      definitions: {
        gmv: "Tổng tiền đơn không hủy, theo ngày tạo đơn",
        collected:
          "Tổng payments paid theo paid_at (dữ liệu cũ thiếu paid_at dùng created_at); chưa trừ hoàn tiền thủ công",
      },
    };
  }
  async function publicCoupons() {
    return (
      await pool.query(
        "SELECT c.code,p.discount_type,p.discount_value,p.minimum_order,p.maximum_discount FROM coupons c JOIN promotions p ON p.id=c.promotion_id WHERE c.status='active' AND p.status='active' AND (c.expires_at IS NULL OR c.expires_at>now()) AND (p.start_at IS NULL OR p.start_at<=now()) AND (p.end_at IS NULL OR p.end_at>now()) AND (c.usage_limit IS NULL OR c.used_count<c.usage_limit) ORDER BY p.priority DESC,c.id LIMIT 10",
      )
    ).rows;
  }
  async function coupons() {
    return (
      await pool.query(
        "SELECT c.id,c.code,c.usage_limit,c.used_count,c.status,p.name,p.discount_type,p.discount_value,p.minimum_order,p.maximum_discount,p.start_at,p.end_at FROM coupons c JOIN promotions p ON p.id=c.promotion_id ORDER BY c.id DESC LIMIT 100",
      )
    ).rows;
  }
  async function saveCoupon(target, b, user) {
    return tx(pool, async (c) => {
      const code = text(b.code, "Mã", 40, 2).toUpperCase();
      if (!/^[A-Z0-9_-]+$/.test(code))
        reject(400, "validation_error", "Mã không hợp lệ.");
      if (
        !["fixed", "percentage", "shipping"].includes(b.discountType) ||
        !["active", "inactive"].includes(b.status)
      )
        reject(400, "validation_error", "Loại giảm/trạng thái không hợp lệ.");
      const value = integer(
          b.discountValue,
          0,
          b.discountType === "percentage" ? 100 : 9007199254740991,
        ),
        min = integer(b.minimumOrder),
        limit =
          b.usageLimit == null ? null : integer(b.usageLimit, 1, 10000000);
      let old;
      if (target) {
        old = (
          await c.query("SELECT * FROM coupons WHERE id=$1 FOR UPDATE", [
            id(target),
          ])
        ).rows[0];
        if (!old) reject(404, "not_found", "Không tìm thấy mã.");
        if (limit !== null && limit < old.used_count)
          reject(409, "usage_limit", "Giới hạn không nhỏ hơn số lượt đã dùng.");
      }
      const dates = [
        b.startAt ? new Date(b.startAt) : null,
        b.endAt ? new Date(b.endAt) : null,
      ];
      if (
        dates.some((d) => d && !Number.isFinite(+d)) ||
        (dates[0] && dates[1] && dates[0] >= dates[1])
      )
        reject(400, "validation_error", "Thời gian không hợp lệ.");
      const vals = [
        text(b.name || code, "Tên", 200, 2),
        b.discountType,
        value,
        min,
        b.maximumDiscount == null ? null : integer(b.maximumDiscount),
        ...dates,
        b.status,
      ];
      let promotion;
      if (old) {
        await c.query(
          "UPDATE promotions SET name=$1,discount_type=$2,discount_value=$3,minimum_order=$4,maximum_discount=$5,start_at=$6,end_at=$7,status=$8 WHERE id=$9",
          [...vals, old.promotion_id],
        );
        promotion = old.promotion_id;
        await c.query(
          "UPDATE coupons SET code=$2,usage_limit=$3,status=$4 WHERE id=$1",
          [old.id, code, limit, b.status],
        );
      } else {
        promotion = (
          await c.query(
            "INSERT INTO promotions(name,discount_type,discount_value,minimum_order,maximum_discount,start_at,end_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
            vals,
          )
        ).rows[0].id;
        old = (
          await c.query(
            "INSERT INTO coupons(code,promotion_id,usage_limit,status) VALUES($1,$2,$3,$4) RETURNING id",
            [code, promotion, limit, b.status],
          )
        ).rows[0];
      }
      await audit(c, user.id, "promotion.saved", "coupon", old.id);
      return { id: old.id };
    });
  }
  async function banners(publicOnly = false) {
    return (
      await pool.query(
        `SELECT b.*, '/media/'||m.storage_key AS url,m.alt_text FROM page_banners b JOIN media_assets m ON m.id=b.asset_id ${publicOnly ? "WHERE b.status='published' AND (b.starts_at IS NULL OR b.starts_at<=now()) AND (b.ends_at IS NULL OR b.ends_at>now())" : ""} ORDER BY b.id DESC LIMIT 30`,
      )
    ).rows;
  }
  async function saveBanner(target, b, user) {
    return tx(pool, async (c) => {
      if (!["draft", "published", "archived"].includes(b.status))
        reject(400, "validation_error", "Trạng thái không hợp lệ.");
      const dates = [
        b.startsAt ? new Date(b.startsAt) : null,
        b.endsAt ? new Date(b.endsAt) : null,
      ];
      if (
        dates.some((d) => d && !Number.isFinite(+d)) ||
        (dates[0] && dates[1] && dates[0] >= dates[1])
      )
        reject(400, "validation_error", "Thời gian không hợp lệ.");
      const vals = [
        text(b.title, "Tiêu đề", 150, 2),
        id(b.assetId),
        safePath(b.targetPath),
        b.status,
        ...dates,
      ];
      let row;
      if (target) {
        const old = (
          await c.query("SELECT * FROM page_banners WHERE id=$1 FOR UPDATE", [
            id(target),
          ])
        ).rows[0];
        version(old, b.version);
        row = (
          await c.query(
            "UPDATE page_banners SET title=$1,asset_id=$2,target_path=$3,status=$4,starts_at=$5,ends_at=$6,version=version+1 WHERE id=$7 RETURNING *",
            [...vals, id(target)],
          )
        ).rows[0];
      } else
        row = (
          await c.query(
            "INSERT INTO page_banners(title,asset_id,target_path,status,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
            vals,
          )
        ).rows[0];
      await audit(c, user.id, "banner.saved", "banner", row.id);
      return row;
    });
  }
  async function redirects() {
    return (
      await pool.query(
        "SELECT old_path,new_path,created_at FROM seo_redirects ORDER BY created_at DESC LIMIT 200",
      )
    ).rows;
  }
  async function saveRedirect(b, user) {
    return tx(pool, async (c) => {
      const oldPath = safePath(b.oldPath);
      let newPath = safePath(b.newPath);
      if (oldPath === newPath)
        reject(400, "redirect_loop", "URL nguồn và đích phải khác nhau.");
      await c.query("LOCK TABLE seo_redirects IN SHARE ROW EXCLUSIVE MODE");
      const seen = new Set([oldPath]);
      for (let hops = 0; hops < 10; hops++) {
        if (seen.has(newPath))
          reject(400, "redirect_loop", "Chuyển hướng tạo vòng lặp.");
        seen.add(newPath);
        const next = (
          await c.query(
            "SELECT new_path FROM seo_redirects WHERE old_path=$1",
            [newPath],
          )
        ).rows[0];
        if (!next) break;
        newPath = next.new_path;
      }
      const existing = (
        await c.query("SELECT 1 FROM seo_redirects WHERE old_path=$1", [
          newPath,
        ])
      ).rowCount;
      if (existing)
        reject(400, "redirect_chain", "Chuỗi chuyển hướng quá dài.");
      const isActive = async (path) => {
        if (["/san-pham", "/tin-tuc"].includes(path)) return true;
        if (path.startsWith("/san-pham/"))
          return !!(
            await c.query(
              "SELECT 1 FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.slug=$1 AND v.status='active' AND p.status='active'",
              [path.slice(10)],
            )
          ).rowCount;
        if (path.startsWith("/danh-muc/"))
          return !!(
            await c.query(
              "SELECT 1 FROM categories WHERE slug=$1 AND status='active'",
              [path.slice(10)],
            )
          ).rowCount;
        if (path.startsWith("/tin-tuc/"))
          return !!(
            await c.query(
              "SELECT 1 FROM articles a JOIN article_revisions r ON r.id=a.published_revision_id WHERE r.snapshot->>'slug'=$1 AND a.status<>'archived' AND a.published_at<=now()",
              [path.slice(9)],
            )
          ).rowCount;
        return false;
      };
      if (await isActive(oldPath))
        reject(
          409,
          "active_source",
          "Không chuyển hướng đè URL đang hoạt động. Đổi slug qua editor trước.",
        );
      if (!(await isActive(newPath)))
        reject(
          400,
          "invalid_target",
          "Đích phải là trang công khai đang hoạt động.",
        );
      await c.query("UPDATE seo_redirects SET new_path=$2 WHERE new_path=$1", [
        oldPath,
        newPath,
      ]);
      await c.query(
        "INSERT INTO seo_redirects(old_path,new_path) VALUES($1,$2) ON CONFLICT(old_path) DO UPDATE SET new_path=excluded.new_path",
        [oldPath, newPath],
      );
      await audit(c, user.id, "seo.redirect_saved", "redirect", oldPath, {
        newPath,
      });
      return { oldPath, newPath };
    });
  }
  async function auditList(q = {}) {
    const action = text(q.action || "", "Thao tác", 100),
      actor = q.actorId ? id(q.actorId) : null;
    return (
      await pool.query(
        "SELECT id,actor_id,action,entity_type,entity_id,created_at FROM audit_logs WHERE ($1='' OR action=$1) AND ($2::bigint IS NULL OR actor_id=$2) ORDER BY id DESC LIMIT 500",
        [action, actor],
      )
    ).rows;
  }
  async function auditCsv(q) {
    const rows = await auditList(q);
    return csvEncode([
      ["id", "actor_id", "action", "entity_type", "entity_id", "created_at"],
      ...rows.map((r) => [
        r.id,
        r.actor_id,
        r.action,
        r.entity_type,
        r.entity_id,
        r.created_at.toISOString(),
      ]),
    ]);
  }
  async function reportCsv(q) {
    const r = await reports(q);
    return csvEncode([
      ["from_utc", "to_utc", "orders", "gmv_vnd", "collected_vnd"],
      [r.from.toISOString(), r.to.toISOString(), r.orders, r.gmv, r.collected],
    ]);
  }
  async function status() {
    await pool.query("SELECT 1");
    let backup = null;
    try {
      const d = JSON.parse(
        await readFile(resolve("data/backups/latest.json"), "utf8"),
      );
      if (Number.isFinite(+new Date(d.createdAt)))
        backup = {
          lastRecordedAt: d.createdAt,
          ageHours: Math.max(0, (Date.now() - new Date(d.createdAt)) / 3600000),
          databaseBytes: d.databaseBytes,
          mediaFiles: d.mediaFiles,
        };
    } catch (e) {
      if (e.code !== "ENOENT" && e.name !== "SyntaxError") throw e;
    }
    const jobs = (
      await pool.query(
        "SELECT state,count(*) AS count FROM article_publish_jobs GROUP BY state",
      )
    ).rows;
    return {
      database: "ok",
      backup,
      jobs,
      backupNote:
        "Chỉ ghi nhận tạo snapshot; không chứng minh đã kiểm tra restore.",
    };
  }
  return {
    redirects,
    saveRedirect,
    auditList,
    auditCsv,
    reportCsv,
    status,
    settings,
    saveSetting,
    reports,
    coupons,
    publicCoupons,
    saveCoupon,
    banners,
    saveBanner,
  };
}
