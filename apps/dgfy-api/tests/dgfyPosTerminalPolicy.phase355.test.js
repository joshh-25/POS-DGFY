import { jest } from '@jest/globals';

const count = jest.fn(async () => 0);
const settings = [{ setting_key: 'pos_terminal_registry', setting_value: JSON.stringify([{ terminal_id: 'REG-1', location_id: 7, is_active: true }]) }];
jest.unstable_mockModule('../src/models/index.js', () => ({ Tenant: { findByPk: async () => ({ id: 'tenant-1', status: 'active', company_token: 'test' }) } }));
jest.unstable_mockModule('../src/utils/TenantConnector.js', () => ({ default: { getConnection: async () => ({}) } }));
jest.unstable_mockModule('../src/utils/tenantModelFactory.js', () => ({ getTenantModels: () => ({}) }));
jest.unstable_mockModule('../src/utils/dbStore.js', () => ({ default: {
    run: (_context, work) => work(),
    get: (name) => name === 'SystemSetting' ? { findAll: async () => settings } : { count }
} }));
jest.unstable_mockModule('../src/modules/pos/services/posTerminalDeviceEnrollmentService.js', () => ({ assertPosDeviceProof: jest.fn() }));
const { validateDgfyPosTerminalPolicy } = await import('../src/services/dgfyPosTerminalPolicyService.js');

describe('Phase 355 SSO location grants', () => {
    test('switch permission does not bypass an absent destination grant', async () => {
        count.mockResolvedValue(0);
        await expect(validateDgfyPosTerminalPolicy({ tenantId: 'tenant-1', terminalId: 'REG-1', tenantUserId: 1, userRole: 'cashier', permissions: ['pos:switch_location'] }))
            .rejects.toMatchObject({ statusCode: 403, details: { terminal_identity_policy: { reason_code: 'CASHIER_LOCATION_NOT_GRANTED' } } });
    });
    test('assigned cashier is allowed', async () => {
        count.mockResolvedValue(1);
        await expect(validateDgfyPosTerminalPolicy({ tenantId: 'tenant-1', terminalId: 'REG-1', tenantUserId: 1 })).resolves.toMatchObject({ reason_code: 'ALLOWED' });
    });
    test('existing master-admin tenant-wide authority is preserved', async () => {
        count.mockClear();
        await expect(validateDgfyPosTerminalPolicy({ tenantId: 'tenant-1', terminalId: 'REG-1', tenantUserId: 1, isMasterAdmin: true })).resolves.toMatchObject({ reason_code: 'ALLOWED' });
        expect(count).not.toHaveBeenCalled();
    });
});
