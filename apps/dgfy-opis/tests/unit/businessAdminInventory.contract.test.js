import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const businessAdminPage = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/BusinessAdminPage.jsx'),
  'utf8'
);
const businessAdminCss = fs.readFileSync(
  path.resolve(__dirname, '../../src/features/businessAdmin/businessAdmin.css'),
  'utf8'
);

describe('Business Admin inventory presentation contract', () => {
  it('keeps inventory values read-only and cost visibility aware', () => {
    expect(businessAdminPage).toContain('business-admin-inventory-workspace');
    expect(businessAdminPage).toContain('weighted_total_available_qty');
    expect(businessAdminPage).toContain('weighted_total_inventory_value');
    expect(businessAdminPage).toContain("data?.valuation?.meta?.cost_visibility === false");
    expect(businessAdminPage).toContain('Read-only inventory view');
    expect(businessAdminPage).toContain('Catalog Editor and Stock movements');
  });

  it('provides one canonical inventory workflow entry point without creating a stock-count form', () => {
    expect(businessAdminPage).toContain('Inventory workflows');
    expect(businessAdminPage).toContain('Catalog editor');
    expect(businessAdminPage).toContain('Stock movements');
    expect(businessAdminPage).toContain('Suppliers');
    expect(businessAdminPage).toContain('Purchase orders');
    expect(businessAdminPage).toContain('Ingredients & recipes');
    expect(businessAdminPage).toContain('Stock counts need a separate command-owner decision.');
    expect(businessAdminPage).not.toContain('Create stock count');
  });

  it('provides desktop tables and mobile inventory cards from the same rows', () => {
    expect(businessAdminPage).toContain('InventorySummaryMetric');
    expect(businessAdminPage).toContain('InventoryValuationCard');
    expect(businessAdminPage).toContain('InventoryLowStockCard');
    expect(businessAdminPage).toContain('business-admin-inventory-table-view');
    expect(businessAdminPage).toContain('business-admin-inventory-mobile-view');
    expect(businessAdminPage).toContain('business-admin-inventory-record-facts');
    expect(businessAdminPage).toContain('shortage_quantity');
    expect(businessAdminPage).toContain('const BUSINESS_ADMIN_INVENTORY_PAGE_SIZE = 10;');
    expect(businessAdminPage).toContain('page: inventoryPage, limit: BUSINESS_ADMIN_INVENTORY_PAGE_SIZE');
    expect(businessAdminPage).toContain('rows.slice(0, BUSINESS_ADMIN_INVENTORY_PAGE_SIZE)');
    expect(businessAdminPage).toContain('InventoryPagination');
    expect(businessAdminPage).toContain('onPageChange={setInventoryPage}');
  });

  it('prevents inventory tables from forcing mobile horizontal scrolling', () => {
    expect(businessAdminCss).toContain('.business-admin-inventory-table-view .business-admin-table { min-width: 0; table-layout: fixed; }');
    expect(businessAdminCss).toContain('.business-admin-inventory-mobile-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-inventory-table-view { display: none; }');
    expect(businessAdminCss).toContain('.business-admin-inventory-mobile-view { display: block; }');
    expect(businessAdminCss).toContain('.business-admin-inventory-summary { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }');
    expect(businessAdminCss).toContain('.business-admin-inventory-workflow-grid { grid-template-columns: minmax(0, 1fr); }');
    expect(businessAdminCss).toContain('.business-admin-inventory-pagination {');
    expect(businessAdminCss).toContain('.business-admin-inventory-pagination-actions { display: flex; align-items: center; justify-content: center; gap: 8px; }');
  });
});
