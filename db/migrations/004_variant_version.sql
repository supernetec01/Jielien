ALTER TABLE product_variants ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1 CHECK (row_version > 0);
