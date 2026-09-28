import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Food & Beverage frontend contract', () => {
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
    expect(page).toContain('Assigned Tables');
    expect(page).toContain('Duration Minutes');
    expect(page).toContain('Restaurant Service Charge');
    expect(page).not.toContain('Job Order');
    expect(page).not.toContain('Dispatch Order');
  });

  it('keeps live F&B operations in POS Terminal', () => {
    const diningPanel = read('packages/web-core/src/features/fnb/components/FnbDiningPanel.jsx');
    const posPageShell = read('packages/web-core/src/features/pos/pages/PosPageShell.jsx');
    const terminalPage = read('packages/web-core/src/features/pos/pages/TerminalPage.jsx');
    const terminalLayout = read('packages/web-core/src/features/pos/components/TerminalPageLayout.jsx');
    const terminalSidebar = read('packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx');
    expect(diningPanel).toContain('canTransact');
    expect(diningPanel).toContain('transferFnbCheck');
    expect(diningPanel).toContain('splitFnbCheck');
    expect(diningPanel).toContain('mergeFnbChecks');
    expect(diningPanel).toContain('kitchenStatusTransitions');
    expect(posPageShell).toContain('canTransact={canTransactPos}');
    expect(terminalPage).toContain("'fnb_service'");
    expect(terminalPage).toContain('canAccessFnbService');
    expect(terminalPage).toContain('showFnbService={canAccessFnbService}');
    expect(terminalLayout).toContain('FnbDiningPanel');
    expect(terminalLayout).toContain('data-testid="pos-fnb-service-workspace"');
    expect(terminalLayout).toContain('fnbContext={fnbCheckoutContext}');
    expect(terminalSidebar).toContain('pos-nav-fnb-service');
  });

  it('keeps modifier management in standalone POS instead of the SKUpervisor F&B page', () => {
    const fnbPage = read('packages/web-core/src/features/fnb/pages/FnbPage.jsx');
    const posWorkspace = read('packages/web-core/src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(fnbPage).not.toContain('PosFnbModifierManager');
    expect(fnbPage).not.toContain('FnbModifierManager');
    expect(posWorkspace).toContain('PosFnbModifiersWorkspace');
    // The workspace tab was renamed from "Menu modifiers" to "Item Options"
    // (the create-flow stage reads "Menu options"); both live in standalone
    // POS, not the SKUpervisor F&B page.
    expect(posWorkspace).toContain("label: 'Item Options'");
    expect(posWorkspace).toContain("'Menu options'");
  });

  it('attaches F&B check context to POS checkout and receipts', () => {
    const posPageShell = read('packages/web-core/src/features/pos/pages/PosPageShell.jsx');
    const diningPanel = read('packages/web-core/src/features/fnb/components/FnbDiningPanel.jsx');
    const checkoutWorkflow = read('packages/web-core/src/features/pos/hooks/usePosCheckoutWorkflow.js');
    const cartWorkflow = read('packages/web-core/src/features/pos/hooks/usePosCartWorkflow.js');
    const fnbCheckoutCart = read('packages/web-core/src/features/pos/utils/fnbCheckoutCart.js');
    const modifierUtils = read('packages/web-core/src/features/pos/utils/posCheckoutTerminalModifiers.js');
    const checkoutSurfaceContract = read('packages/web-core/src/features/pos/utils/checkoutSurfaceContract.js');
    const receipt = read('packages/web-core/src/features/pos/components/ReceiptPrintView.jsx');

    expect(posPageShell).toContain('FnbDiningPanel');
    expect(diningPanel).toContain('restaurant_service_charge: serviceCharge');
    expect(diningPanel).toContain('fnb_check_lines: Array.isArray(check.lines) ? check.lines : []');
    expect(diningPanel).toContain('fnb_checkout_request_id');
    expect(diningPanel).toContain('has no active items. Add an item before checkout.');
    expect(checkoutWorkflow).toContain('fnbContext: normalizedFnbContext');
    expect(fnbCheckoutCart).toContain('export const buildFnbCheckCartLines');
    expect(checkoutSurfaceContract).toContain('fnb_check_id');
    expect(checkoutWorkflow).toContain('restaurant_service_charge');
    expect(cartWorkflow).toContain('buildKitchenStationSnapshot');
    expect(modifierUtils).toContain('export const buildKitchenStationSnapshot');
    expect(checkoutSurfaceContract).toContain('kitchen_station_id');
    expect(receipt).toContain('F&B Check');
    expect(receipt).toContain('restaurant_service_charge_amount');
  });
});
