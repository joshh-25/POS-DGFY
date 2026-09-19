const toSlug = (value) => String(value || '').trim().toLowerCase();

export const STOREFRONT_CART_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

// v2 makes the physical browser key match the logical scope used by the hook.
// v1 was keyed only by store slug, so the same slug could overwrite another
// workflow mode's unfinished cart before the payload mode check ran.
export const STOREFRONT_CART_LEGACY_STORAGE_VERSION = 1;
export const STOREFRONT_CART_STORAGE_VERSION = 2;
const STOREFRONT_CART_STORAGE_PREFIX = 'dgfy_storefront_cart_v2:';
const STOREFRONT_CART_LEGACY_STORAGE_PREFIX = 'dgfy_storefront_cart_v1:';

const optionalText = (value) => String(value || '').trim();

const normalizeMode = (value) => optionalText(value).toLowerCase();

const encodeStorageSegment = (value) => encodeURIComponent(String(value || ''));

const resolveStorageMode = (options) => normalizeMode(
  typeof options === 'string' ? options : options?.mode
);

const normalizeImageVariantSet = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const normalized = {
    thumbnail_url: optionalText(value.thumbnail_url) || null,
    medium_url: optionalText(value.medium_url) || null,
    large_url: optionalText(value.large_url) || null
  };
  return Object.values(normalized).some(Boolean) ? normalized : null;
};

const normalizeImageVariants = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const fallback = normalizeImageVariantSet(value);
  const avif = normalizeImageVariantSet(value.avif);
  const webp = normalizeImageVariantSet(value.webp);
  const placeholderUrl = optionalText(value.placeholder_url) || null;
  const version = Number(value.version);
  const normalized = {
    ...(fallback || {}),
    ...(avif ? { avif } : {}),
    ...(webp ? { webp } : {}),
    ...(placeholderUrl ? { placeholder_url: placeholderUrl } : {}),
    ...(Number.isFinite(version) && version > 0 ? { version } : {})
  };
  return Object.keys(normalized).length > 0 ? normalized : null;
};

const normalizeCartModifier = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const modifierGroupId = entry.modifier_group_id;
  const modifierOptionId = entry.modifier_option_id;
  if (modifierGroupId == null || modifierOptionId == null) return null;
  return {
    modifier_group_id: modifierGroupId,
    modifier_option_id: modifierOptionId,
    option_name: optionalText(entry.option_name),
    price_delta: Number(entry.price_delta || 0) || 0,
    quantity: Math.min(99, Math.max(1, Number.parseInt(entry.quantity || 1, 10) || 1))
  };
};

const normalizeSelectedServiceOption = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const optionId = Number(entry.option_id);
  if (!Number.isInteger(optionId) || optionId <= 0) return null;
  return {
    option_id: optionId,
    group_id: Number(entry.group_id) || null,
    group_name: optionalText(entry.group_name),
    group_type: entry.group_type === 'variation' ? 'variation' : 'addon',
    name: optionalText(entry.name),
    price_adjustment_centavos: Number(entry.price_adjustment_centavos || 0) || 0,
    duration_adjustment_minutes: Number(entry.duration_adjustment_minutes || 0) || 0
  };
};

const normalizeServiceOptionGroup = (group) => {
  if (!group || typeof group !== 'object') return null;
  const groupId = Number(group.group_id);
  if (!Number.isInteger(groupId) || groupId <= 0) return null;
  const options = (Array.isArray(group.options) ? group.options : [])
    .map((option) => normalizeSelectedServiceOption({
      ...option,
      group_id: groupId,
      group_name: group.name,
      group_type: group.group_type
    }))
    .filter(Boolean);
  if (options.length === 0) return null;
  return {
    group_id: groupId,
    name: optionalText(group.name),
    description: optionalText(group.description),
    group_type: group.group_type === 'variation' ? 'variation' : 'addon',
    selection_type: group.selection_type === 'multi' ? 'multi' : 'single',
    min_selections: Math.max(0, Number(group.min_selections || 0)),
    max_selections: Math.max(1, Number(group.max_selections || 1)),
    is_required: group.is_required === true,
    options
  };
};

