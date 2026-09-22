import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pagePath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../pages/StockMovementsPage.jsx'
);
const pageSource = fs.readFileSync(pagePath, 'utf8');

describe('Stock Movements workspace presentation contract', () => {
  it('keeps the workspace hierarchy and responsive filter controls', () => {
    expect(pageSource).toContain('Inventory operations');
    expect(pageSource).toContain('Movement history');
    expect(pageSource).toContain('Filter movements');
    expect(pageSource).not.toContain('Search by item, type, or date.');
    expect(pageSource).toContain('htmlFor="stock-movements-search"');
    expect(pageSource).toContain('id="stock-movements-search"');
    expect(pageSource).toContain('aria-label="Search stock movements"');
    expect(pageSource).toContain('htmlFor="stock-movements-type"');
    expect(pageSource).toContain('id="stock-movements-type"');
    expect(pageSource).toContain('aria-label="Filter by movement type"');
    expect(pageSource).toContain('id="stock-movements-from"');
    expect(pageSource).toContain('id="stock-movements-to"');
    expect(pageSource).toContain('grid-cols-2 gap-3 md:gap-4 lg:grid-cols-4');
    expect(pageSource).toContain('grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_12rem_11rem_11rem]');
    expect(pageSource).toContain('mt-3 overflow-x-auto overscroll-x-contain pb-1');
    expect(pageSource).toContain('flex min-w-max flex-nowrap gap-2');
    expect(pageSource).toContain('role="region" aria-label="Movement type quick filters"');
    expect(pageSource).toContain('aria-label="Quick movement filters"');
  });

  it('makes quick filters and table actions keyboard-safe and unambiguous', () => {
    expect(pageSource).toContain('type="button"');
    expect(pageSource).toContain('aria-pressed={active}');
    expect(pageSource).toContain('aria-label={`${active ? \'Remove\' : \'Apply\'} ${label} filter`}');
    expect(pageSource).toContain('onClick={(event) => event.stopPropagation()}');
    expect(pageSource).toContain('aria-label={`Actions for ${mov.item?.name || mov.item_name || \'movement\'}`}');
    expect(pageSource).toContain('title="Movement actions"');
    expect(pageSource).toContain('className="min-w-48 p-1.5"');
    expect(pageSource).toContain('Movement actions');
    expect(pageSource).toContain('<span>View details</span>');
    expect(pageSource).toContain('<span>Void movement</span>');
    expect(pageSource).toMatch(/const handleVoidClick = \(movement\) => \{\s*setShowDetailsModal\(false\);\s*setSelectedMovement\(null\);/);
    expect(pageSource).toContain('onKeyDown={(event) => {');
    expect(pageSource).toContain('aria-label="Previous page"');
    expect(pageSource).toContain('aria-label="Next page"');
  });

  it('preserves the existing movement contracts and safe empty state', () => {
    expect(pageSource).toContain('No movements found matching your criteria.');
    expect(pageSource).toContain('Try adjusting the search, movement type, or date range.');
    expect(pageSource).toContain('handleExport');
    expect(pageSource).toContain("canCreate('stock_movements')");
    expect(pageSource).toContain("canDelete('stock_movements')");
    expect(pageSource).toContain('handleCreateMovement');
    expect(pageSource).toContain('handleVoidClick');
    expect(pageSource).toContain('exportFeatureStockMovements');
    expect(pageSource).toContain('voidFeatureMovement');
  });
});
