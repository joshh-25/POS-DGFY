const isoDate = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

const pesosFromCentavos = (value) => (Number(value || 0) / 100).toFixed(2);

export const createDefaultTenantRevenuePolicyForm = (effectiveAt) => ({
    dgfy_percentage: '1.00',
    settlement_cycle_days: '15',
    settlement_status: 'on_hold',
    minimum_payout_pesos: '0.00',
    provider_fee_payer: 'tenant',
    shared_fee_percentage: '100.00',
    effective_at: effectiveAt,
    reason: '',
    payout_type: 'bank',
    payout_provider: '',
    payout_account_name: '',
    payout_account_number: '',
    fallback_method: 'qrph',
    fallback_rate_percentage: '',
    fallback_fixed_pesos: ''
});

export const nextPolicyEffectiveDate = (latestEffectiveAt, currentDate) => {
    const latestDate = isoDate(latestEffectiveAt);
    if (!latestDate || latestDate < currentDate) return currentDate;

    const nextDate = new Date(`${latestDate}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    return nextDate.toISOString().slice(0, 10);
};

export const policyToEditableForm = (policy, currentDate) => {
    const fallbackEntries = Object.entries(policy?.fallback_fee_policy || {});
    const [fallbackMethod = 'qrph', fallback = {}] = fallbackEntries[0] || [];

    return {
        ...createDefaultTenantRevenuePolicyForm(
            nextPolicyEffectiveDate(policy?.effective_at, currentDate)
        ),
        dgfy_percentage: (Number(policy?.dgfy_rate_bps || 0) / 100).toFixed(2),
        settlement_cycle_days: String(policy?.settlement_cycle_days || 15),
        settlement_status: policy?.settlement_status || 'on_hold',
        minimum_payout_pesos: pesosFromCentavos(policy?.minimum_payout_centavos),
        provider_fee_payer: policy?.provider_fee_payer || 'tenant',
        shared_fee_percentage: policy?.shared_fee_tenant_bps == null
            ? '100.00'
            : (Number(policy.shared_fee_tenant_bps) / 100).toFixed(2),
        fallback_method: fallbackMethod,
        fallback_rate_percentage: fallback.rate_bps == null
            ? ''
            : (Number(fallback.rate_bps) / 100).toFixed(2),
        fallback_fixed_pesos: fallback.fixed_centavos == null
            ? ''
            : pesosFromCentavos(fallback.fixed_centavos)
    };
};
