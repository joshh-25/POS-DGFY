import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../../..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('Food & Beverage frontend contract', () => {
  it('owns the F&B workspace in POS Back Office and retires the IMS merchant route', () => {
    const main = read('apps/dgfy-ims/src/main.jsx');
    const posMain = read('apps/dgfy-pos/src/main.jsx');
    const businessAdmin = read('apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx');
    const businessAdminManifest = read('apps/dgfy-pos/src/features/businessAdmin/businessAdminManifest.js');

    expect(main).toContain('<Route path="/fnb" element={<LegacyMerchantRoute target="/backoffice/fnb" title="Food-and-beverage workspace moved" />} />');
    expect(posMain).toContain('<Route path="/backoffice/*" element={<BackOfficeRouteGuard />} />');
    expect(businessAdmin).toContain('MIGRATED_BACKOFFICE_MODULE_KEYS');
    expect(businessAdmin).toContain('MigratedBackOfficeModule');
    expect(businessAdminManifest).toContain("fnb: module('Operations', 'fnb', 'F&B Setup'");
    expect(businessAdminManifest).toContain('MERCHANT_BACKOFFICE_MODULE_META');
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
    expect(page).toContain('Assigned Tables');
    expect(page).toContain('Duration Minutes');
    expect(page).toContain('Restaurant Service Charge');
    expect(page).not.toContain('Job Order');
    expect(page).not.toContain('Dispatch Order');
  });

  it('keeps live F&B operations in POS Terminal instead of Back Office', () => {
    const backOfficePage = read('packages/web-core/src/features/fnb/pages/FnbPage.jsx');
    const diningPanel = read('packages/web-core/src/features/fnb/components/FnbDiningPanel.jsx');
    const posPageShell = read('packages/web-core/src/features/pos/pages/PosPageShell.jsx');
    const terminalPage = read('packages/web-core/src/features/pos/pages/TerminalPage.jsx');
    const terminalLayout = read('packages/web-core/src/features/pos/components/TerminalPageLayout.jsx');
    const terminalSidebar = read('packages/web-core/src/features/pos/components/TerminalWorkspaceSidebar.jsx');
    const wrapper = read('apps/dgfy-pos/src/features/businessAdmin/MigratedBackOfficeModule.jsx');
    const businessAdminManifest = read('apps/dgfy-pos/src/features/businessAdmin/businessAdminManifest.js');

    expect(backOfficePage).toContain('Setup &amp; monitoring only');
    expect(backOfficePage).toContain('data-testid="fnb-checks-read-only"');
    expect(backOfficePage).toContain('data-testid="fnb-kitchen-read-only"');
    expect(backOfficePage).not.toContain('updateFnbCheckStatus');
    expect(backOfficePage).not.toContain('transferFnbCheck');
    expect(backOfficePage).not.toContain('splitFnbCheck');
    expect(backOfficePage).not.toContain('mergeFnbChecks');
    expect(backOfficePage).not.toContain('updateFnbKitchenTicketStatus');
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
    expect(businessAdminManifest).toContain("fnb: module('Operations', 'fnb', 'F&B Setup'");
  });

  it('keeps the embedded F&B workspace concise and scannable', () => {
    const page = read('packages/web-core/src/features/fnb/pages/FnbPage.jsx');
    const wrapper = read('apps/dgfy-pos/src/features/businessAdmin/MigratedBackOfficeModule.jsx');
    const businessAdminCss = read('apps/dgfy-pos/src/features/businessAdmin/businessAdmin.css');

    expect(page).toContain('embedded = false');
    expect(page).toContain('business-admin-fnb-workspace');
    expect(page).toContain('Service at a glance');
    expect(page).toContain('business-admin-fnb-summary');
    expect(page).toContain('business-admin-fnb-tabs-scroll');
    expect(page).toContain('role="tab"');
    expect(page).toContain('aria-selected={active}');
    expect(page).toContain('Tables</h2>');
    expect(wrapper).toContain("const isFnb = section === 'fnb';");
    expect(wrapper).toContain('!isCatalog && !isFnb');
    expect(wrapper).toContain('isCatalog || isFnb || isSales ? <Module embedded />');
    expect(businessAdminCss).toContain('.business-admin-fnb-overview');
    expect(businessAdminCss).toContain('.business-admin-fnb-summary');
    expect(businessAdminCss).toContain('.business-admin-fnb-tab {');
    expect(businessAdminCss).toContain('.business-admin-fnb-tab-panel');
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
