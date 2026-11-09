-- Shared across app processes; no raw identifier or client IP is stored here.
CREATE TABLE auth_security_keys (
  name TEXT PRIMARY KEY,
  secret TEXT NOT NULL
);
CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL CHECK (count >= 0),
  expires_at BIGINT NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON auth_rate_limits(expires_at);
