import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Food & Beverage frontend contract', () => {
  it('registers the IMS route and navigation behind the F&B workflow capability', () => {
    const main = read('apps/dgfy-ims/src/main.jsx');
    const layout = read('apps/dgfy-ims/Layout.jsx');

    expect(main).toContain("path=\"/fnb\"");
    expect(main).toContain('requiredCapability="fnbDining"');
    expect(layout).toContain("name: 'Food & Beverage'");
    expect(layout).toContain("page: 'Fnb'");
  });

  it('exposes F&B APIs for menu, tables, checks, kitchen, reservations, and service charge settings', () => {
    const api = read('packages/web-core/src/features/fnb/api/fnbApi.js');

    expect(api).toContain('/fnb/modifier-groups');
    expect(api).toContain('updateFnbModifierGroup');
    expect(api).toContain('/fnb/dining-areas');
    expect(api).toContain('/fnb/checks');
    expect(api).toContain('/fnb/kitchen-tickets/');
    expect(api).toContain('/fnb/reservations');
    expect(api).toContain('/fnb/service-charge-settings');
  });

  it('keeps the F&B console restaurant-native rather than manufacturing-native', () => {
    const page = read('packages/web-core/src/features/fnb/pages/FnbPage.jsx');

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

  it('keeps modifier management in standalone POS instead of the SKUpervisor F&B page', () => {
    const fnbPage = read('packages/web-core/src/features/fnb/pages/FnbPage.jsx');
    const posWorkspace = read('packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(fnbPage).not.toContain('PosFnbModifierManager');
    expect(fnbPage).not.toContain('FnbModifierManager');
    expect(posWorkspace).toContain('PosFnbModifiersWorkspace');
    expect(posWorkspace).toContain("label: 'Menu modifiers'");
  });

  it('attaches F&B check context to POS checkout and receipts', () => {
    const posPageShell = read('packages/web-core/src/features/pos/pages/PosPageShell.jsx');
    const diningPanel = read('packages/web-core/src/features/fnb/components/FnbDiningPanel.jsx');
    const checkoutWorkflow = read('packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js');
    const cartWorkflow = read('packages/web-core/src/features/pos/hooks/usePosCartWorkflow.js');
    const modifierUtils = read('packages/web-core/src/features/pos/utils/posCheckoutTerminalModifiers.js');
    const checkoutSurfaceContract = read('packages/web-core/src/features/pos/utils/checkoutSurfaceContract.js');
    const receipt = read('packages/web-core/src/features/pos/components/ReceiptPrintView.jsx');

    expect(posPageShell).toContain('FnbDiningPanel');
    expect(diningPanel).toContain('restaurant_service_charge: serviceCharge');
    expect(checkoutWorkflow).toContain('fnbContext: normalizedFnbContext');
    expect(checkoutSurfaceContract).toContain('fnb_check_id');
    expect(checkoutWorkflow).toContain('restaurant_service_charge');
    expect(cartWorkflow).toContain('buildKitchenStationSnapshot');
    expect(modifierUtils).toContain('export const buildKitchenStationSnapshot');
    expect(checkoutSurfaceContract).toContain('kitchen_station_id');
    expect(receipt).toContain('F&B Check');
    expect(receipt).toContain('restaurant_service_charge_amount');
  });
});
