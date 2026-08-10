const MAX_STOREFRONT_SLUG_LENGTH = 80;

export const normalizeStorefrontSlug = (value) => String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');

export const deriveStorefrontSlug = ({
    tenantName = '',
    tenantId = '',
    suffixLength = 6
} = {}) => {
    const requestedSuffixLength = Number.isInteger(suffixLength) && suffixLength > 0
        ? suffixLength
        : 6;
    const idSuffix = String(tenantId || '')
        .replace(/[^a-z0-9]/gi, '')
        .toLowerCase()
        .slice(0, requestedSuffixLength);
    const base = normalizeStorefrontSlug(tenantName) || 'store';

    if (!idSuffix) {
        return base.slice(0, MAX_STOREFRONT_SLUG_LENGTH).replace(/-+$/g, '');
    }

    const maxBaseLength = Math.max(1, MAX_STOREFRONT_SLUG_LENGTH - idSuffix.length - 1);
    const truncatedBase = base.slice(0, maxBaseLength).replace(/-+$/g, '') || 'store';
    return `${truncatedBase}-${idSuffix}`;
};

export const isValidStorefrontSlug = (value) => {
    const normalized = String(value || '').trim();
    return normalized.length > 0
        && normalized.length <= MAX_STOREFRONT_SLUG_LENGTH
        && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized);
};

