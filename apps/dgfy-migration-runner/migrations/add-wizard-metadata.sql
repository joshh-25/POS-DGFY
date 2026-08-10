-- Migration: Add wizard_metadata column to items table
-- Date: 2025-12-29
-- Purpose: Support draft functionality for ProductCreateWizard
--
-- Execute this migration:
--   MySQL CLI: mysql -u root sku_inventory_manager < add-wizard-metadata.sql
--   phpMyAdmin: Copy and paste into SQL tab after selecting sku_inventory_manager database

USE sku_inventory_manager;

-- Add wizard_metadata column if it doesn't exist
ALTER TABLE items
ADD COLUMN IF NOT EXISTS wizard_metadata JSON NULL
COMMENT 'Stores wizard progress for draft products';

-- Verify column was added
DESCRIBE items;
