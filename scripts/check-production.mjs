import { readBankConfig } from "../lib/vietqr.mjs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
// Validate names and constraints only. Never print values or connection strings.
export function validateProductionConfig(env) {
  const errors = [];
  const domain = String(env.SITE_DOMAIN || "").trim();
  if (
    !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(
      domain,
    ) ||
    /\.(?:test|local|localhost|example|invalid)$/i.test(domain)
  )
    errors.push(
      "SITE_DOMAIN: cần tên miền công khai, không kèm https, cổng hoặc đường dẫn.",
    );
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.ACME_EMAIL || ""))
    errors.push("ACME_EMAIL: cần email liên hệ cấp chứng chỉ HTTPS.");
  if (!/^[A-Za-z0-9_-]{24,}$/.test(env.POSTGRES_PASSWORD || ""))
    errors.push(
      "POSTGRES_PASSWORD: tối thiểu 24 ký tự URL-safe (chữ, số, _ hoặc -); dùng giá trị ngẫu nhiên riêng.",
    );
  if (env.JIELIEN_DEMO_DATA === "true")
    errors.push("JIELIEN_DEMO_DATA: phải tắt trước khi mở bán.");
  if (env.DEMO_MODE === "true")
    errors.push("DEMO_MODE: phải tắt trước khi mở bán.");
  if (env.COOKIE_SECURE === "false")
    errors.push("COOKIE_SECURE: không được tắt ở production.");
  if (env.NODE_ENV && env.NODE_ENV !== "production")
    errors.push("NODE_ENV: dùng production cho website công khai.");
  try {
    const delivery=new URL(env.AUTH_VERIFICATION_WEBHOOK_URL);
    if(delivery.protocol!=='https:'||delivery.username||delivery.password||delivery.hash||!env.AUTH_VERIFICATION_WEBHOOK_TOKEN)throw Error();
  } catch {
    errors.push('AUTH_VERIFICATION_WEBHOOK_*: cần bridge HTTPS và bearer token để mở đăng ký có xác minh SMS/email.');
  }
  const bank = [
    "BANK_BIN",
    "BANK_NAME",
    "BANK_ACCOUNT_NUMBER",
    "BANK_ACCOUNT_NAME",
  ];
  if (bank.some((k) => env[k]) && !bank.every((k) => env[k]))
    errors.push(
      "BANK_*: cần đủ bốn trường để bật chuyển khoản; để trống toàn bộ nếu chỉ dùng COD.",
    );
  if (bank.some((k) => env[k]) && !readBankConfig(env).enabled)
    errors.push(
      "BANK_*: thông tin nhận tiền không hợp lệ theo quy tắc VietQR của ứng dụng.",
    );
  return errors;
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const errors = validateProductionConfig(process.env);
  if (errors.length) {
    console.error(
      "Cấu hình chưa sẵn sàng:\n" + errors.map((e) => " - " + e).join("\n"),
    );
    process.exitCode = 1;
  } else
    console.log(
      "Cấu hình đầu vào hợp lệ. Chưa xác minh DNS, HTTPS, nhận tiền, gửi hàng hoặc khả năng khôi phục backup.",
    );
}
