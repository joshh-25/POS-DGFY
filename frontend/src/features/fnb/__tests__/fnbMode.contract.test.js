import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Food & Beverage frontend contract', () => {
  it('registers the IMS route and navigation behind the F&B workflow capability', () => {
    const main = read('frontend/src/main.jsx');
    const layout = read('frontend/Layout.jsx');

    expect(main).toContain("path=\"/fnb\"");
    expect(main).toContain('requiredCapability="fnbDining"');
    expect(layout).toContain("name: 'Food & Beverage'");
    expect(layout).toContain("page: 'Fnb'");
  });

  it('exposes F&B APIs for menu, tables, checks, kitchen, reservations, and service charge settings', () => {
    const api = read('frontend/src/features/fnb/api/fnbApi.js');

    expect(api).toContain('/fnb/modifier-groups');
    expect(api).toContain('/fnb/dining-areas');
    expect(api).toContain('/fnb/checks');
    expect(api).toContain('/fnb/kitchen-tickets/');
    expect(api).toContain('/fnb/reservations');
    expect(api).toContain('/fnb/service-charge-settings');
  });

  it('keeps the F&B console restaurant-native rather than manufacturing-native', () => {
    const page = read('frontend/src/features/fnb/pages/FnbPage.jsx');

    expect(page).toContain('Tables');
    expect(page).toContain('Kitchen');
    expect(page).toContain('Modifier Groups');
    expect(page).toContain('Reservation Schedule');
    expect(page).toContain('Select item');
    expect(page).toContain('Split Lines');
    expect(page).toContain('Assigned Tables');
    expect(page).toContain('Duration Minutes');
    expect(page).toContain('Restaurant Service Charge');
    expect(page).not.toContain('Job Order');
    expect(page).not.toContain('Dispatch Order');
  });

  it('attaches F&B check context to POS checkout and receipts', () => {
    const posPage = read('frontend/src/features/pos/pages/PosPageShell.jsx');
    const diningPanel = read('frontend/src/features/fnb/components/FnbDiningPanel.jsx');
    const terminal = read('frontend/src/features/pos/components/POSCheckoutTerminal.jsx');
    const historyPanel = read('frontend/src/features/pos/components/POSTransactionHistoryPanel.jsx');
    const receipt = read('frontend/src/features/pos/components/ReceiptPrintView.jsx');

    expect(posPage).toContain('FnbDiningPanel');
    expect(diningPanel).toContain('restaurant_service_charge: serviceCharge');
    expect(terminal).toContain('fnbContext: normalizedFnbContext');
    expect(terminal).toContain('fnb_check_id');
    expect(terminal).toContain('restaurant_service_charge');
    expect(terminal).toContain('buildKitchenStationSnapshot');
    expect(terminal).toContain('kitchen_station_id');
    expect(historyPanel).toContain('Restaurant Charge');
    expect(receipt).toContain('F&B Check');
    expect(receipt).toContain('restaurant_service_charge_amount');
  });
});
