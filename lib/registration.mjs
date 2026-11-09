import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { AuthError } from "./auth.mjs";

export const registrationMessage =
  "Nếu yêu cầu hợp lệ, bạn sẽ nhận được mã xác minh qua số điện thoại đã nhập.";
const invalid = () =>
  new AuthError(
    400,
    "invalid_verification",
    "Mã xác minh không hợp lệ hoặc đã hết hạn.",
  );

// Provider bridge contract documented in docs/REGISTRATION.md. No dev bypass.
export function registrationDelivery(env = process.env) {
  if (
    !env.AUTH_VERIFICATION_WEBHOOK_URL &&
    !env.AUTH_VERIFICATION_WEBHOOK_TOKEN
  )
    return null;
  const url = new URL(env.AUTH_VERIFICATION_WEBHOOK_URL);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    !env.AUTH_VERIFICATION_WEBHOOK_TOKEN
  )
    throw Error(
      "Configure an HTTPS verification webhook and its bearer token.",
    );
  return async (payload) => {
    const r = await fetch(url, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(5000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.AUTH_VERIFICATION_WEBHOOK_TOKEN}`,
        "Idempotency-Key": payload.id,
      },
      body: JSON.stringify(payload),
    });
    // Never read or log a provider response containing phone, OTP or credentials.
    await r.body?.cancel();
    if (!r.ok) throw Error("Verification delivery failed");
  };
}

export async function createRegistration(
  pool,
  auth,
  { deliver = null, clock = Date.now, demo = false } = {},
) {
  await pool.query(
    "INSERT INTO auth_security_keys(name,secret) VALUES('registration',$1) ON CONFLICT DO NOTHING",
    [randomBytes(32).toString("hex")],
  );
  const secret = Buffer.from(
    (
      await pool.query(
        "SELECT secret FROM auth_security_keys WHERE name='registration'",
      )
    ).rows[0].secret,
    "hex",
  );
  const digest = (id, phone, code, purpose = "phone") =>
    createHmac("sha256", secret)
      .update("signup\0" + purpose + "\0" + id + "\0" + phone + "\0" + code)
      .digest("hex");
  const seal = (value) => {
    const iv = randomBytes(12),
      c = createCipheriv("aes-256-gcm", secret, iv);
    const data = Buffer.concat([
      c.update(JSON.stringify(value), "utf8"),
      c.final(),
    ]);
    return Buffer.concat([iv, c.getAuthTag(), data]).toString("base64");
  };
  const open = (value) => {
    const b = Buffer.from(value, "base64"),
      d = createDecipheriv("aes-256-gcm", secret, b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8"),
    );
  };
  async function transaction(work) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const v = await work(c);
      await c.query("COMMIT");
      return v;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  return {
    enabled: !!deliver || demo,
    async begin(body) {
      if (!deliver && !demo)
        throw new AuthError(
          503,
          "verification_unavailable",
          "Đăng ký đang tạm ngừng vì dịch vụ xác minh chưa sẵn sàng. Vui lòng thử lại sau.",
        );
      const prepared = await auth.prepareRegistration(body);
      const now = clock(),
        id = randomBytes(32).toString("base64url"),
        code = String(randomInt(1_000_000)).padStart(6, "0"),
        expiresAt = now + 5 * 60_000;
      let emailCode = null;
      if (prepared.email) {
        do {
          emailCode = String(randomInt(1_000_000)).padStart(6, "0");
        } while (emailCode === code);
      }
      await transaction(async (c) => {
        const recipients = [
          ["phone", prepared.phone],
          ...(prepared.email ? [["email", prepared.email]] : []),
        ].sort((a, b) => (a[0] + a[1]).localeCompare(b[0] + b[1]));
        for (const [kind, value] of recipients)
          await c.query(
            "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
            ["registration:" + kind + ":" + value],
          );
        for (const [kind, value] of recipients) {
          const recent = (
            await c.query(
              `SELECT count(*) AS count,max(created_at) AS latest FROM registration_challenges WHERE ${kind}=$1 AND created_at>$2`,
              [value, now - 15 * 60_000],
            )
          ).rows[0];
          if (
            recent.count >= 5 ||
            (recent.latest !== null && recent.latest > now - 60_000)
          ) {
            throw Object.assign(
              new AuthError(
                429,
                "rate_limited",
                "Vui lòng chờ trước khi yêu cầu mã mới.",
              ),
              { retryAfter: recent.count >= 5 ? 900 : 60 },
            );
          }
        }
        await c.query(
          "UPDATE registration_challenges SET consumed_at=$2 WHERE phone=$1 AND consumed_at IS NULL",
          [prepared.phone, now],
        );
        await c.query(
          `INSERT INTO registration_challenges(id,full_name,phone,email,password_hash,code_hash,email_code_hash,created_at,expires_at,is_demo)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            id,
            prepared.fullName,
            prepared.phone,
            prepared.email,
            prepared.passwordHash,
            digest(id, prepared.phone, code),
            prepared.email
              ? digest(id, prepared.email, emailCode, "email")
              : null,
            now,
            expiresAt,
            demo,
          ],
        );
        if(!demo)await c.query(
          "INSERT INTO registration_outbox(challenge_id,payload,next_attempt) VALUES($1,$2,$3)",
          [
            id,
            seal({
              id,
              phone: prepared.phone,
              code,
              email: prepared.email,
              emailCode,
              purpose: "signup",
              expiresAt,
            }),
            now,
          ],
        );
      });
      return {
        message: demo ? 'Chế độ demo localhost: dùng mã thử nghiệm bên dưới; không gửi SMS/email thật.' : registrationMessage,
        challengeId: id,
        expiresIn: 300,
        resendAfter: 60,
        emailVerificationRequired: !!prepared.email,
        ...(demo ? {demoCodes:{code,emailCode}} : {}),
      };
    },
    async verify(body) {
      if (
        typeof body?.challengeId !== "string" ||
        !/^[A-Za-z0-9_-]{43}$/.test(body.challengeId) ||
        typeof body.code !== "string" ||
        !/^\d{6}$/.test(body.code)
      )
        throw invalid();
      const result = await transaction(async (c) => {
        const r = (
          await c.query(
            "SELECT * FROM registration_challenges WHERE id=$1 FOR UPDATE",
            [body.challengeId],
          )
        ).rows[0];
        const now = clock();
        if (
          !r || r.is_demo !== demo ||
          r.consumed_at !== null ||
          r.expires_at <= now ||
          r.attempts >= 5
        )
          return null;
        await c.query(
          "UPDATE registration_challenges SET attempts=attempts+1 WHERE id=$1",
          [r.id],
        );
        if (
          !timingSafeEqual(
            Buffer.from(r.code_hash, "hex"),
            Buffer.from(digest(r.id, r.phone, body.code), "hex"),
          )
        )
          return null;
        if (
          r.email &&
          (typeof body.emailCode !== "string" ||
            !/^\d{6}$/.test(body.emailCode) ||
            !timingSafeEqual(
              Buffer.from(r.email_code_hash, "hex"),
              Buffer.from(
                digest(r.id, r.email, body.emailCode, "email"),
                "hex",
              ),
            ))
        )
          return null;
        await c.query(
          "UPDATE registration_challenges SET consumed_at=$2 WHERE id=$1",
          [r.id, now],
        );
        // A duplicate signup cannot replace credentials or link an existing user.
        return auth.completeRegistration(c, {
          fullName: r.full_name,
          phone: r.phone,
          email: r.email,
          passwordHash: r.password_hash,
        }, {demo});
      });
      if (!result) throw invalid();
      return result;
    },
    async flush() {
      // Drop expired PII/password hashes/outbox, retaining only the last day.
      const now = clock();
      await pool.query(
        "DELETE FROM registration_challenges WHERE expires_at<$1",
        [now - 24 * 60 * 60_000],
      );
      if (!deliver) return;
      for (let i = 0; i < 5; i++) {
        const row = await transaction(async (c) => {
          const r = (
            await c.query(
              `SELECT o.*,r.expires_at,r.consumed_at FROM registration_outbox o
            JOIN registration_challenges r ON r.id=o.challenge_id
            WHERE (o.state='pending' AND o.next_attempt<=$1) OR (o.state='sending' AND o.lease_until<=$1)
            ORDER BY o.next_attempt FOR UPDATE OF o SKIP LOCKED LIMIT 1`,
              [clock()],
            )
          ).rows[0];
          if (!r) return null;
          if (
            r.expires_at <= clock() ||
            r.consumed_at !== null ||
            r.attempts >= 5
          ) {
            await c.query(
              "UPDATE registration_outbox SET state='dead',payload='' WHERE challenge_id=$1",
              [r.challenge_id],
            );
            return { skip: true };
          }
          await c.query(
            "UPDATE registration_outbox SET state='sending',attempts=attempts+1,lease_until=$2 WHERE challenge_id=$1",
            [r.challenge_id, clock() + 30_000],
          );
          return r;
        });
        if (!row) break;
        if (row.skip) continue;
        try {
          await deliver(open(row.payload));
          await pool.query(
            "UPDATE registration_outbox SET state='sent',payload='',lease_until=NULL WHERE challenge_id=$1 AND state='sending' AND attempts=$2",
            [row.challenge_id, row.attempts + 1],
          );
        } catch {
          await pool.query(
            "UPDATE registration_outbox SET state='pending',next_attempt=$2,lease_until=NULL WHERE challenge_id=$1 AND state='sending' AND attempts=$3",
            [
              row.challenge_id,
              clock() + Math.min(60_000, 1000 * 2 ** row.attempts),
              row.attempts + 1,
            ],
          );
        }
      }
    },
  };
}
