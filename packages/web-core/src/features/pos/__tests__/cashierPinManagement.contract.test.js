import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (relativePath) => fs.readFileSync(path.resolve(webCoreRoot, relativePath), 'utf8');

const posServiceSource = read('src/features/pos/services/posService.js');
const settingsWorkspaceSource = read('src/features/pos/settings/PosSettingsWorkspace.jsx');
const terminalSettingsSource = read('src/features/pos/settings/PosTerminalSettingsSection.jsx');
const cashierTableSource = read('src/features/pos/settings/PosTerminalCashierAccessTable.jsx');

describe('POS cashier PIN management contract', () => {
  it('exposes a write-only personal cashier PIN setup in Terminal settings', () => {
    expect(posServiceSource).toContain("api.post('/pos/operator/pin/reset'");
    expect(settingsWorkspaceSource).toContain('updatePosCashierPin(userId, { pin: normalizedPin })');
    expect(settingsWorkspaceSource).toContain('Set Global POS PIN');
    expect(settingsWorkspaceSource).toContain('Reset Global POS PIN');
    expect(settingsWorkspaceSource).toContain('One write-only PIN is used for this user&apos;s protected POS actions');
    expect(terminalSettingsSource).toContain('onOpenCashierPin={onOpenCashierPin}');
    expect(cashierTableSource).toContain('data-testid={`pos-cashier-pin-${cashier.user_id}`}');
    expect(cashierTableSource).toContain('data-testid={`mobile-pos-cashier-pin-${cashier.user_id}`}');
  });

  it('uses the same global PIN while keeping permissions and approvals separate', () => {
    expect(settingsWorkspaceSource).toContain('Permissions and manager approval rules still apply.');
    expect(settingsWorkspaceSource).not.toContain('POS Discount Approval PIN');
    expect(settingsWorkspaceSource).not.toContain('POS Day Close PIN');
    expect(cashierTableSource).toContain('POS Discount Authorization');
    expect(cashierTableSource).toContain('Day Close Access');
    expect(cashierTableSource).toContain('Uses global POS PIN');
    expect(cashierTableSource).toContain('pos_cashier_pin_configured');
  });
});
