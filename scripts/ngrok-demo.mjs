import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function demoTunnelConfig(env = process.env) {
  const port = env.NGROK_LOCAL_PORT || env.JIELIEN_PORT || "3001";
  if (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535)
    throw new Error("NGROK_LOCAL_PORT/JIELIEN_PORT phải từ 1 đến 65535.");
  const domain = env.NGROK_DOMAIN?.trim();
  if (
    domain &&
    !/^(?=.{1,253}$)(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/.test(
      domain,
    )
  )
    throw new Error(
      "NGROK_DOMAIN chỉ chứa hostname được cấp trong tài khoản ngrok, không có https:// hoặc đường dẫn.",
    );
  if (
    env.NGROK_BASIC_AUTH &&
    !/^[^:\r\n]+:[^\r\n]+$/.test(env.NGROK_BASIC_AUTH)
  )
    throw new Error("NGROK_BASIC_AUTH cần dạng ten-dang-nhap:mat-khau.");
  return {
    upstream: `http://127.0.0.1:${Number(port)}`,
    options: {
      addr: `127.0.0.1:${Number(port)}`,
      authtoken_from_env: true,
      schemes: ["https"],
      ...(domain ? { domain } : {}),
      ...(env.NGROK_BASIC_AUTH ? { basic_auth: [env.NGROK_BASIC_AUTH] } : {}),
    },
  };
}
export async function checkDemoServer(upstream, request = fetch) {
  let response;
  try {
    response = await request(upstream + "/api/health", {
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new Error(
      `Chưa kết nối được Jielien tại ${upstream}. Chạy npm run local:start (Docker) hoặc npm run demo:server (cloud) trước.`,
    );
  }
  let health;
  try {
    health = await response.json();
  } catch {}
  if (
    !response.ok ||
    health?.status !== "ok" ||
    health?.database !== "postgresql"
  )
    throw new Error(
      "Cổng này chưa trả health check hợp lệ của Jielien/PostgreSQL. Kiểm tra đúng cổng và database trước khi mở tunnel.",
    );
}
export function redactTunnelError(error, env = process.env) {
  let message = String(error?.message || "Không mở được tunnel ngrok.");
  for (const value of [env.NGROK_AUTHTOKEN, env.NGROK_BASIC_AUTH].filter(
    Boolean,
  ))
    message = message.replaceAll(value, "[REDACTED]");
  return message;
}
export async function startDemoTunnel({
  env = process.env,
  request = fetch,
  load = () => import("@ngrok/ngrok"),
  log = console.log,
} = {}) {
  const config = demoTunnelConfig(env);
  await checkDemoServer(config.upstream, request);
  if (!env.NGROK_AUTHTOKEN?.trim())
    throw new Error(
      "Thiếu NGROK_AUTHTOKEN. Đặt token vào .env.ngrok (đã Git ignore) hoặc cấu hình bí mật của môi trường, rồi chạy lại npm run demo:ngrok. Không gửi token vào chat hoặc commit Git.",
    );
  const ngrok = await load();
  const listener = await ngrok.forward(config.options);
  const url = listener.url();
  if (!url || new URL(url).protocol !== "https:") {
    await listener.close();
    throw new Error("Ngrok chưa cấp URL HTTPS hợp lệ.");
  }
  log(`Demo Jielien: ${url}`);
  log(
    "Chia sẻ URL HTTPS này cho khách. Giữ terminal, website và database đang chạy; Ctrl+C để đóng link.",
  );
  return { url, close: () => listener.close() };
}
async function main() {
  let tunnel;
  const stop = async () => {
    try {
      await tunnel?.close();
    } finally {
      process.exit(0);
    }
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    tunnel = await startDemoTunnel();
    await new Promise(() => {});
  } catch (error) {
    console.error(redactTunnelError(error));
    process.exitCode = 1;
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
