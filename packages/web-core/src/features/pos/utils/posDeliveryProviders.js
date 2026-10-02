export const DELIVERY_PROVIDER_OPTIONS = Object.freeze([
    Object.freeze({ value: 'foodpanda', label: 'Foodpanda' }),
    Object.freeze({ value: 'grab', label: 'Grab' }),
    Object.freeze({ value: 'other', label: 'Other' })
]);

const DELIVERY_PROVIDER_TYPES = new Set(DELIVERY_PROVIDER_OPTIONS.map((option) => option.value));
const DELIVERY_PROVIDER_LABELS = new Map(DELIVERY_PROVIDER_OPTIONS.map((option) => [option.value, option.label]));
const MAX_TRANSACTION_PROVIDER_ROWS = 1;
const MAX_PROVIDER_NAME_LENGTH = 120;

const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

export const parseDeliveryProviderBreakdown = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

export const normalizeDeliveryProviderName = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

export const formatDeliveryProviderLabel = (entry = {}) => {
    const providerType = String(entry?.provider_type || '').trim().toLowerCase();
    if (providerType === 'other') {
        const providerName = normalizeDeliveryProviderName(entry?.provider_name);
        return providerName ? `${providerName} (Other)` : 'Other';
    }
    return DELIVERY_PROVIDER_LABELS.get(providerType) || providerType || 'Delivery provider';
};

export const formatDeliveryProviderBreakdown = (value, { includeAmounts = true, currencySymbol = '₱' } = {}) => (
    parseDeliveryProviderBreakdown(value)
        .map((entry) => {
            const label = formatDeliveryProviderLabel(entry);
            if (!includeAmounts) return label;
            const amount = Number(entry?.amount || 0).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            return `${label} ${String(currencySymbol).toUpperCase() === 'PHP' ? '₱' : currencySymbol}${amount}`;
        })
        .filter(Boolean)
        .join(' + ')
);

export const parseDeliveryProviderSummary = (value) => (
    parseDeliveryProviderBreakdown(value)
        .map((entry) => ({
            ...entry,
            transaction_count: Math.max(0, Number.parseInt(entry?.transaction_count || 0, 10) || 0),
            amount: Number(entry?.amount || 0)
        }))
        .filter((entry) => Number.isFinite(entry.amount) && entry.amount > 0)
);

export const formatDeliveryProviderSummaryLabel = (entry) => (
    formatDeliveryProviderLabel(entry)
);

export const toDeliveryProviderPayload = (entries = [], totalAmount = null) => {
    const normalizedTotalAmount = Number(totalAmount);
    const hasExplicitTotalAmount = totalAmount !== null
        && totalAmount !== undefined
        && String(totalAmount).trim() !== '';
    const useDerivedTotal = hasExplicitTotalAmount
        && Number.isFinite(normalizedTotalAmount)
        && normalizedTotalAmount >= 0;
    return parseDeliveryProviderBreakdown(entries).map((entry) => ({
        provider_type: String(entry?.provider_type || '').trim().toLowerCase(),
        ...(String(entry?.provider_type || '').trim().toLowerCase() === 'other'
            ? { provider_name: normalizeDeliveryProviderName(entry?.provider_name) }
            : {}),
        amount: useDerivedTotal ? round4(normalizedTotalAmount) : Number(entry?.amount)
    }));
};

export const getDeliveryProviderValidationMessage = ({ orderMethod, entries } = {}) => {
    if (String(orderMethod || '').trim().toLowerCase() !== 'delivery') return '';
    const rows = parseDeliveryProviderBreakdown(entries);
    if (rows.length === 0) return 'Select at least one delivery provider.';
    if (rows.length !== MAX_TRANSACTION_PROVIDER_ROWS) return 'Select exactly one delivery provider.';

    const seenTypes = new Set();
    for (const [index, entry] of rows.entries()) {
        const providerType = String(entry?.provider_type || '').trim().toLowerCase();
        if (!DELIVERY_PROVIDER_TYPES.has(providerType)) return `Delivery provider ${index + 1} is invalid.`;
        if (seenTypes.has(providerType)) return 'Select each delivery provider only once.';
        seenTypes.add(providerType);

        const providerName = normalizeDeliveryProviderName(entry?.provider_name);
        if (providerType === 'other' && !providerName) return 'Enter the provider name for Other.';
        if (providerName.length > MAX_PROVIDER_NAME_LENGTH) return `Other provider names must be ${MAX_PROVIDER_NAME_LENGTH} characters or fewer.`;
        if (providerType !== 'other' && providerName) return `${formatDeliveryProviderLabel(entry)} does not accept a custom provider name.`;
    }
    return '';
};

export const DELIVERY_PROVIDER_MAX_ROWS = MAX_TRANSACTION_PROVIDER_ROWS;
