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
const businessAdminPageSource = readSource('../../businessAdmin/BusinessAdminPage.jsx');
const posRouteSource = readSource('../../../../../../apps/dgfy-pos/src/main.jsx');

const renderSidebar = ({ terminalUser = { role: 'admin' }, canLaunchBackOffice = true, canAccessPosOnlySetup = false, currentViewMode = 'checkout', isCollapsed = false, locked = false, onOpenBackOffice = vi.fn(), onSelectViewMode = vi.fn() } = {}) => render(
  <TerminalWorkspaceSidebar
    locked={locked}
    isOnline
    isCollapsed={isCollapsed}
    terminalUser={terminalUser}
    currentViewMode={currentViewMode}
    canLaunchBackOffice={canLaunchBackOffice}
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

describe('POS Business Admin navigation', () => {
  it('renders the Business Admin button and invokes its navigation callback', () => {
    const onOpenBackOffice = vi.fn();
    renderSidebar({ onOpenBackOffice });

    const button = screen.getByTestId('pos-nav-business-admin');
    expect(button).toBeDefined();
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);
  });

  it('renders the same navigation affordance in the collapsed/mobile sidebar state', () => {
    renderSidebar({ isCollapsed: true });

    const button = screen.getByTestId('pos-nav-business-admin');
    expect(button).toBeDefined();
    expect(button.getAttribute('aria-label')).toBe('Business Admin');
  });

  it('keeps Business Admin available for an authorized manager while checkout is locked', () => {
    const onOpenBackOffice = vi.fn();
    renderSidebar({ locked: true, onOpenBackOffice });

    const button = screen.getByTestId('pos-nav-business-admin');
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

    fireEvent.click(screen.getByTestId('pos-lock-drawer-open-business-admin'));
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);
  });

  it('does not render Business Admin for a cashier even if the caller passes access', () => {
    renderSidebar({ terminalUser: { role: 'cashier' }, canLaunchBackOffice: true });

    expect(screen.queryByTestId('pos-nav-business-admin')).toBeNull();
  });

  it('keeps POS-only terminal setup available to a cashier without Business Admin', () => {
    const onSelectViewMode = vi.fn();
    renderSidebar({
      terminalUser: { role: 'cashier' },
      canLaunchBackOffice: false,
      canAccessPosOnlySetup: true,
      onSelectViewMode
    });

    expect(screen.getByTestId('pos-nav-terminal-setup')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-business-admin')).toBeNull();
    fireEvent.click(screen.getByTestId('pos-nav-terminal-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('highlights only Terminal Setup when the terminal setup view is open', () => {
    renderSidebar({
      terminalUser: { role: 'cashier' },
      canLaunchBackOffice: false,
      canAccessPosOnlySetup: true,
      currentViewMode: 'terminal_setup'
    });

    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    expect(screen.getByTestId('pos-nav-terminal-setup').className).toContain('bg-[#1A4E8D]');
  });

  it('keeps a single Business Admin entry beside POS settings navigation', () => {
    const onOpenBackOffice = vi.fn();
    const onSelectViewMode = vi.fn();
    render(
      <TerminalWorkspaceSidebar
        locked={false}
        isOnline
        terminalUser={{ role: 'admin' }}
        currentViewMode="checkout"
        canLaunchBackOffice
        canViewPos
        shiftState={{ shift: { pos_terminal_shift_id: 12, location_id: 3 } }}
        onSelectViewMode={onSelectViewMode}
        onOpenBackOffice={onOpenBackOffice}
      />
    );

    fireEvent.click(screen.getByTestId('pos-nav-business-admin'));
    expect(onOpenBackOffice).toHaveBeenCalledTimes(1);

    expect(screen.queryByTestId('pos-nav-business-admin-settings')).toBeNull();

    expect(screen.getAllByTestId('pos-nav-business-admin')).toHaveLength(1);
    expect(screen.getByTestId('pos-nav-settings')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-terminal-setup')).toBeNull();
  });

  it('renders one POS setup entry when terminal configuration is allowed without Business Admin', () => {
    const onSelectViewMode = vi.fn();
    renderSidebar({ canLaunchBackOffice: false, canAccessPosOnlySetup: true, onSelectViewMode });

    expect(screen.getByTestId('pos-nav-terminal-setup')).toBeDefined();
    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
    expect(screen.queryByTestId('pos-nav-business-admin')).toBeNull();

    fireEvent.click(screen.getByTestId('pos-nav-terminal-setup'));
    expect(onSelectViewMode).toHaveBeenCalledWith('terminal_setup');
  });

  it('hides both Business Admin and POS setup when the operator has no configuration capability', () => {
    renderSidebar({ canLaunchBackOffice: false, canAccessPosOnlySetup: false });

    expect(screen.queryByTestId('pos-nav-business-admin')).toBeNull();
    expect(screen.queryByTestId('pos-nav-pos-setup')).toBeNull();
    expect(screen.queryByTestId('pos-nav-settings')).toBeNull();
  });

  it('keeps authorized manager access on POS while preserving the confirmation flow', () => {
    expect(terminalPageSource).toContain('const canAccessBusinessAdmin = !isCashierRole && (');
    expect(terminalPageSource).toContain("|| normalizedTerminalRole === 'admin'");
    expect(terminalPageSource).toContain("|| hasPermission('business_admin:access')");
    expect(terminalPageSource).toContain("if (!terminalUser || !apiReachable || !canAccessBusinessAdmin) return;");
    expect(terminalPageSource).toContain('setBackOfficeConfirmOpen(true);');
    expect(terminalPageSource).toContain('setBackOfficeTargetPath(safePath);');
    expect(terminalPageSource).toContain("window.open('', '_blank')");
    expect(terminalPageSource).toContain('backOfficeWindow.opener = null;');
    expect(terminalPageSource).toContain('window.location.origin}/#${canonicalPath}');
    expect(terminalPageDialogLayerSource).toContain('Open Business Admin?');
    expect(terminalPageDialogLayerSource).toContain('POS administration opens in a new tab.');
    expect(terminalLockDrawerSource).toContain('pos-lock-drawer-open-business-admin');
    expect(posRouteSource).toContain('<Route path="/business-admin/*" element={<BusinessAdminPage surface="pos" />} />');
    expect(terminalPageSource).toContain('canLaunchBackOffice={canAccessBusinessAdmin}');
    expect(terminalPageLayoutSource).toContain('canLaunchBackOffice={canLaunchBackOffice}');
    expect(terminalPageLayoutSource).toContain('onOpenBackOffice={onOpenBackOffice}');
    expect(terminalWorkspaceSidebarSource).toContain('testId="pos-nav-business-admin"');
    expect(businessAdminPageSource).toContain('MigratedBackOfficeModule');
    expect(businessAdminPageSource).toContain('getBusinessAdminWorkflowPageName');
  });
});
