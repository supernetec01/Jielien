INSERT INTO permissions(code) VALUES ('dashboard.read'),('catalog.read'),('orders.read'),('inventory.read'),('users.read') ON CONFLICT DO NOTHING;
INSERT INTO roles(name) VALUES ('boss'),('sales'),('warehouse'),('content'),('viewer') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='boss' AND p.code IN ('dashboard.read','catalog.read','orders.read','inventory.read','audit.read') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='sales' AND p.code IN ('dashboard.read','catalog.read','orders.read','orders.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='warehouse' AND p.code IN ('orders.read','inventory.read','inventory.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='content' AND p.code IN ('dashboard.read','catalog.read','catalog.manage') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='viewer' AND p.code IN ('catalog.read') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r CROSS JOIN permissions p WHERE r.name='admin' ON CONFLICT DO NOTHING;
