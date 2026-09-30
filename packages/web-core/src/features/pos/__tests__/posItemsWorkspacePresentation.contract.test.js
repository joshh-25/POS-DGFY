import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const workspacePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../components/TerminalOperationsWorkspace.jsx');
const readWorkspace = () => fs.readFileSync(workspacePath, 'utf8');

describe('standalone POS Items workspace presentation', () => {
  it('targets the Items management workspace instead of the checkout item picker', () => {
    const source = readWorkspace();

    expect(source).toContain("case 'items':");
    expect(source).toContain('<ItemsCatalogWorkspace');
    expect(source).toContain('className="pos-items-desktop-toolbar hidden items-center gap-2 sm:flex"');
    expect(source).toContain('className="pos-items-desktop-actions flex shrink-0 flex-wrap items-center justify-end gap-2"');
    expect(source).toContain('data-testid="pos-items-results"');
    // The result area is a responsive card grid, with the same test hook retained.
    expect(source).toContain('xl:grid-cols-2');
    expect(source).toContain('pos-items-desktop-toolbar');
    expect(source).toContain('placeholder="Search item by Name, SKU, or Barcode"');
    expect(source).toContain('pos-items-desktop-card-grid');
    expect(source).toContain('pos-items-desktop-card"');
    expect(source).toContain('Cost (₱):');
    expect(source).toContain('Price (₱):');
    expect(source).toContain('₱{money(item.default_sale_price)}');
    expect(source).toContain('`₱${money(item.cost_per_unit)}`');
    expect(source).toContain('₱${money(item.cost_per_unit)}');
    expect(source).toContain('tabular-nums');
  });

  it('keeps the reference card metrics and item management actions', () => {
    const source = readWorkspace();
    // Card metrics carry the old table columns' content: cost, stock, price,
    // SKU, and category — without the isMoneyColumn heading machinery.
    expect(source).toContain('Cost (₱):');
    expect(source).toContain('Stock:');
    expect(source).toContain('Price (₱):');
    expect(source).toContain('font-black leading-tight tabular-nums');
    expect(source).toContain('Search item by Name, SKU, or Barcode');
    expect(source).toContain('Add Items');
    expect(source).toContain('Import Items');
    expect(source).toContain("const menuImportButtonLabel = 'Import Menu';");
    expect(source).toContain('SKU');
    expect(source).toContain('Barcode');
    expect(source).toContain('Edit Item');
    expect(source).toContain('Delete');
    expect(source).toContain('onClick={() => openEdit(item)}');
    expect(source).toContain('onClick={() => setDeleteConfirmItem(item)}');
  });
});
