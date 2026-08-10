import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('tenant admin audit log action contract', () => {
  it('allows tenant admin audit actions in the landlord model and migrations', () => {
    const model = readFileSync(path.resolve('src/models/Landlord/TenantAdminAuditLog.js'), 'utf8');
    const migration = readFileSync(path.resolve('migrations/20260615000001-extend-tenant-admin-audit-actions.cjs'), 'utf8');
    const provisioningMigration = readFileSync(path.resolve('migrations/20260625000001-add-platform-admin-assisted-provisioning.cjs'), 'utf8');

    expect(model).toContain("'pos_metadata_update'");
    expect(model).toContain("'admin_create_tenant'");
    expect(model).toContain("'admin_create_account_and_tenant'");
    expect(model).toContain("'admin_force_assign_owner'");
    expect(migration).toContain("'pos_metadata_update'");
    expect(provisioningMigration).toContain("'admin_create_tenant'");
    expect(provisioningMigration).toContain("'admin_force_assign_owner'");
  });
});
