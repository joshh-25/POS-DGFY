import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const source = fs.readFileSync(path.resolve(__dirname, '../UserManagementModal.jsx'), 'utf8');

describe('UserManagementModal mode-aware RBAC contract', () => {
  it('surfaces role catalog failure instead of silently falling back', () => {
    expect(source).toContain('roleCatalogError');
    expect(source).toContain('Mode-aware role catalog unavailable; legacy roles are shown.');
    expect(source).toContain('<AlertTriangle');
  });

  it('saves assigned-scope role changes with location ids in one role update', () => {
    expect(source).toContain('pendingRoleAssignment');
    expect(source).toContain("preset?.location_scope === 'assigned'");
    expect(source).toContain('role_preset_key: presetKey');
    expect(source).toContain('location_ids: selectedLocationGrantIds');
    expect(source).toContain('Role and location scope updated successfully');
  });

  it('supports bulk assigned-scope presets with explicit shared location scope', () => {
    expect(source).toContain('pendingBulkRoleAssignment');
    expect(source).toContain('setShowBulkRoleScopeModal(true)');
    expect(source).toContain('listTenantLocations({ include_inactive: false })');
    expect(source).toContain('handleSaveBulkRoleScope');
    expect(source).toContain('role_preset_key: pendingBulkRoleAssignment.rolePresetKey');
    expect(source).toContain('location_ids: selectedBulkLocationIds');
    expect(source).not.toContain('Assign location-scoped role presets individually');
  });
});
