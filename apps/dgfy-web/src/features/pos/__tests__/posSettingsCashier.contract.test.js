import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');
const tenantSetupModalSource = fs.readFileSync(path.resolve(__dirname, '../components/PosTenantSetupModal.jsx'), 'utf8');

describe('regular POS Setup cashier management contract', () => {
  it('renders DGFY cashier invitation management inside terminal settings', () => {
    expect(workspaceSource).toContain('Cashiers are invited through DGFY');
    expect(workspaceSource).toContain('getCashiersForLocation(terminal.location_id)');
    expect(workspaceSource).toContain('fixedRole="cashier"');
    expect(workspaceSource).toContain('locationOptions={locations}');
    expect(workspaceSource).toContain('Invite DGFY Cashier');
    expect(workspaceSource).not.toContain('createPosSetupCashier');
  });

  it('loads active cashier authorization profiles after invitation acceptance', () => {
    expect(workspaceSource).toContain('const rows = await fetchPosSetupCashiers();');
    expect(workspaceSource).toContain("resolveUserPermissionList(terminalUser).includes('users:manage')");
  });

  it('keeps cashier POS void authorization inside POS Settings and preserves other permissions', () => {
    expect(workspaceSource).toContain('Cashier Void and Cash Authorization');
    expect(workspaceSource).toContain('data-testid="pos-cashier-void-authorization"');
    expect(workspaceSource).toContain('data-testid={`pos-cashier-void-toggle-${cashier.user_id}`}');
    expect(workspaceSource).toContain("cashierPermissions.includes('pos:void')");
    expect(workspaceSource).toContain("Array.from(new Set([...permissions, 'pos:void']))");
    expect(workspaceSource).toContain("permissions.filter((permission) => permission !== 'pos:void')");
    expect(workspaceSource).toContain('const updated = await updateUserPermissions(userId, nextPermissions);');
    expect(workspaceSource).toContain('activeCashierUsers.map((cashier) =>');
    expect(workspaceSource).toContain('const [cashiersLoaded, setCashiersLoaded] = useState(false);');
    expect(workspaceSource).toContain('Loading active cashier accounts...');
    expect(workspaceSource).toContain("role !== 'cashier'");
    expect(workspaceSource).not.toContain('Skupervisor');
  });

  it('keeps physical cash authority separate and configurable inside POS Settings', () => {
    expect(workspaceSource).toContain('Can refund cash / adjust drawer');
    expect(workspaceSource).toContain('data-testid={`pos-cashier-drawer-toggle-${cashier.user_id}`}');
    expect(workspaceSource).toContain("cashierPermissions.includes('pos:cash_drawer_adjust')");
    expect(workspaceSource).toContain("Array.from(new Set([...permissions, 'pos:cash_drawer_adjust']))");
    expect(workspaceSource).toContain("permissions.filter((permission) => permission !== 'pos:cash_drawer_adjust')");
    expect(workspaceSource).toContain('updateCashierDrawerAccess(cashier, !hasDrawerAccess)');
  });

  it('keeps POS onboarding primary location control aligned with IMS settings', () => {
    expect(tenantSetupModalSource).toContain("import { Switch } from '@/components/ui/switch';");
    expect(tenantSetupModalSource).toContain('Primary Business Location');
    expect(tenantSetupModalSource).toContain('onCheckedChange={(checked) => setLocationDraft');
    expect(tenantSetupModalSource).toContain('{ defaultPrimary: primaryLocation == null }');
    const primaryLocationControlStart = tenantSetupModalSource.indexOf('Primary Business Location');
    const primaryLocationControlEnd = tenantSetupModalSource.indexOf('<React.Suspense', primaryLocationControlStart);
    const primaryLocationControl = tenantSetupModalSource.slice(primaryLocationControlStart, primaryLocationControlEnd);
    expect(primaryLocationControl).not.toContain('disabled={normalizedLocations.length === 0}');
  });

  it('keeps cashier provisioning out of POS onboarding while preserving authorization readiness', () => {
    expect(tenantSetupModalSource).not.toContain('Cashier Gmail');
    expect(tenantSetupModalSource).not.toContain('Cashier Password');
    expect(tenantSetupModalSource).not.toContain('provisionCashierFromGmail');
    expect(tenantSetupModalSource).not.toContain('Invite DGFY Cashier');
    expect(tenantSetupModalSource).toContain('Cashier invitations and location permissions are managed from POS Settings.');
    expect(tenantSetupModalSource).toContain('active cashier or company master admin');
    expect(tenantSetupModalSource).toContain('Select a store for each active terminal before saving.');
    expect(tenantSetupModalSource).toContain('terminalSaveFeedback');
    expect(tenantSetupModalSource).toContain('terminalFieldErrors');
  });

  it('places business hours before the location editor and persists the shared storefront setting', () => {
    expect(tenantSetupModalSource).toContain('StorefrontBusinessHoursScheduler');
    expect(tenantSetupModalSource).toContain('Save Business Hours');
    expect(tenantSetupModalSource).toContain('storefront_hours: serializeStorefrontBusinessHours(storefrontHours)');
    expect(tenantSetupModalSource).toContain('onKeyDown={handleDialogKeyDown}');
    expect(tenantSetupModalSource.indexOf('Business Hours')).toBeLessThan(tenantSetupModalSource.indexOf('Business Location'));
    expect(tenantSetupModalSource).not.toContain('STARTER_ITEM');
    expect(tenantSetupModalSource).not.toContain('starterItemRequirements');
  });

  it('keeps onboarding open until Finish Setup instead of allowing early dismissal', () => {
    expect(tenantSetupModalSource).toContain('<Dialog open={open} onOpenChange={() => {}}>');
    expect(tenantSetupModalSource).toContain('onEscapeKeyDown={(event) => event.preventDefault()}');
    expect(tenantSetupModalSource).toContain('onInteractOutside={(event) => event.preventDefault()}');
    expect(tenantSetupModalSource).toContain('Finish all required steps, then click');
    expect(tenantSetupModalSource).not.toContain('onSkip');
  });

  it('lets cashier protected tools reach the POS access PIN gate without an open shift', () => {
    expect(terminalPageSource).toContain("const SHIFT_EXEMPT_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'audit', 'items', 'services', 'history']);");
    expect(terminalPageSource).toContain("const PIN_PROTECTED_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'items']);");
    expect(terminalPageSource).toContain('if (requiresOpenShift && !isSettingsViewMode && !isShiftExemptViewMode && !canAdminBypassShiftPrompt) {');
    expect(terminalPageSource).toContain('await verifyPosSettingsAccessPin(normalizedPin);');
    expect(terminalPageSource).toContain('const hydrateTerminalMeta = useCallback');
    expect(terminalPageSource).toContain('hydrateTerminalMeta({ suppressGlobalErrors: true })');
    expect(terminalPageSource).toContain('setSettingsAccessPinVerified(true);');
    expect(terminalPageSource).toContain('commitViewModeSelection(nextMode);');
    expect(terminalPageSource).toContain('await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('items')}");
    expect(sidebarSource).toContain("disabled={locked || onboardingRestricted || !canViewPos}");
    expect(sidebarSource).toContain('Daily totals, popular items, and transactions');
  });
});
