const PARKED_SALE_PRICE_EPSILON = 0.0001;

const toFiniteNumber = (value) => {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : null;
};

const stableStringify = (value) => {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    if (value && typeof value === 'object') {
        return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const normalizeModifierSnapshot = (value) => (
    (Array.isArray(value) ? value : [])
        .map((modifier) => ({
            modifier_group_id: Number.parseInt(modifier?.modifier_group_id, 10) || null,
            modifier_option_id: Number.parseInt(modifier?.modifier_option_id, 10) || null,
            quantity: Math.min(99, Math.max(1, Number.parseInt(modifier?.quantity || 1, 10) || 1))
        }))
        .sort((left, right) => stableStringify(left).localeCompare(stableStringify(right)))
);

export const sameParkedSalePrice = (left, right) => (
    Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= PARKED_SALE_PRICE_EPSILON
);

export const parkedSaleLineConfigurationFingerprint = (line = {}) => stableStringify({
    course: String(line?.course || '').trim() || 'main',
    modifiers: normalizeModifierSnapshot(line?.line_modifiers || line?.modifiers),
    selected_option_ids: (Array.isArray(line?.selected_option_ids) ? line.selected_option_ids : [])
        .map((id) => Number.parseInt(id, 10))
        .filter((id) => Number.isInteger(id) && id > 0)
        .sort((left, right) => left - right),
    special_instructions: String(line?.special_instructions || '').trim().slice(0, 1000) || null
});

const lineReference = (line = {}) => String(line?.line_key || line?.line_ref || '').trim();

export const normalizeParkedSaleLineRemovalReasons = (value) => (
    (Array.isArray(value) ? value : [])
        .map((entry) => {
            const reason = String(entry?.reason || '').trim().slice(0, 255);
            const lineRef = String(entry?.line_ref || entry?.line_key || '').trim().slice(0, 120);
            const itemId = toFiniteNumber(entry?.item_id);
            if (reason.length < 3 || (!lineRef && (!Number.isInteger(itemId) || itemId <= 0))) return null;
            return {
                line_ref: lineRef || null,
                item_id: Number.isInteger(itemId) && itemId > 0 ? itemId : null,
                reason
            };
        })
        .filter(Boolean)
);

export const findParkedSaleLineRemovalReason = ({ snapshotLine, previousLines = [], removalReasons = [] }) => {
    const snapshotRef = lineReference(snapshotLine);
    if (snapshotRef) {
        const exactReference = removalReasons.find((entry) => entry.line_ref === snapshotRef);
        if (exactReference) return exactReference;
    }

    const itemId = Number(snapshotLine?.item_id);
    const sameItemLines = previousLines.filter((line) => Number(line?.item_id) === itemId);
    if (!snapshotRef || sameItemLines.length === 1) {
        return removalReasons.find((entry) => Number(entry.item_id) === itemId) || null;
    }
    return null;
};

const findOriginalLineIndex = ({ snapshotLine, nextLines, consumedIndexes }) => {
    const snapshotRef = lineReference(snapshotLine);
    if (snapshotRef) {
        const referencedIndex = nextLines.findIndex((line, index) => (
            !consumedIndexes.has(index) && lineReference(line) === snapshotRef
        ));
        if (referencedIndex >= 0) return referencedIndex;
    }

    return nextLines.findIndex((line, index) => (
        !consumedIndexes.has(index)
        && Number(line?.item_id) === Number(snapshotLine?.item_id)
        && sameParkedSalePrice(line?.sale_price, snapshotLine?.sale_price)
        && parkedSaleLineConfigurationFingerprint(line) === parkedSaleLineConfigurationFingerprint(snapshotLine)
    ));
};

export const markRetainedParkedSaleLines = ({ snapshot = {}, previousSnapshot = {} } = {}) => {
    const previousLines = Array.isArray(previousSnapshot?.lines) ? previousSnapshot.lines : [];
    const nextLines = Array.isArray(snapshot?.lines) ? snapshot.lines : [];
    const consumedIndexes = new Set();
    const retainedIndexes = new Set();

    previousLines.forEach((previousLine) => {
        const nextIndex = findOriginalLineIndex({
            snapshotLine: previousLine,
            nextLines,
            consumedIndexes
        });
        if (nextIndex < 0) return;
        consumedIndexes.add(nextIndex);
        retainedIndexes.add(nextIndex);
    });

    return {
        ...snapshot,
        lines: nextLines.map((line, index) => (
            retainedIndexes.has(index) ? { ...line, parked_snapshot_line: true } : line
        ))
    };
};

const itemIsCurrentlyUsable = (item) => Boolean(item)
    && String(item?.status || '').trim().toLowerCase() !== 'inactive'
    && item?.pos_visible !== false
    && item?.pos_location_available !== false;

export const validateParkedSaleSnapshotRevision = ({
    previousSnapshot = {},
    nextSnapshot = {},
    currentItems = [],
    removedLineReasons = []
} = {}) => {
    const previousLines = Array.isArray(previousSnapshot?.lines) ? previousSnapshot.lines : [];
    const nextLines = Array.isArray(nextSnapshot?.lines) ? nextSnapshot.lines : [];
    const normalizedRemovalReasons = normalizeParkedSaleLineRemovalReasons(removedLineReasons);
    const consumedIndexes = new Set();

    for (const snapshotLine of previousLines) {
        const nextIndex = findOriginalLineIndex({ snapshotLine, nextLines, consumedIndexes });
        if (nextIndex < 0) {
            if (findParkedSaleLineRemovalReason({
                snapshotLine,
                previousLines,
                removalReasons: normalizedRemovalReasons
            })) continue;
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_REMOVED',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Deleting an original parked-sale item requires a reason.'
            };
        }

        consumedIndexes.add(nextIndex);
        const nextLine = nextLines[nextIndex];
        if (Number(snapshotLine?.item_id) !== Number(nextLine?.item_id)) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_CHANGED',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Original parked-sale items cannot be changed.'
            };
        }
        const snapshotPrice = toFiniteNumber(snapshotLine?.sale_price);
        const nextPrice = toFiniteNumber(nextLine?.sale_price);
        if (snapshotPrice != null && nextPrice != null && !sameParkedSalePrice(snapshotPrice, nextPrice)) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_PRICE_CHANGED',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Original parked-sale prices cannot be changed.'
            };
        }
        if (parkedSaleLineConfigurationFingerprint(snapshotLine)
            !== parkedSaleLineConfigurationFingerprint(nextLine)) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_CHANGED',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Original parked-sale item configuration cannot be changed.'
            };
        }

        const snapshotQuantity = toFiniteNumber(snapshotLine?.quantity) || 0;
        const nextQuantity = toFiniteNumber(nextLine?.quantity) || 0;
        if (nextQuantity < snapshotQuantity - PARKED_SALE_PRICE_EPSILON) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_QUANTITY_REDUCED',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Original parked-sale quantities cannot be reduced or removed.'
            };
        }
        if (nextQuantity <= snapshotQuantity + PARKED_SALE_PRICE_EPSILON) continue;

        const currentItem = currentItems.find((item) => Number(item?.item_id) === Number(nextLine?.item_id));
        const savedBasePrice = toFiniteNumber(snapshotLine?.base_sale_price) ?? snapshotPrice;
        const currentPrice = toFiniteNumber(currentItem?.default_sale_price);
        if (!itemIsCurrentlyUsable(currentItem) || currentPrice == null || savedBasePrice == null) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_ADDITION_UNAVAILABLE',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Additional quantity is unavailable because the original item is missing or inactive.'
            };
        }
        if (!sameParkedSalePrice(currentPrice, savedBasePrice)) {
            return {
                reasonCode: 'PARKED_SALE_ORIGINAL_LINE_PRICE_DRIFT',
                itemId: Number(snapshotLine?.item_id) || null,
                lineRef: lineReference(snapshotLine) || null,
                message: 'Additional quantity is disabled because the item price changed while parked.'
            };
        }
    }

    return null;
};
