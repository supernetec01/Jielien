CREATE TABLE customer_password_resets (
  token_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  email_snapshot TEXT,
  password_fingerprint TEXT NOT NULL,
  source TEXT NOT NULL CHECK(source IN ('email','support')),
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  used_at BIGINT
);
CREATE INDEX customer_reset_user_created ON customer_password_resets(user_id,created_at);
CREATE INDEX customer_reset_expiry ON customer_password_resets(expires_at);
CREATE TABLE customer_recovery_outbox (
  id TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at BIGINT NOT NULL,
  next_attempt BIGINT NOT NULL,
  lease_until BIGINT
);
CREATE INDEX recovery_outbox_due ON customer_recovery_outbox(state,next_attempt);
