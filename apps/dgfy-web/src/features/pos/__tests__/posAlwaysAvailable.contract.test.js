import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('POS Always Available contract', () => {
  it('does not show or enforce out-of-stock state for a POS-only Always Available item', () => {
    const checkout = fs.readFileSync(path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx'), 'utf8');
    const skupervisorCheckout = fs.readFileSync(path.resolve(__dirname, '../components/SkupervisorPOSCheckoutTerminal.jsx'), 'utf8');
    expect(checkout).toContain("item?.pos_always_available === true");
    expect(checkout).toContain('const CatalogItemBadges');
    expect(checkout).toContain('isAlwaysAvailable={isAlwaysAvailable}');
    expect(skupervisorCheckout).toContain("isAlwaysAvailable ? 'Always available'");
  });

  it('renders Best Seller from the server-owned catalog contract instead of browser storage', () => {
    const checkout = fs.readFileSync(path.resolve(__dirname, '../components/POSCheckoutTerminal.jsx'), 'utf8');
    const workspace = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');
    expect(checkout).toContain('item?.is_best_seller === true');
    expect(checkout).toContain('isBestSeller={isBestSeller}');
    expect(checkout).toContain('flex min-w-0 items-start gap-1.5');
    expect(checkout).toContain('isBestSeller={false}');
    expect(checkout).not.toContain('pos_best_seller_item_ids');
    expect(workspace).toContain('pos_best_seller_settings');
    expect(workspace).toContain('pos-best-seller-auto-tagging');
    expect(workspace).toContain('pos-items-edit-best-seller-mode');
    expect(workspace).toContain('pos_best_seller_mode: editForm.pos_best_seller_mode');
    expect(workspace).toContain('notifyPosCatalogUpdated()');
    expect(checkout).toContain('subscribeToPosCatalogUpdates');
    expect(workspace).not.toContain('pos_best_seller_item_ids');
  });
});
