export const DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD = 5;

export const isServiceCatalogItem = (item = {}) => (
    String(item?.category || '').trim().toLowerCase() === 'service'
    || String(item?.mode_item_preset || '').trim().toLowerCase() === 'service'
);

export const normalizeLowStockDisplayThreshold = (value) => {
    const threshold = Number(value);
    return Number.isFinite(threshold) && threshold >= 0
        ? threshold
        : DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD;
};

// POS filters its location-scoped catalog for sale presentation only. Checkout remains
// protected by the backend's authoritative stock validation.
export const isSellAvailableCatalogItem = (item = {}) => (
    isServiceCatalogItem(item)
    || item?.pos_always_available === true
    || Number(item?.current_stock || 0) > 0
);

export const getCatalogStockColorClassName = (item = {}, lowStockThreshold) => {
    if (!isSellAvailableCatalogItem(item) || isServiceCatalogItem(item) || item?.pos_always_available === true) {
        return 'text-[#64748B]';
    }
    return Number(item?.current_stock || 0) <= normalizeLowStockDisplayThreshold(lowStockThreshold)
        ? 'text-amber-700'
        : 'text-emerald-700';
};
