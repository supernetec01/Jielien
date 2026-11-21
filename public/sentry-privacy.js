// Deliberate allowlist: free-form messages, request bodies, headers, cookies,
// user data, breadcrumbs, URLs, extra contexts and span data never leave the app.
const files = new Set([
  "server.mjs", "instrument.mjs", "app.js", "account.js", "admin.js",
  "commerce-admin.js", "warehouse-admin.js", "v3-storefront.js", "shell-v3.js",
  "site-shell.js", "language.js", "category-navigation.js", "checkout-key.js",
  "auth.mjs", "cart.mjs", "store.mjs", "database.mjs", "commerce-routes.mjs",
  "catalog.mjs", "public-catalog.mjs", "catalog-import.mjs", "cms.mjs",
  "operations.mjs", "returns.mjs", "inventory-documents.mjs", "media.mjs",
  "password-recovery.mjs", "warehouse-catalog.mjs", "seo.mjs", "vietqr.mjs",
  "bank-settings.mjs", "bank-settings-admin.js", "bank-transfer-policy.mjs", "order-expiry.mjs", "staff-notifications.mjs", "transfer-timing.js",
]);
const errorTypes = new Set(["Error", "TypeError", "RangeError", "ReferenceError", "SyntaxError", "URIError", "EvalError", "AggregateError"]);
const hex = (value, size) => typeof value === "string" && new RegExp(`^[a-f0-9]{${size}}$`, "i").test(value);
const numeric = (value) => typeof value === "number" && Number.isFinite(value);
export function sanitizeEvent(event) {
  const safe = {};
  if (hex(event.event_id, 32)) safe.event_id = event.event_id;
  for (const key of ["timestamp", "start_timestamp"]) if (numeric(event[key])) safe[key] = event[key];
  if (["fatal", "error", "warning", "info", "debug"].includes(event.level)) safe.level = event.level;
  if (["node", "javascript"].includes(event.platform)) safe.platform = event.platform;
  // These two values come from operator configuration, never from customer input.
  for (const key of ["release", "environment"]) if (typeof event[key] === "string") safe[key] = event[key];
  const trace = event.contexts?.trace;
  if (hex(trace?.trace_id, 32) && hex(trace?.span_id, 16)) {
    safe.contexts = { trace: { trace_id: trace.trace_id, span_id: trace.span_id } };
  }
  if (event.type === "transaction") {
    safe.type = "transaction";
    safe.transaction = "HTTP request";
    safe.transaction_info = { source: "custom" };
    safe.spans = [];
  } else {
    safe.exception = { values: (event.exception?.values?.length ? event.exception.values : [{}]).map((value) => {
      const frames = (value.stacktrace?.frames || []).flatMap((frame) => {
        const filename = String(frame.filename || "").split(/[?#]/)[0].split(/[\\/]/).at(-1);
        if (!files.has(filename)) return [];
        const clean = { filename, in_app: true };
        for (const key of ["lineno", "colno"]) if (numeric(frame[key])) clean[key] = frame[key];
        return [clean];
      });
      return {
        type: errorTypes.has(value.type) ? value.type : "Error",
        value: "Lỗi ứng dụng (nội dung đã được ẩn để bảo vệ thông tin cá nhân).",
        ...(frames.length ? { stacktrace: { frames } } : {}),
        mechanism: { type: "generic", handled: value.mechanism?.handled !== false },
      };
    }) };
  }
  return safe;
}
