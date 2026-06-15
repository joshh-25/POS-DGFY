import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';

describe('tenant admin audit log action contract', () => {
  it('allows POS metadata audit actions in the landlord model and migration', () => {
    const model = readFileSync(path.resolve('src/models/Landlord/TenantAdminAuditLog.js'), 'utf8');
    const migration = readFileSync(path.resolve('migrations/20260615000001-extend-tenant-admin-audit-actions.cjs'), 'utf8');

    expect(model).toContain("DataTypes.ENUM('capability_update', 'pos_metadata_update')");
    expect(migration).toContain("'pos_metadata_update'");
  });
});
