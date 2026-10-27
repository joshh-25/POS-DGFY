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

const isDestinationCapabilityGranted = (item, {
    capabilities = {},
    settingsCapabilities = {}
} = {}) => {
    const selector = item?.metadata?.accessSelector;
    if (!selector) return true;
    if (selector.type === 'capability') {
        return capabilities?.[selector.key] === true;
    }
    if (selector.type === 'settings') {
        return settingsCapabilities?.[selector.section]?.[selector.capability] === true;
    }
    // Unknown selectors fail closed so a new manifest entry cannot become
    // discoverable without an explicit capability projection.
    return false;
};

export const isBusinessAdminNavigationVisible = (
    item,
    {
        catalogOnlyAccess = false,
        usersRolesVisible = true,
        capabilities = {},
        settingsCapabilities = {}
    } = {}
) => {
    if (item?.key === 'users-roles' && !usersRolesVisible) return false;
    if (!isDestinationCapabilityGranted(item, { capabilities, settingsCapabilities })) return false;
    return catalogOnlyAccess
        ? CATALOG_ONLY_BUSINESS_ADMIN_NAVIGATION_KEYS.includes(item?.key)
        : !BUSINESS_ADMIN_UI_VISIBILITY.hiddenNavigationKeys.includes(item?.key);
};

export const isBusinessAdminDestinationAccessible = (
    item,
    {
        catalogOnlyAccess = false,
        usersRolesVisible = true,
        capabilities = {},
        settingsCapabilities = {}
    } = {}
) => {
    if (item?.key === 'users-roles' && !usersRolesVisible) return false;
    if (!isDestinationCapabilityGranted(item, { capabilities, settingsCapabilities })) return false;
    // Sidebar presentation rules must not turn a valid deep link into an
    // authorization boundary. Catalog-only routing remains an explicit
    // product mode, while hidden legacy destinations stay server-authorized.
    return !catalogOnlyAccess || CATALOG_ONLY_BUSINESS_ADMIN_NAVIGATION_KEYS.includes(item?.key);
};
