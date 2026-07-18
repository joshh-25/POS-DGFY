const POS_CATALOG_UPDATED_EVENT = 'pos:catalog-updated';

export const notifyPosCatalogUpdated = () => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new Event(POS_CATALOG_UPDATED_EVENT));
};

export const subscribeToPosCatalogUpdates = (listener) => {
    if (typeof window === 'undefined' || typeof listener !== 'function') return () => {};
    window.addEventListener(POS_CATALOG_UPDATED_EVENT, listener);
    return () => window.removeEventListener(POS_CATALOG_UPDATED_EVENT, listener);
};