export const normalizeStorefrontCartLine = (line) => {
  if (!line || typeof line !== 'object') return null;
  const itemId = Number(line.item_id);
  const quantity = Math.max(0, Number(line.quantity || 0) || 0);
  if (!Number.isFinite(itemId) || itemId <= 0 || quantity <= 0) return null;

  const selectedOptions = (Array.isArray(line.selected_options) ? line.selected_options : [])
    .map(normalizeSelectedServiceOption)
    .filter(Boolean);
  const selectedOptionIds = [...new Set([
    ...(Array.isArray(line.selected_option_ids) ? line.selected_option_ids : []),
    ...selectedOptions.map((option) => option.option_id)
  ].map(Number).filter((optionId) => Number.isInteger(optionId) && optionId > 0))];

  return {
    item_id: itemId,
    cart_line_id: optionalText(line.cart_line_id) || `${itemId}:default`,
    name: optionalText(line.name),
    variantName: optionalText(line.variantName),
    category: optionalText(line.category).toLowerCase(),
    service_detail: line.service_detail && typeof line.service_detail === 'object' ? line.service_detail : null,
    quantity,
    price: Number(line.price || 0) || 0,
    ...(optionalText(line.category).toLowerCase() === 'service' && Number.isFinite(Number(line.base_price))
      ? { base_price: Number(line.base_price) }
      : {}),
    image_url: optionalText(line.image_url) || null,
    thumbnail_url: optionalText(line.thumbnail_url) || optionalText(line.image_url) || null,
    image_variants: normalizeImageVariants(line.image_variants),
    unit_of_measure: optionalText(line.unit_of_measure),
    max_stock: line.max_stock == null
      ? Number.POSITIVE_INFINITY
      : (Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY),
    has_modifier_groups: line.has_modifier_groups === true,
    serviceAreaLabel: optionalText(line.serviceAreaLabel),
    durationLabel: optionalText(line.durationLabel),
    line_modifiers: (Array.isArray(line.line_modifiers) ? line.line_modifiers : [])
      .map(normalizeCartModifier)
      .filter(Boolean),
    selected_option_ids: selectedOptionIds,
    selected_options: selectedOptions,
    service_option_groups: (Array.isArray(line.service_option_groups) ? line.service_option_groups : [])
      .map(normalizeServiceOptionGroup)
      .filter(Boolean),
    service_notes: optionalText(line.service_notes),
    service_schedule_at: optionalText(line.service_schedule_at),
    payment_timing: optionalText(line.payment_timing),
    intake_responses: line.intake_responses && typeof line.intake_responses === 'object'
      ? line.intake_responses
      : null
  };
};

export const buildStorefrontCartStorageKey = (storeSlug = '', options = {}) => {
  const normalizedStoreSlug = toSlug(storeSlug);
  if (!normalizedStoreSlug) return '';
  const normalizedMode = resolveStorageMode(options) || 'default';
  return `${STOREFRONT_CART_STORAGE_PREFIX}${encodeStorageSegment(normalizedMode)}:${encodeStorageSegment(normalizedStoreSlug)}`;
};

export const buildLegacyStorefrontCartStorageKey = (storeSlug = '') => {
  const normalizedStoreSlug = toSlug(storeSlug);
  return normalizedStoreSlug
    ? `${STOREFRONT_CART_LEGACY_STORAGE_PREFIX}${encodeStorageSegment(normalizedStoreSlug)}`
    : '';
};

export const normalizeStorefrontCartSnapshot = (value, options = {}) => {
  if (!value || typeof value !== 'object') return null;

  const currentStoreSlug = toSlug(options.storeSlug);
  const currentMode = optionalText(options.mode).toLowerCase();
  const snapshotStoreSlug = toSlug(value.storeSlug);
  const snapshotMode = optionalText(value.mode).toLowerCase();
  if (!snapshotStoreSlug || (currentStoreSlug && snapshotStoreSlug !== currentStoreSlug)) return null;
  if (currentMode && snapshotMode && snapshotMode !== currentMode) return null;

  const now = Number(options.now) || Date.now();
  const savedAt = Number(value.savedAt) || now;
  const expiresAt = Number(value.expiresAt) || (savedAt + STOREFRONT_CART_STORAGE_TTL_MS);
  if (expiresAt <= now) return null;

  const cart = (Array.isArray(value.cart) ? value.cart : [])
    .map(normalizeStorefrontCartLine)
    .filter(Boolean);
  if (cart.length === 0) return null;

  // #768: an applied voucher/promo code is scoped to the same store+mode as the cart it was
  // applied against, so it rides along in the same snapshot rather than a second storage key --
  // one read, one write, no separate expiry/mode-mismatch logic to keep in sync with the cart's own.
  const voucherCode = optionalText(value.voucherCode).toUpperCase();
  const promoCode = optionalText(value.promoCode).toUpperCase();

  return {
    version: STOREFRONT_CART_STORAGE_VERSION,
    storeSlug: snapshotStoreSlug,
    mode: snapshotMode || currentMode,
    cart,
    voucherCode,
    promoCode,
    savedAt,
    expiresAt
  };
};

