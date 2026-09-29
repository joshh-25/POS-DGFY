import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const read = (relativePath) => fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');

const terminalPageSource = read('../pages/TerminalPage.jsx');
const terminalLayoutSource = read('../components/TerminalPageLayout.jsx');
const terminalSidebarSource = read('../components/TerminalWorkspaceSidebar.jsx');
const operationsWorkspaceSource = read('../components/TerminalOperationsWorkspace.jsx');
const operationsPanelsSource = read('../components/TerminalOperationsPanels.jsx');

describe('POS read-only branch viewer navigation contracts', () => {
  it('allows the safe POS views while rejecting terminal mutation views', () => {
    expect(terminalPageSource).toContain("const BRANCH_VIEW_READ_ONLY_MODES = new Set([");
    expect(terminalPageSource).toContain("'incoming_queue'");
    expect(terminalPageSource).toContain("'history'");
    expect(terminalPageSource).toContain("'reports'");
    expect(terminalPageSource).toContain("'items'");
    expect(terminalPageSource).toContain('if (branchViewLocationId && !branchViewReadOnlyNavigation)');
    expect(terminalPageSource).toContain('const isShiftExemptViewMode = SHIFT_EXEMPT_VIEW_MODES.has(nextMode) || branchViewReadOnlyNavigation;');
  });

  it('uses the selected branch for the shared workspace and marks the view read-only', () => {
    expect(terminalLayoutSource).toContain('const workspaceLocationId = isBranchReadOnlyView');
    expect(terminalLayoutSource).toContain('selectedLocationId={workspaceLocationId}');
    expect(terminalLayoutSource).toContain('operatingLocationId={workspaceLocationId}');
    expect(terminalLayoutSource).toContain('readOnlyBranchView={isBranchReadOnlyView}');
    expect(terminalLayoutSource).toContain('data-testid="pos-branch-view-banner"');
    expect(terminalLayoutSource).toContain('const workspaceCanCloseShift = isBranchReadOnlyView ? false : canCloseShift;');
    expect(terminalLayoutSource).toContain('const workspaceCanAdjustCashDrawer = isBranchReadOnlyView ? false : canAdjustCashDrawer;');
    expect(terminalSidebarSource).toContain('disabled={locked || onboardingRestricted || isBranchReadOnlyView || !navigationShiftReady}');
    expect(terminalSidebarSource).toContain('disabled={locked || !isOnline || isBranchReadOnlyView}');
    expect(operationsWorkspaceSource).toContain('canTransactPos={isBranchReadOnlyView ? false : canTransactPos}');
    expect(operationsWorkspaceSource).toContain("const visibleShiftTabs = isBranchReadOnlyView");
    expect(operationsWorkspaceSource).toContain("if (isBranchReadOnlyView) return renderShiftLocationPane();");
  });

  it('uses the branch monitor for Orders instead of the active terminal queue', () => {
    expect(operationsPanelsSource).toContain('const isAdminBranchMonitor = Boolean(branchViewLocationId) || (!hasActiveShift && canViewAdminLocationMonitor);');
    expect(operationsPanelsSource).toContain('<AdminBranchOrdersPanel');
  });
});
