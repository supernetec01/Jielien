CREATE TABLE catalog_import_jobs(id TEXT PRIMARY KEY,actor_id BIGINT NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),summary JSONB NOT NULL);
