import { DomainError, DomainErrorCode } from '../contracts/domainErrors.js';

export const CUSTOMER_ACCESS_MODES = Object.freeze(['ghost', 'catalog', 'inquiry', 'transaction']);
export const INVENTORY_DISPLAY_MODES = Object.freeze(['hidden', 'availability', 'low_stock', 'exact_quantity']);

export const CUSTOMER_ACCESS_SETTING_KEYS = Object.freeze([
    'customer_access_mode',
    'inventory_display_mode',
    'inventory_low_stock_display_threshold',
    'tenant_onboarding_progress'
]);

export const DEFAULT_CUSTOMER_ACCESS_MODE = 'catalog';
export const DEFAULT_INVENTORY_DISPLAY_MODE = 'availability';
export const DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD = 5;

const isTruthyEnv = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    return ['1', 'true', 'yes', 'on'].includes(raw);
};

const parseTenantAllowlist = (value) => String(value || '')
    .split(',')
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

const extractTenantIdentifiers = (context = {}) => [
    context.tenantId,
    context.tenant_id,
    context.resolvedTenantId,
    context.tenantToken,
    context.tenant_token,
    context.companyToken,
    context.company_token,
    context.slug,
    context.tenantSlug,
    context.tenantName,
    context.tenant_name
]
    .map((entry) => String(entry || '').trim().toLowerCase())
    .filter(Boolean);

const CUSTOMER_ACCESS_MODE_RANK = Object.freeze({
    ghost: 0,
    catalog: 1,
    inquiry: 2,
    transaction: 3
});

const REGISTRATION_STAGE_MAX_MODE = Object.freeze({
    informal: 'catalog',
    partial: 'inquiry',
    registered: 'transaction'
});

export const isCustomerAccessModesEnabled = (context = {}) => {
    if (isTruthyEnv(process.env.CUSTOMER_ACCESS_MODES_ENABLED)) return true;

    const allowlist = parseTenantAllowlist(process.env.CUSTOMER_ACCESS_MODES_ENABLED_TENANTS);
    if (allowlist.length === 0) return false;
    if (allowlist.includes('*')) return true;

    const tenantIdentifiers = extractTenantIdentifiers(context);
    return tenantIdentifiers.some((identifier) => allowlist.includes(identifier));
};

export const normalizeCustomerAccessMode = (value, fallback = DEFAULT_CUSTOMER_ACCESS_MODE) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (CUSTOMER_ACCESS_MODES.includes(normalized)) return normalized;
    const fallbackNormalized = String(fallback || '').trim().toLowerCase();
    return CUSTOMER_ACCESS_MODES.includes(fallbackNormalized)
        ? fallbackNormalized
        : DEFAULT_CUSTOMER_ACCESS_MODE;
};

export const normalizeLegacyVisibilityMode = normalizeCustomerAccessMode;

export const normalizeInventoryDisplayMode = (value, fallback = DEFAULT_INVENTORY_DISPLAY_MODE) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (INVENTORY_DISPLAY_MODES.includes(normalized)) return normalized;
    const fallbackNormalized = String(fallback || '').trim().toLowerCase();
    return INVENTORY_DISPLAY_MODES.includes(fallbackNormalized)
        ? fallbackNormalized
        : DEFAULT_INVENTORY_DISPLAY_MODE;
};

export const normalizeLowStockDisplayThreshold = (value, fallback = DEFAULT_LOW_STOCK_DISPLAY_THRESHOLD) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 9999) return parsed;
    return fallback;
};

export const compareCustomerAccessModes = (left, right) => (
    CUSTOMER_ACCESS_MODE_RANK[normalizeCustomerAccessMode(left)]
    - CUSTOMER_ACCESS_MODE_RANK[normalizeCustomerAccessMode(right)]
);

export const minCustomerAccessMode = (left, right) => (
    compareCustomerAccessModes(left, right) <= 0
        ? normalizeCustomerAccessMode(left)
        : normalizeCustomerAccessMode(right)
);

export const normalizeRegistrationStage = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'registered') return 'registered';
    if (normalized === 'partial' || normalized === 'pending' || normalized === 'in_progress') return 'partial';
    return 'informal';
};

export const extractRegistrationStageFromProgress = (progress = null) => {
    const payloadStage = progress?.step_payloads?.business_classification?.legitimacy?.registration_status;
    if (payloadStage) return normalizeRegistrationStage(payloadStage);

    const snapshotStage = progress?.classification_snapshot?.payload?.legitimacy?.registration_status;
    if (snapshotStage) return normalizeRegistrationStage(snapshotStage);

    return 'informal';
};

export const getMaxCustomerAccessModeForStage = (registrationStage) => (
    REGISTRATION_STAGE_MAX_MODE[normalizeRegistrationStage(registrationStage)] || DEFAULT_CUSTOMER_ACCESS_MODE
);

export const buildAccessCapabilities = (effectiveMode) => {
    const mode = normalizeCustomerAccessMode(effectiveMode);
    return {
        profile: true,
        contact: true,
        catalog: mode !== 'ghost',
        inventory: mode !== 'ghost',
        inquiry: mode === 'inquiry',
        cart: mode === 'transaction',
        quote: mode === 'transaction',
        checkout: mode === 'transaction',
        booking: mode === 'transaction',
        payment: mode === 'transaction'
    };
};

