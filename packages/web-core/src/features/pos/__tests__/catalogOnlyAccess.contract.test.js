import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

describe('POS catalog-only onboarding access contract', () => {
  it('opens catalog-only tenants directly to catalog management', () => {
    const terminalPage = read('../pages/TerminalPage.jsx');
    const sidebar = read('../components/TerminalWorkspaceSidebar.jsx');

    expect(terminalPage).toContain('const catalogOnlyAccess = !tenantPosEnabled;');
    expect(terminalPage).toContain(
      "const CATALOG_ONLY_ALLOWED_VIEW_MODES = new Set(['items', 'settings_profile', 'settings_pos', 'settings_storefront']);"
    );
    expect(terminalPage).toContain('const tenantSetupRequestedOrRequired = !setupFlowState.onboardingCompleted');
    expect(terminalPage).toContain('&& !catalogOnlyAccess');
    expect(terminalPage).toContain('if (catalogOnlyAccess) {');
    expect(terminalPage).toContain('const tenantHintMatched = Boolean(requestedCompany);');
    expect(terminalPage).toContain('if (!continuingAfterCompanyPicker && !tenantHintMatched) {');
    expect(terminalPage).toContain("selectedTenantSession?.tenant_capabilities?.pos_enabled === false");
    expect(terminalPage).toContain('const selectedTenantCatalogOnly = (');
    expect(terminalPage).toContain("activateDgfyTenantSession(selectedTenantSession, { emitAuthEvent: false });");
    expect(terminalPage).toContain('if (selectedTenantSetupState.tenantPosEnabled === false) {');
    expect(terminalPage).toContain("setPosViewMode('items');");
    expect(terminalPage).toContain("toast.success('Catalog-only access opened. Add items and categories.');");
    expect(terminalPage).toContain('const catalogOnlyCanOpenMode = nextMode === \'items\'');
    expect(terminalPage).toContain('if (catalogOnlyAccess && !catalogOnlyCanOpenMode) {');
    expect(terminalPage).toContain('if (setupFlowActive && CATALOG_ONLY_ALLOWED_VIEW_MODES.has(posViewMode)) return;');

    const itemsWorkspace = read('../components/PosItemsWorkspace.jsx');
    const itemsCatalogWorkspace = read('../components/PosItemsCatalogWorkspace.jsx');
    expect(itemsCatalogWorkspace).toContain('const effectiveCanViewItems = canViewItems == null ? canViewPos : canViewItems;');
    expect(itemsCatalogWorkspace).toContain('const canViewCatalog = effectiveCanViewItems || catalogOnlyAccess;');
    expect(itemsWorkspace).toContain('catalogOnlyAccess: postCreateCatalogOnlyAccess = false');
    expect(itemsWorkspace).toContain('if (postCreateCatalogOnlyAccess) {');
    expect(itemsWorkspace).toContain("scope: catalogOnlyAccess ? 'inventory' : 'pos'");
    expect(itemsWorkspace).toContain('if (!catalogOnlyAccess) {');
    expect(itemsWorkspace).toContain('catalogOnlyAccess = false');

    expect(sidebar).toContain("label={posNavLabel('onboarding', 'Onboarding')}");
    expect(sidebar).toContain('testId="pos-nav-onboarding"');
    expect(sidebar).toContain('disabled={locked || !canAccessItemsWorkspace}');
    expect(sidebar).toContain('POS onboarding will be available after DGFY Admin enables POS');
    expect(sidebar).toContain('DGFY Admin must enable POS before this page is available');
  });
});
