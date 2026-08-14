import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const userManagementPath = path.resolve(webCoreRoot, 'Components/users/UserManagementModal.jsx');
const userServicePath = path.resolve(webCoreRoot, 'src/services/userService.js');
const terminalWorkspacePath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx');
const userManagementContent = fs.readFileSync(userManagementPath, 'utf8');
const userServiceContent = fs.readFileSync(userServicePath, 'utf8');
const terminalWorkspaceContent = fs.readFileSync(terminalWorkspacePath, 'utf8');

describe('POS discount approver management contract', () => {
  it('limits approval PIN controls to the Master Admin and eligible roles', () => {
    expect(userManagementContent).toContain('currentUser?.is_master_admin === true');
    expect(userManagementContent).toContain("['admin', 'manager'].includes(user.role)");
    expect(userManagementContent).toContain('pos_approval_pin_configured');
  });

  it('supports set and clear without reading a PIN value', () => {
    expect(userServiceContent).toContain("/pos-approval-pin");
    expect(userManagementContent).toContain("saveApprovalPin({ clear: true })");
    expect(userManagementContent).not.toContain('pos_approval_pin_hash');
  });

  it('makes the same write-only approval PIN management available in POS settings', () => {
    expect(terminalWorkspaceContent).toContain('POS Discount Approval PINs');
    expect(terminalWorkspaceContent).toContain('canManageDiscountApprovalPins = terminalUser?.is_master_admin === true');
    expect(terminalWorkspaceContent).toContain('getAllUsers({ include_invitations: false })');
    expect(terminalWorkspaceContent).toContain("['admin', 'manager'].includes");
    expect(terminalWorkspaceContent).toContain('updatePosApprovalPin(approvalPinUser.user_id');
    expect(terminalWorkspaceContent).toContain("saveApprovalPin({ clear: true })");
    expect(terminalWorkspaceContent).not.toContain('pos_approval_pin_hash');
  });
});
