import {
    Building2,
    Settings,
    ShieldCheck,
    ShoppingBag,
    Store
} from 'lucide-react';

const normalizeLabel = (value) => String(value || '').trim().toLowerCase();

export const BUSINESS_ADMIN_SETTINGS_GROUP_DEFINITIONS = Object.freeze([
    Object.freeze({
        key: 'business',
        label: 'Business',
        icon: Building2,
        sectionKeys: Object.freeze(['profile', 'taxes'])
    }),
    Object.freeze({
        key: 'sales-pos',
        label: 'Sales & POS',
        icon: ShoppingBag,
        sectionKeys: Object.freeze(['pos', 'discounts', 'payments'])
    }),
    Object.freeze({
        key: 'online-store',
        label: 'Online Store',
        icon: Store,
        sectionKeys: Object.freeze(['storefront', 'delivery'])
    }),
    Object.freeze({
        key: 'operations',
        label: 'Operations',
        icon: Settings,
        sectionKeys: Object.freeze(['branches', 'attendance', 'registers'])
    }),
    Object.freeze({
        key: 'access-administration',
        label: 'Access & administration',
        icon: ShieldCheck,
        sectionKeys: Object.freeze(['team']),
        includesAdministrativeTools: true
    })
]);

export const getBusinessAdminSettingsNavigationGroups = ({
    visibleSections = [],
    sectionCapabilities = {},
    administrativeTools = []
} = {}) => {
    const visibleSectionByKey = new Map(
        (Array.isArray(visibleSections) ? visibleSections : []).map((section) => [section.key, section])
    );

    return BUSINESS_ADMIN_SETTINGS_GROUP_DEFINITIONS.map((group) => {
        const sectionItems = group.sectionKeys
            .map((key) => visibleSectionByKey.get(key))
            .filter(Boolean)
            .map((section) => ({
                ...section,
                itemType: 'section',
                canEdit: sectionCapabilities?.[section.key]?.edit === true
            }));
        const administrativeItems = group.includesAdministrativeTools
            ? (Array.isArray(administrativeTools) ? administrativeTools : []).map((tool) => ({
                ...tool,
                key: tool.key,
                itemType: 'administrative-tool',
                icon: tool.icon || ShieldCheck
            }))
            : [];

        return {
            ...group,
            items: [...sectionItems, ...administrativeItems]
        };
    }).filter((group) => group.items.length > 0);
};

export const filterBusinessAdminSettingsNavigationGroups = (groups, query = '') => {
    const normalizedQuery = normalizeLabel(query);
    if (!normalizedQuery) return Array.isArray(groups) ? groups : [];

    return (Array.isArray(groups) ? groups : []).map((group) => {
        const groupMatches = normalizeLabel(group.label).includes(normalizedQuery);
        const items = groupMatches
            ? group.items
            : group.items.filter((item) => (
                normalizeLabel(item.label).includes(normalizedQuery)
                || normalizeLabel(item.description).includes(normalizedQuery)
            ));
        return { ...group, items };
    }).filter((group) => group.items.length > 0);
};
