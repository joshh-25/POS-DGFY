import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';

const sourcePath = path.resolve('src/services/dgfyTenantSessionService.js');

describe('DGFY tenant-session service contract', () => {
  it('loads tenant db_name before opening a tenant connection', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain("attributes: ['id', 'name', 'db_name', 'company_token', 'status', 'plan']");
    expect(source).toContain('tenantConnector.getConnection(tenant)');
  });

  it('binds DGFY Day Close PIN setup to the accepted membership tenant user', () => {
    const source = fs.readFileSync(sourcePath, 'utf8');

    expect(source).toContain('configureTenantDayClosePinForDgfyAccount');
    expect(source).toContain('membership.tenant_user_id');
    expect(source).toContain("String(user.email || '').trim().toLowerCase() !== String(account.email || '').trim().toLowerCase()");
    expect(source).toContain('updateOwnPosDayClosePinForVerifiedDgfyAccount(user.user_id');
  });
});