export const readStorefrontCartSnapshot = (storeSlug, options = {}) => {
  if (typeof window === 'undefined') return null;
  const normalizedMode = resolveStorageMode(options);
  const key = buildStorefrontCartStorageKey(storeSlug, { mode: normalizedMode });
  const legacyKey = buildLegacyStorefrontCartStorageKey(storeSlug);
  if (!key || !legacyKey) return null;
  try {
    const candidateKeys = [key];
    if (legacyKey !== key) candidateKeys.push(legacyKey);

    for (const candidateKey of candidateKeys) {
      const parsed = JSON.parse(window.localStorage.getItem(candidateKey) || 'null');
      if (!parsed) continue;

      const parsedMode = normalizeMode(parsed.mode);
      const isLegacyModeMismatch = candidateKey === legacyKey
        && Boolean(normalizedMode && parsedMode && parsedMode !== normalizedMode);
      const normalized = isLegacyModeMismatch
        ? null
        : normalizeStorefrontCartSnapshot(parsed, {
          ...options,
          mode: normalizedMode,
          storeSlug
        });

      if (normalized) {
        // Migrate a still-valid v1 snapshot into its mode-specific v2 key. A
        // legacy payload without a mode is safe to claim for the first mode
        // that reads it; a payload with another mode stays untouched.
        if (candidateKey === legacyKey && normalizedMode) {
          window.localStorage.setItem(key, JSON.stringify(normalized));
          if (!parsedMode || parsedMode === normalizedMode) {
            window.localStorage.removeItem(legacyKey);
          }
        }
        return normalized;
      }

      // A legacy snapshot for another mode may still be valid for that mode;
      // never delete it merely because the current route is different. A
      // malformed/expired current v2 entry, however, is safe to remove.
      if (candidateKey === key && !isLegacyModeMismatch) {
        window.localStorage.removeItem(candidateKey);
      } else if (candidateKey === legacyKey && !isLegacyModeMismatch) {
        window.localStorage.removeItem(candidateKey);
      }
    }
    return null;
  } catch {
    window.localStorage.removeItem(key);
    return null;
  }
};

export const writeStorefrontCartSnapshot = ({
  cart,
  mode = '',
  now = Date.now(),
  promoCode = '',
  storeSlug,
  ttlMs = STOREFRONT_CART_STORAGE_TTL_MS,
  voucherCode = ''
} = {}) => {
  if (typeof window === 'undefined') return null;
  const normalizedMode = normalizeMode(mode);
  const key = buildStorefrontCartStorageKey(storeSlug, { mode: normalizedMode });
  const legacyKey = buildLegacyStorefrontCartStorageKey(storeSlug);
  if (!key) return null;
  const normalizedStoreSlug = toSlug(storeSlug);
  const snapshot = normalizeStorefrontCartSnapshot({
    version: STOREFRONT_CART_STORAGE_VERSION,
    storeSlug: normalizedStoreSlug,
    mode: normalizedMode,
    cart,
    voucherCode,
    promoCode,
    savedAt: now,
    expiresAt: now + ttlMs
  }, {
    mode: normalizedMode,
    now,
    storeSlug: normalizedStoreSlug
  });
  if (!snapshot) {
    window.localStorage.removeItem(key);
    return null;
  }
  window.localStorage.setItem(key, JSON.stringify(snapshot));
  if (legacyKey && legacyKey !== key) {
    try {
      const legacySnapshot = JSON.parse(window.localStorage.getItem(legacyKey) || 'null');
      const legacyMode = normalizeMode(legacySnapshot?.mode);
      if (!legacyMode || legacyMode === normalizedMode) {
        window.localStorage.removeItem(legacyKey);
      }
    } catch {
      window.localStorage.removeItem(legacyKey);
    }
  }
  return snapshot;
};

export const clearStorefrontCartSnapshot = (storeSlug, options = {}) => {
  if (typeof window === 'undefined') return;
  const requestedMode = resolveStorageMode(options);
  const key = buildStorefrontCartStorageKey(storeSlug, { mode: requestedMode });
  const legacyKey = buildLegacyStorefrontCartStorageKey(storeSlug);
  if (!key || !legacyKey) return;

  window.localStorage.removeItem(key);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(legacyKey) || 'null');
    const storedMode = normalizeMode(parsed?.mode);
    if (!requestedMode || !storedMode || storedMode === requestedMode) {
      window.localStorage.removeItem(legacyKey);
    }
  } catch {
    window.localStorage.removeItem(legacyKey);
  }
};
