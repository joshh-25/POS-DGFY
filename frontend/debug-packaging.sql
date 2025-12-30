-- Debug query to check packaging items
USE sku_inventory_manager;

-- Check if any items have category='packaging'
SELECT
    item_id,
    sku_code,
    name,
    category,
    packaging_specs
FROM items
WHERE category = 'packaging';

-- Check all categories in the system
SELECT DISTINCT category, COUNT(*) as count
FROM items
GROUP BY category;

-- Check if packaging_specs column exists
DESCRIBE items;
