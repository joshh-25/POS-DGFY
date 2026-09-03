import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';

const readSource = (relativePath) => fs.readFileSync(
  path.resolve(process.cwd(), relativePath),
  'utf8'
);

describe('POS Day Close PIN self-service contract', () => {
  it('keeps PIN configuration scoped to the authenticated close-day operator', () => {
    const routes = readSource('src/routes/users.js');
    const validator = readSource('src/validators/userValidator.js');
    const service = readSource('src/services/userService.js');

    expect(routes).toContain("router.put('/me/pos-day-close-pin', authenticate");
    expect(validator).toContain('updateOwnPosDayClosePinSchema');
    expect(service).toContain("resolveEffectivePermissions(user).includes('pos:close_day')");
    expect(service).toContain('comparePassword(normalizedPassword, user.password_hash)');
    expect(service).toContain("entity_type: 'pos_day_close_pin'");
    expect(service).toContain("operation: 'self_service_configure'");
  });

  it('uses the global DGFY credential authority for DGFY Business PIN setup', () => {
    const dgfyRoutes = readSource('src/routes/dgfy.js');
    const dgfyUseCases = readSource('src/modules/dgfy/usecases/dgfyAuthUseCases.js');
    const tenantSessionService = readSource('src/services/dgfyTenantSessionService.js');
    const userService = readSource('src/services/userService.js');

    expect(dgfyRoutes).toContain("router.put('/account/companies/:tenant_id/pos-day-close-pin', authenticateDgfyAccount");
    expect(dgfyUseCases).toContain('comparePassword(currentPassword, account.password_hash)');
    expect(tenantSessionService).toContain('findAcceptedMembership({ account, tenantId })');
    expect(tenantSessionService).toContain('updateOwnPosDayClosePinForVerifiedDgfyAccount(user.user_id');
    expect(userService).toContain("credentialAuthority: 'dgfy_account'");
  });

  it('keeps the Master Admin action limited to PIN reset', () => {
    const validator = readSource('src/validators/userValidator.js');
    const service = readSource('src/services/userService.js');

    expect(validator).toContain('Master Admin can only reset a cashier Day Close PIN');
    expect(service).toContain('Master Admin can only reset a cashier POS Day Close PIN');
    expect(service).toContain("operation: 'admin_reset'");
  });

  // Consolidated from tests/dgfyTenantSessionService.contract.test.js (#1441)
  it('loads tenant db_name before opening a tenant connection', () => {
    const service = readSource('src/services/dgfyTenantSessionService.js');

    expect(service).toContain("attributes: ['id', 'name', 'db_name', 'company_token', 'status', 'plan']");
    expect(service).toContain('tenantConnector.getConnection(tenant)');
  });

  // Consolidated from tests/dgfyTenantSessionService.contract.test.js (#1441)
  it('binds DGFY Day Close PIN setup to the accepted membership tenant user', () => {
    const service = readSource('src/services/dgfyTenantSessionService.js');

    expect(service).toContain('configureTenantDayClosePinForDgfyAccount');
    expect(service).toContain('membership.tenant_user_id');
    expect(service).toContain("String(user.email || '').trim().toLowerCase() !== String(account.email || '').trim().toLowerCase()");
  });
});
