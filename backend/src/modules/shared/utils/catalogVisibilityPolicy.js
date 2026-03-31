const hasOwn = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);

export const isDefaultCatalogVisible = (item = {}) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
);

export const resolveCatalogVisibility = ({ item = {}, override = null } = {}) => {
    if (hasOwn(override, 'pos_visible')) {
        return override.pos_visible !== false;
    }

    return isDefaultCatalogVisible(item);
};

export const getCatalogOverride = (item = {}) => {
    if (item?.posCatalogOverride && typeof item.posCatalogOverride === 'object') {
        return item.posCatalogOverride;
    }
    if (item?.pos_catalog_override && typeof item.pos_catalog_override === 'object') {
        return item.pos_catalog_override;
    }
    return null;
};

export const isCatalogItemVisible = (item = {}) => (
    resolveCatalogVisibility({
        item,
        override: getCatalogOverride(item)
    })
);

export default {
    isDefaultCatalogVisible,
    resolveCatalogVisibility,
    getCatalogOverride,
    isCatalogItemVisible
};
