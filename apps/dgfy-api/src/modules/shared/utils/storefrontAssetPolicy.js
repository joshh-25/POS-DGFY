const STOREFRONT_ASSET_URL_PATTERN = /^\/uploads\/storefront-assets\/[A-Za-z0-9/_\-.]+$/;
const STOREFRONT_ASSET_PATH_PATTERN = /^storefront-assets\/[A-Za-z0-9/_\-.]+$/;

const normalize = (value) => String(value ?? '').trim();

export const normalizeStorefrontAssetUrl = (value) => {
    const normalized = normalize(value);
    if (!normalized) return '';
    return STOREFRONT_ASSET_URL_PATTERN.test(normalized) ? normalized : '';
};

export const normalizeStorefrontAssetPath = (value) => {
    const normalized = normalize(value).replace(/^[/\\]+/, '');
    if (!normalized) return '';
    return STOREFRONT_ASSET_PATH_PATTERN.test(normalized) ? normalized : '';
};

export const isStorefrontAssetUrl = (value) => Boolean(normalizeStorefrontAssetUrl(value));
export const isStorefrontAssetPath = (value) => Boolean(normalizeStorefrontAssetPath(value));

