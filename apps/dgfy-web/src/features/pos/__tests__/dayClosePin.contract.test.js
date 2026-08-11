import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(process.cwd(), relativePath),
  'utf8'
);

describe('POS Day Close PIN contract', () => {
  it('requires a personal Day Close PIN before the terminal submits close day', () => {
    const terminalPageSource = [
      readSource('src/features/pos/pages/TerminalPage.jsx'),
      readSource('src/features/pos/components/TerminalPageDialogLayer.jsx')
    ].join('\n');
    const posServiceSource = readSource('src/features/pos/services/posService.js');

    expect(terminalPageSource).toContain('Your POS Day Close PIN');
    expect(terminalPageSource).toContain('closePosDay(null, { dayClosePin: zReadingClosePin })');
    expect(posServiceSource).toContain('day_close_pin: dayClosePin');
    expect(posServiceSource).toContain("api.get('/pos/z-reading/close-readiness'");
    expect(terminalPageSource).toContain('Shift Closed Successfully');
    expect(terminalPageSource).toContain('All cashier shifts are closed. The branch Z-reading is ready to generate.');
    expect(terminalPageSource).toContain('Return to Login');
  });

  it('shows the cashier account and keeps PIN creation self-service', () => {
    const workspaceSource = readSource('src/features/pos/components/TerminalOperationsWorkspace.jsx');
    const terminalPageSource = [
      readSource('src/features/pos/pages/TerminalPage.jsx'),
      readSource('src/features/pos/components/TerminalPageDialogLayer.jsx')
    ].join('\n');
    const userServiceSource = readSource('src/services/userService.js');

    expect(workspaceSource).toContain('Day Close Access');
    expect(workspaceSource).toContain("{user.email || 'No account email'}");
    expect(workspaceSource).toContain('Cashier setup pending');
    expect(workspaceSource).toContain('Can generate Z-reading');
    expect(workspaceSource).toContain("Array.from(new Set([...permissions, 'pos:close_day']))");
    expect(workspaceSource).toContain("permissions.filter((permission) => permission !== 'pos:close_day')");
    expect(workspaceSource).toContain('updateUserPermissions(userId, nextPermissions)');
    expect(workspaceSource).toContain('Built-in access');
    expect(terminalPageSource).toContain('My POS Day Close PIN');
    expect(terminalPageSource).toContain('updateOwnPosDayClosePin({ currentPassword, pin })');
    expect(userServiceSource).toContain('/users/me/pos-day-close-pin');
  });

  it('gates every Shift-screen Day Close attempt on fresh branch readiness', () => {
    const terminalPageSource = [
      readSource('src/features/pos/pages/TerminalPage.jsx'),
      readSource('src/features/pos/components/TerminalPageDialogLayer.jsx')
    ].join('\n');
    const layoutSource = readSource('src/features/pos/components/TerminalPageLayout.jsx');
    const workspaceSource = readSource('src/features/pos/components/TerminalOperationsWorkspace.jsx');

    expect(terminalPageSource).toContain('const [dayCloseReadinessState, setDayCloseReadinessState] = useState({');
    expect(terminalPageSource).toContain('const refreshDayCloseReadiness = useCallback(async ({ silent = false } = {}) => {');
    expect(terminalPageSource).toContain("const isDayCloseSurface = posViewMode === 'shift_controls' || posViewMode === 'close_shift';");
    expect(terminalPageSource).toMatch(
      /const handleCloseDay = useCallback\(async \(\) => \{[\s\S]*?const readiness = await refreshDayCloseReadiness\(\);[\s\S]*?if \(!readiness\?\.ready\)[\s\S]*?setZReadingCloseConfirmOpen\(true\);/
    );
    expect(terminalPageSource).toMatch(
      /const confirmCloseDay = useCallback\(async \(\) => \{[\s\S]*?const readiness = await refreshDayCloseReadiness\(\);[\s\S]*?if \(!readiness\?\.ready\)[\s\S]*?closePosDay\(null, \{ dayClosePin: zReadingClosePin \}\)/
    );
    expect(terminalPageSource).toContain('dayCloseReadinessState.readiness?.ready !== true');
    expect(terminalPageSource).toContain('data-testid="pos-close-day-confirm"');
    expect(layoutSource).toContain('dayCloseReadinessState={dayCloseReadinessState}');
    expect(layoutSource).toContain('refreshDayCloseReadiness={refreshDayCloseReadiness}');
    expect(workspaceSource).toContain('const dayCloseReady = !activeShift && dayCloseReadiness?.ready === true;');
    expect(workspaceSource).toContain('disabled={dayCloseActionDisabled}');
    expect(workspaceSource).toContain('Close this cashier shift before generating the branch Z-reading.');
    expect(workspaceSource).toContain('Close every cashier shift in this branch before generating the Z-reading.');
    expect(workspaceSource).toContain('data-testid="pos-close-day-readiness"');
  });
});
