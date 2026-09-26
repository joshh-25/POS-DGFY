// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalLockDrawer from '../components/TerminalLockDrawer.jsx';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const terminalPageSource = readSource('../pages/TerminalPage.jsx');
const terminalPageLayoutSource = readSource('../components/TerminalPageLayout.jsx');
const terminalPageDialogLayerSource = readSource('../components/TerminalPageDialogLayer.jsx');
const terminalLockDrawerSource = readSource('../components/TerminalLockDrawer.jsx');
const terminalWorkspaceSidebarSource = readSource('../components/TerminalWorkspaceSidebar.jsx');
const terminalOperationsWorkspaceSource = readSource('../components/TerminalOperationsWorkspace.jsx');
const settingsWorkspaceSource = readSource('../settings/PosSettingsWorkspace.jsx');
const terminalLocalControlsSource = readSource('../settings/TerminalLocalControlsSection.jsx');
const businessAdminPageSource = readSource('../../../../../../apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx');
const posRouteSource = readSource('../../../../../../apps/dgfy-pos/src/main.jsx');

const renderSidebar = ({ terminalUser = { role: 'admin' }, canAccessBusinessAdmin = true, canAccessPosOnlySetup = false, currentViewMode = 'checkout', isCollapsed = false, locked = false, onOpenBackOffice = vi.fn(), onSelectViewMode = vi.fn() } = {}) => render(
  <TerminalWorkspaceSidebar
    locked={locked}
    isOnline
    isCollapsed={isCollapsed}
    terminalUser={terminalUser}
    currentViewMode={currentViewMode}
    canAccessBusinessAdmin={canAccessBusinessAdmin}
    canAccessPosOnlySetup={canAccessPosOnlySetup}
    canViewPos
    shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
    onSelectViewMode={onSelectViewMode}
    onOpenBackOffice={onOpenBackOffice}
  />
);

afterEach(() => {
  cleanup();
});

