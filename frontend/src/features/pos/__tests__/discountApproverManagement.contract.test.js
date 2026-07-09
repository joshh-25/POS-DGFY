import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const userManagementPath = path.resolve(process.cwd(), 'Components/users/UserManagementModal.jsx');
const userServicePath = path.resolve(process.cwd(), 'src/services/userService.js');
const userManagementContent = fs.readFileSync(userManagementPath, 'utf8');
const userServiceContent = fs.readFileSync(userServicePath, 'utf8');

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
});
