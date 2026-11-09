-- Dedicated staff capability; legacy settings permissions remain compatible.
INSERT INTO permissions(code,description) VALUES ('banners.read','Xem Banner Studio'),('banners.write','Tạo và sửa banner/poster') ON CONFLICT DO NOTHING;
INSERT INTO roles(name,description) VALUES('banner_manager','Quản lý banner và ảnh chiến dịch') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM roles r CROSS JOIN permissions p
WHERE (r.name='admin' AND p.code IN ('banners.read','banners.write'))
   OR (r.name='banner_manager' AND p.code IN ('banners.read','banners.write','media.read','media.upload'))
ON CONFLICT DO NOTHING;
