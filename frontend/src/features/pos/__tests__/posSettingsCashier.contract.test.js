import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalOperationsWorkspace.jsx'), 'utf8');
const terminalPageSource = fs.readFileSync(path.resolve(__dirname, '../pages/TerminalPage.jsx'), 'utf8');
const sidebarSource = fs.readFileSync(path.resolve(__dirname, '../components/TerminalWorkspaceSidebar.jsx'), 'utf8');

describe('regular POS Setup cashier management contract', () => {
  it('renders cashier management inside each terminal card', () => {
    expect(workspaceSource).toContain('Cashiers created here are automatically bound to the store assigned to this terminal.');
    expect(workspaceSource).toContain('getCashiersForLocation(terminal.location_id)');
    expect(workspaceSource).toContain('cashierEditorTerminalIndex === index');
    expect(workspaceSource).toContain("cashierCreating ? 'Creating Cashier...' : 'Create Cashier'");
  });

  it('inherits exactly one store assignment from the terminal', () => {
    expect(workspaceSource).toContain('await createPosSetupCashier({');
    expect(workspaceSource).toContain('const locationId = toPositiveInt(terminal?.location_id);');
    expect(workspaceSource).toContain('location_ids: [locationId]');
    expect(workspaceSource).toContain('const rows = await fetchPosSetupCashiers();');
    expect(workspaceSource).toContain("resolveUserPermissionList(terminalUser).includes('users:manage')");
  });

  it('lets cashier protected tools reach the POS access PIN gate without an open shift', () => {
    expect(terminalPageSource).toContain("const PIN_PROTECTED_VIEW_MODES = new Set([...SETTINGS_VIEW_MODES, 'reports', 'items']);");
    expect(terminalPageSource).toContain('if (requiresOpenShift && !isSettingsViewMode && !isPinProtectedViewMode && !canAdminBypassShiftPrompt) {');
    expect(terminalPageSource).toContain('await verifyPosSettingsAccessPin(normalizedPin);');
    expect(terminalPageSource).toContain('await hydrateTerminalMeta({ suppressGlobalErrors: true });');
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('reports')}");
    expect(sidebarSource).toContain("onClick={() => onSelectViewMode('items')}");
    expect(sidebarSource).toContain("disabled={locked || onboardingRestricted || !canViewPos}");
    expect(sidebarSource).toContain('Protected by POS access PIN');
  });
});
