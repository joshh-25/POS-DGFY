USE sku_inventory_manager;
UPDATE users SET password_hash='$2a$10$ruHft/Bv2W.kQmfegFffpuxNIJzlBb/B9ygR490Ci/IQRF6GEzw/y', is_active=1 WHERE email='admin@test.com';
SELECT password_hash FROM users WHERE email='admin@test.com';
