import { TenantDownpaymentSettings } from '../../../models/index.js';

// Mirrors the model-level defaults in TenantDownpaymentSettings.js so a tenant with no settings
// row yet resolves identically to one with a freshly-created row -- same convention as
// dgfyAffiliateRepository.js's own DEFAULT_SETTINGS.
const DEFAULT_SETTINGS = Object.freeze({
    payment_mode: 'full_payment',
    downpayment_type: null,
    downpayment_rate_bps: null,
    downpayment_fixed_centavos: null,
    min_downpayment_centavos: 0,
    downpayment_refundable: true,
    allowed_capture_methods: null
});

const toPlain = (value) => (
    value && typeof value.toJSON === 'function'
        ? value.toJSON()
        : value
);

const getUpdatedAt = (row) => row?.updated_at ?? row?.updatedAt ?? null;

const toIsoTimestamp = (value) => {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

const createVersionConflictError = (expectedUpdatedAt, current) => {
    const error = new Error('Downpayment settings changed in another session. Refresh the values and try again.');
    error.statusCode = 409;
    error.details = {
        reason_code: 'DOWNPAYMENT_SETTINGS_VERSION_CONFLICT',
        expected_updated_at: expectedUpdatedAt,
        current_updated_at: getUpdatedAt(current)
    };
    return error;
};

const assertExpectedVersion = (row, expectedUpdatedAt) => {
    if (!expectedUpdatedAt) return;
    const expected = toIsoTimestamp(expectedUpdatedAt);
    const actual = toIsoTimestamp(getUpdatedAt(row));
    if (!expected || !actual || expected !== actual) {
        throw createVersionConflictError(expectedUpdatedAt, row);
    }
};

export const downpaymentSettingsRepository = {
    async getSettings(tenantId) {
        const row = await TenantDownpaymentSettings.findByPk(tenantId);
        if (row) return toPlain(row);
        return { tenant_id: tenantId, ...DEFAULT_SETTINGS };
    },

    async upsertSettings(tenantId, payload = {}, { expectedUpdatedAt = null } = {}) {
        const [row] = await TenantDownpaymentSettings.findOrCreate({
            where: { tenant_id: tenantId },
            defaults: { tenant_id: tenantId, ...DEFAULT_SETTINGS }
        });
        assertExpectedVersion(row, expectedUpdatedAt);
        if (!expectedUpdatedAt) {
            await row.update(payload);
            return toPlain(await row.reload());
        }

        const [affectedRows] = await TenantDownpaymentSettings.update(payload, {
            where: {
                tenant_id: tenantId,
                updated_at: getUpdatedAt(row)
            }
        });
        if (affectedRows !== 1) {
            const current = await TenantDownpaymentSettings.findByPk(tenantId);
            throw createVersionConflictError(expectedUpdatedAt, current);
        }

        return toPlain(await TenantDownpaymentSettings.findByPk(tenantId));
    }
};
