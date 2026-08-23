const toSlug = (value) => String(value || '').trim().toLowerCase();

export const STOREFRONT_CART_STORAGE_VERSION = 1;
export const STOREFRONT_CART_STORAGE_TTL_MS = 24 * 60 * 60 * 1000;

const STOREFRONT_CART_STORAGE_PREFIX = 'dgfy_storefront_cart_v1:';

const optionalText = (value) => String(value || '').trim();

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

export const buildStorefrontCartStorageKey = (storeSlug = '') => {
  const normalizedStoreSlug = toSlug(storeSlug);
  return normalizedStoreSlug ? `${STOREFRONT_CART_STORAGE_PREFIX}${normalizedStoreSlug}` : '';
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
  const key = buildStorefrontCartStorageKey(storeSlug);
  if (!key) return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
    const requestedMode = optionalText(options.mode).toLowerCase();
    const parsedMode = optionalText(parsed?.mode).toLowerCase();
    const isModeMismatch = Boolean(requestedMode && parsedMode && requestedMode !== parsedMode);
    const normalized = normalizeStorefrontCartSnapshot(parsed, {
      ...options,
      storeSlug
    });
    // Keep a valid snapshot for another mode so a route transition can finish
    // loading its destination profile without destroying the original store
    // cart. It remains unreadable until the matching mode is active.
    const modeAgnosticSnapshot = !normalized && isModeMismatch
      ? normalizeStorefrontCartSnapshot(parsed, { ...options, mode: '', storeSlug })
      : null;
    if (!normalized && parsed && !modeAgnosticSnapshot) {
      window.localStorage.removeItem(key);
    }
    return normalized;
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
  const key = buildStorefrontCartStorageKey(storeSlug);
  if (!key) return null;
  const normalizedStoreSlug = toSlug(storeSlug);
  const normalizedMode = optionalText(mode).toLowerCase();
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
  return snapshot;
};

export const clearStorefrontCartSnapshot = (storeSlug, options = {}) => {
  if (typeof window === 'undefined') return;
  const key = buildStorefrontCartStorageKey(storeSlug);
  if (!key) return;

  const requestedMode = optionalText(options.mode).toLowerCase();
  if (requestedMode) {
    try {
      const parsed = JSON.parse(window.localStorage.getItem(key) || 'null');
      const storedMode = optionalText(parsed?.mode).toLowerCase();
      if (storedMode && storedMode !== requestedMode) return;
    } catch {
      // Invalid storage is safe to remove below.
    }
  }
  window.localStorage.removeItem(key);
};
