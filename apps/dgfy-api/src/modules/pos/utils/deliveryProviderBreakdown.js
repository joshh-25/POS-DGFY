const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000;

const PROVIDER_DEFINITIONS = Object.freeze([
    Object.freeze({ provider_type: 'foodpanda', display_label: 'Foodpanda', sort_order: 1 }),
    Object.freeze({ provider_type: 'grab', display_label: 'Grab', sort_order: 2 }),
    Object.freeze({ provider_type: 'other', display_label: null, sort_order: 3 })
]);

const PROVIDER_TYPES = new Set(PROVIDER_DEFINITIONS.map((definition) => definition.provider_type));
const PROVIDER_SORT_ORDER = new Map(PROVIDER_DEFINITIONS.map((definition) => [definition.provider_type, definition.sort_order]));
// Keep the historical snapshot limit broad enough for already-recorded rows;
// new checkout submissions are restricted separately in assertDeliveryProviderBreakdown.
const MAX_PROVIDER_ROWS = 3;
const MAX_TRANSACTION_PROVIDER_ROWS = 1;
const MAX_PROVIDER_NAME_LENGTH = 120;

export class DeliveryProviderBreakdownError extends Error {
    constructor(message, code = 'DELIVERY_PROVIDER_INVALID') {
        super(message);
        this.name = 'DeliveryProviderBreakdownError';
        this.code = code;
    }
}

const parseSnapshot = (value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : value;
    } catch {
        return value;
    }
};

const normalizeProviderType = (value) => String(value || '').trim().toLowerCase();

const normalizeProviderName = (value) => String(value || '')
    .trim()
    .replace(/\s+/g, ' ');

const assertMoneyAmount = (value, index) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider amount at row ${index + 1} must be a positive number.`,
            'DELIVERY_PROVIDER_AMOUNT_INVALID'
        );
    }
    if (Math.abs(amount - round4(amount)) > 0.0000001) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider amount at row ${index + 1} supports at most four decimal places.`,
            'DELIVERY_PROVIDER_AMOUNT_PRECISION'
        );
    }
    return round4(amount);
};

