/**
 * Image Lifecycle Contract & Semantic Variants Specification
 */

export const IMAGE_LIFECYCLE_STATES = Object.freeze({
    LEGACY: 'legacy',
    OPTIMIZED: 'optimized',
    UNCHANGED: 'unchanged',
    REPLACED: 'replaced',
    MISSING: 'missing',
    EXTERNAL: 'external'
});

export const IMAGE_SEMANTIC_VARIANTS = Object.freeze({
    POS_THUMBNAIL: 'pos_thumbnail',
    THUMBNAIL: 'thumbnail',
    CATALOG_CARD: 'catalog_card',
    CHECKOUT: 'checkout',
    PREVIEW: 'preview'
});

export const OPTIMIZATION_VERSION_V2 = 2;

export const SEMANTIC_VARIANT_MAP = Object.freeze({
    pos_thumbnail: { formatKey: 'pos_thumbnail', legacyField: 'pos_thumbnail_url', targetWidth: 144 },
    thumbnail: { formatKey: 'thumbnail', legacyField: 'thumbnail_url', targetWidth: 400 },
    catalog_card: { formatKey: 'medium', legacyField: 'medium_url', targetWidth: 1024 },
    checkout: { formatKey: 'thumbnail', legacyField: 'thumbnail_url', targetWidth: 400 },
    preview: { formatKey: 'large', legacyField: 'large_url', targetWidth: 1920 }
});

export const isExternalImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) return false;
    // Local invalid / local dev origins are treated as internal
    if (/^https?:\/\/(localhost|127\.0\.0\.1|local\.invalid)/i.test(trimmed)) return false;
    return true;
};

export const inspectImageLifecycleState = ({ storedPath, storedUrl, metadata, file = null } = {}) => {
    if (file) {
        return IMAGE_LIFECYCLE_STATES.REPLACED;
    }

    const rawUrl = String(storedUrl || '').trim();
    const rawPath = String(storedPath || '').trim();

    if (!rawUrl && !rawPath) {
        return IMAGE_LIFECYCLE_STATES.MISSING;
    }

    if (isExternalImageUrl(rawUrl)) {
        return IMAGE_LIFECYCLE_STATES.EXTERNAL;
    }

    if (
        metadata &&
        Number(metadata.optimization_version) === OPTIMIZATION_VERSION_V2 &&
        metadata.processing_status === 'optimized'
    ) {
        return IMAGE_LIFECYCLE_STATES.OPTIMIZED;
    }

    return IMAGE_LIFECYCLE_STATES.LEGACY;
};

export const resolveSemanticImageUrl = (imageTarget = {}, variantName = IMAGE_SEMANTIC_VARIANTS.CATALOG_CARD) => {
    if (!imageTarget) return null;

    const targetVariant = SEMANTIC_VARIANT_MAP[variantName] || SEMANTIC_VARIANT_MAP.catalog_card;

    // 1. Check variant_metadata (JSON object stored in storefront_catalog_overrides)
    const variantMetadata = imageTarget.variant_metadata || imageTarget.variantMetadata;
    if (variantMetadata && typeof variantMetadata === 'object') {
        const directUrl = variantMetadata[variantName]?.url || variantMetadata[targetVariant.formatKey]?.url;
        if (directUrl) return directUrl;
    }

    // 2. Check storefront_image_variants (derived variants object)
    const variants = imageTarget.storefront_image_variants
        || imageTarget.storefrontImageVariants
        || imageTarget.image_variants
        || imageTarget.variants;

    if (variants && typeof variants === 'object') {
        const formatVariants = variants.webp || variants.avif;
        if (formatVariants && typeof formatVariants === 'object') {
            const formattedUrl = formatVariants[targetVariant.legacyField] || formatVariants[`${targetVariant.formatKey}_url`];
            if (formattedUrl) return formattedUrl;
        }
        const variantUrl = variants[targetVariant.legacyField] || variants[`${targetVariant.formatKey}_url`];
        if (variantUrl) return variantUrl;
    }

    // 3. Check legacy URLs on the object
    const legacyUrl = imageTarget[targetVariant.legacyField]
        || imageTarget.storefront_image_url
        || imageTarget.storefrontImageUrl
        || imageTarget.pos_image_url
        || imageTarget.posImageUrl
        || imageTarget.url;

    return legacyUrl || null;
};
