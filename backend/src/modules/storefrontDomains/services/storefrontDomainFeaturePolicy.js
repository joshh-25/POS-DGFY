const parseCsv = (value) => new Set(
    String(value || '')
        .split(',')
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
);

export const isStorefrontCustomDomainsEnabled = () => (
    process.env.NODE_ENV !== 'production'
    || process.env.CUSTOM_STOREFRONT_DOMAINS_ENABLED === 'true'
);

export const isStorefrontDomainTenantAllowed = (tenantId) => {
    if (!isStorefrontCustomDomainsEnabled()) return false;
    if (process.env.NODE_ENV !== 'production') return true;

    const allowlist = parseCsv(process.env.CUSTOM_STOREFRONT_DOMAIN_PILOT_TENANT_IDS);
    return allowlist.size > 0 && allowlist.has(String(tenantId || '').trim().toLowerCase());
};

export const storefrontDomainFeaturePolicy = {
    isEnabled: isStorefrontCustomDomainsEnabled,
    isTenantAllowed: isStorefrontDomainTenantAllowed
};
