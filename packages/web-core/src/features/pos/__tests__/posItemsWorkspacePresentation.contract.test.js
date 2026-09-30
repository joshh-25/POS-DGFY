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
    expect(source).toContain('pos-items-desktop-card-grid');
    expect(source).toContain('pos-items-desktop-card"');
    expect(source).toContain('Cost (₱):');
    expect(source).toContain('Price (₱):');
    expect(source).toContain('₱{money(item.default_sale_price)}');
    expect(source).toContain('`₱${money(item.cost_per_unit)}`');
  });

  it('keeps the current card layout, search, and item management actions', () => {
    const source = readWorkspace();

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
