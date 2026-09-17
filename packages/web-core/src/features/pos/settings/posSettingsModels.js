import { normalizeStorefrontBusinessHours } from '@/src/features/settings/storefrontBusinessHours.js';

export const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
export const TERMINAL_REGISTRY_MODE_OPTIONS = ['warn', 'enforce'];

export const createDefaultPosForm = () => ({
  registeredName: '',
  businessName: '',
  businessStyle: '',
  taxpayerType: '',
  tinBranch: '',
  businessAddress: '',
  ptuNumber: '',
  minNumber: '',
  accreditationNumber: '',
  fiscalBuyerDetailsRequired: false,
  receiptFooterMessage: '',
  terminalRegistry: [],
  terminalRegistryMode: 'warn',
  terminalLocationBindingEnforced: false,
  voucherPosRedemptionEnabled: false,
  settingsAccessPinEnabled: false,
  settingsAccessPin: '',
  clearSettingsAccessPin: false,
  discountProfiles: [],
  employeeDiscountSelfApprovalEnabled: false,
  posReceiptMetadataPendingReview: null,
  pettyCashSymbol: 'PHP',
  pettyCashAmount: 0,
  activeDiscountCount: 0,
  posOpenStatus: true,
  posWaitTimeMinutes: 15,
  inventoryLowStockDisplayThreshold: 5,
  bestSellerAutoTaggingEnabled: true,
  dailyTopBestSellerEnabled: false
});

export const createDefaultStorefrontForm = () => ({
  storeTenantSlug: '',
  storeIsVisible: false,
  storeHasNoLocation: false,
  customerAccessMode: 'catalog',
  customerAccessEffectiveMode: 'catalog',
  customerAccessMaxMode: 'transaction',
  customerAccessPlatformMaxMode: 'transaction',
  customerAccessRegistrationStageMaxMode: 'transaction',
  customerAccessLimitationReason: '',
  customerAccessRegistrationStage: 'registered',
  customerAccessFlagStatus: 'enabled',
  storefrontTagline: '',
  storefrontPhone: '',
  storefrontEmail: '',
  storefrontAbout: '',
  storefrontHours: normalizeStorefrontBusinessHours(null),
  storefrontWhyChooseUs: [''],
  storefrontSocialMessenger: '',
  storefrontSocialFacebook: '',
  storefrontSocialInstagram: '',
  storefrontUiV2Enabled: false,
  storefrontCategories: [''],
  storefrontGalleryImages: [{ url: '', path: '', caption: '', alt: '', sort_order: 0 }],
  storefrontDeliveryPartners: [],
  storefrontReviewHighlights: [{ reviewer_name: '', rating: '', comment: '' }],
  storefrontReviewSummaryScore: '',
  storefrontReviewSummaryTotalCount: '',
  storefrontReviewSummaryStar1: '',
  storefrontReviewSummaryStar2: '',
  storefrontReviewSummaryStar3: '',
  storefrontReviewSummaryStar4: '',
  storefrontReviewSummaryStar5: '',
  storefrontFollowEnabled: false,
  storefrontShareEnabled: false,
  storefrontGuestCheckoutEnabled: true,
  storefrontCashPaymentEnabled: true
});

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

export const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};
