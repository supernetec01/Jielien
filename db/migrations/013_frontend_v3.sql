-- Additive only: old banners remain home_hero with their existing asset/link/schedule.
ALTER TABLE page_banners ADD COLUMN slot TEXT NOT NULL DEFAULT 'home_hero' CHECK (slot IN ('home_hero','home_side_top','home_side_bottom','home_wide','category_hero','article_featured'));
ALTER TABLE page_banners ADD COLUMN asset_mobile_id BIGINT REFERENCES media_assets(id);
ALTER TABLE page_banners ADD COLUMN alt TEXT NOT NULL DEFAULT '';
ALTER TABLE page_banners ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
ALTER TABLE page_banners ADD COLUMN cta_label TEXT NOT NULL DEFAULT 'Khám phá';
ALTER TABLE page_banners ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE page_banners ADD COLUMN focal_x INTEGER NOT NULL DEFAULT 50 CHECK (focal_x BETWEEN 0 AND 100);
ALTER TABLE page_banners ADD COLUMN focal_y INTEGER NOT NULL DEFAULT 50 CHECK (focal_y BETWEEN 0 AND 100);
ALTER TABLE page_banners ADD COLUMN created_by BIGINT REFERENCES users(id);
ALTER TABLE page_banners ADD COLUMN updated_by BIGINT REFERENCES users(id);
ALTER TABLE page_banners ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE categories ADD COLUMN image_asset_id BIGINT REFERENCES media_assets(id);
CREATE INDEX page_banners_public_slots ON page_banners(slot,sort_order,id) WHERE status='published';
CREATE INDEX product_variants_public_price ON product_variants(price,id) WHERE status='active';
