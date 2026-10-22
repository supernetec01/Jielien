import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";

const PASSWORD_ROUNDS = 12;
const SESSION_DAYS = 7;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export class AuthError extends Error {
  constructor(status, error, message) {
    super(message);
    this.name = "AuthError";
    this.status = status;
    this.error = error;
    this.expose = true;
  }
}

function fail(status, code, message) {
  throw new AuthError(status, code, message);
}

function text(value, label, minimum, maximum) {
  if (typeof value !== "string") {
    fail(400, "validation_error", `${label} không hợp lệ.`);
  }
  const result = value.trim();
  if (
    result.length < minimum ||
    result.length > maximum ||
    /[\u0000-\u001f\u007f]/u.test(result)
  ) {
    fail(400, "validation_error", `${label} không hợp lệ.`);
  }
  return result;
}

function phone(value) {
  if (typeof value !== "string") {
    fail(400, "validation_error", "Số điện thoại không hợp lệ.");
  }
  const result = value
    .trim()
    .replace(/[ .()-]/g, "")
    .replace(/^\+84/, "0");
  if (!/^0[35789]\d{8}$/.test(result)) {
    fail(
      400,
      "validation_error",
      "Vui lòng nhập số điện thoại Việt Nam hợp lệ.",
    );
  }
  return result;
}

function email(value, required = false) {
  if (!required && (value == null || value === "")) return null;
  const result = text(value, "Email", 5, 200).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) {
    fail(400, "validation_error", "Email không hợp lệ.");
  }
  return result;
}

function password(value) {
  if (
    typeof value !== "string" ||
    [...value].length < 10 ||
    Buffer.byteLength(value, "utf8") > 72 ||
    value.includes("\0")
  ) {
    fail(
      400,
      "validation_error",
      "Mật khẩu cần ít nhất 10 ký tự và tối đa 72 byte UTF-8.",
    );
  }
  return value;
}

function positiveId(value, label = "Mã dữ liệu") {
  const result =
    typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (!Number.isSafeInteger(result) || result < 1) {
    fail(400, "validation_error", `${label} không hợp lệ.`);
  }
  return result;
}

function optionalCode(value, label) {
  if (value == null || value === "") return null;
  const result = text(value, label, 1, 20);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) {
    fail(400, "validation_error", `${label} không hợp lệ.`);
  }
  return result;
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function validToken(token) {
  return typeof token === "string" && TOKEN_PATTERN.test(token);
}

function normalizeDatabaseError(error) {
  if (error.code === "23505") {
    return new AuthError(
      409,
      "account_exists",
      "Email hoặc số điện thoại đã được sử dụng.",
    );
  }
  return error;
}

function addressDto(row) {
  return {
    id: Number(row.id),
    recipientName: row.recipient_name,
    phone: row.phone,
    provinceCode: row.province_code,
    wardCode: row.ward_code,
    province: row.province,
    district: row.district,
    addressDetail: row.address_detail,
    isDefault: row.is_default,
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : row.created_at,
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : row.updated_at,
  };
}

/**
 * PostgreSQL-backed identity service. HTTP cookies, CSRF enforcement, request
 * throttling and authorization checks belong to the HTTP adapter, not this file.
 */
