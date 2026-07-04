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
    expect(workspaceSource).toContain('Edit Cashier');
    expect(workspaceSource).toContain('Default Branch / Location');
    expect(workspaceSource).toContain('New POS Password');
    expect(workspaceSource).toContain('resetLocalCashierPassword');
    expect(workspaceSource).toContain('updateUserLocationGrants');
    expect(workspaceSource).toContain('Remove');
    expect(workspaceSource).not.toContain('createPosSetupCashier');
  });

  it('loads active cashier authorization profiles after invitation acceptance', () => {
    expect(workspaceSource).toContain('const rows = await fetchPosSetupCashiers();');
    expect(workspaceSource).toContain("resolveUserPermissionList(terminalUser).includes('users:manage')");
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

  it('lets cashier protected tools reach the POS access PIN gate without an open shift', () => {
    expect(terminalPageSource).toContain("const PIN_PROTECTED_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'items']);");
    expect(terminalPageSource).toContain('if (requiresOpenShift && !isSettingsViewMode && !isPinProtectedViewMode && !canAdminBypassShiftPrompt) {');
    expect(terminalPageSource).toContain('await verifyPosSettingsAccessPin(normalizedPin);');
    expect(terminalPageSource).toContain('const hydrateTerminalMeta = useCallback');
    expect(terminalPageSource).toContain('hydrateTerminalMeta({ suppressGlobalErrors: true })');
    expect(terminalPageSource).toContain('setSettingsAccessPinVerified(true);');
    expect(terminalPageSource).toContain('commitViewModeSelection(nextMode);');
    expect(terminalPageSource).toContain('await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('items')}");
    expect(sidebarSource).toContain("disabled={locked || onboardingRestricted || !canViewPos}");
    expect(sidebarSource).toContain('Protected by POS access PIN');
  });

  it('persists and refreshes the access PIN from the terminal registry Save button', () => {
    const registrySaveStart = workspaceSource.indexOf('const persistTerminalRegistry = useCallback');
    const registrySaveEnd = workspaceSource.indexOf('const handleTerminalRegistrySave', registrySaveStart);
    const registrySaveFlow = workspaceSource.slice(registrySaveStart, registrySaveEnd);

    expect(registrySaveFlow).toContain("pos_settings_access_pin: String(posForm.settingsAccessPin || '').trim()");
    expect(registrySaveFlow).toContain('clear_pos_settings_access_pin: posForm.clearSettingsAccessPin === true');
    expect(registrySaveFlow).toContain('terminalUser?.is_master_admin === true');
    expect(registrySaveFlow).toContain('hydrateSettingsWorkspace()');
    expect(workspaceSource).toContain('Terminal registry and access PIN settings saved.');
  });
});
