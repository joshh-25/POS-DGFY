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
    expect(source).toContain("data-pos-items-design={IS_DGFY_POS_SURFACE ? 'apex' : undefined}");
    expect(source).toContain('data-testid="pos-items-design-tabs"');
    expect(source).toContain("data-pos-items-toolbar={IS_DGFY_POS_SURFACE ? 'true' : undefined}");
    expect(source).toContain("data-pos-items-search-card={IS_DGFY_POS_SURFACE ? 'true' : undefined}");
    expect(source).toContain("currencySymbol = 'PHP'");
    expect(source).toContain('const itemDisplayCurrency = currencyLabel(currencySymbol);');
    expect(source).toContain("currencySymbol={terminalMeta?.pettyCashSymbol || 'PHP'}");
    expect(source).toContain('{itemDisplayCurrency}{money(item.default_sale_price)}');
    expect(source).toContain("`${itemDisplayCurrency}${money(item.cost_per_unit)}`");
    expect(source).toContain('data-pos-items-table="true"');
    expect(source).toContain('data-pos-items-row="true"');
    expect(source).toContain("data-pos-items-card={IS_DGFY_POS_SURFACE ? 'true' : undefined}");
    expect(source).toContain("data-pos-items-actions={IS_DGFY_POS_SURFACE ? 'true' : undefined}");
  });

  it('keeps the reference table columns and item management actions', () => {
    const source = readWorkspace();

    expect(source).toContain("['Item', 'Details & Identification', 'Category', 'Stock Status', 'Profit Margin', 'Price', 'Cost', 'Actions']");
    expect(source).toContain('Search by item name, SKU, or barcode');
    expect(source).toContain('Add Item');
    expect(source).toContain('Import Items');
    expect(source).toContain('SKU');
    expect(source).toContain('Barcode');
    expect(source).toContain('Edit');
    expect(source).toContain('Delete');
    expect(source).toContain('onClick={() => openEdit(item)}');
    expect(source).toContain('onClick={() => setDeleteConfirmItem(item)}');
  });
});
