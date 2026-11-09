import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "node:crypto";
import { AuthError } from "./auth.mjs";
const hash = (v) => createHash("sha256").update(v).digest("hex");
export const recoveryMessage =
  "Nếu tài khoản khách hàng phù hợp có email, hướng dẫn đặt lại mật khẩu sẽ được gửi tới email đã lưu. Nếu chỉ có số điện thoại hoặc không nhận được email, vui lòng liên hệ cửa hàng để được xác minh và hỗ trợ.";
const invalid = () =>
  new AuthError(
    400,
    "invalid_reset",
    "Liên kết không hợp lệ, đã sử dụng hoặc hết hạn. Vui lòng yêu cầu liên kết mới.",
  );
export function recoveryDelivery(env = process.env) {
  if (!env.RESEND_API_KEY && !env.PASSWORD_RESET_FROM_EMAIL) return null;
  if (
    !env.RESEND_API_KEY ||
    !env.PASSWORD_RESET_FROM_EMAIL ||
    /[\r\n]/.test(env.PASSWORD_RESET_FROM_EMAIL)
  )
    throw Error("Configure RESEND_API_KEY and PASSWORD_RESET_FROM_EMAIL.");
  const u = new URL(env.PUBLIC_BASE_URL);
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    u.pathname !== "/" ||
    u.search ||
    u.hash
  )
    throw Error("Password recovery requires a trusted HTTPS PUBLIC_BASE_URL.");
  return {
    origin: u.origin,
    send: async (message) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          "Idempotency-Key": message.id,
        },
        body: JSON.stringify({
          from: env.PASSWORD_RESET_FROM_EMAIL,
          to: [message.to],
          subject: "Đặt lại mật khẩu Jielien",
          text: `Bạn đã yêu cầu đặt lại mật khẩu tài khoản Jielien. Mở liên kết sau trong 30 phút:\n${message.url}\nNếu không yêu cầu, bạn có thể bỏ qua email này.`,
        }),
      });
      await r.body?.cancel();
      if (!r.ok) throw Error("Recovery email delivery failed");
    },
  };
}

