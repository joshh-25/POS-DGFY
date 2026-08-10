const hasOwn = (obj, key) => Boolean(obj) && Object.prototype.hasOwnProperty.call(obj, key);

export const isDefaultCatalogVisible = (item = {}) => (
    item?.category === 'product' && item?.product_type === 'finished_goods'
);

const getServiceDetail = (item = {}) => {
    if (item?.serviceDetail && typeof item.serviceDetail === 'object') {
        return item.serviceDetail;
    }
    if (item?.service_detail && typeof item.service_detail === 'object') {
        return item.service_detail;
    }
    return null;
};

export const isServiceCatalogVisible = (item = {}, { surface = 'storefront' } = {}) => {
    if (String(item?.category || '').trim().toLowerCase() !== 'service') {
        return false;
    }
    const detail = getServiceDetail(item);
    if (!detail) return false;
    if (surface === 'pos') {
        return detail.visible_in_pos !== false;
    }
    return detail.visible_in_storefront !== false && detail.bookable !== false;
};

export const resolveCatalogVisibility = ({ item = {}, override = null, surface = 'storefront' } = {}) => {
    if (hasOwn(override, 'pos_visible')) {
        return override.pos_visible !== false;
    }

    if (isServiceCatalogVisible(item, { surface })) {
        return true;
    }

    return isDefaultCatalogVisible(item);
};

export const resolveStorefrontCatalogVisibility = ({ item = {}, override = null, legacyPosOverride = null } = {}) => {
    if (hasOwn(override, 'storefront_visible')) {
        return override.storefront_visible !== false;
    }

    if (hasOwn(legacyPosOverride, 'pos_visible')) {
        return legacyPosOverride.pos_visible !== false;
    }

    if (isServiceCatalogVisible(item, { surface: 'storefront' })) {
        return true;
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

export const getStorefrontCatalogOverride = (item = {}) => {
    if (item?.storefrontCatalogOverride && typeof item.storefrontCatalogOverride === 'object') {
        return item.storefrontCatalogOverride;
    }
    if (item?.storefront_catalog_override && typeof item.storefront_catalog_override === 'object') {
        return item.storefront_catalog_override;
    }
    return null;
};

export const isCatalogItemVisible = (item = {}) => (
    resolveStorefrontCatalogVisibility({
        item,
        override: getStorefrontCatalogOverride(item),
        legacyPosOverride: getCatalogOverride(item)
    })
);

export default {
    isDefaultCatalogVisible,
    isServiceCatalogVisible,
    resolveCatalogVisibility,
    resolveStorefrontCatalogVisibility,
    getCatalogOverride,
    getStorefrontCatalogOverride,
    isCatalogItemVisible
};
