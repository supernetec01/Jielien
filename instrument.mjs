// Preload before server.mjs so HTTP instrumentation is installed before node:http.
if (process.env.SENTRY_DSN_BACKEND?.trim()) {
  try {
    const { monitoringDsn } = await import("./lib/sentry-config.mjs");
    const dsn = monitoringDsn(process.env.SENTRY_DSN_BACKEND, true);
    // Reject malformed config before the SDK can print it in its own diagnostic.
    if (!dsn) throw new Error("invalid_monitoring_config");
    const Sentry = await import("@sentry/node");
    const { sanitizeEvent } = await import("./public/sentry-privacy.js");
    const { currentRelease } = await import("./lib/runtime.mjs");
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT,
      release: currentRelease(),
      tracesSampleRate: 0.05,
      // v11 streams spans by default; static lifecycle guarantees every trace
      // passes through the same final privacy allowlist as errors.
      traceLifecycle: "static",
      sendDefaultPii: false,
      sendClientReports: false,
      defaultIntegrations: false,
      integrations: [
        Sentry.httpIntegration({ breadcrumbs: false, tracePropagation: false, sessions: false, maxRequestBodySize: "none" }),
      ],
      maxBreadcrumbs: 0,
      beforeSend: sanitizeEvent,
      beforeSendTransaction: sanitizeEvent,
      beforeBreadcrumb: () => null,
      beforeSendLog: () => null,
    });
    const { setErrorReporter } = await import("./lib/monitoring.mjs");
    setErrorReporter((error) => Sentry.captureException(error));
    let exiting = false;
    const fatal = (error) => {
      // Preserve Node's fatal-error behavior without printing raw exception/PII.
      if (exiting) process.exit(1);
      exiting = true;
      Sentry.captureException(error, { level: "fatal" });
      console.error("Ứng dụng gặp lỗi nghiêm trọng và cần khởi động lại.");
      void Sentry.close(2000).finally(() => process.exit(1));
    };
    process.on("uncaughtException", fatal);
    process.on("unhandledRejection", fatal);
  } catch {
    console.error("Không khởi tạo được theo dõi lỗi; website tiếp tục hoạt động.");
  }
}
