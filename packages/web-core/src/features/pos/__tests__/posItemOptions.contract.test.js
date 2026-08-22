import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx');
const checkoutViewPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx');
const checkoutContent = [checkoutPath, checkoutViewPath]
  .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
  .join('\n');

describe('POS Current Sale item options contract', () => {
  it('opens one item options modal from the item itself', () => {
    expect(checkoutContent).toContain("import('./ItemOptionsDialog.jsx')");
    expect(checkoutContent).toContain('data-testid={`pos-item-options-trigger-${lineKey}`}');
    expect(checkoutContent).toContain('role="button"');
    expect(checkoutContent).toContain('if (!sessionLocked) setItemOptionsLineKey(lineKey);');
    expect(checkoutContent).toContain('event.stopPropagation();');
    expect(checkoutContent).toContain('Tap item to customize');
    expect(checkoutContent).not.toContain('pos-item-note-trigger-');
    expect(checkoutContent).not.toContain('Choose modifiers');
    expect(checkoutContent).not.toContain('Modifiers:');
    expect(checkoutContent).not.toContain('None selected');
    expect(checkoutContent).toContain('item_discount: normalizedItemDiscount');
    expect(checkoutContent).toContain('itemDiscount={itemOptionsItemDiscount}');
    expect(checkoutContent).toContain('defaultDiscountApprover={activeShiftCashierApprover}');
  });
});