export function createAuth(pool) {
  // A missing account still executes bcrypt comparison. This value is neither a
  // user password nor a usable account credential and is never persisted.
  let dummyHash;
  const getDummyHash = () => {
    dummyHash ??= bcrypt.hash(randomBytes(32).toString("hex"), PASSWORD_ROUNDS);
    return dummyHash;
  };

  async function transaction(work) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async function profile(queryable, userId) {
    const { rows } = await queryable.query(
      "SELECT id, full_name, phone, email, status FROM users WHERE id = $1",
      [userId],
    );
    const row = rows[0];
    if (!row || row.status !== "active") return null;
    const roles = await queryable.query(
      `SELECT DISTINCT r.name FROM roles r
       JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = $1 ORDER BY r.name`,
      [userId],
    );
    const permissions = await queryable.query(
      `SELECT DISTINCT p.code FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = $1 ORDER BY p.code`,
      [userId],
    );
    return {
      id: Number(row.id),
      fullName: row.full_name,
      phone: row.phone,
      email: row.email,
      roles: roles.rows.map((role) => role.name),
      permissions: permissions.rows.map((permission) => permission.code),
    };
  }

  async function session(queryable, userId) {
    const token = randomBytes(32).toString("base64url");
    const csrfToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await queryable.query(
      `INSERT INTO user_sessions(user_id, token_hash, csrf_token, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [userId, hashToken(token), csrfToken, expiresAt],
    );
    return {
      user: await profile(queryable, userId),
      token,
      csrfToken,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async function register(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail(400, "validation_error", "Thông tin đăng ký không hợp lệ.");
    }
    const fullName = text(body.fullName, "Họ tên", 2, 100);
    const normalizedPhone = phone(body.phone);
    const normalizedEmail = email(body.email);
    const passwordHash = await bcrypt.hash(
      password(body.password),
      PASSWORD_ROUNDS,
    );
    return transaction(async (client) => {
      const { rows } = await client.query(
        `INSERT INTO users(full_name, phone, email, password_hash, status)
         VALUES ($1, $2, $3, $4, 'active') RETURNING id`,
        [fullName, normalizedPhone, normalizedEmail, passwordHash],
      );
      const role = await client.query(
        `INSERT INTO user_roles(user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'customer' RETURNING role_id`,
        [rows[0].id],
      );
      if (!role.rowCount)
        throw new Error(
          "Required customer role is missing; run database migrations.",
        );
      // Role/permission fields from an untrusted request are intentionally not
      // consumed. Public registration can only obtain the customer role.
      return session(client, rows[0].id);
    });
  }

  async function login(body) {
    const invalid = () =>
      fail(401, "invalid_credentials", "Thông tin đăng nhập không chính xác.");
    let identifier = "";
    if (body && typeof body.identifier === "string")
      identifier = body.identifier.trim();
    if (
      identifier.length > 200 ||
      typeof body?.password !== "string" ||
      !body.password.length ||
      Buffer.byteLength(body.password, "utf8") > 72 ||
      body.password.includes("\0")
    )
      invalid();
    let normalizedPhone = null;
    if (!identifier.includes("@")) {
      try {
        normalizedPhone = phone(identifier);
      } catch {
        /* Generic login failure below. */
      }
    }
    const normalizedEmail = identifier.includes("@")
      ? identifier.toLowerCase()
      : null;
    const { rows } = await pool.query(
      `SELECT id, password_hash, status FROM users
       WHERE ($1::text IS NOT NULL AND phone = $1)
          OR ($2::text IS NOT NULL AND lower(email) = $2)
       LIMIT 1`,
      [normalizedPhone, normalizedEmail],
    );
    const account = rows[0];
    const matches = await bcrypt.compare(
      body.password,
      account?.password_hash || (await getDummyHash()),
    );
    if (!account || account.status !== "active" || !matches) invalid();
    return transaction(async (client) => {
      // Lock the user so a concurrent account deactivation cannot issue a new
      // valid session between the status check and session creation.
      const current = await client.query(
        "SELECT status FROM users WHERE id = $1 FOR UPDATE",
        [account.id],
      );
      if (current.rows[0]?.status !== "active") invalid();
      return session(client, account.id);
    });
  }

  async function authenticate(rawToken) {
    if (!validToken(rawToken)) return null;
    const { rows } = await pool.query(
      `SELECT s.id, s.user_id, s.csrf_token FROM user_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.revoked_at IS NULL
         AND s.expires_at > now() AND u.status = 'active'`,
      [hashToken(rawToken)],
    );
    const row = rows[0];
    if (!row) return null;
    const user = await profile(pool, row.user_id);
    if (!user) return null;
    return { user, csrfToken: row.csrf_token, sessionId: Number(row.id) };
  }

  async function logout(rawToken) {
    if (!validToken(rawToken)) return;
    await pool.query(
      `UPDATE user_sessions SET revoked_at = COALESCE(revoked_at, now())
       WHERE token_hash = $1`,
      [hashToken(rawToken)],
    );
  }

  async function getProfile(userId) {
    const user = await profile(pool, positiveId(userId, "Mã người dùng"));
    if (!user)
      fail(404, "user_not_found", "Không tìm thấy tài khoản đang hoạt động.");
    return user;
  }

  async function listAddresses(userId) {
    const { rows } = await pool.query(
      `SELECT * FROM user_addresses WHERE user_id = $1
       ORDER BY is_default DESC, id DESC`,
      [positiveId(userId, "Mã người dùng")],
    );
    return rows.map(addressDto);
  }

  async function saveAddress(userId, body) {
    const ownerId = positiveId(userId, "Mã người dùng");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      fail(400, "validation_error", "Thông tin địa chỉ không hợp lệ.");
    }
    const id = body.id == null ? null : positiveId(body.id, "Mã địa chỉ");
    const recipientName = text(body.recipientName, "Họ tên người nhận", 2, 100);
    const recipientPhone = phone(body.phone);
    const addressDetail = text(body.addressDetail, "Địa chỉ chi tiết", 5, 250);
    const provinceCode = optionalCode(body.provinceCode, "Mã tỉnh/thành phố");
    const wardCode = optionalCode(body.wardCode, "Mã phường/xã");
    const province =
      body.province == null || body.province === ""
        ? ""
        : text(body.province, "Tỉnh/thành phố", 2, 100);
    const district =
      body.district == null || body.district === ""
        ? ""
        : text(body.district, "Khu vực", 2, 100);
    if (body.isDefault != null && typeof body.isDefault !== "boolean") {
      fail(400, "validation_error", "Lựa chọn địa chỉ mặc định không hợp lệ.");
    }
    return transaction(async (client) => {
      const user = await client.query(
        "SELECT status FROM users WHERE id = $1 FOR UPDATE",
        [ownerId],
      );
      if (user.rows[0]?.status !== "active")
        fail(404, "user_not_found", "Không tìm thấy tài khoản đang hoạt động.");
      let existing;
      if (id) {
        const result = await client.query(
          "SELECT * FROM user_addresses WHERE id = $1 AND user_id = $2 FOR UPDATE",
          [id, ownerId],
        );
        existing = result.rows[0];
        if (!existing)
          fail(
            404,
            "address_not_found",
            "Không tìm thấy địa chỉ của tài khoản này.",
          );
      }
      const defaults = await client.query(
        "SELECT id FROM user_addresses WHERE user_id = $1 AND is_default = true LIMIT 1",
        [ownerId],
      );
      const isDefault =
        body.isDefault ?? existing?.is_default ?? !defaults.rowCount;
      if (isDefault) {
        await client.query(
          "UPDATE user_addresses SET is_default = false, updated_at = now() WHERE user_id = $1 AND is_default = true",
          [ownerId],
        );
      }
      const values = [
        ownerId,
        recipientName,
        recipientPhone,
        provinceCode,
        wardCode,
        province,
        district,
        addressDetail,
        isDefault,
      ];
      const result = id
        ? await client.query(
            `UPDATE user_addresses SET recipient_name = $2, phone = $3,
             province_code = $4, ward_code = $5, province = $6, district = $7,
             address_detail = $8, is_default = $9, updated_at = now()
           WHERE user_id = $1 AND id = $10 RETURNING *`,
            [...values, id],
          )
        : await client.query(
            `INSERT INTO user_addresses(user_id, recipient_name, phone,
             province_code, ward_code, province, district, address_detail, is_default)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            values,
          );
      return addressDto(result.rows[0]);
    });
  }

  async function ensureAdmin(options) {
    if (!options || typeof options !== "object") {
      fail(
        400,
        "validation_error",
        "Cần cấu hình quản trị được cung cấp rõ ràng.",
      );
    }
    const adminEmail = email(options.email, true);
    const adminPhone = phone(options.phone);
    const fullName = text(
      options.name || "Quản trị viên",
      "Tên quản trị",
      2,
      100,
    );
    const suppliedPassword = password(options.password);
    const passwordHash = await bcrypt.hash(suppliedPassword, PASSWORD_ROUNDS);
    return transaction(async (client) => {
      const found = await client.query(
        "SELECT id, password_hash, status FROM users WHERE lower(email) = $1 FOR UPDATE",
        [adminEmail],
      );
      if (found.rowCount) {
        const user = await profile(client, found.rows[0].id);
        if (!user?.roles.includes("admin")) {
          fail(
            409,
            "admin_bootstrap_conflict",
            "Tài khoản email này đã tồn tại; không tự động nâng quyền hoặc đổi mật khẩu.",
          );
        }
        if (
          !(await bcrypt.compare(suppliedPassword, found.rows[0].password_hash))
        ) {
          fail(
            401,
            "invalid_credentials",
            "Thông tin quản trị không chính xác.",
          );
        }
        return user;
      }
      const result = await client.query(
        `INSERT INTO users(full_name, phone, email, password_hash, status)
         VALUES ($1,$2,$3,$4,'active') RETURNING id`,
        [fullName, adminPhone, adminEmail, passwordHash],
      );
      const role = await client.query(
        `INSERT INTO user_roles(user_id, role_id)
         SELECT $1, id FROM roles WHERE name = 'admin' RETURNING role_id`,
        [result.rows[0].id],
      );
      if (!role.rowCount)
        throw new Error(
          "Required admin role is missing; run database migrations.",
        );
      return profile(client, result.rows[0].id);
    });
  }

  return {
    register,
    login,
    authenticate,
    logout,
    getProfile,
    listAddresses,
    saveAddress,
    ensureAdmin,
  };
}
