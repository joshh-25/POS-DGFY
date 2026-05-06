export const normalizeItemCategory = (item = {}) => (
    String(item?.category || '').trim().toLowerCase()
);

export const isStockExemptServiceItem = (item = {}) => (
    normalizeItemCategory(item) === 'service'
);

export const isStockBearingItem = (item = {}) => (
    !isStockExemptServiceItem(item)
);
