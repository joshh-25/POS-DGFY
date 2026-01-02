-- Fix items table category field to match schema requirements
-- This ensures all items have a valid category and the field is NOT NULL

USE sku_inventory_manager;

-- Step 1: Check for NULL categories
SELECT item_id, sku_code, name, category, status
FROM items
WHERE category IS NULL;

-- Step 2: Update NULL categories based on SKU prefix (if any found)
-- Update items with NULL category based on their SKU code pattern
UPDATE items
SET category = 'ingredient'
WHERE category IS NULL AND sku_code LIKE 'ING-%';

UPDATE items
SET category = 'product'
WHERE category IS NULL AND sku_code LIKE 'PRD-%';

UPDATE items
SET category = 'packaging'
WHERE category IS NULL AND sku_code LIKE 'PKG-%';

-- Step 3: For any remaining NULL categories, set to 'ingredient' as default
UPDATE items
SET category = 'ingredient'
WHERE category IS NULL;

-- Step 4: Verify all items now have categories
SELECT
  category,
  COUNT(*) as count,
  GROUP_CONCAT(sku_code SEPARATOR ', ') as sku_codes
FROM items
GROUP BY category;

-- Step 5: Enforce NOT NULL constraint on category field
ALTER TABLE items
MODIFY COLUMN category ENUM('ingredient', 'product', 'packaging') NOT NULL;

-- Step 6: Verify the change
DESCRIBE items;

-- Expected output should show:
-- category | enum('ingredient','product','packaging') | NO | | NULL |
