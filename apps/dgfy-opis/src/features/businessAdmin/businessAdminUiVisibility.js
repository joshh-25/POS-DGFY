const HIDDEN_BUSINESS_ADMIN_NAVIGATION_KEYS = Object.freeze([
    'company',
    'storefront',
    'onboarding'
]);

export const BUSINESS_ADMIN_UI_VISIBILITY = Object.freeze({
    hiddenNavigationKeys: HIDDEN_BUSINESS_ADMIN_NAVIGATION_KEYS,
    showSidebarPosTerminal: false,
    showAdminChip: false,
    showRefresh: false,
    showSwitchLocation: false,
    showPosTerminal: false
});

export const isBusinessAdminNavigationVisible = (item) => (
    !BUSINESS_ADMIN_UI_VISIBILITY.hiddenNavigationKeys.includes(item?.key)
);
