-- SKU Inventory Manager - Database Setup Script
-- Execute this script to create the database for the application
-- 
-- Usage:
--   MySQL CLI: mysql -u root -p < database-setup.sql
--   phpMyAdmin: Copy and paste into SQL tab

CREATE DATABASE IF NOT EXISTS sku_inventory_manager 
CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

-- Verify database creation
SHOW DATABASES LIKE 'sku_inventory_manager';



















