let reporter;
export function setErrorReporter(capture) { reporter = capture; }
export function reportError(error) {
  // Monitoring must never change the HTTP response or expose the original error in logs.
  try { reporter?.(error); } catch { /* Optional monitoring is unavailable. */ }
}
