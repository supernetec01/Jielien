import { normalizeBankConfig } from "./vietqr.mjs";
import { audit, reject, text, tx, version } from "./commerce-common.mjs";

const key = "bank_transfer_receiving";
const fields = ["bankBin", "bankName", "accountNumber", "accountName"];
export function createBankSettings(pool, { fallback } = {}) {
  const initial = fallback ?? {
    bankBin: process.env.BANK_BIN || "",
    bankName: process.env.BANK_NAME || "",
    accountNumber: process.env.BANK_ACCOUNT_NUMBER || "",
    accountName: process.env.BANK_ACCOUNT_NAME || "",
  };
  const defaults = {
    ...Object.fromEntries(fields.map(field => [field, typeof initial[field] === "string" ? initial[field].trim() : ""])),
    enabled: normalizeBankConfig(initial).enabled,
  };
  async function get(client = pool, lock = false) {
    const row = (await client.query(
      "SELECT value_json,version FROM site_settings WHERE key=$1" + (lock ? " FOR SHARE" : ""), [key],
    )).rows[0];
    const settings = row ? row.value_json : defaults;
    return { settings, version: row?.version ?? 0, saved: !!row, available: normalizeBankConfig(settings).enabled };
  }
  async function effective(client = pool, lock = false) {
    return normalizeBankConfig((await get(client, lock)).settings);
  }
  async function save(body, user) {
    if (Object.keys(body).some(field => ![...fields, "enabled", "version"].includes(field)) || typeof body.enabled !== "boolean")
      reject(400, "validation_error", "Chỉ nhập thông tin tài khoản nhận tiền và trạng thái bật/tắt.");
    const settings = { enabled: body.enabled };
    for (const field of fields) settings[field] = text(body[field], "Thông tin ngân hàng", field === "accountNumber" ? 30 : 100);
    if (settings.bankBin && !/^\d{6}$/.test(settings.bankBin))
      reject(400, "validation_error", "Mã ngân hàng VietQR cần đúng 6 chữ số. Nếu chưa có, để trống và tắt chuyển khoản.");
    if (settings.accountNumber && !/^\d{6,30}$/.test(settings.accountNumber))
      reject(400, "validation_error", "Số tài khoản cần từ 6 đến 30 chữ số.");
    if (settings.enabled && !normalizeBankConfig(settings).enabled)
      reject(400, "validation_error", "Cần điền đủ mã ngân hàng, tên ngân hàng, số tài khoản và tên chủ tài khoản trước khi bật chuyển khoản.");
    return tx(pool, async client => {
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('jielien-bank-settings',0))");
      const old = (await client.query("SELECT version FROM site_settings WHERE key=$1 FOR UPDATE", [key])).rows[0];
      version(old ?? { version: 0 }, body.version);
      const row = (await client.query(
        "INSERT INTO site_settings(key,value_json,updated_by) VALUES($1,$2,$3) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json,version=site_settings.version+1,updated_by=excluded.updated_by,updated_at=now() RETURNING version",
        [key, JSON.stringify(settings), user.id],
      )).rows[0];
      // Account details are intentionally excluded from audit metadata.
      await audit(client, user.id, "settings.bank_transfer_saved", "setting", key, { enabled: settings.enabled });
      return { settings, version: row.version, saved: true, available: normalizeBankConfig(settings).enabled };
    });
  }
  return { get, effective, save };
}