const normalizeProviderEntry = (entry, index) => {
    const providerType = normalizeProviderType(entry?.provider_type);
    if (!PROVIDER_TYPES.has(providerType)) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider at row ${index + 1} must be Foodpanda, Grab, or Other.`,
            'DELIVERY_PROVIDER_TYPE_INVALID'
        );
    }

    const rawProviderName = normalizeProviderName(entry?.provider_name);
    if (/[^\P{Cc}\n\r\t]/u.test(rawProviderName)) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider name at row ${index + 1} contains an unsupported control character.`,
            'DELIVERY_PROVIDER_NAME_INVALID'
        );
    }
    if (rawProviderName.length > MAX_PROVIDER_NAME_LENGTH) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider name at row ${index + 1} must be ${MAX_PROVIDER_NAME_LENGTH} characters or fewer.`,
            'DELIVERY_PROVIDER_NAME_TOO_LONG'
        );
    }
    if (providerType === 'other' && !rawProviderName) {
        throw new DeliveryProviderBreakdownError(
            'Other delivery providers require a provider name.',
            'DELIVERY_PROVIDER_NAME_REQUIRED'
        );
    }
    if (providerType !== 'other' && rawProviderName) {
        throw new DeliveryProviderBreakdownError(
            'Foodpanda and Grab must use their canonical provider names.',
            'DELIVERY_PROVIDER_NAME_NOT_ALLOWED'
        );
    }

    const providerName = providerType === 'other' ? rawProviderName : null;
    const displayLabel = providerType === 'other'
        ? `${providerName} (Other)`
        : PROVIDER_DEFINITIONS.find((definition) => definition.provider_type === providerType).display_label;

    return {
        provider_type: providerType,
        provider_name: providerName,
        amount: assertMoneyAmount(entry?.amount, index),
        display_label: displayLabel
    };
};

export const normalizeDeliveryProviderBreakdown = (entries = []) => {
    const parsedEntries = parseSnapshot(entries);
    if (parsedEntries == null) return [];
    if (!Array.isArray(parsedEntries)) {
        throw new DeliveryProviderBreakdownError(
            'delivery_provider_breakdown must be an array.',
            'DELIVERY_PROVIDER_BREAKDOWN_INVALID'
        );
    }
    if (parsedEntries.length > MAX_PROVIDER_ROWS) {
        throw new DeliveryProviderBreakdownError(
            `A delivery transaction can contain at most ${MAX_PROVIDER_ROWS} provider rows.`,
            'DELIVERY_PROVIDER_ROW_LIMIT'
        );
    }

    const seenTypes = new Set();
    const normalized = parsedEntries.map((entry, index) => {
        const normalizedEntry = normalizeProviderEntry(entry, index);
        if (seenTypes.has(normalizedEntry.provider_type)) {
            throw new DeliveryProviderBreakdownError(
                `A delivery transaction can contain only one ${normalizedEntry.display_label} provider row.`,
                'DELIVERY_PROVIDER_DUPLICATE_TYPE'
            );
        }
        seenTypes.add(normalizedEntry.provider_type);
        return normalizedEntry;
    });

    return normalized.sort((left, right) => (
        (PROVIDER_SORT_ORDER.get(left.provider_type) || 99) - (PROVIDER_SORT_ORDER.get(right.provider_type) || 99)
    ));
};

export const assertDeliveryProviderBreakdown = ({ orderMethod, entries, totalAmount } = {}) => {
    const normalizedOrderMethod = String(orderMethod || '').trim().toLowerCase();
    const hasEntries = entries !== undefined && entries !== null;
    const normalized = hasEntries ? normalizeDeliveryProviderBreakdown(entries) : [];

    if (normalizedOrderMethod !== 'delivery') {
        if (normalized.length > 0) {
            throw new DeliveryProviderBreakdownError(
                'Delivery provider data is allowed only for Delivery orders.',
                'DELIVERY_PROVIDER_ORDER_METHOD_INVALID'
            );
        }
        return [];
    }

    if (normalized.length === 0) {
        throw new DeliveryProviderBreakdownError(
            'Select exactly one delivery provider.',
            'DELIVERY_PROVIDER_REQUIRED'
        );
    }
    if (normalized.length !== MAX_TRANSACTION_PROVIDER_ROWS) {
        throw new DeliveryProviderBreakdownError(
            'A delivery transaction must have exactly one delivery provider.',
            'DELIVERY_PROVIDER_SINGLE_REQUIRED'
        );
    }

    const expectedTotal = round4(totalAmount);
    const providerTotal = round4(normalized.reduce((sum, entry) => sum + entry.amount, 0));
    if (Math.abs(providerTotal - expectedTotal) > 0.0001) {
        throw new DeliveryProviderBreakdownError(
            `Delivery provider amounts must equal the transaction total of ${expectedTotal.toFixed(4)}.`,
            'DELIVERY_PROVIDER_TOTAL_MISMATCH'
        );
    }

    return normalized;
};

const providerGroupKey = (entry) => (
    entry.provider_type === 'other'
        ? `other:${String(entry.provider_name || '').trim().toLocaleLowerCase()}`
        : entry.provider_type
);

const transactionKeyForRow = (row, index) => {
    const candidate = row?.transaction_id ?? row?.pos_transaction_id ?? row?.id;
    return candidate == null || String(candidate).trim() === ''
        ? `row:${index}`
        : String(candidate);
};

export const aggregateDeliveryProviderBreakdown = (rows = []) => {
    const uniqueTransactionRows = new Map();
    (Array.isArray(rows) ? rows : []).forEach((row, index) => {
        const transactionKey = transactionKeyForRow(row, index);
        if (!uniqueTransactionRows.has(transactionKey)) uniqueTransactionRows.set(transactionKey, row);
    });

    const groups = new Map();
    uniqueTransactionRows.forEach((row, transactionKey) => {
        let snapshot;
        try {
            snapshot = normalizeDeliveryProviderBreakdown(row?.delivery_provider_breakdown);
        } catch {
            // Historical rows remain reportable even if an old or manually repaired
            // snapshot is malformed; invalid provider data contributes nothing.
            snapshot = [];
        }
        snapshot.forEach((entry) => {
            const key = providerGroupKey(entry);
            const current = groups.get(key) || {
                provider_type: entry.provider_type,
                provider_name: entry.provider_name,
                display_label: entry.display_label,
                transaction_ids: new Set(),
                amount: 0
            };
            current.transaction_ids.add(transactionKey);
            current.amount = round4(current.amount + entry.amount);
            groups.set(key, current);
        });
    });

    return Array.from(groups.values())
        .sort((left, right) => {
            const typeDelta = (PROVIDER_SORT_ORDER.get(left.provider_type) || 99)
                - (PROVIDER_SORT_ORDER.get(right.provider_type) || 99);
            if (typeDelta !== 0) return typeDelta;
            return String(left.provider_name || '').localeCompare(String(right.provider_name || ''), undefined, { sensitivity: 'base' });
        })
        .map((entry) => ({
            provider_type: entry.provider_type,
            provider_name: entry.provider_name,
            display_label: entry.display_label,
            transaction_count: entry.transaction_ids.size,
            amount: round4(entry.amount)
        }));
};

export const normalizeDeliveryProviderSummary = (entries = []) => (
    (Array.isArray(entries) ? entries : [])
        .map((entry, index) => {
            try {
                const normalized = normalizeProviderEntry(entry, index);
                return {
                    ...normalized,
                    transaction_count: Math.max(0, Number.parseInt(entry?.transaction_count || 0, 10) || 0)
                };
            } catch {
                return null;
            }
        })
        .filter(Boolean)
        .sort((left, right) => {
            const typeDelta = (PROVIDER_SORT_ORDER.get(left.provider_type) || 99)
                - (PROVIDER_SORT_ORDER.get(right.provider_type) || 99);
            if (typeDelta !== 0) return typeDelta;
            return String(left.provider_name || '').localeCompare(String(right.provider_name || ''), undefined, { sensitivity: 'base' });
        })
        .map(({ provider_type, provider_name, display_label, transaction_count, amount }) => ({
            provider_type,
            provider_name,
            display_label,
            transaction_count,
            amount: round4(amount)
        }))
);

export const DELIVERY_PROVIDER_TYPE_DEFINITIONS = PROVIDER_DEFINITIONS;
export const DELIVERY_PROVIDER_MAX_ROWS = MAX_PROVIDER_ROWS;
export const DELIVERY_PROVIDER_MAX_NAME_LENGTH = MAX_PROVIDER_NAME_LENGTH;