export const resolveEffectiveCustomerAccessMode = ({
    requestedMode,
    legacyVisibilityMode,
    registrationStage,
    featureEnabled = isCustomerAccessModesEnabled()
} = {}) => {
    const requested = normalizeCustomerAccessMode(
        requestedMode || legacyVisibilityMode,
        DEFAULT_CUSTOMER_ACCESS_MODE
    );
    const normalizedStage = normalizeRegistrationStage(registrationStage);
    const maxAllowed = getMaxCustomerAccessModeForStage(normalizedStage);
    const effective = featureEnabled
        ? minCustomerAccessMode(requested, maxAllowed)
        : 'transaction';
    const limitationReason = featureEnabled && effective !== requested
        ? `Registration stage ${normalizedStage} allows up to ${maxAllowed} mode.`
        : null;

    return {
        customer_access_mode: requested,
        requested_customer_access_mode: requested,
        effective_customer_access_mode: effective,
        max_customer_access_mode: maxAllowed,
        registration_stage: normalizedStage,
        limitation_reason: limitationReason,
        customer_access_modes_enabled: featureEnabled,
        access_capabilities: buildAccessCapabilities(effective)
    };
};

export const resolveAccessPolicyFromSettings = (settings = {}, options = {}) => {
    const progress = settings?.tenant_onboarding_progress?.value || settings?.tenant_onboarding_progress || options.progress || null;
    const registrationStage = options.registrationStage || extractRegistrationStageFromProgress(progress);
    const resolved = resolveEffectiveCustomerAccessMode({
        requestedMode: settings?.customer_access_mode?.value ?? settings?.customer_access_mode,
        legacyVisibilityMode: progress?.classification_snapshot?.visibility_mode,
        registrationStage,
        featureEnabled: options.featureEnabled ?? isCustomerAccessModesEnabled()
    });
    const inventoryDisplayMode = normalizeInventoryDisplayMode(
        settings?.inventory_display_mode?.value ?? settings?.inventory_display_mode
    );
    const lowStockThreshold = normalizeLowStockDisplayThreshold(
        settings?.inventory_low_stock_display_threshold?.value
            ?? settings?.inventory_low_stock_display_threshold
    );

    return {
        ...resolved,
        inventory_display_mode: inventoryDisplayMode,
        inventory_low_stock_display_threshold: lowStockThreshold
    };
};

export const buildCustomerAccessModeBlockedError = ({ action, accessPolicy }) => new DomainError(
    DomainErrorCode.CUSTOMER_ACCESS_MODE_BLOCKED,
    `Customer access mode does not allow ${action}`,
    {
        statusCode: 403,
        details: {
            requested_action: action,
            requested_mode: accessPolicy?.requested_customer_access_mode || accessPolicy?.customer_access_mode || DEFAULT_CUSTOMER_ACCESS_MODE,
            effective_mode: accessPolicy?.effective_customer_access_mode || DEFAULT_CUSTOMER_ACCESS_MODE,
            limitation_reason: accessPolicy?.limitation_reason || 'The storefront is not in transaction mode.',
            allowed_capabilities: accessPolicy?.access_capabilities || buildAccessCapabilities(DEFAULT_CUSTOMER_ACCESS_MODE)
        }
    }
);

export const applyInventoryDisplayPolicy = (item = {}, accessPolicy = {}) => {
    const mode = normalizeInventoryDisplayMode(accessPolicy.inventory_display_mode);
    const availabilityStatus = String(item.availability_status || '').trim().toLowerCase();
    const isServiceItem = String(item.category || '').trim().toLowerCase() === 'service';
    const isAvailable = item.is_available === true
        || availabilityStatus === 'in_stock'
        || availabilityStatus === 'bookable'
        || (isServiceItem && availabilityStatus !== 'out_of_stock');
    const stock = Math.max(0, Number(item.current_stock || 0));
    const roundedStock = Math.round(stock * 10000) / 10000;
    const threshold = normalizeLowStockDisplayThreshold(accessPolicy.inventory_low_stock_display_threshold);

    if (mode === 'hidden') {
        return { mode, label: null };
    }

    if (mode === 'exact_quantity' && !isServiceItem) {
        return {
            mode,
            label: isAvailable ? `${roundedStock} available` : 'Not available',
            display_quantity: isAvailable ? roundedStock : 0
        };
    }

    if (mode === 'low_stock' && !isServiceItem) {
        if (!isAvailable) return { mode, label: 'Not available' };
        if (roundedStock > 0 && roundedStock <= threshold) {
            return {
                mode,
                label: `Only ${roundedStock} left`,
                display_quantity: roundedStock
            };
        }
        return { mode, label: 'Available' };
    }

    return {
        mode: 'availability',
        label: isServiceItem
            ? (isAvailable ? 'Bookable' : 'Unavailable')
            : (isAvailable ? 'Available' : 'Not available')
    };
};