describe('POS Back Office navigation', () => {
  it('renders the Back Office button and invokes its navigation callback', () => {
    const onOpenBackOffice = vi.fn();
    renderSidebar({ onOpenBackOffice });

    const button = screen.getByTestId('pos-nav-backoffice');
    expect(button).toBeDefined();
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);
  });

  it('renders the same navigation affordance in the collapsed/mobile sidebar state', () => {
    renderSidebar({ isCollapsed: true });

    const button = screen.getByTestId('pos-nav-backoffice');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toBe('Back Office');
  });

  it('keeps Back Office available for an authorized manager while checkout is locked', () => {
    const onOpenBackOffice = vi.fn();
    renderSidebar({ locked: true, onOpenBackOffice });

    const button = screen.getByTestId('pos-nav-backoffice');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toContain('Manager access remains available while checkout is locked');

    fireEvent.click(button);
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);
  });

  it('keeps the manager entry available from the full lock drawer', () => {
    const onOpenBackOffice = vi.fn();
    render(
      <TerminalLockDrawer
        drawerOpen
        terminalUser={{ role: 'admin', email: 'admin@example.com' }}
        canAccessBusinessAdmin
        onOpenBackOffice={onOpenBackOffice}
        formData={{ email: '', password: '', rememberDevice: false, dgfyTenantId: '', terminalId: '' }}
        dgfyPosState={{}}
        emailCompanyLookup={{}}
        submitting={false}
        posTextSize="normal"
        onPosTextSizeChange={vi.fn()}
        onSubmit={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('pos-lock-drawer-open-backoffice'));
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);
  });

  it('does not render Back Office for a cashier even if the caller passes access', () => {
    renderSidebar({ terminalUser: { role: 'cashier' }, canAccessBusinessAdmin: true });

    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
  });

  it('keeps POS-only terminal setup available to a cashier without Business Admin', () => {
    const onSelectViewMode = vi.fn();
    renderSidebar({
      terminalUser: { role: 'cashier' },
      canAccessBusinessAdmin: false,
      canAccessPosOnlySetup: true,
      onSelectViewMode
    });

    expect(screen.getByTestId('pos-nav-pos-setup')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
    fireEvent.click(screen.getByTestId('pos-nav-pos-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('highlights only Terminal Setup when the terminal setup view is open', () => {
    renderSidebar({ currentViewMode: 'terminal_setup' });

    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    expect(screen.getByTestId('pos-nav-terminal-setup').className).toContain('bg-[#1A4E8D]');
  });

  it('keeps one Back Office entry and Terminal Setup in POS for administrators', () => {
    const onOpenBackOffice = vi.fn();
    const onSelectViewMode = vi.fn();
    render(
      <TerminalWorkspaceSidebar
        locked={false}
        isOnline
        terminalUser={{ role: 'admin' }}
        currentViewMode="checkout"
        canAccessBusinessAdmin
        canViewPos
        shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
        onSelectViewMode={onSelectViewMode}
        onOpenBackOffice={onOpenBackOffice}
      />
    );

    fireEvent.click(screen.getByTestId('pos-nav-backoffice'));
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('pos-nav-backoffice-settings')).toBeNull();

    fireEvent.click(screen.getByTestId('pos-nav-terminal-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('renders one POS setup entry when terminal configuration is allowed without Back Office', () => {
    const onSelectViewMode = vi.fn();
    renderSidebar({ canAccessBusinessAdmin: false, canAccessPosOnlySetup: true, onSelectViewMode });

    expect(screen.getByTestId('pos-nav-pos-setup')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();

    fireEvent.click(screen.getByTestId('pos-nav-pos-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('hides both Back Office and POS setup when the operator has no configuration capability', () => {
    renderSidebar({ canAccessBusinessAdmin: false, canAccessPosOnlySetup: false });

    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
    expect(screen.queryByTestId('pos-nav-pos-setup')).toBeNull();
    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
  });

  it('keeps the access predicate, confirmation dialog, and separate-page URL aligned with the Back Office contract', () => {
    expect(terminalPageSource).toContain('const canAccessBusinessAdmin = !isCashierRole && (');
    expect(terminalPageSource).toContain("|| normalizedTerminalRole === 'admin'");
    expect(terminalPageSource).toContain("|| hasPermission('business_admin:access')");
    expect(terminalPageSource).toContain('setBackOfficeConfirmOpen(true)');
    expect(terminalPageSource).toContain('const buildPosBackOfficeHandoffPath = useCallback((path) => {');
    expect(terminalPageSource).toContain("params.set('pos_handoff', '1')");
    expect(terminalPageSource).toContain("url.search = '?view=reports'");
    expect(terminalPageSource).toContain('url.hash = `#${handoffPath}`');
    expect(terminalPageSource).toContain("setBackOfficeTargetPath(safePath)");
    expect(terminalPageSource).toContain("const requestedPath = typeof target === 'string' ? target : target?.path;");
    expect(terminalPageSource).toContain("params.set('branch_id', String(activeBranchId))");
    expect(terminalPageSource).toContain("const canAccessPosOnlySetup = !canAccessBusinessAdmin && canViewPos;");
    expect(terminalPageSource).toContain('const isAuthorizedPosOnlyTerminalSetup = nextMode === \'terminal_setup\' && canAccessPosOnlySetup;');
    expect(terminalPageSource).toContain(": 'terminal_setup'");
    expect(terminalPageSource).toContain("subscribeToBusinessAdminSettingsUpdates");
    expect(terminalPageSource).toContain("if (!activeTenantId || typeof window === 'undefined') return undefined;");
    expect(terminalPageSource).toContain('|| formData.dgfyTenantId');
    expect(terminalPageSource).toContain('terminalRegistryLookup.get(sanitizeTerminalId(activeTerminalId))?.location_id');
    expect(terminalPageSource).toContain('allowWhileLocked: true');
    expect(terminalPageSource).toContain('if (!locked && canViewPos)');
    expect(terminalPageSource).toContain('refreshTenantLocations({');
    expect(terminalPageSource).toContain('silent: true');
    expect(terminalPageSource).toContain("if (!terminalUser || !apiReachable || !canAccessBusinessAdmin) return;");
    expect(terminalPageSource).toContain("const openedWindow = window.open('', '_blank');");
    expect(terminalPageSource).toContain('openedWindow.opener = null;');
    expect(terminalPageSource).toContain('openedWindow.location.replace(url.toString());');
    expect(terminalPageSource).toContain('Your browser blocked the Back Office window.');
    expect(terminalPageSource).not.toContain("navigate('/backoffice')");
    expect(terminalPageSource).not.toContain('window.confirm');
    expect(terminalPageDialogLayerSource).toContain('Back Office will open in a new window at Overview. Continue?');
    expect(terminalPageDialogLayerSource).toContain('Open Back Office');
    expect(terminalPageDialogLayerSource).toContain('data-testid="pos-unlock-open-backoffice"');
    expect(terminalPageDialogLayerSource).toContain('data-testid="pos-shift-opening-open-backoffice"');
    expect(terminalPageDialogLayerSource).toContain('canAccessBusinessAdmin && terminalUser && handleOpenBackOffice');
    expect(terminalLockDrawerSource).toContain('data-testid="pos-lock-drawer-open-backoffice"');
    expect(terminalLockDrawerSource).toContain('Open Back Office without unlocking checkout or starting a cashier shift.');
    expect(posRouteSource).toContain('<Route path="/backoffice/login" element={<BackOfficeLoginPage />} />');
    expect(posRouteSource).toContain('<Route path="/backoffice/*" element={<BackOfficeRouteGuard />} />');
    expect(terminalPageLayoutSource).toContain('const lockedSidebarSurfaceClassName = locked');
    expect(terminalPageLayoutSource).toContain('disabled={locked && !canAccessBusinessAdmin}');
    expect(terminalPageLayoutSource).toContain('className={`${workspaceContentClassName} ${lockedSurfaceClassName}`}');
    expect(terminalPageLayoutSource).toContain('pointer-events-none fixed inset-0 z-40 bg-slate-950/70 backdrop-blur-none');
    expect(terminalPageLayoutSource).toContain('onOpenBackOffice={onOpenBackOffice}');
    expect(terminalPageLayoutSource.match(/canAccessBusinessAdmin=\{canAccessBusinessAdmin\}/g)).toHaveLength(3);
    expect(terminalPageLayoutSource.match(/onOpenBackOffice=\{onOpenBackOffice\}/g)).toHaveLength(3);
    expect(terminalOperationsWorkspaceSource).toContain("allowedTabIds={['pos_setup']}");
    expect(settingsWorkspaceSource).toContain('const showSettingsTabNavigation = visibleSettingsTabs.length > 1;');
    expect(settingsWorkspaceSource).toContain('{showSettingsTabNavigation ? (');
    expect(terminalOperationsWorkspaceSource).toContain("editorSection=\"terminal_setup\"");
    expect(terminalOperationsWorkspaceSource).toContain('const showTerminalOnlyControlsPane = showTerminalOnlyControls');
    expect(settingsWorkspaceSource).toContain("(editorSection === 'terminal_setup' || editorSection === 'registers')");
    const terminalSetupStart = terminalOperationsWorkspaceSource.indexOf("case 'terminal_setup':");
    const shiftControlsStart = terminalOperationsWorkspaceSource.indexOf("case 'shift_controls':", terminalSetupStart);
    const terminalSetupSection = terminalOperationsWorkspaceSource.slice(terminalSetupStart, shiftControlsStart);
    expect(terminalSetupStart).toBeGreaterThanOrEqual(0);
    expect(shiftControlsStart).toBeGreaterThan(terminalSetupStart);
    expect(terminalSetupSection).toContain("editorSection=\"terminal_setup\"");
    expect(terminalSetupSection).not.toContain("editorSection=\"registers\"");
    expect(settingsWorkspaceSource).toContain("editorSection === 'registers'");
    expect(terminalLocalControlsSource).toContain('TerminalQueueScopeField');
    expect(terminalLocalControlsSource).toContain('TerminalSoundField');
    expect(terminalOperationsWorkspaceSource).toContain('Manage terminal registry, branch binding, queue scope, and local device preferences.');
    expect(terminalOperationsWorkspaceSource).toContain("title: 'Terminal Setup'");
    expect(terminalWorkspaceSidebarSource).toContain('Queue scope and local sound; device, printer, and terminal controls');
    expect(terminalWorkspaceSidebarSource).toContain('testId="pos-nav-pos-setup"');
    expect(terminalWorkspaceSidebarSource).toContain('canAccessPosOnlySetup');
    expect(terminalWorkspaceSidebarSource).not.toContain("onClick={() => onOpenBackOffice('/backoffice/settings/profile')}");
    expect(businessAdminPageSource).toContain("publishBusinessAdminSettingsUpdated");
    expect(businessAdminPageSource).toContain("new URLSearchParams(location.search).get('branch_id')");
    expect(businessAdminPageSource).toContain('const handleSettingsBranchChange = useCallback');
    expect(businessAdminPageSource).toContain("searchParams.set('branch_id', normalizedBranchId)");
    expect(businessAdminPageSource).toContain("searchParams.delete('branch_id')");
    expect(businessAdminPageSource).toContain('navigate({');
    expect(businessAdminPageSource).toContain('}, { replace: true });');
    expect(businessAdminPageSource).toContain('const bootstrapRequestRef = useRef(0);');
    expect(businessAdminPageSource).toContain('if (bootstrapRequestRef.current !== requestId) return;');
    expect(businessAdminPageSource).toContain('const [bootstrapAccessDenied, setBootstrapAccessDenied] = useState(false);');
    expect(businessAdminPageSource).toContain('const sessionRequired = status === 401 || status === 419;');
    expect(businessAdminPageSource).toContain('setBootstrapAuthRequired(sessionRequired)');
    expect(businessAdminPageSource).toContain('setBootstrapAccessDenied(status === 403)');
    expect(businessAdminPageSource).toContain("window.addEventListener('auth:session-expired', handleSessionInvalidation)");
    expect(businessAdminPageSource).toContain("window.addEventListener('auth:session-cleared', handleSessionInvalidation)");
    expect(businessAdminPageSource).toContain("window.addEventListener('auth:logout', handleSessionInvalidation)");
    expect(businessAdminPageSource).toContain("window.addEventListener('auth:tenant-switched', handleTenantSwitch)");
    expect(businessAdminPageSource).toContain('Back Office sign-in required');
    expect(businessAdminPageSource).toContain('Back Office access denied');
    expect(businessAdminPageSource).toContain("bootstrapAuthRequired ? 'business-admin-session-required'");
    expect(businessAdminPageSource).toContain("bootstrapAccessDenied ? 'business-admin-access-denied'");
    expect(businessAdminPageSource).toContain('Open Back Office sign-in');
    expect(businessAdminPageSource).toContain('const handleBusinessAdminRefresh = useCallback');
    expect(businessAdminPageSource).toContain("window.confirm('You have unsaved settings changes. Refresh and discard them?')");
    expect(businessAdminPageSource).toContain("onSettingsSaved={notifySettingsSaved}");
    expect(businessAdminPageSource).toContain('Manage users &amp; roles');
    expect(businessAdminPageSource).toContain('F&amp;B Admin');
    expect(businessAdminPageSource).toContain('Restaurant Manager');
    expect(businessAdminPageSource).toContain('getBusinessAdminWorkflowPageName');
    expect(businessAdminPageSource).toContain('isBusinessAdminWorkflowSectionVisible');
    expect(businessAdminPageSource).toContain('workflowVisibilityReady');
    expect(businessAdminPageSource).toContain('Navigate to={`${rootPath}/overview`} replace');
    expect(businessAdminPageSource).toContain('showTerminalOnlyControls={false}');
    expect(businessAdminPageSource).toContain('editorSection={definition?.key}');
    expect(businessAdminPageSource).toContain('settingsRefreshKey={settingsRefreshKey}');
    expect(businessAdminPageSource).toContain('settingsRefreshKey={reloadNonce}');
    expect(businessAdminPageSource).toContain('key={`${definition.key}-${settingsRefreshKey}`}');
    expect(businessAdminPageSource).toContain("buildPosSettingsOwnerPath('terminal_setup')");
    expect(businessAdminPageSource).toContain('Open POS terminal controls');
  });
});
