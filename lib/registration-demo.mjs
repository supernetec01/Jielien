export function registrationDemoEnabled(env = process.env) {
  const mode = env.AUTH_VERIFICATION_MODE || 'provider';
  if (!['provider', 'demo'].includes(mode)) throw Error('AUTH_VERIFICATION_MODE must be provider or demo.');
  if (mode !== 'demo') return false;
  if (env.NODE_ENV !== 'development' ||
      (env.AUTH_DEMO_LOCAL_BIND || '127.0.0.1') !== '127.0.0.1' ||
      env.PUBLIC_BASE_URL || env.SEO_INDEXING_ENABLED === 'true' ||
      env.AUTH_VERIFICATION_WEBHOOK_URL || env.AUTH_VERIFICATION_WEBHOOK_TOKEN) {
    throw Error('Demo registration requires development, localhost-only binding, no public URL/indexing and no real verification provider.');
  }
  return true;
}

export function requireDemoLocalHost(req) {
  // Host allowlist also rejects DNS rebinding; normal origin checks still apply.
  let host;
  try { host = new URL('http://' + req.headers.host).hostname; } catch {}
  if (!['localhost', '127.0.0.1', '[::1]'].includes(host)) {
    throw Object.assign(new Error('Đăng ký demo chỉ dùng qua localhost.'), {status:403,error:'demo_localhost_only'});
  }
}
