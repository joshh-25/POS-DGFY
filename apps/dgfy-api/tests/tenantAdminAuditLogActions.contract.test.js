import { describe, expect, it } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationRunnerMigrationsDir = path.join(__dirname, '..', '..', 'dgfy-migration-runner', 'migrations');

describe('tenant admin audit log action contract', () => {
  it('allows tenant admin audit actions in the landlord model and migrations', () => {
    const model = readFileSync(path.resolve('src/models/Landlord/TenantAdminAuditLog.js'), 'utf8');
    const migration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260615000001-extend-tenant-admin-audit-actions.cjs'), 'utf8');
    const provisioningMigration = readFileSync(path.join(migrationRunnerMigrationsDir, '20260625000001-add-platform-admin-assisted-provisioning.cjs'), 'utf8');

    expect(model).toContain("'pos_metadata_update'");
    expect(model).toContain("'admin_create_tenant'");
    expect(model).toContain("'admin_create_account_and_tenant'");
    expect(model).toContain("'admin_force_assign_owner'");
    expect(migration).toContain("'pos_metadata_update'");
    expect(provisioningMigration).toContain("'admin_create_tenant'");
    expect(provisioningMigration).toContain("'admin_force_assign_owner'");
  });
});
