import { currentRelease } from "./runtime.mjs";
export const browserSdkUrl = "https://browser.sentry-cdn.com/11.12.0/bundle.min.js";
export function monitoringDsn(value, allowHttp = false) {
  try {
    const url = new URL(value?.trim());
    if (!(url.protocol === "https:" || (allowHttp && url.protocol === "http:")) ||
      !/^[a-z0-9]+$/i.test(url.username) || url.password || !/^\/(?:[a-z0-9_-]+\/)*[0-9]+$/i.test(url.pathname) || url.search || url.hash) return null;
    return url.href;
  } catch { return null; }
}
export function frontendMonitoring(env = process.env) {
  const dsn = monitoringDsn(env.SENTRY_DSN_FRONTEND);
  return dsn ? { dsn, environment: env.SENTRY_ENVIRONMENT, release: currentRelease(env) } : null;
}
export function monitoringConnectSource(config) {
  if (!config) return "";
  return new URL(config.dsn).origin;
}
