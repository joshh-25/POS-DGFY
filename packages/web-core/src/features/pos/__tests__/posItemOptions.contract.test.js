import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx');
const checkoutViewPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx');
const itemOptionsPath = path.resolve(webCoreRoot, 'src/features/pos/components/ItemOptionsDialog.jsx');
const checkoutContent = [checkoutPath, checkoutViewPath]
  .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
  .join('\n');
const itemOptionsContent = fs.readFileSync(itemOptionsPath, 'utf8');

describe('POS Current Sale item options contract', () => {
  it('opens one item options modal from the item itself', () => {
    expect(checkoutContent).toContain("import('./ItemOptionsDialog.jsx')");
    expect(checkoutContent).toContain('data-testid={`pos-item-options-trigger-${lineKey}`}');
    expect(checkoutContent).toContain('role="button"');
    expect(checkoutContent).toContain('if (!sessionLocked) setItemOptionsLineKey(lineKey);');
    expect(checkoutContent).toContain('event.stopPropagation();');
    expect(checkoutContent).toContain('Tap item to customize');
    expect(checkoutContent).toContain('border border-blue-300 bg-clip-padding bg-slate-50 p-2.5');
    expect(checkoutContent).toContain('hover:border-blue-400 hover:bg-blue-50');
    expect(checkoutContent).not.toContain('pos-item-note-trigger-');
    expect(checkoutContent).not.toContain('Choose modifiers');
    expect(checkoutContent).not.toContain('Modifiers:');
    expect(checkoutContent).not.toContain('None selected');
    expect(checkoutContent).toContain('const saveItemOptions = async ({ note, selections })');
    expect(checkoutContent).not.toContain('item_discount: normalizedItemDiscount');
    expect(checkoutContent).not.toContain('itemDiscount={itemOptionsItemDiscount}');
    expect(checkoutContent).not.toContain('defaultDiscountApprover={activeShiftCashierApprover}');
    expect(checkoutContent).toContain('globalDiscount={itemOptionsGlobalDiscount}');
  });

  it('keeps item options focused on customization while directing discounts to checkout', () => {
    expect(itemOptionsContent).not.toContain('Discount for this item');
    expect(itemOptionsContent).not.toContain('Apply an item-only discount');
    expect(itemOptionsContent).toContain('Apply discounts from the checkout discount action');
  });
});