export async function createPasswordRecovery(
  pool,
  auth,
  { delivery = null, clock = Date.now } = {},
) {
  await pool.query(
    "INSERT INTO auth_security_keys(name,secret) VALUES('customer-recovery',$1) ON CONFLICT DO NOTHING",
    [randomBytes(32).toString("hex")],
  );
  const secret = Buffer.from(
    (
      await pool.query(
        "SELECT secret FROM auth_security_keys WHERE name='customer-recovery'",
      )
    ).rows[0].secret,
    "hex",
  );
  const encrypt = (v) => {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", secret, iv),
      data = Buffer.concat([c.update(JSON.stringify(v), "utf8"), c.final()]);
    return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
  };
  const decrypt = (v) => {
    const b = Buffer.from(v, "base64"),
      d = createDecipheriv("aes-256-gcm", secret, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"),
    );
  };
  async function tx(work) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("LOCK TABLE user_roles IN SHARE MODE");
      const result = await work(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async function customer(c, id) {
    return (
      await c.query(
        `SELECT u.id,u.email,u.password_hash,u.status,u.is_demo FROM users u WHERE u.id=$1 AND EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name='customer') AND NOT EXISTS(SELECT 1 FROM user_roles ur JOIN roles r ON r.id=ur.role_id WHERE ur.user_id=u.id AND r.name<>'customer') FOR UPDATE OF u`,
        [id],
      )
    ).rows[0];
  }
  async function issue(c, user, source) {
    const token = randomBytes(32).toString("base64url"),
      now = clock(),
      expiresAt = now + 30 * 60_000;
    await c.query(
      "UPDATE customer_password_resets SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL",
      [user.id, now],
    );
    await c.query(
      "UPDATE customer_recovery_outbox SET state='dead',payload='' WHERE user_id=$1 AND state='pending'",
      [user.id],
    );
    await c.query(
      "INSERT INTO customer_password_resets(token_hash,user_id,email_snapshot,password_fingerprint,source,created_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        hash(token),
        user.id,
        user.email,
        hash(user.password_hash),
        source,
        now,
        expiresAt,
      ],
    );
    return { path: "/tai-khoan?mode=reset#token=" + token, expiresAt };
  }
  return {
    async forgot(body) {
      const value =
        typeof body?.identifier === "string"
          ? body.identifier.trim().toLowerCase()
          : "";
      if (!value || value.length > 200)
        throw new AuthError(
          400,
          "validation_error",
          "Vui lòng nhập số điện thoại hoặc email hợp lệ.",
        );
      const phone = value.replace(/[ .()-]/g, "").replace(/^\+84/, "0");
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) &&
        !/^0[35789]\d{8}$/.test(phone)
      )
        throw new AuthError(
          400,
          "validation_error",
          "Vui lòng nhập số điện thoại hoặc email hợp lệ.",
        );
      if (delivery) {
        const candidate = (
          await pool.query(
            "SELECT id FROM users WHERE lower(email)=$1 OR phone=$2 LIMIT 1",
            [value, phone],
          )
        ).rows[0];
        if (candidate)
          await tx(async (c) => {
            const user = await customer(c, candidate.id);
            if (
              !user ||
              user.status !== "active" ||
              user.is_demo ||
              !user.email
            )
              return;
            const recent = (
              await c.query(
                "SELECT count(*) AS n,max(created_at) AS latest FROM customer_password_resets WHERE user_id=$1 AND created_at>$2",
                [user.id, clock() - 3600_000],
              )
            ).rows[0];
            if (
              recent.n >= 5 ||
              (recent.latest !== null && recent.latest > clock() - 60_000)
            )
              return;
            const link = await issue(c, user, "email"),
              id = randomBytes(16).toString("hex");
            await c.query(
              "INSERT INTO customer_recovery_outbox(id,user_id,payload,expires_at,next_attempt) VALUES($1,$2,$3,$4,$5)",
              [
                id,
                user.id,
                encrypt({
                  id,
                  to: user.email,
                  url: delivery.origin + link.path,
                }),
                link.expiresAt,
                clock(),
              ],
            );
          });
      }
      return { message: recoveryMessage };
    },
    async support(actorId, targetId, body) {
      if (!Number.isSafeInteger(targetId) || targetId < 1)
        throw new AuthError(
          400,
          "validation_error",
          "Mã khách hàng không hợp lệ.",
        );
      if (body?.ownershipConfirmed !== true)
        throw new AuthError(
          400,
          "confirmation_required",
          "Cần xác minh người sở hữu tài khoản trước khi hỗ trợ.",
        );
      return tx(async (c) => {
        await auth.verifySupportActor(actorId, body.currentPassword, c);
        const user = await customer(c, targetId);
        if (!user || user.status !== "active")
          throw new AuthError(
            404,
            "customer_not_found",
            "Không tìm thấy khách hàng đang hoạt động.",
          );
        const link = await issue(c, user, "support");
        await c.query(
          "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES($1,'customer.recovery_issued','user',$2,'{}')",
          [actorId, String(targetId)],
        );
        return link;
      });
    },
    async reset(body) {
      if (
        typeof body?.token !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.token)
      )
        throw invalid();
      const tokenHash = hash(body.token),
        found = (
          await pool.query(
            "SELECT user_id,expires_at,used_at FROM customer_password_resets WHERE token_hash=$1",
            [tokenHash],
          )
        ).rows[0];
      if (!found || found.used_at !== null || found.expires_at <= clock())
        throw invalid();
      const passwordHash = await auth.prepareResetPassword(body.newPassword);
      const ok = await tx(async (c) => {
        const user = await customer(c, found.user_id);
        const token = (
          await c.query(
            "SELECT * FROM customer_password_resets WHERE token_hash=$1 FOR UPDATE",
            [tokenHash],
          )
        ).rows[0];
        if (
          !user ||
          user.status !== "active" ||
          !token ||
          token.used_at !== null ||
          token.expires_at <= clock() ||
          token.password_fingerprint !== hash(user.password_hash) ||
          (token.source === "email" &&
            (user.is_demo || token.email_snapshot !== user.email))
        )
          return false;
        await c.query(
          "UPDATE users SET password_hash=$2,is_demo=CASE WHEN $3 THEN false ELSE is_demo END,updated_at=now() WHERE id=$1",
          [user.id, passwordHash, token.source === "support"],
        );
        await c.query(
          "UPDATE customer_password_resets SET used_at=$2 WHERE user_id=$1 AND used_at IS NULL",
          [user.id, clock()],
        );
        await c.query(
          "UPDATE user_sessions SET revoked_at=COALESCE(revoked_at,now()) WHERE user_id=$1",
          [user.id],
        );
        await c.query(
          "INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,metadata) VALUES($1,'account.password_reset','user',$2,$3)",
          [user.id, String(user.id), JSON.stringify({ source: token.source })],
        );
        return true;
      });
      if (!ok) throw invalid();
    },
    async flush() {
      const now = clock();
      await pool.query(
        "DELETE FROM customer_password_resets WHERE expires_at<$1",
        [now - 24 * 3600_000],
      );
      await pool.query(
        "DELETE FROM customer_recovery_outbox WHERE expires_at<$1",
        [now - 24 * 3600_000],
      );
      if (!delivery) return;
      for (let i = 0; i < 5; i++) {
        const job = await tx(async (c) => {
          const r = (
            await c.query(
              "SELECT * FROM customer_recovery_outbox WHERE (state='pending' AND next_attempt<=$1) OR (state='sending' AND lease_until<=$1) ORDER BY next_attempt FOR UPDATE SKIP LOCKED LIMIT 1",
              [clock()],
            )
          ).rows[0];
          if (!r) return null;
          if (r.expires_at <= clock() || r.attempts >= 5) {
            await c.query(
              "UPDATE customer_recovery_outbox SET state='dead',payload='' WHERE id=$1",
              [r.id],
            );
            return { skip: true };
          }
          await c.query(
            "UPDATE customer_recovery_outbox SET state='sending',attempts=attempts+1,lease_until=$2 WHERE id=$1",
            [r.id, clock() + 30_000],
          );
          return r;
        });
        if (!job) break;
        if (job.skip) continue;
        try {
          await delivery.send(decrypt(job.payload));
          await pool.query(
            "UPDATE customer_recovery_outbox SET state='sent',payload='',lease_until=NULL WHERE id=$1 AND attempts=$2",
            [job.id, job.attempts + 1],
          );
        } catch {
          await pool.query(
            "UPDATE customer_recovery_outbox SET state='pending',next_attempt=$2,lease_until=NULL WHERE id=$1 AND attempts=$3",
            [
              job.id,
              clock() + Math.min(60_000, 1000 * 2 ** job.attempts),
              job.attempts + 1,
            ],
          );
        }
      }
    },
  };
}
