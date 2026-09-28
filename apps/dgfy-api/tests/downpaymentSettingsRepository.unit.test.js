import { jest } from '@jest/globals';

const mockTenantDownpaymentSettings = {
    findByPk: jest.fn(),
    findOrCreate: jest.fn(),
    update: jest.fn()
};

// Also provide a `default` export matching models/index.js's real shape (db as default) -- see
// emailDeliveryLogRepository.unit.test.js's own comment on why this matters under --runInBand.
jest.unstable_mockModule('../src/models/index.js', () => ({
    default: { TenantDownpaymentSettings: mockTenantDownpaymentSettings },
    TenantDownpaymentSettings: mockTenantDownpaymentSettings
}));

const { downpaymentSettingsRepository } = await import('../src/modules/downpayment/repositories/downpaymentSettingsRepository.js');

const TENANT_ID = 'tenant-1';

describe('downpaymentSettingsRepository', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getSettings', () => {
        it('returns the stored row (as plain data) when one exists', async () => {
            const row = {
                tenant_id: TENANT_ID,
                payment_mode: 'downpayment_required',
                toJSON: () => ({ tenant_id: TENANT_ID, payment_mode: 'downpayment_required' })
            };
            mockTenantDownpaymentSettings.findByPk.mockResolvedValue(row);

            const result = await downpaymentSettingsRepository.getSettings(TENANT_ID);

            expect(mockTenantDownpaymentSettings.findByPk).toHaveBeenCalledWith(TENANT_ID);
            expect(result).toEqual({ tenant_id: TENANT_ID, payment_mode: 'downpayment_required' });
        });

        it('falls back to DEFAULT_SETTINGS when no row exists yet', async () => {
            mockTenantDownpaymentSettings.findByPk.mockResolvedValue(null);

            const result = await downpaymentSettingsRepository.getSettings(TENANT_ID);

            expect(result).toEqual(expect.objectContaining({
                tenant_id: TENANT_ID,
                payment_mode: 'full_payment',
                downpayment_refundable: true,
                min_downpayment_centavos: 0
            }));
        });
    });

    describe('upsertSettings', () => {
        it('creates a row (via findOrCreate) and applies the update payload', async () => {
            const stored = { tenant_id: TENANT_ID, payment_mode: 'full_payment' };
            const row = {
                update: jest.fn(async (payload) => Object.assign(stored, payload)),
                reload: jest.fn(async () => ({
                    toJSON: () => ({ ...stored })
                }))
            };
            mockTenantDownpaymentSettings.findOrCreate.mockResolvedValue([row, true]);

            const result = await downpaymentSettingsRepository.upsertSettings(TENANT_ID, { payment_mode: 'downpayment_required' });

            expect(mockTenantDownpaymentSettings.findOrCreate).toHaveBeenCalledWith(expect.objectContaining({
                where: { tenant_id: TENANT_ID },
                defaults: expect.objectContaining({ tenant_id: TENANT_ID, payment_mode: 'full_payment' })
            }));
            expect(row.update).toHaveBeenCalledWith({ payment_mode: 'downpayment_required' });
            expect(result).toEqual({ tenant_id: TENANT_ID, payment_mode: 'downpayment_required' });
        });

        it('uses the stored timestamp as a compare-and-set precondition', async () => {
            const current = {
                tenant_id: TENANT_ID,
                updated_at: '2026-09-15T01:00:00.000Z'
            };
            const refreshed = {
                ...current,
                payment_mode: 'downpayment_required',
                updated_at: '2026-09-15T01:01:00.000Z',
                toJSON: () => ({
                    ...current,
                    payment_mode: 'downpayment_required',
                    updated_at: '2026-09-15T01:01:00.000Z'
                })
            };
            mockTenantDownpaymentSettings.findOrCreate.mockResolvedValue([current, false]);
            mockTenantDownpaymentSettings.update.mockResolvedValue([1]);
            mockTenantDownpaymentSettings.findByPk.mockResolvedValue(refreshed);

            const result = await downpaymentSettingsRepository.upsertSettings(
                TENANT_ID,
                { payment_mode: 'downpayment_required' },
                { expectedUpdatedAt: '2026-09-15T01:00:00.000Z' }
            );

            expect(mockTenantDownpaymentSettings.update).toHaveBeenCalledWith(
                { payment_mode: 'downpayment_required' },
                {
                    where: {
                        tenant_id: TENANT_ID,
                        updated_at: '2026-09-15T01:00:00.000Z'
                    }
                }
            );
            expect(result).toEqual(expect.objectContaining({
                payment_mode: 'downpayment_required',
                updated_at: '2026-09-15T01:01:00.000Z'
            }));
        });
    });
});
