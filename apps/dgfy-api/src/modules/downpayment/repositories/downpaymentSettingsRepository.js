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

export const downpaymentSettingsRepository = {
    async getSettings(tenantId) {
        const row = await TenantDownpaymentSettings.findByPk(tenantId);
        if (row) return toPlain(row);
        return { tenant_id: tenantId, ...DEFAULT_SETTINGS };
    },

    async upsertSettings(tenantId, payload = {}) {
        const [row] = await TenantDownpaymentSettings.findOrCreate({
            where: { tenant_id: tenantId },
            defaults: { tenant_id: tenantId, ...DEFAULT_SETTINGS }
        });
        await row.update(payload);
        return toPlain(await row.reload());
    }
};
