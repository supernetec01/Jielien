import { sanitizeEvent } from "/sentry-privacy.js";

try {
  const response = await fetch("/api/site", { credentials: "omit", cache: "no-store" });
  const config = response.ok ? (await response.json()).monitoring : null;
  if (config?.dsn) {
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://browser.sentry-cdn.com/11.12.0/bundle.min.js";
      script.crossOrigin = "anonymous";
      script.onload = resolve;
      script.onerror = reject;
      document.head.append(script);
    });
    window.Sentry.init({
      dsn: config.dsn,
      environment: config.environment,
      release: config.release,
      traceLifecycle: "static",
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [window.Sentry.globalHandlersIntegration()],
      maxBreadcrumbs: 0,
      autoSessionTracking: false,
      sendClientReports: false,
      beforeSend: sanitizeEvent,
      beforeSendTransaction: sanitizeEvent,
      beforeBreadcrumb: () => null,
      beforeSendLog: () => null,
    });
  }
} catch {
  // Missing config, blocked SDK or an unavailable provider must not block shopping.
}
