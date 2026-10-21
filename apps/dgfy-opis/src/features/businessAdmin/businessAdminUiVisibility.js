const HIDDEN_BUSINESS_ADMIN_NAVIGATION_KEYS = Object.freeze([
    'company',
    'storefront',
    'onboarding'
]);
const CATALOG_ONLY_BUSINESS_ADMIN_NAVIGATION_KEYS = Object.freeze(['catalog']);

export const BUSINESS_ADMIN_UI_VISIBILITY = Object.freeze({
    hiddenNavigationKeys: HIDDEN_BUSINESS_ADMIN_NAVIGATION_KEYS,
    showSidebarPosTerminal: false
});

export const isBusinessAdminNavigationVisible = (item, { catalogOnlyAccess = false } = {}) => (
    catalogOnlyAccess
        ? CATALOG_ONLY_BUSINESS_ADMIN_NAVIGATION_KEYS.includes(item?.key)
        : !BUSINESS_ADMIN_UI_VISIBILITY.hiddenNavigationKeys.includes(item?.key)
);
