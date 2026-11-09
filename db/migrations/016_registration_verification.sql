-- Existing accounts remain active; never backfill proof of ownership.
ALTER TABLE users ADD COLUMN phone_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN email_verified_at TIMESTAMPTZ;
CREATE TABLE registration_challenges (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  password_hash TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  email_code_hash TEXT,
  created_at BIGINT NOT NULL,
  expires_at BIGINT NOT NULL,
  consumed_at BIGINT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5)
);
CREATE INDEX registration_phone_created ON registration_challenges(phone,created_at);
CREATE INDEX registration_email_created ON registration_challenges(email,created_at);
CREATE INDEX registration_expiry ON registration_challenges(expires_at);
CREATE TABLE registration_outbox (
  challenge_id TEXT PRIMARY KEY REFERENCES registration_challenges(id) ON DELETE CASCADE,
  payload TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sending','sent','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt BIGINT NOT NULL,
  lease_until BIGINT
);
