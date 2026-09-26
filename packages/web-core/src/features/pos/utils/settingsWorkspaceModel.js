import { normalizeStorefrontBusinessHours, serializeStorefrontBusinessHours } from '../../settings/storefrontBusinessHours.js';
import { normalizeDeliveryRadiusKm } from '../../settings/deliveryRadius.js';
import { evaluateFulfillmentLeadTime } from '../../settings/fulfillmentLeadTime.js';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from './terminalIdentity.js';

export const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
export const TERMINAL_REGISTRY_MODE_OPTIONS = ['warn', 'enforce'];
export const CUSTOMER_ACCESS_MODE_RANK = { ghost: 0, catalog: 1, inquiry: 2, transaction: 3 };

const CUSTOMER_ACCESS_MODE_VALUES = new Set(Object.keys(CUSTOMER_ACCESS_MODE_RANK));

export const normalizeCustomerAccessMode = (value, fallback = 'catalog') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CUSTOMER_ACCESS_MODE_VALUES.has(normalized) ? normalized : fallback;
};

export const mapCustomerAccessRuntimeSettings = (systemSettings = {}) => ({
  customerAccessMode: normalizeCustomerAccessMode(systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessEffectiveMode: normalizeCustomerAccessMode(systemSettings.effective_customer_access_mode?.value || systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessMaxMode: normalizeCustomerAccessMode(systemSettings.max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessPlatformMaxMode: normalizeCustomerAccessMode(systemSettings.platform_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessRegistrationStageMaxMode: normalizeCustomerAccessMode(systemSettings.registration_stage_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessLimitationReason: String(systemSettings.customer_access_limitation_reason?.value || ''),
  customerAccessRegistrationStage: String(systemSettings.customer_access_registration_stage?.value || 'registered').trim().toLowerCase() || 'registered',
  customerAccessFlagStatus: systemSettings.customer_access_modes_enabled?.value === false ? 'rollback' : 'enabled'
});

export const normalizeSettingsUpdatedAt = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export const getSettingsUpdatedAt = (setting = null) => normalizeSettingsUpdatedAt(
  setting?.updated_at ?? setting?.updatedAt
);

export const buildSettingsVersionMap = (settingsPayload = {}) => Object.fromEntries(
  Object.entries(settingsPayload || {})
    .map(([key, setting]) => [key, getSettingsUpdatedAt(setting)])
    .filter(([, updatedAt]) => Boolean(updatedAt))
);

export const getSettingsWriteFailureMessage = (error, fallbackMessage = 'Settings were not saved.') => {
  const status = Number(error?.response?.status || error?.statusCode || 0);
  const responseMessage = error?.response?.data?.message;
  if (status === 409) {
    return responseMessage || 'These settings changed in another session. Refresh the values and try again.';
  }

  const message = String(error?.message || '').toLowerCase();
  const requestFailed = Boolean(error?.request) && !error?.response;
  const browserOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (browserOffline || requestFailed || /network|offline|failed to fetch|timeout|econnaborted/.test(message)) {
    return 'Settings were not saved because this device is offline. Reconnect and try again.';
  }

  return responseMessage || fallbackMessage;
};

export const normalizeStringList = (raw, maxItems = 8, maxLen = 120) => {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((entry) => String(entry || '').trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
};

export const parseJsonObjectSetting = (raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

export const parseNullableNumberInput = (value, {
  integer = false,
  min = null,
  max = null,
  precision = null
} = {}) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  if (integer && !Number.isInteger(parsed)) return null;
  let normalized = parsed;
  if (min != null && normalized < min) return null;
  if (max != null && normalized > max) return null;
  if (typeof precision === 'number' && Number.isInteger(precision) && precision >= 0) {
    normalized = Number(normalized.toFixed(precision));
  }
  return normalized;
};

export const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

export const sanitizeDiscountProfile = (profile) => ({
  name: String(profile?.name || '').trim(),
  percentage: Number(profile?.percentage ?? 0),
  active: profile?.active !== false
});

export const normalizeDiscountProfiles = (rawProfiles) => {
  let parsed = rawProfiles;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];
  return parsed.map(sanitizeDiscountProfile);
};

export const normalizeStorefrontGallerySettings = (raw) => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const url = String(entry.url || '').trim().slice(0, 500);
      const path = String(entry.path || '').trim().slice(0, 500);
      if (!url && !path) return null;
      return {
        url,
        path,
        caption: String(entry.caption || '').trim().slice(0, 140),
        alt: String(entry.alt || '').trim().slice(0, 140),
        sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
      };
    })
    .filter(Boolean)
    .slice(0, 24)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
  return normalized.length > 0 ? normalized : [{ url: '', path: '', caption: '', alt: '', sort_order: 0 }];
};

export const normalizeStorefrontDeliveryPartnersSettings = (raw) => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((entry) => {
      if (typeof entry === 'string') {
        const partner = String(entry || '').trim().toLowerCase();
        if (!partner) return null;
        return { partner, label: '', url: '' };
      }
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const partner = String(entry.partner || '').trim().toLowerCase();
      if (!partner) return null;
      return {
        partner,
        label: String(entry.label || '').trim().slice(0, 60),
        url: String(entry.url || '').trim().slice(0, 255)
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return normalized.length > 0 ? normalized : [{ partner: 'grab', label: '', url: '' }];
};

export const normalizeStorefrontReviewSummarySettings = (raw) => {
  const parsed = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const starDistribution = parsed.star_distribution && typeof parsed.star_distribution === 'object' && !Array.isArray(parsed.star_distribution)
    ? parsed.star_distribution
    : {};
  return {
    score: parsed.score == null ? '' : String(parsed.score),
    total_count: parsed.total_count == null ? '' : String(parsed.total_count),
    star1: starDistribution[1] == null ? '' : String(starDistribution[1]),
    star2: starDistribution[2] == null ? '' : String(starDistribution[2]),
    star3: starDistribution[3] == null ? '' : String(starDistribution[3]),
    star4: starDistribution[4] == null ? '' : String(starDistribution[4]),
    star5: starDistribution[5] == null ? '' : String(starDistribution[5])
  };
};

export const serializeStorefrontGallerySettings = (raw) => {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((entry, index) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
      const url = String(entry.url || '').trim().slice(0, 500);
      const path = String(entry.path || '').trim().slice(0, 500);
      if (!url && !path) return null;
      return {
        url,
        path,
        caption: String(entry.caption || '').trim().slice(0, 140),
        alt: String(entry.alt || '').trim().slice(0, 140),
        sort_order: Number.isInteger(Number(entry.sort_order)) ? Number(entry.sort_order) : index
      };
    })
    .filter(Boolean)
    .slice(0, 24)
    .sort((left, right) => Number(left.sort_order || 0) - Number(right.sort_order || 0));
};

export const serializeStorefrontReviewSummary = (form = {}) => {
  const starDistribution = {};
  [
    ['1', form.storefrontReviewSummaryStar1],
    ['2', form.storefrontReviewSummaryStar2],
    ['3', form.storefrontReviewSummaryStar3],
    ['4', form.storefrontReviewSummaryStar4],
    ['5', form.storefrontReviewSummaryStar5]
  ].forEach(([star, value]) => {
    const parsed = parseNullableNumberInput(value, { integer: true, min: 0 });
    if (parsed !== null) {
      starDistribution[star] = parsed;
    }
  });

  const summary = {
    score: parseNullableNumberInput(form.storefrontReviewSummaryScore, { min: 0, max: 5, precision: 1 }),
    total_count: parseNullableNumberInput(form.storefrontReviewSummaryTotalCount, { integer: true, min: 0 })
  };

  if (Object.keys(starDistribution).length > 0) {
    summary.star_distribution = starDistribution;
  }

  return summary;
};

export const SETTINGS_FIELD_LABELS = {
  name: 'Location Name',
  address_line: 'Location Address',
  latitude: 'Latitude',
  longitude: 'Longitude',
  store_is_visible: 'Storefront Visible',
  store_has_no_location: 'Searchable Without Map Pin',
  customer_access_mode: 'Customer Access Mode',
  storefront_tagline: 'Storefront Tagline',
  storefront_about: 'Storefront About',
  storefront_phone: 'Storefront Phone',
  storefront_email: 'Storefront Email',
  storefront_hours: 'Storefront Hours',
  storefront_why_choose_us: 'Storefront Why Choose Us',
  storefront_social_links: 'Storefront Social Links',
  storefront_review_highlights: 'Storefront Review Highlights',
  storefront_review_summary: 'Storefront Review Summary',
  storefront_promo: 'Storefront Promo',
  storefront_promos: 'Storefront Promos',
  storefront_ui_v2_enabled: 'Storefront UI V2',
  storefront_categories: 'Storefront Categories',
  storefront_gallery_images: 'Storefront Gallery Images',
  storefront_delivery_partners: 'Storefront Delivery Partners',
  storefront_follow_enabled: 'Show Follow Button',
  storefront_share_enabled: 'Show Share Button',
  storefront_guest_checkout_enabled: 'Allow Guest Checkout',
  storefront_cash_payment_enabled: 'Accept Cash on Delivery/Pickup',
  'storefront_locations.primary_location': 'Primary Storefront Location'
};

export const formatFirstValidationError = (error, fallbackMessage) => {
  const primaryError = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors.find((entry) => String(entry?.message || '').trim())
    : null;

  if (primaryError) {
    const field = String(primaryError.field || '').trim();
    const message = String(primaryError.message || '').trim();
    return field ? `${field}: ${message}` : message;
  }

  return error?.response?.data?.message || fallbackMessage;
};

export const formatValidationErrorDescription = (apiErrors) => {
  if (!Array.isArray(apiErrors) || apiErrors.length === 0) return '';
  return apiErrors
    .slice(0, 5)
    .map((entry) => `${SETTINGS_FIELD_LABELS[entry.field] || entry.field}: ${entry.message}`)
    .join(' | ');
};

export const collectValidationErrors = (error, fallbackMessage = 'Validation failed') => {
  const responseErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
      .map((entry) => ({
        field: String(entry?.field || '').trim(),
        message: String(entry?.message || '').trim()
      }))
      .filter((entry) => entry.message)
    : [];

  if (responseErrors.length > 0) return responseErrors;

  const responseMessage = String(error?.response?.data?.message || error?.message || fallbackMessage).trim();
  return responseMessage ? [{ field: '', message: responseMessage }] : [];
};

export const formatValidationModalTitle = (contextLabel) => `${contextLabel} Error`;

export const createDefaultLocationForm = () => ({
  name: '',
  address_line: '',
  latitude: '10.7202',
  longitude: '122.5621',
  location_version: '',
  delivery_radius_km: '5',
  current_wait_time_minutes: '15',
  is_open: true,
  is_active: true,
  is_primary_storefront: false,
  allow_out_of_stock_sales: false,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: true,
  scheduling_enabled: true,
  immediate_fulfillment_enabled: true,
  fulfillment_lead_time_min_days: '',
  fulfillment_lead_time_max_days: ''
});

export const hydratePosSettingsForm = (settingsPayload = {}, terminalMeta = {}) => {
  const discountProfiles = settingsPayload?.pos_discount_profiles?.value || [];
  const activeDiscountCount = Array.isArray(discountProfiles)
    ? discountProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
    : 0;
  const registryMode = String(settingsPayload?.pos_terminal_registry_mode?.value || '').trim().toLowerCase();
  const bestSellerSettings = settingsPayload?.pos_best_seller_settings?.value || {};

  return {
    registeredName: String(settingsPayload?.pos_registered_name?.value || ''),
    businessName: String(settingsPayload?.pos_business_name?.value || ''),
    businessStyle: String(settingsPayload?.pos_business_style?.value || ''),
    taxpayerType: String(settingsPayload?.pos_taxpayer_type?.value || ''),
    tinBranch: String(settingsPayload?.pos_tin_branch?.value || ''),
    businessAddress: String(settingsPayload?.pos_address?.value || ''),
    ptuNumber: String(settingsPayload?.pos_ptu_number?.value || ''),
    minNumber: String(settingsPayload?.pos_min_number?.value || ''),
    accreditationNumber: String(settingsPayload?.pos_accreditation_number?.value || ''),
    fiscalBuyerDetailsRequired: settingsPayload?.pos_fiscal_buyer_details_required?.value === true,
    receiptFooterMessage: String(settingsPayload?.pos_receipt_footer_message?.value || ''),
    terminalRegistry: normalizeTerminalRegistry(settingsPayload?.pos_terminal_registry?.value || []),
    terminalRegistryMode: TERMINAL_REGISTRY_MODE_OPTIONS.includes(registryMode) ? registryMode : 'warn',
    terminalLocationBindingEnforced: settingsPayload?.pos_terminal_location_binding_enforced?.value === true,
    voucherPosRedemptionEnabled: settingsPayload?.voucher_pos_redemption_enabled?.value === true,
    settingsAccessPinEnabled: settingsPayload?.pos_settings_access_pin_enabled?.value === true,
    settingsAccessPin: '',
    clearSettingsAccessPin: false,
    discountProfiles: normalizeDiscountProfiles(discountProfiles),
    employeeDiscountSelfApprovalEnabled: settingsPayload?.pos_employee_discount_self_approval_enabled?.value === true,
    posReceiptMetadataPendingReview: settingsPayload?.pos_receipt_metadata_pending_changes?.value?.status === 'pending_review'
      ? settingsPayload.pos_receipt_metadata_pending_changes.value
      : null,
    pettyCashSymbol: String(settingsPayload?.pos_petty_cash_symbol?.value || terminalMeta?.pettyCashSymbol || 'PHP'),
    pettyCashAmount: Number(settingsPayload?.pos_petty_cash_amount?.value ?? terminalMeta?.pettyCashAmount ?? 0) || 0,
    activeDiscountCount,
    posOpenStatus: settingsPayload?.pos_open_status?.value ?? true,
    posWaitTimeMinutes: Number(settingsPayload?.pos_wait_time_minutes?.value ?? 15) || 15,
    inventoryLowStockDisplayThreshold: Number(settingsPayload?.inventory_low_stock_display_threshold?.value ?? 5) || 5,
    bestSellerAutoTaggingEnabled: bestSellerSettings?.enabled !== false,
    dailyTopBestSellerEnabled: bestSellerSettings?.daily_top_enabled === true
  };
};

export const hydrateStorefrontSettingsForm = (settingsPayload = {}) => {
  const storefrontSocialLinks = parseJsonObjectSetting(settingsPayload?.storefront_social_links?.value);
  const normalizedReviewSummary = normalizeStorefrontReviewSummarySettings(
    parseJsonObjectSetting(settingsPayload?.storefront_review_summary?.value)
  );
  const customerAccessRuntime = mapCustomerAccessRuntimeSettings(settingsPayload);
  const storefrontReviewHighlightsRaw = Array.isArray(settingsPayload?.storefront_review_highlights?.value)
    ? settingsPayload.storefront_review_highlights.value
    : [];
  const storefrontGalleryImagesRaw = Array.isArray(settingsPayload?.storefront_gallery_images?.value)
    ? settingsPayload.storefront_gallery_images.value
    : [];
  const storefrontDeliveryPartnersRaw = Array.isArray(settingsPayload?.storefront_delivery_partners?.value)
    ? settingsPayload.storefront_delivery_partners.value
    : [];
  const storefrontCategoriesRaw = Array.isArray(settingsPayload?.storefront_categories?.value)
    ? settingsPayload.storefront_categories.value
    : [];
  const normalizedWhyChooseUs = normalizeStringList(settingsPayload?.storefront_why_choose_us?.value, 6, 120);
  const normalizedCategories = normalizeStringList(storefrontCategoriesRaw, 12, 60);

  return {
    storeTenantSlug: String(settingsPayload?.store_tenant_slug?.value || '').trim().toLowerCase(),
    storeIsVisible: settingsPayload?.store_is_visible?.value === true,
    storeHasNoLocation: settingsPayload?.store_has_no_location?.value === true,
    ...customerAccessRuntime,
    storefrontTagline: String(settingsPayload?.storefront_tagline?.value || ''),
    storefrontPhone: String(settingsPayload?.storefront_phone?.value || ''),
    storefrontEmail: String(settingsPayload?.storefront_email?.value || ''),
    storefrontAbout: String(settingsPayload?.storefront_about?.value || ''),
    storefrontHours: normalizeStorefrontBusinessHours(settingsPayload?.storefront_hours?.value),
    storefrontWhyChooseUs: normalizedWhyChooseUs.length > 0 ? normalizedWhyChooseUs : [''],
    storefrontSocialMessenger: String(storefrontSocialLinks.messenger || ''),
    storefrontSocialFacebook: String(storefrontSocialLinks.facebook || ''),
    storefrontSocialInstagram: String(storefrontSocialLinks.instagram || ''),
    storefrontUiV2Enabled: settingsPayload?.storefront_ui_v2_enabled?.value === true,
    storefrontCategories: normalizedCategories.length > 0 ? normalizedCategories : [''],
    storefrontGalleryImages: normalizeStorefrontGallerySettings(storefrontGalleryImagesRaw),
    storefrontDeliveryPartners: normalizeStorefrontDeliveryPartnersSettings(storefrontDeliveryPartnersRaw),
    storefrontReviewHighlights: storefrontReviewHighlightsRaw.length > 0
      ? storefrontReviewHighlightsRaw.slice(0, 8).map((entry) => ({
        reviewer_name: String(entry?.reviewer_name || ''),
        rating: entry?.rating == null ? '' : String(entry.rating),
        comment: String(entry?.comment || '')
      }))
      : [{ reviewer_name: '', rating: '', comment: '' }],
    storefrontReviewSummaryScore: normalizedReviewSummary.score,
    storefrontReviewSummaryTotalCount: normalizedReviewSummary.total_count,
    storefrontReviewSummaryStar1: normalizedReviewSummary.star1,
    storefrontReviewSummaryStar2: normalizedReviewSummary.star2,
    storefrontReviewSummaryStar3: normalizedReviewSummary.star3,
    storefrontReviewSummaryStar4: normalizedReviewSummary.star4,
    storefrontReviewSummaryStar5: normalizedReviewSummary.star5,
    storefrontFollowEnabled: settingsPayload?.storefront_follow_enabled?.value === true,
    storefrontShareEnabled: settingsPayload?.storefront_share_enabled?.value === true,
    storefrontGuestCheckoutEnabled: settingsPayload?.storefront_guest_checkout_enabled?.value !== false,
    storefrontCashPaymentEnabled: settingsPayload?.storefront_cash_payment_enabled?.value !== false
  };
};

export const hydrateStorefrontAssets = (settingsPayload = {}) => ({
  cover: String(settingsPayload?.storefront_cover_image_url?.value || ''),
  profile: String(settingsPayload?.storefront_profile_image_url?.value || '')
});

const normalizeTerminalRegistryDraftEntries = (rawEntries) => (
  Array.isArray(rawEntries)
    ? rawEntries.map((entry) => ({
      terminal_id: sanitizeTerminalId(entry?.terminal_id),
      label: String(entry?.label || '').trim(),
      location_id: toPositiveInt(entry?.location_id),
      is_active: entry?.is_active !== false,
      is_default: entry?.is_default === true,
      pairing_version: String(entry?.pairing_version || '').trim(),
      rotate_pairing: entry?.rotate_pairing === true
    }))
    : []
);

export const updateTerminalRegistryEntry = (rawEntries, index, key, value) => {
  const entries = normalizeTerminalRegistryDraftEntries(rawEntries);
  const existing = entries[index] || {
    terminal_id: createSuggestedTerminalId(entries),
    label: '',
    location_id: null,
    is_active: true,
    is_default: entries.length === 0,
    pairing_version: '',
    rotate_pairing: false
  };
  entries[index] = {
    ...existing,
    [key]: key === 'terminal_id'
      ? sanitizeTerminalId(value)
      : (key === 'location_id' ? toPositiveInt(value) : value)
  };

  if (key === 'is_active' && value === false && entries[index].is_default === true) {
    entries[index].is_default = false;
    const fallbackIndex = entries.findIndex((entry, entryIndex) => entryIndex !== index && entry.is_active);
    if (fallbackIndex >= 0) entries[fallbackIndex].is_default = true;
  }

  if (key === 'is_default' && value === true) {
    entries.forEach((entry, entryIndex) => {
      if (entryIndex !== index) entry.is_default = false;
    });
    entries[index].is_active = true;
  }

  return entries;
};

export const addTerminalRegistryEntry = (rawEntries) => {
  const entries = normalizeTerminalRegistryDraftEntries(rawEntries);
  entries.push({
    terminal_id: createSuggestedTerminalId(entries),
    label: '',
    location_id: null,
    is_active: true,
    is_default: entries.length === 0,
    pairing_version: '',
    rotate_pairing: false
  });
  return entries;
};

export const removeTerminalRegistryEntry = (rawEntries, index) => {
  const entries = normalizeTerminalRegistryDraftEntries(rawEntries)
    .filter((_, entryIndex) => entryIndex !== index);
  if (entries.length > 0 && !entries.some((entry) => entry.is_default === true && entry.is_active)) {
    const firstActiveIndex = entries.findIndex((entry) => entry.is_active);
    if (firstActiveIndex >= 0) entries[firstActiveIndex].is_default = true;
  }
  return entries;
};

export const buildTerminalRegistryPayload = (posForm = {}) => {
  const rawTerminalRegistry = Array.isArray(posForm.terminalRegistry) ? posForm.terminalRegistry : [];
  const candidateTerminalEntries = normalizeTerminalRegistryDraftEntries(rawTerminalRegistry)
    .filter((entry) => entry.terminal_id || entry.label || entry.is_default || entry.is_active === false);

  const invalidTerminalEntry = candidateTerminalEntries.find((entry) => !entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id));
  if (invalidTerminalEntry) {
    throw new Error(`Invalid terminal ID: ${invalidTerminalEntry.terminal_id || '(empty)'}`);
  }

  const seenTerminalIds = new Set();
  for (const entry of candidateTerminalEntries) {
    if (seenTerminalIds.has(entry.terminal_id)) throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
    seenTerminalIds.add(entry.terminal_id);
  }

  const defaultTerminalCount = candidateTerminalEntries.filter((entry) => entry.is_default === true).length;
  if (defaultTerminalCount > 1) throw new Error('Only one default terminal can be configured.');

  const posTerminalRegistry = candidateTerminalEntries.map((entry) => ({
    terminal_id: entry.terminal_id,
    label: entry.label,
    location_id: entry.location_id,
    is_active: entry.is_active !== false,
    is_default: entry.is_default === true,
    pairing_version: entry.pairing_version,
    rotate_pairing: entry.rotate_pairing === true
  }));
  const rawMode = String(posForm.terminalRegistryMode || '').trim().toLowerCase();
  const posTerminalRegistryMode = TERMINAL_REGISTRY_MODE_OPTIONS.includes(rawMode) ? rawMode : 'warn';
  const normalizedRegistryState = normalizeTerminalRegistry(posTerminalRegistry);
  const activeRegistryEntries = normalizedRegistryState.filter((entry) => entry?.is_active !== false);
  if (posTerminalRegistryMode === 'enforce' && activeRegistryEntries.length === 0) {
    throw new Error('Terminal registry mode "enforce" requires at least one active terminal entry.');
  }

  return { posTerminalRegistry, normalizedRegistryState, posTerminalRegistryMode };
};

export const buildPosSettingsPayload = (posForm = {}) => {
  const posDiscountProfiles = (Array.isArray(posForm.discountProfiles) ? posForm.discountProfiles : [])
    .map(sanitizeDiscountProfile)
    .filter((profile) => profile.name.length > 0);
  const normalizedDiscountNames = new Set();
  for (const profile of posDiscountProfiles) {
    const normalizedName = profile.name.toLowerCase();
    if (normalizedDiscountNames.has(normalizedName)) {
      const error = new Error(`Duplicate POS discount name: ${profile.name}`);
      error.code = 'DUPLICATE_DISCOUNT_NAME';
      throw error;
    }
    normalizedDiscountNames.add(normalizedName);
  }

  const { posTerminalRegistry, posTerminalRegistryMode } = buildTerminalRegistryPayload(posForm);
  return {
    pos_registered_name: String(posForm.registeredName || '').trim(),
    pos_business_name: String(posForm.businessName || '').trim(),
    pos_business_style: String(posForm.businessStyle || '').trim(),
    pos_taxpayer_type: String(posForm.taxpayerType || '').trim(),
    pos_tin_branch: String(posForm.tinBranch || '').trim(),
    pos_address: String(posForm.businessAddress || '').trim(),
    pos_ptu_number: String(posForm.ptuNumber || '').trim(),
    pos_min_number: String(posForm.minNumber || '').trim(),
    pos_accreditation_number: String(posForm.accreditationNumber || '').trim(),
    pos_fiscal_buyer_details_required: posForm.fiscalBuyerDetailsRequired === true,
    pos_receipt_footer_message: String(posForm.receiptFooterMessage || '').trim(),
    pos_discount_profiles: posDiscountProfiles,
    pos_employee_discount_self_approval_enabled: posForm.employeeDiscountSelfApprovalEnabled === true,
    pos_terminal_registry: posTerminalRegistry,
    pos_terminal_registry_mode: posTerminalRegistryMode,
    pos_terminal_location_binding_enforced: posForm.terminalLocationBindingEnforced === true,
    voucher_pos_redemption_enabled: posForm.voucherPosRedemptionEnabled === true,
    pos_settings_access_pin: String(posForm.settingsAccessPin || '').trim(),
    clear_pos_settings_access_pin: posForm.clearSettingsAccessPin === true,
    pos_petty_cash_symbol: String(posForm.pettyCashSymbol || 'PHP').trim() || 'PHP',
    pos_petty_cash_amount: Number(posForm.pettyCashAmount || 0),
    pos_open_status: posForm.posOpenStatus === true,
    pos_wait_time_minutes: Number(posForm.posWaitTimeMinutes || 0),
    inventory_low_stock_display_threshold: Number(posForm.inventoryLowStockDisplayThreshold || 5),
    pos_best_seller_settings: {
      enabled: posForm.bestSellerAutoTaggingEnabled === true,
      lookback_days: 30,
      top_limit: 3,
      daily_top_enabled: posForm.dailyTopBestSellerEnabled === true
    }
  };
};

export const buildStorefrontSettingsPayload = (storefrontForm = {}) => {
  const storefrontReviewHighlights = (Array.isArray(storefrontForm.storefrontReviewHighlights) ? storefrontForm.storefrontReviewHighlights : [])
    .map((entry) => ({
      reviewer_name: String(entry?.reviewer_name || '').trim().slice(0, 80),
      rating: parseNullableNumberInput(entry?.rating, { min: 0, max: 5, precision: 1 }),
      comment: String(entry?.comment || '').trim().slice(0, 240)
    }))
    .filter((entry) => entry.reviewer_name || entry.comment || entry.rating !== null);

  return {
    store_is_visible: storefrontForm.storeIsVisible === true,
    store_has_no_location: storefrontForm.storeHasNoLocation === true,
    customer_access_mode: normalizeCustomerAccessMode(storefrontForm.customerAccessMode),
    storefront_tagline: String(storefrontForm.storefrontTagline || '').trim(),
    storefront_phone: String(storefrontForm.storefrontPhone || '').trim(),
    storefront_email: String(storefrontForm.storefrontEmail || '').trim(),
    storefront_about: String(storefrontForm.storefrontAbout || '').trim(),
    storefront_hours: serializeStorefrontBusinessHours(storefrontForm.storefrontHours),
    storefront_why_choose_us: normalizeStringList(storefrontForm.storefrontWhyChooseUs, 6, 120),
    storefront_social_links: {
      messenger: String(storefrontForm.storefrontSocialMessenger || '').trim(),
      facebook: String(storefrontForm.storefrontSocialFacebook || '').trim(),
      instagram: String(storefrontForm.storefrontSocialInstagram || '').trim()
    },
    storefront_ui_v2_enabled: storefrontForm.storefrontUiV2Enabled === true,
    storefront_categories: normalizeStringList(storefrontForm.storefrontCategories, 12, 60),
    storefront_gallery_images: serializeStorefrontGallerySettings(storefrontForm.storefrontGalleryImages),
    storefront_delivery_partners: normalizeStorefrontDeliveryPartnersSettings(storefrontForm.storefrontDeliveryPartners),
    storefront_review_highlights: storefrontReviewHighlights,
    storefront_review_summary: serializeStorefrontReviewSummary(storefrontForm),
    storefront_follow_enabled: storefrontForm.storefrontFollowEnabled === true,
    storefront_share_enabled: storefrontForm.storefrontShareEnabled === true,
    storefront_guest_checkout_enabled: storefrontForm.storefrontGuestCheckoutEnabled !== false,
    storefront_cash_payment_enabled: storefrontForm.storefrontCashPaymentEnabled !== false
  };
};

export const updateStorefrontList = (form, field, index, value) => {
  const next = Array.isArray(form?.[field]) ? [...form[field]] : [];
  next[index] = value;
  return { ...form, [field]: next };
};

export const appendStorefrontList = (form, field, value) => ({
  ...form,
  [field]: [...(Array.isArray(form?.[field]) ? form[field] : []), value]
});

export const removeStorefrontList = (form, field, index, fallback = '') => {
  const next = (Array.isArray(form?.[field]) ? form[field] : []).filter((_, rowIndex) => rowIndex !== index);
  return { ...form, [field]: next.length > 0 ? next : [fallback] };
};

export const updateStorefrontObjectRow = (form, field, index, key, value) => {
  const next = Array.isArray(form?.[field]) ? [...form[field]] : [];
  next[index] = { ...(next[index] || {}), [key]: value };
  return { ...form, [field]: next };
};

export const appendStorefrontObjectRow = (form, field, value) => ({
  ...form,
  [field]: [...(Array.isArray(form?.[field]) ? form[field] : []), value]
});

export const removeStorefrontObjectRow = (form, field, index, fallback) => {
  const next = (Array.isArray(form?.[field]) ? form[field] : []).filter((_, rowIndex) => rowIndex !== index);
  return { ...form, [field]: next.length > 0 ? next : [fallback] };
};

export const buildLocationPayload = (locationForm = {}, editingLocationId = null) => {
  const payload = {
    name: String(locationForm.name || '').trim(),
    address_line: String(locationForm.address_line || '').trim(),
    latitude: Number(locationForm.latitude),
    longitude: Number(locationForm.longitude),
    delivery_radius_km: normalizeDeliveryRadiusKm(locationForm.delivery_radius_km),
    current_wait_time_minutes: Number(locationForm.current_wait_time_minutes || 0),
    is_open: locationForm.is_open !== false,
    is_active: locationForm.is_active !== false,
    is_primary_storefront: locationForm.is_primary_storefront === true,
    allow_out_of_stock_sales: locationForm.allow_out_of_stock_sales === true,
    supports_delivery: locationForm.supports_delivery !== false,
    supports_pickup: locationForm.supports_pickup !== false,
    supports_dine_in: locationForm.supports_dine_in !== false,
    scheduling_enabled: locationForm.scheduling_enabled !== false,
    immediate_fulfillment_enabled: locationForm.immediate_fulfillment_enabled !== false,
    fulfillment_lead_time_min_days: locationForm.fulfillment_lead_time_min_days === '' ? null : Number(locationForm.fulfillment_lead_time_min_days),
    fulfillment_lead_time_max_days: locationForm.fulfillment_lead_time_max_days === '' ? null : Number(locationForm.fulfillment_lead_time_max_days)
  };
  if (editingLocationId && locationForm.location_version) {
    payload.last_known_updated_at = locationForm.location_version;
  }
  return payload;
};

export const validateLocationPayload = (payload = {}) => {
  const localErrors = [];
  if (!payload.name) localErrors.push({ field: 'name', message: 'Location name is required.' });
  if (!payload.address_line) localErrors.push({ field: 'address_line', message: 'Location address is required.' });
  if (!Number.isFinite(payload.latitude)) localErrors.push({ field: 'latitude', message: 'Latitude is required.' });
  if (!Number.isFinite(payload.longitude)) localErrors.push({ field: 'longitude', message: 'Longitude is required.' });

  const leadTimeCheck = evaluateFulfillmentLeadTime(payload);
  if (leadTimeCheck.requiredMissing) {
    localErrors.push({
      field: 'fulfillment_lead_time_min_days',
      message: 'A fulfillment lead time (minimum and maximum days) is required when immediate fulfillment is disabled for this location.'
    });
  }
  if (leadTimeCheck.rangeInverted) {
    localErrors.push({
      field: 'fulfillment_lead_time_max_days',
      message: 'Fulfillment lead time maximum days must be greater than or equal to minimum days.'
    });
  }
  return localErrors;
};
