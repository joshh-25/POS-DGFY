import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const userManagementPath = path.resolve(webCoreRoot, 'Components/users/UserManagementModal.jsx');
const userServicePath = path.resolve(webCoreRoot, 'src/services/userService.js');
const terminalWorkspacePath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalOperationsWorkspace.jsx');
const checkoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx');
const terminalPageLayoutPath = path.resolve(webCoreRoot, 'src/features/pos/components/TerminalPageLayout.jsx');
const userManagementContent = fs.readFileSync(userManagementPath, 'utf8');
const userServiceContent = fs.readFileSync(userServicePath, 'utf8');
const terminalWorkspaceContent = fs.readFileSync(terminalWorkspacePath, 'utf8');
const checkoutContent = fs.readFileSync(checkoutPath, 'utf8');
const checkoutViewContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
  'utf8'
);
const discountWorkspaceContent = fs.readFileSync(
  path.resolve(webCoreRoot, 'src/features/pos/components/POSDiscountWorkspace.jsx'),
  'utf8'
);
const checkoutRenderContent = `${checkoutContent}\n${checkoutViewContent}\n${discountWorkspaceContent}`;
const terminalPageLayoutContent = fs.readFileSync(terminalPageLayoutPath, 'utf8');

describe('POS discount approver management contract', () => {
  it('keeps discount authorization setup inside POS settings', () => {
    expect(terminalWorkspaceContent).toContain('POS Discount Authorization');
    expect(terminalWorkspaceContent).toContain('updateDiscountAuthorization');
    expect(terminalWorkspaceContent).toContain("aria-label={`Can authorize discounts for");
    expect(userManagementContent).not.toContain('POS Discount Approval PIN');
  });

  it('supports set and clear without reading a PIN value', () => {
    expect(userServiceContent).toContain("/pos-approval-pin");
    expect(userManagementContent).not.toContain('pos_approval_pin_hash');
  });

  it('makes the same write-only approval PIN management available in POS settings', () => {
    expect(terminalWorkspaceContent).toContain('POS Discount Authorization');
    expect(terminalWorkspaceContent).toContain('canManageDiscountApprovalPins = terminalUser?.is_master_admin === true');
    expect(terminalWorkspaceContent).toContain('getAllUsers({ include_invitations: false })');
    expect(terminalWorkspaceContent).toContain("['admin', 'manager'].includes");
    expect(terminalWorkspaceContent).toContain("resolveUserPermissionList(user).includes('pos:discount_authorize')");
    expect(terminalWorkspaceContent).toContain('updatePosApprovalPin(approvalPinUser.user_id');
    expect(terminalWorkspaceContent).toContain("saveApprovalPin({ clear: true })");
    expect(terminalWorkspaceContent).toContain("updateUserPermissions(userId, nextPermissions)");
    expect(terminalWorkspaceContent).not.toContain('pos_approval_pin_hash');
  });

  it('keeps authorized employees visible while marking missing PIN setup', () => {
    expect(terminalWorkspaceContent).toContain('pos_approval_pin_configured');
    expect(checkoutRenderContent).toContain('PIN not configured');
    expect(checkoutRenderContent).toContain('disabled={approver.pos_approval_pin_configured !== true}');
    expect(checkoutRenderContent).toContain('autoComplete="one-time-code"');
    expect(checkoutRenderContent).toContain('type="text"');
    expect(checkoutRenderContent).toContain('WebkitTextSecurity');
    expect(checkoutRenderContent).toContain('name="pos_discount_approval_pin"');
  });

  it('passes the active shift cashier into checkout for the default authorizer', () => {
    expect(terminalPageLayoutContent).toContain('activeShiftCashierId={shiftState?.shift?.cashier_id || null}');
  });
});
