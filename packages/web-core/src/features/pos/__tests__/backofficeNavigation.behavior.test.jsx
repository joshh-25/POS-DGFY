// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import TerminalWorkspaceSidebar from '../components/TerminalWorkspaceSidebar.jsx';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const readSource = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
const terminalPageSource = readSource('../pages/TerminalPage.jsx');
const terminalPageLayoutSource = readSource('../components/TerminalPageLayout.jsx');
const terminalPageDialogLayerSource = readSource('../components/TerminalPageDialogLayer.jsx');
const terminalOperationsWorkspaceSource = readSource('../components/TerminalOperationsWorkspace.jsx');
const businessAdminPageSource = readSource('../../../../../../apps/dgfy-pos/src/features/businessAdmin/BusinessAdminPage.jsx');
const posRouteSource = readSource('../../../../../../apps/dgfy-pos/src/main.jsx');

const renderSidebar = ({ terminalUser = { role: 'admin' }, canAccessBusinessAdmin = true, currentViewMode = 'checkout', isCollapsed = false, locked = false, onOpenBackOffice = vi.fn() } = {}) => render(
  <TerminalWorkspaceSidebar
    locked={locked}
    isOnline
    isCollapsed={isCollapsed}
    terminalUser={terminalUser}
    currentViewMode={currentViewMode}
    canAccessBusinessAdmin={canAccessBusinessAdmin}
    canViewPos
    shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
    onSelectViewMode={vi.fn()}
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

  it('does not render Back Office for a cashier even if the caller passes access', () => {
    renderSidebar({ terminalUser: { role: 'cashier' }, canAccessBusinessAdmin: true });

    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
  });

  it('highlights only Terminal Setup when the terminal setup view is open', () => {
    renderSidebar({ currentViewMode: 'terminal_setup' });

    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    expect(screen.getByTestId('pos-nav-terminal-setup').className).toContain('bg-[#1A4E8D]');
  });

  it('keeps one Back Office entry for administrators and keeps Terminal Setup in POS', () => {
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

    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    fireEvent.click(screen.getByTestId('pos-nav-backoffice'));
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('pos-nav-terminal-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('keeps the legacy Settings entry when Back Office access is unavailable', () => {
    renderSidebar({ canAccessBusinessAdmin: false });

    expect(screen.getByTestId('pos-nav-settings')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-backoffice')).toBeNull();
  });

  it('keeps the access predicate, confirmation dialog, and separate-page URL aligned with the Back Office contract', () => {
    expect(terminalPageSource).toContain('const canAccessBusinessAdmin = !isCashierRole && (');
    expect(terminalPageSource).toContain("|| normalizedTerminalRole === 'admin'");
    expect(terminalPageSource).toContain("|| hasPermission('business_admin:access')");
    expect(terminalPageSource).toContain('setBackOfficeConfirmOpen(true)');
    expect(terminalPageSource).toContain("url.search = '?view=reports'");
    expect(terminalPageSource).toContain("url.hash = '#/backoffice/overview'");
    expect(terminalPageSource).toContain("url.hash = `#${backOfficeTargetPath}`");
    expect(terminalPageSource).toContain("setBackOfficeTargetPath(safePath)");
    expect(terminalPageSource).toContain("params.set('branch_id', String(activeBranchId))");
    expect(terminalPageSource).toContain(": (isMsmeMode || !canAccessBusinessAdmin ? 'settings_profile' : 'terminal_setup')");
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
    expect(posRouteSource).toContain('<Route path="/backoffice/*" element={<BusinessAdminPage />} />');
    expect(terminalPageLayoutSource).toContain('const lockedSidebarSurfaceClassName = locked');
    expect(terminalPageLayoutSource).toContain('disabled={locked && !canAccessBusinessAdmin}');
    expect(terminalPageLayoutSource).toContain('className={`${workspaceContentClassName} ${lockedSurfaceClassName}`}');
    expect(terminalPageLayoutSource.match(/canAccessBusinessAdmin=\{canAccessBusinessAdmin\}/g)).toHaveLength(2);
    expect(terminalPageLayoutSource.match(/onOpenBackOffice=\{onOpenBackOffice\}/g)).toHaveLength(2);
    expect(terminalOperationsWorkspaceSource).toContain("allowedTabIds={['pos_setup']}");
    expect(terminalOperationsWorkspaceSource).toContain('const showSettingsTabNavigation = visibleSettingsTabs.length > 1;');
    expect(terminalOperationsWorkspaceSource).toContain('{showSettingsTabNavigation ? (');
    expect(terminalOperationsWorkspaceSource).toContain("editorSection=\"registers\"");
    expect(terminalOperationsWorkspaceSource).toContain("editorSection === 'registers'");
    expect(terminalOperationsWorkspaceSource).toContain('TerminalQueueScopeField');
    expect(terminalOperationsWorkspaceSource).toContain('TerminalSoundField');
    expect(terminalOperationsWorkspaceSource).toContain("title: 'Terminal Setup'");
    expect(businessAdminPageSource).toContain("publishBusinessAdminSettingsUpdated");
    expect(businessAdminPageSource).toContain("new URLSearchParams(location.search).get('branch_id')");
    expect(businessAdminPageSource).toContain("setBootstrapAuthRequired(status === 401 || status === 419)");
    expect(businessAdminPageSource).toContain('Business Admin sign-in required');
    expect(businessAdminPageSource).toContain('Open POS sign-in');
    expect(businessAdminPageSource).toContain("onSettingsSaved={notifySettingsSaved}");
    expect(businessAdminPageSource).toContain("buildPosSettingsOwnerPath('terminal_setup')");
    expect(businessAdminPageSource).toContain('Open POS terminal controls');
  });
});
