ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
CREATE UNIQUE INDEX product_variants_sku_upper_unique ON product_variants(upper(sku));
ALTER TABLE inventory_balances ADD COLUMN row_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inventory_balances ADD COLUMN price BIGINT, ADD COLUMN original_price BIGINT, ADD COLUMN price_override BOOLEAN NOT NULL DEFAULT false;
UPDATE inventory_balances b SET price=v.price,original_price=COALESCE(v.original_price,v.price) FROM product_variants v WHERE v.id=b.variant_id;
ALTER TABLE inventory_balances ALTER COLUMN price SET NOT NULL, ALTER COLUMN original_price SET NOT NULL;
ALTER TABLE inventory_balances ADD CONSTRAINT warehouse_price_valid CHECK(price BETWEEN 0 AND 9007199254740991 AND original_price BETWEEN price AND 9007199254740991);
CREATE FUNCTION guard_inventory_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.id=NEW.variant_id AND p.deleted_at IS NULL FOR SHARE OF v;
  IF NOT FOUND THEN RAISE EXCEPTION 'SKU đã xóa hoặc không tồn tại' USING ERRCODE='23503'; END IF;
  IF NEW.price IS NULL THEN SELECT price,COALESCE(original_price,price) INTO NEW.price,NEW.original_price FROM product_variants WHERE id=NEW.variant_id; END IF;
  IF TG_OP='UPDATE' THEN NEW.row_version=OLD.row_version+1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER inventory_catalog_guard BEFORE INSERT OR UPDATE ON inventory_balances FOR EACH ROW EXECUTE FUNCTION guard_inventory_catalog();
CREATE FUNCTION protect_sku_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.product_id<>OLD.product_id THEN RAISE EXCEPTION 'Không thể chuyển SKU sang sản phẩm khác' USING ERRCODE='23503'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER sku_owner_guard BEFORE UPDATE OF product_id ON product_variants FOR EACH ROW EXECUTE FUNCTION protect_sku_owner();

ALTER TABLE order_items ADD COLUMN warehouse_id BIGINT REFERENCES warehouses(id), ADD COLUMN warehouse_name_snapshot TEXT NOT NULL DEFAULT '';
CREATE FUNCTION sync_default_warehouse_prices() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE inventory_balances SET price=NEW.price,original_price=COALESCE(NEW.original_price,NEW.price) WHERE variant_id=NEW.id AND NOT price_override;
  RETURN NEW;
END $$;
CREATE TRIGGER sync_warehouse_prices AFTER UPDATE OF price,original_price ON product_variants FOR EACH ROW EXECUTE FUNCTION sync_default_warehouse_prices();

ALTER TABLE product_variants ADD CONSTRAINT sku_product_identity UNIQUE(id,product_id);
ALTER TABLE product_media ADD CONSTRAINT media_sku_product_fk FOREIGN KEY(variant_id,product_id) REFERENCES product_variants(id,product_id);
