import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Settings as SettingsIcon,
  Save,
  AlertTriangle,
  Warehouse,
  RefreshCw,
  User,
  Users,
  Building2,
  Copy,
  Link as LinkIcon,
  CreditCard,
  Star,
  CheckCircle2,
  History,
  XCircle,
  Plus,
  Trash2,
  Wand2,
  ImagePlus
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import ConfirmActionDialog from "@/components/ui/ConfirmActionDialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "../../../packages/web-core/src/lib/utils.js";
import useStore from '../../../packages/web-core/src/store/useStore.js';
import * as userService from '../../../packages/web-core/src/services/userService.js';
import * as settingsService from '../../../packages/web-core/src/services/settingsService.js';
import * as paymentService from '../../../packages/web-core/src/services/paymentService.js';
import * as tenantLocationService from '../../../packages/web-core/src/services/tenantLocationService.js';
import {
  fetchESalesReports,
  fetchFiscalLedgerIntegrity,
  fetchFiscalTerminalRegistrations,
  generateESalesReport,
  saveFiscalTerminalRegistration,
  updateESalesReportStatus
} from '../../../packages/web-core/src/features/pos/services/posService.js';
import UserManagementModal from '../../../packages/web-core/Components/users/UserManagementModal.jsx';
import MapPinPicker from '../../../packages/web-core/src/components/maps/MapPinPicker.jsx';
import ComplianceProgramPanel from '../../../packages/web-core/src/features/compliance/components/ComplianceProgramPanel.jsx';
import { useLocation, useNavigate } from 'react-router-dom';
import { shouldShowMigrateToPayMongoSection, subscriptionsEnabled } from '../../../packages/web-core/src/utils/subscriptionUi.js';
import {
  resolveSettingsDeepLink,
  resolveSettingsTab,
  withSettingsTabInSearch
} from '../../../packages/web-core/src/features/settings/settingsDeepLink.js';
import { broadcastWorkflowModeChange } from '../../../packages/web-core/src/features/settings/WorkflowModeContext.jsx';
import {
  DEFAULT_WORKFLOW_MODE,
  getWorkflowModeLabel,
  normalizeWorkflowMode,
  WORKFLOW_MODE_LABELS,
  WORKFLOW_MODE_SELECT_VALUES
} from '../../../packages/web-core/src/features/settings/workflowMode.js';
import {
  createDefaultStorefrontBusinessHours,
  normalizeStorefrontBusinessHours,
  serializeStorefrontBusinessHours
} from '../../../packages/web-core/src/features/settings/storefrontBusinessHours.js';
import StorefrontBusinessHoursScheduler from '../../../packages/web-core/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import resolveAssetUrl from '../../../packages/web-core/src/utils/assetUrl.js';
import { getPhoneNumberError, normalizePhoneNumber, PHONE_NUMBER_HELP_TEXT } from '../../../packages/web-core/src/utils/phoneNumber.js';
import { generateReadablePassword, isPasswordLongEnough } from '../../../packages/web-core/src/utils/passwordPolicy.js';

const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const TERMINAL_REGISTRY_MODE_OPTIONS = ['warn', 'enforce'];
const HASH_TARGET_ID_PATTERN = /^[A-Za-z][-A-Za-z0-9_:.]*$/;
const LOCATION_REFERENCE_LABELS = {
  itemLocationStocks: 'Item location stock',
  fifoBatches: 'FIFO batches',
  stockMovements: 'Stock movements',
  posTransactions: 'POS transactions',
  posTerminalShifts: 'POS terminal shifts',
  posShiftLocationTransitions: 'POS shift location transitions',
  posShiftLocationBackfillAudits: 'POS shift backfill audits',
  userLocationGrants: 'User location grants',
  serviceProviderAssignments: 'Service provider assignments',
  serviceResources: 'Service resources',
  serviceBookings: 'Service bookings',
  serviceBookingHolds: 'Service booking holds'
};

const findElementByHashTarget = (target) => {
  const normalizedTarget = String(target || '').trim();
  if (!normalizedTarget.startsWith('#')) return null;
  const rawId = normalizedTarget.slice(1);
  if (!rawId) return null;
  let decodedId = rawId;
  try {
    decodedId = decodeURIComponent(rawId);
  } catch {
    return null;
  }
  if (!HASH_TARGET_ID_PATTERN.test(decodedId)) {
    return null;
  }
  return document.getElementById(decodedId);
};

const sanitizeTerminalRegistryId = (value) => String(value || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '-')
  .replace(/[^A-Z0-9._-]/g, '');
const toPositiveInt = (value) => {
  const normalized = Number.parseInt(value, 10);
  return Number.isInteger(normalized) && normalized > 0 ? normalized : null;
};

const createDefaultFiscalTerminalForm = () => ({
  terminal_id: '',
  location_id: '',
  min_number: '',
  machine_serial_number: '',
  software_version: '',
  software_serial_number: '',
  ptu_number: '',
  permit_issued_at: '',
  permit_effective_at: '',
  permit_expires_at: '',
  receipt_printer_binding: '',
  cash_drawer_binding: '',
  accreditation_status: 'draft',
  evidence_ref: ''
});

const currentMonthValue = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

const formatLocationDeleteErrors = (error) => {
  const details = error?.response?.data?.errors || error?.response?.data?.details || {};
  const counts = details?.reference_counts || {};
  const blockers = Object.entries(counts)
    .filter(([key, count]) => key !== 'total' && Number(count || 0) > 0)
    .map(([key, count]) => `${LOCATION_REFERENCE_LABELS[key] || key}: ${count}`);

  if (blockers.length > 0) {
    return blockers;
  }

  return [
    error?.response?.data?.message || 'This location has operational history. Deactivate it instead.'
  ];
};

const createDefaultSettings = ({ workflowMode = DEFAULT_WORKFLOW_MODE } = {}) => ({
  defaultMinThreshold: 40,
  defaultPurchaseAllowance: 20,
  lowStockAlertEnabled: true,
  surplusAlertEnabled: true,
  procurementReminderDay: 1,
  qualityThreshold: 3.5,
  autoCalculateThresholds: true,
  posRegisteredName: '',
  posBusinessName: '',
  posBusinessStyle: '',
  posTaxpayerType: '',
  posTinBranch: '',
  posAddress: '',
  posPtuNumber: '',
  posMinNumber: '',
  posAccreditationNumber: '',
  posSoftwareName: '',
  posSoftwareVersion: '',
  posSoftwareSerialNumber: '',
  posReceiptMetadataPendingReview: null,
  posFiscalBuyerDetailsRequired: false,
  posReceiptFooterMessage: '',
  posDiscountProfiles: [],
  posTerminalRegistry: [],
  posTerminalRegistryMode: 'warn',
  posTerminalLocationBindingEnforced: false,
  posPettyCashSymbol: 'PHP',
  posPettyCashAmount: 0,
  opsWorkflowMode: workflowMode,
  storeDeliveryFee: 0,
  storeTenantSlug: '',
  storeIsVisible: false,
  storeHasNoLocation: false,
  posOpenStatus: true,
  posWaitTimeMinutes: 15,
  customerAccessMode: 'catalog',
  customerAccessEffectiveMode: 'catalog',
  customerAccessMaxMode: 'transaction',
  customerAccessPlatformMaxMode: 'transaction',
  customerAccessRegistrationStageMaxMode: 'transaction',
  customerAccessLimitationReason: '',
  inventoryDisplayMode: 'availability',
  inventoryLowStockDisplayThreshold: 5,
  customerAccessRegistrationStage: 'registered',
  customerAccessFlagStatus: 'enabled',
  storefrontTagline: '',
  storefrontAbout: '',
  storefrontPhone: '',
  storefrontEmail: '',
  storefrontHours: createDefaultStorefrontBusinessHours(),
  storefrontWhyChooseUs: [''],
  storefrontSocialMessenger: '',
  storefrontSocialFacebook: '',
  storefrontSocialInstagram: '',
  storefrontReviewHighlights: [{ reviewer_name: '', rating: '', comment: '' }],
  storefrontReviewSummaryScore: '',
  storefrontReviewSummaryTotalCount: '',
  storefrontReviewSummaryStar1: '',
  storefrontReviewSummaryStar2: '',
  storefrontReviewSummaryStar3: '',
  storefrontReviewSummaryStar4: '',
  storefrontReviewSummaryStar5: '',
  storefrontPromoTitle: '',
  storefrontPromoSubtitle: '',
  storefrontPromoBadge: '',
  storefrontPromoValidityText: '',
  storefrontPromoCode: '',
  storefrontPromoDiscountPercent: '',
  storefrontPromoUsageLimit: '',
  storefrontPromoUsedCount: '0',
  storefrontPromoValidTimeStart: '',
  storefrontPromoValidTimeEnd: '',
  storefrontPromoActive: false,
  storefrontUiV2Enabled: false,
  storefrontCategories: [''],
  storefrontGalleryImages: [{ url: '', path: '', caption: '', alt: '', sort_order: 0 }],
  storefrontDeliveryPartners: [{ partner: 'grab', label: '', url: '' }],
  storefrontFollowEnabled: false,
  storefrontShareEnabled: false
});

const normalizeTerminalRegistry = (rawRegistry) => {
  let parsed = rawRegistry;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = [];
    }
  }

  if (!Array.isArray(parsed)) return [];

  const seen = new Set();
  const normalized = [];
  parsed.forEach((entry) => {
    const terminalId = sanitizeTerminalRegistryId(entry?.terminal_id);
    if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId)) return;
    if (seen.has(terminalId)) return;
    seen.add(terminalId);

    const isActive = entry?.is_active !== false;
    normalized.push({
      terminal_id: terminalId,
      label: String(entry?.label || '').trim(),
      location_id: toPositiveInt(entry?.location_id),
      is_active: isActive,
      is_default: isActive && entry?.is_default === true,
      pairing_version: String(entry?.pairing_version || '').trim(),
      rotate_pairing: entry?.rotate_pairing === true
    });
  });

  if (normalized.length === 0) return [];

  const defaultIndex = normalized.findIndex((entry) => entry.is_default === true);
  if (defaultIndex >= 0) {
    normalized.forEach((entry, index) => {
      if (index !== defaultIndex) {
        entry.is_default = false;
      }
    });
  } else {
    const firstActiveIndex = normalized.findIndex((entry) => entry.is_active);
    if (firstActiveIndex >= 0) {
      normalized[firstActiveIndex].is_default = true;
    }
  }

  return normalized;
};

const SETTINGS_FIELD_LABELS = {
  username: 'Username',
  email: 'Email',
  phone_number: 'Phone Number',
  currentPassword: 'Current Password',
  newPassword: 'New Password',
  confirmPassword: 'Confirm Password',
  pos_registered_name: 'Registered Name',
  pos_business_name: 'Business Name',
  pos_business_style: 'Business Style',
  pos_taxpayer_type: 'Taxpayer Type',
  pos_tin_branch: 'TIN / Branch',
  pos_address: 'Business Address',
  pos_ptu_number: 'PTU Number',
  pos_min_number: 'MIN Number',
  pos_accreditation_number: 'Accreditation Number',
  pos_software_name: 'Software Name',
  pos_software_version: 'Software Version',
  pos_software_serial_number: 'Software Serial Number',
  pos_fiscal_buyer_details_required: 'Fiscal Buyer Details Required',
  pos_receipt_footer_message: 'Receipt Footer Message',
  pos_terminal_registry_mode: 'Terminal Registry Mode',
  pos_terminal_location_binding_enforced: 'Strict Location Binding',
  pos_petty_cash_symbol: 'Petty Cash Currency Symbol',
  pos_petty_cash_amount: 'Petty Cash Amount',
  ops_workflow_mode: 'Business Mode',
  store_delivery_fee: 'Store Delivery Fee',
  store_tenant_slug: 'Storefront Slug',
  store_has_no_location: 'Store Has No Location',
  pos_wait_time_minutes: 'Customer Wait Time',
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
  storefront_ui_v2_enabled: 'Storefront UI V2',
  storefront_categories: 'Storefront Categories',
  storefront_gallery_images: 'Storefront Gallery Images',
  storefront_delivery_partners: 'Storefront Delivery Partners',
  storefront_follow_enabled: 'Storefront Follow Enabled',
  storefront_share_enabled: 'Storefront Share Enabled',
  customer_access_mode: 'Customer Access Mode',
  inventory_display_mode: 'Inventory Display Mode',
  inventory_low_stock_display_threshold: 'Low Stock Display Threshold'
};

const POS_RECEIPT_METADATA_SETTING_KEYS = [
  'pos_registered_name',
  'pos_business_name',
  'pos_business_style',
  'pos_taxpayer_type',
  'pos_tin_branch',
  'pos_address',
  'pos_ptu_number',
  'pos_min_number',
  'pos_accreditation_number',
  'pos_fiscal_buyer_details_required',
  'pos_receipt_footer_message'
];

const POS_SETUP_SETTING_KEYS = [
  ...POS_RECEIPT_METADATA_SETTING_KEYS,
  'pos_discount_profiles',
  'pos_terminal_registry',
  'pos_terminal_registry_mode',
  'pos_terminal_location_binding_enforced',
  'pos_petty_cash_symbol',
  'pos_petty_cash_amount'
];

const STOREFRONT_SETTING_KEYS = [
  'store_delivery_fee',
  'store_tenant_slug',
  'store_is_visible',
  'store_has_no_location',
  'pos_open_status',
  'pos_wait_time_minutes',
  'customer_access_mode',
  'inventory_display_mode',
  'inventory_low_stock_display_threshold',
  'storefront_tagline',
  'storefront_about',
  'storefront_phone',
  'storefront_email',
  'storefront_hours',
  'storefront_why_choose_us',
  'storefront_social_links',
  'storefront_review_highlights',
  'storefront_review_summary',
  'storefront_promo',
  'storefront_ui_v2_enabled',
  'storefront_categories',
  'storefront_gallery_images',
  'storefront_delivery_partners',
  'storefront_follow_enabled',
  'storefront_share_enabled'
];

const SYSTEM_SETTING_KEYS = [
  'enable_auto_reorder',
  'min_stock_threshold_percent',
  'purchase_allowance_percent',
  'ops_workflow_mode'
];

const SETTINGS_PAYLOAD_KEYS_BY_TAB = {
  pos: new Set(POS_SETUP_SETTING_KEYS),
  storefront: new Set(STOREFRONT_SETTING_KEYS),
  system: new Set(SYSTEM_SETTING_KEYS)
};

const filterSettingsPayloadByKeys = (payload, allowedKeys) => (
  Object.fromEntries(
    Object.entries(payload || {}).filter(([key]) => allowedKeys.has(key))
  )
);

const scopeSettingsPayloadForTab = (payload, tab) => {
  const allowedKeys = SETTINGS_PAYLOAD_KEYS_BY_TAB[tab];
  if (!allowedKeys) {
    return payload;
  }
  return filterSettingsPayloadByKeys(payload, allowedKeys);
};

const SETTINGS_CARD_TITLE_CLASS = 'flex items-start gap-2 text-xl leading-tight sm:items-center sm:text-2xl';
const CUSTOMER_ACCESS_MODE_OPTIONS = [
  { value: 'ghost', label: 'Ghost', description: 'Profile and contact only; catalog, cart, checkout, and booking are hidden.' },
  { value: 'catalog', label: 'Catalog Only', description: 'Customers can browse catalog, prices, and inventory labels only.' },
  { value: 'inquiry', label: 'Inquiry', description: 'Customers can browse and contact you through existing channels.' },
  { value: 'transaction', label: 'Transaction', description: 'Customers can quote, checkout, and book services online.' }
];
const INVENTORY_DISPLAY_MODE_OPTIONS = [
  { value: 'hidden', label: 'Hidden' },
  { value: 'availability', label: 'Availability' },
  { value: 'low_stock', label: 'Low Stock' },
  { value: 'exact_quantity', label: 'Exact Quantity' }
];
const CUSTOMER_ACCESS_MODE_RANK = { ghost: 0, catalog: 1, inquiry: 2, transaction: 3 };
const normalizeCustomerAccessMode = (value) => (
  CUSTOMER_ACCESS_MODE_OPTIONS.some((option) => option.value === String(value || '').trim().toLowerCase())
    ? String(value || '').trim().toLowerCase()
    : 'catalog'
);
const normalizeInventoryDisplayMode = (value) => (
  INVENTORY_DISPLAY_MODE_OPTIONS.some((option) => option.value === String(value || '').trim().toLowerCase())
    ? String(value || '').trim().toLowerCase()
    : 'availability'
);
const mapCustomerAccessRuntimeSettings = (systemSettings = {}) => ({
  customerAccessMode: normalizeCustomerAccessMode(systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessEffectiveMode: normalizeCustomerAccessMode(systemSettings.effective_customer_access_mode?.value || systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessMaxMode: normalizeCustomerAccessMode(systemSettings.max_customer_access_mode?.value || 'transaction'),
  customerAccessPlatformMaxMode: normalizeCustomerAccessMode(systemSettings.platform_max_customer_access_mode?.value || 'transaction'),
  customerAccessRegistrationStageMaxMode: normalizeCustomerAccessMode(systemSettings.registration_stage_max_customer_access_mode?.value || 'transaction'),
  customerAccessLimitationReason: String(systemSettings.customer_access_limitation_reason?.value || ''),
  customerAccessRegistrationStage: String(systemSettings.customer_access_registration_stage?.value || 'registered').trim().toLowerCase() || 'registered',
  customerAccessFlagStatus: systemSettings.customer_access_modes_enabled?.value === false ? 'rollback' : 'enabled'
});
const getReadableFieldName = (field) => SETTINGS_FIELD_LABELS[field] || field;

const formatValidationErrorDescription = (apiErrors) => {
  if (!Array.isArray(apiErrors) || apiErrors.length === 0) {
    return '';
  }

  return apiErrors
    .slice(0, 5)
    .map((err) => `${getReadableFieldName(err.field)}: ${err.message}`)
    .join(' | ');
};

const createDefaultLocationForm = () => ({
  name: '',
  address_line: '',
  latitude: '10.7202',
  longitude: '122.5621',
  pin_confirmed: false,
  location_version: '',
  delivery_radius_km: '5',
  current_wait_time_minutes: '15',
  is_open: true,
  is_active: true,
  is_primary_storefront: false,
  allow_out_of_stock_sales: false,
  supports_delivery: true,
  supports_pickup: true,
  supports_dine_in: true
});

const sanitizeDiscountProfile = (profile) => ({
  name: String(profile?.name || '').trim(),
  percentage: Number(profile?.percentage ?? 0),
  active: profile?.active !== false
});

const normalizeDiscountProfiles = (rawProfiles) => {
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

const normalizeUserPermissions = (rawPermissions) => {
  if (Array.isArray(rawPermissions)) {
    return rawPermissions.map((permission) => String(permission || '').trim()).filter(Boolean);
  }
  if (typeof rawPermissions === 'string') {
    try {
      const parsed = JSON.parse(rawPermissions);
      if (Array.isArray(parsed)) {
        return parsed.map((permission) => String(permission || '').trim()).filter(Boolean);
      }
    } catch {
      return rawPermissions
        .split(',')
        .map((permission) => String(permission || '').trim())
        .filter(Boolean);
    }
  }
  return [];
};

const normalizeStringList = (raw, maxItems = 8, maxLen = 120) => {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((entry) => String(entry || '').trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
};

const parseJsonObjectSetting = (raw) => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const parseNullableNumberInput = (value, {
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

const normalizeStorefrontGallerySettings = (raw) => {
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

const serializeStorefrontGallerySettings = (raw) => {
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

const normalizeStorefrontDeliveryPartnersSettings = (raw) => {
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

const normalizeStorefrontReviewSummarySettings = (raw) => {
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

const serializeStorefrontReviewSummary = (settings = {}) => {
  const starDistribution = {};
  [
    ['1', settings.storefrontReviewSummaryStar1],
    ['2', settings.storefrontReviewSummaryStar2],
    ['3', settings.storefrontReviewSummaryStar3],
    ['4', settings.storefrontReviewSummaryStar4],
    ['5', settings.storefrontReviewSummaryStar5]
  ].forEach(([star, value]) => {
    const parsed = parseNullableNumberInput(value, { integer: true, min: 0 });
    if (parsed !== null) {
      starDistribution[star] = parsed;
    }
  });

  const summary = {
    score: parseNullableNumberInput(settings.storefrontReviewSummaryScore, { min: 0, max: 5, precision: 1 }),
    total_count: parseNullableNumberInput(settings.storefrontReviewSummaryTotalCount, { integer: true, min: 0 })
  };

  if (Object.keys(starDistribution).length > 0) {
    summary.star_distribution = starDistribution;
  }

  return summary;
};

export default function Settings() {
  const settingsBuildStamp = String(import.meta.env.VITE_BUILD_STAMP || '').trim() || 'dev';
  const location = useLocation();
  const navigate = useNavigate();
  const subscriptionFeaturesEnabled = subscriptionsEnabled();
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const unknownHashToastRef = useRef('');
  const settingsDeepLink = useMemo(() => resolveSettingsDeepLink({
    search: location.search,
    hash: location.hash,
    subscriptionEnabled: subscriptionFeaturesEnabled
  }), [location.hash, location.search, subscriptionFeaturesEnabled]);
  const currentTab = settingsDeepLink.tab;

  const [settings, setSettings] = useState(() => createDefaultSettings());

  const [profileSettings, setProfileSettings] = useState({
    username: '',
    email: '',
    phoneNumber: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    emailOtpCode: ''
  });

  const [profileErrors, setProfileErrors] = useState({});
  const [isRequestingProfileEmailOtp, setIsRequestingProfileEmailOtp] = useState(false);
  const [profileEmailOtpSentTo, setProfileEmailOtpSentTo] = useState('');
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [companyInfo, setCompanyInfo] = useState(null);
  const { currentUser, setCurrentUser } = useStore();
  const isProfileEmailChanged = Boolean(
    currentUser?.email &&
    profileSettings.email &&
    String(profileSettings.email).trim().toLowerCase() !== String(currentUser.email).trim().toLowerCase()
  );

  const [isCancelling, setIsCancelling] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [billingHistory, setBillingHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isChangingPlan, setIsChangingPlan] = useState(false);
  const [isMigratingToPayMongo, setIsMigratingToPayMongo] = useState(false);
  const [paymongoSubscriptionIdInput, setPaymongoSubscriptionIdInput] = useState('');
  const [isStartingPayMongoSetup, setIsStartingPayMongoSetup] = useState(false);
  const [pendingPlanInfo, setPendingPlanInfo] = useState(null);
  const [persistedWorkflowMode, setPersistedWorkflowMode] = useState(DEFAULT_WORKFLOW_MODE);
  const [tenantLocations, setTenantLocations] = useState([]);
  const [storefrontSyncHealth, setStorefrontSyncHealth] = useState(null);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [deleteLocationCandidate, setDeleteLocationCandidate] = useState(null);
  const [deleteLocationErrors, setDeleteLocationErrors] = useState([]);
  const [confirmationAction, setConfirmationAction] = useState(null);
  const [locationForm, setLocationForm] = useState(createDefaultLocationForm());
  const [storefrontAssets, setStorefrontAssets] = useState({
    cover: '',
    profile: ''
  });
  const [assetUploadingType, setAssetUploadingType] = useState('');
  const [assetDeletingType, setAssetDeletingType] = useState('');
  const [fiscalTerminalRegistrations, setFiscalTerminalRegistrations] = useState([]);
  const [fiscalTerminalLoading, setFiscalTerminalLoading] = useState(false);
  const [fiscalTerminalSaving, setFiscalTerminalSaving] = useState(false);
  const [fiscalTerminalForm, setFiscalTerminalForm] = useState(createDefaultFiscalTerminalForm());
  const [esalesReports, setESalesReports] = useState([]);
  const [esalesLoading, setESalesLoading] = useState(false);
  const [esalesSaving, setESalesSaving] = useState(false);
  const [esalesForm, setESalesForm] = useState({
    report_month: currentMonthValue(),
    evidence_ref: ''
  });
  const [esalesStatusForm, setESalesStatusForm] = useState({});
  const [fiscalLedgerIntegrity, setFiscalLedgerIntegrity] = useState(null);
  const [fiscalLedgerLoading, setFiscalLedgerLoading] = useState(false);
  const normalizedCurrentUserPermissions = useMemo(
    () => normalizeUserPermissions(currentUser?.permissions),
    [currentUser?.permissions]
  );
  const terminalLocationOptions = useMemo(
    () => (Array.isArray(tenantLocations) ? tenantLocations : [])
      .filter((location) => location?.is_active !== false)
      .sort((left, right) => {
        if (left?.is_primary_storefront === true && right?.is_primary_storefront !== true) return -1;
        if (right?.is_primary_storefront === true && left?.is_primary_storefront !== true) return 1;
        return String(left?.name || '').localeCompare(String(right?.name || ''));
      }),
    [tenantLocations]
  );
  const canEditStorefrontBranding = useMemo(() => {
    if (currentUser?.is_master_admin === true) {
      return true;
    }
    if (String(currentUser?.role || '').trim().toLowerCase() === 'admin') {
      return true;
    }
    return normalizedCurrentUserPermissions.includes('settings:storefront_branding_edit');
  }, [currentUser?.is_master_admin, currentUser?.role, normalizedCurrentUserPermissions]);
  const canManageFiscalTerminals = currentUser?.is_master_admin === true
    || normalizedCurrentUserPermissions.includes('pos:fiscal_terminals:manage');
  const canManageESalesReports = currentUser?.is_master_admin === true
    || normalizedCurrentUserPermissions.includes('pos:esales:manage');
  const fiscalTerminalReadiness = useMemo(() => {
    const registrations = Array.isArray(fiscalTerminalRegistrations) ? fiscalTerminalRegistrations : [];
    const verified = registrations.filter((registration) => registration?.accreditation_status === 'verified');
    const blocked = registrations.filter((registration) => {
      if (registration?.accreditation_status === 'verified') return false;
      return !registration?.min_number
        || !registration?.machine_serial_number
        || !registration?.software_serial_number
        || !registration?.ptu_number
        || !registration?.evidence_ref;
    });
    return {
      total: registrations.length,
      verified: verified.length,
      blocked: blocked.length,
      ready: verified.length > 0
    };
  }, [fiscalTerminalRegistrations]);

  const setSettingsTab = useCallback((nextTab, { replace = false, preserveHash = true } = {}) => {
    const resolvedTab = resolveSettingsTab(nextTab, { subscriptionEnabled: subscriptionFeaturesEnabled });
    const nextParams = withSettingsTabInSearch(location.search, resolvedTab);
    const nextSearch = nextParams.toString();
    navigate({
      pathname: location.pathname,
      search: nextSearch ? `?${nextSearch}` : '',
      hash: preserveHash ? location.hash : ''
    }, { replace });
    return resolvedTab;
  }, [location.hash, location.pathname, location.search, navigate, subscriptionFeaturesEnabled]);

  const loadTenantLocations = async ({ silent = false } = {}) => {
    if (!silent) {
      setLocationsLoading(true);
    }
    try {
      const result = await tenantLocationService.listTenantLocationsWithMeta({ include_inactive: true });
      const rows = Array.isArray(result?.rows) ? result.rows : [];
      setTenantLocations(rows);
      setStorefrontSyncHealth(result?.meta?.storefront_sync_health || null);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load tenant locations');
      }
    } finally {
      if (!silent) {
        setLocationsLoading(false);
      }
    }
  };

  const loadFiscalTerminalRegistrations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setFiscalTerminalLoading(true);
    try {
      const data = await fetchFiscalTerminalRegistrations();
      setFiscalTerminalRegistrations(Array.isArray(data?.registrations) ? data.registrations : []);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load fiscal terminal registrations.');
      }
    } finally {
      if (!silent) setFiscalTerminalLoading(false);
    }
  }, []);

  const loadESalesReports = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setESalesLoading(true);
    try {
      const data = await fetchESalesReports();
      setESalesReports(Array.isArray(data?.reports) ? data.reports : []);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load eSales reports.');
      }
    } finally {
      if (!silent) setESalesLoading(false);
    }
  }, []);

  const loadFiscalLedgerIntegrity = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setFiscalLedgerLoading(true);
    try {
      const data = await fetchFiscalLedgerIntegrity();
      setFiscalLedgerIntegrity(data || null);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to verify fiscal ledger integrity.');
      }
    } finally {
      if (!silent) setFiscalLedgerLoading(false);
    }
  }, []);

  const setFiscalTerminalField = (field, value) => {
    setFiscalTerminalForm((current) => ({
      ...current,
      [field]: field === 'terminal_id' ? sanitizeTerminalRegistryId(value) : value
    }));
  };

  const editFiscalTerminalRegistration = (registration) => {
    setFiscalTerminalForm({
      terminal_id: registration?.terminal_id || '',
      location_id: registration?.location_id || '',
      min_number: registration?.min_number || '',
      machine_serial_number: registration?.machine_serial_number || '',
      software_version: registration?.software_version || '',
      software_serial_number: registration?.software_serial_number || '',
      ptu_number: registration?.ptu_number || '',
      permit_issued_at: String(registration?.permit_issued_at || '').slice(0, 10),
      permit_effective_at: String(registration?.permit_effective_at || '').slice(0, 10),
      permit_expires_at: String(registration?.permit_expires_at || '').slice(0, 10),
      receipt_printer_binding: registration?.receipt_printer_binding || '',
      cash_drawer_binding: registration?.cash_drawer_binding || '',
      accreditation_status: registration?.accreditation_status || 'draft',
      evidence_ref: registration?.evidence_ref || ''
    });
  };

  const saveFiscalTerminal = async () => {
    const terminalId = sanitizeTerminalRegistryId(fiscalTerminalForm.terminal_id);
    if (!terminalId || !TERMINAL_ID_PATTERN.test(terminalId)) {
      toast.error('Fiscal terminal ID must be 2-100 characters and use letters, numbers, dot, underscore, or hyphen.');
      return;
    }
    if (fiscalTerminalForm.accreditation_status === 'verified') {
      const missing = [
        ['min_number', 'MIN number'],
        ['machine_serial_number', 'Machine serial number'],
        ['software_serial_number', 'Software serial number'],
        ['ptu_number', 'PTU number']
      ].filter(([key]) => !String(fiscalTerminalForm[key] || '').trim());
      if (missing.length > 0) {
        toast.error(`Verified terminals require: ${missing.map(([, label]) => label).join(', ')}.`);
        return;
      }
    }
    setFiscalTerminalSaving(true);
    try {
      await saveFiscalTerminalRegistration({
        ...fiscalTerminalForm,
        terminal_id: terminalId,
        location_id: fiscalTerminalForm.location_id ? Number(fiscalTerminalForm.location_id) : null
      });
      toast.success('Fiscal terminal registration saved.');
      setFiscalTerminalForm(createDefaultFiscalTerminalForm());
      await loadFiscalTerminalRegistrations({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save fiscal terminal registration.');
    } finally {
      setFiscalTerminalSaving(false);
    }
  };

  const generateESales = async () => {
    if (!/^\d{4}-\d{2}$/.test(String(esalesForm.report_month || '').trim())) {
      toast.error('Report month must use YYYY-MM.');
      return;
    }
    setESalesSaving(true);
    try {
      await generateESalesReport(esalesForm);
      toast.success('eSales report package generated.');
      await loadESalesReports({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to generate eSales report.');
    } finally {
      setESalesSaving(false);
    }
  };

  const setESalesStatusDraft = (reportId, field, value) => {
    setESalesStatusForm((current) => ({
      ...current,
      [reportId]: {
        status: 'submitted',
        status_evidence_ref: '',
        status_note: '',
        ...(current?.[reportId] || {}),
        [field]: value
      }
    }));
  };

  const saveESalesStatus = async (report) => {
    const reportId = report?.pos_esales_report_id;
    const draft = esalesStatusForm?.[reportId] || {};
    if (!reportId) return;
    setESalesSaving(true);
    try {
      await updateESalesReportStatus(reportId, {
        status: draft.status || 'submitted',
        status_evidence_ref: draft.status_evidence_ref || '',
        status_note: draft.status_note || ''
      });
      toast.success('eSales report status updated.');
      await loadESalesReports({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update eSales report status.');
    } finally {
      setESalesSaving(false);
    }
  };

  const resetLocationForm = () => {
    setEditingLocationId(null);
    setLocationForm(createDefaultLocationForm());
  };

  // Fetch current user and system settings on mount
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch current user
        const user = await userService.getCurrentUser();
        setCurrentUser(user);
        setProfileSettings({
          username: user.username,
          email: user.email,
          phoneNumber: user.phone_number || '',
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        });

        // Fetch system settings
        const systemSettings = await settingsService.getAllSettings();

        // Map backend settings to frontend state
        const normalizedWorkflowMode = normalizeWorkflowMode(systemSettings.ops_workflow_mode?.value);
        const storefrontSocialLinks = parseJsonObjectSetting(systemSettings.storefront_social_links?.value);
        const storefrontPromo = parseJsonObjectSetting(systemSettings.storefront_promo?.value);
        const storefrontReviewSummary = parseJsonObjectSetting(systemSettings.storefront_review_summary?.value);
        const storefrontReviewHighlightsRaw = Array.isArray(systemSettings.storefront_review_highlights?.value)
          ? systemSettings.storefront_review_highlights.value
          : [];
        const storefrontGalleryImagesRaw = Array.isArray(systemSettings.storefront_gallery_images?.value)
          ? systemSettings.storefront_gallery_images.value
          : [];
        const storefrontDeliveryPartnersRaw = Array.isArray(systemSettings.storefront_delivery_partners?.value)
          ? systemSettings.storefront_delivery_partners.value
          : [];
        const storefrontCategoriesRaw = Array.isArray(systemSettings.storefront_categories?.value)
          ? systemSettings.storefront_categories.value
          : [];
        const normalizedReviewSummary = normalizeStorefrontReviewSummarySettings(storefrontReviewSummary);

        setSettings({
          defaultMinThreshold: systemSettings.min_stock_threshold_percent?.value || 40,
          defaultPurchaseAllowance: systemSettings.purchase_allowance_percent?.value || 20,
          lowStockAlertEnabled: systemSettings.enable_low_stock_alerts?.value ?? true,
          surplusAlertEnabled: systemSettings.enable_expiry_alerts?.value ?? true,
          procurementReminderDay: systemSettings.alert_frequency_hours?.value || 24,
          qualityThreshold: systemSettings.supplier_rating_threshold?.value || 3.5,
          autoCalculateThresholds: systemSettings.enable_auto_reorder?.value ?? true,
          posRegisteredName: systemSettings.pos_registered_name?.value || '',
          posBusinessName: systemSettings.pos_business_name?.value || '',
          posBusinessStyle: systemSettings.pos_business_style?.value || '',
          posTaxpayerType: systemSettings.pos_taxpayer_type?.value || '',
          posTinBranch: systemSettings.pos_tin_branch?.value || '',
          posAddress: systemSettings.pos_address?.value || '',
          posPtuNumber: systemSettings.pos_ptu_number?.value || '',
          posMinNumber: systemSettings.pos_min_number?.value || '',
          posAccreditationNumber: systemSettings.pos_accreditation_number?.value || '',
          posSoftwareName: systemSettings.pos_software_name?.value || '',
          posSoftwareVersion: systemSettings.pos_software_version?.value || '',
          posSoftwareSerialNumber: systemSettings.pos_software_serial_number?.value || '',
          posReceiptMetadataPendingReview: systemSettings.pos_receipt_metadata_pending_changes?.value?.status === 'pending_review'
            ? systemSettings.pos_receipt_metadata_pending_changes.value
            : null,
          posFiscalBuyerDetailsRequired: systemSettings.pos_fiscal_buyer_details_required?.value === true,
          posReceiptFooterMessage: systemSettings.pos_receipt_footer_message?.value || '',
          posDiscountProfiles: normalizeDiscountProfiles(systemSettings.pos_discount_profiles?.value),
          posTerminalRegistry: normalizeTerminalRegistry(systemSettings.pos_terminal_registry?.value),
          posTerminalRegistryMode: TERMINAL_REGISTRY_MODE_OPTIONS.includes(String(systemSettings.pos_terminal_registry_mode?.value || '').trim().toLowerCase())
            ? String(systemSettings.pos_terminal_registry_mode?.value || '').trim().toLowerCase()
            : 'warn',
          posTerminalLocationBindingEnforced: systemSettings.pos_terminal_location_binding_enforced?.value === true,
          posPettyCashSymbol: systemSettings.pos_petty_cash_symbol?.value || 'PHP',
          posPettyCashAmount: Number(systemSettings.pos_petty_cash_amount?.value ?? 0) || 0,
          opsWorkflowMode: normalizedWorkflowMode,
          storeDeliveryFee: Number(systemSettings.store_delivery_fee?.value ?? 0) || 0,
          storeTenantSlug: String(systemSettings.store_tenant_slug?.value || ''),
          storeIsVisible: systemSettings.store_is_visible?.value === true,
          storeHasNoLocation: systemSettings.store_has_no_location?.value === true,
          posOpenStatus: systemSettings.pos_open_status?.value ?? true,
          posWaitTimeMinutes: Number(systemSettings.pos_wait_time_minutes?.value ?? 15) || 15,
          ...mapCustomerAccessRuntimeSettings(systemSettings),
          inventoryDisplayMode: normalizeInventoryDisplayMode(systemSettings.inventory_display_mode?.value || 'availability'),
          inventoryLowStockDisplayThreshold: Number(systemSettings.inventory_low_stock_display_threshold?.value ?? 5) || 5,
          storefrontTagline: String(systemSettings.storefront_tagline?.value || ''),
          storefrontAbout: String(systemSettings.storefront_about?.value || ''),
          storefrontPhone: String(systemSettings.storefront_phone?.value || ''),
          storefrontEmail: String(systemSettings.storefront_email?.value || ''),
          storefrontHours: normalizeStorefrontBusinessHours(systemSettings.storefront_hours?.value),
          storefrontWhyChooseUs: normalizeStringList(systemSettings.storefront_why_choose_us?.value, 6, 120).length > 0
            ? normalizeStringList(systemSettings.storefront_why_choose_us?.value, 6, 120)
            : [''],
          storefrontSocialMessenger: String(storefrontSocialLinks.messenger || ''),
          storefrontSocialFacebook: String(storefrontSocialLinks.facebook || ''),
          storefrontSocialInstagram: String(storefrontSocialLinks.instagram || ''),
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
          storefrontPromoTitle: String(storefrontPromo.title || ''),
          storefrontPromoSubtitle: String(storefrontPromo.subtitle || ''),
          storefrontPromoBadge: String(storefrontPromo.badge || ''),
          storefrontPromoValidityText: String(storefrontPromo.validity_text || ''),
          storefrontPromoCode: String(storefrontPromo.promo_code || ''),
          storefrontPromoDiscountPercent: storefrontPromo.discount_percent == null ? '' : String(storefrontPromo.discount_percent),
          storefrontPromoUsageLimit: storefrontPromo.usage_limit == null ? '' : String(storefrontPromo.usage_limit),
          storefrontPromoUsedCount: storefrontPromo.used_count == null ? '0' : String(storefrontPromo.used_count),
          storefrontPromoValidTimeStart: String(storefrontPromo.valid_time_start || ''),
          storefrontPromoValidTimeEnd: String(storefrontPromo.valid_time_end || ''),
          storefrontPromoActive: storefrontPromo.active === true,
          storefrontUiV2Enabled: systemSettings.storefront_ui_v2_enabled?.value === true,
          storefrontCategories: normalizeStringList(storefrontCategoriesRaw, 12, 60).length > 0
            ? normalizeStringList(storefrontCategoriesRaw, 12, 60)
            : [''],
          storefrontGalleryImages: normalizeStorefrontGallerySettings(storefrontGalleryImagesRaw),
          storefrontDeliveryPartners: normalizeStorefrontDeliveryPartnersSettings(storefrontDeliveryPartnersRaw),
          storefrontFollowEnabled: systemSettings.storefront_follow_enabled?.value === true,
          storefrontShareEnabled: systemSettings.storefront_share_enabled?.value === true
        });
        setStorefrontAssets({
          cover: String(systemSettings.storefront_cover_image_url?.value || ''),
          profile: String(systemSettings.storefront_profile_image_url?.value || '')
        });
        setPersistedWorkflowMode(normalizedWorkflowMode);

        await loadTenantLocations({ silent: true });

        // Fetch company info if master admin
        if (user.is_master_admin) {
          try {
            const companyData = await settingsService.getCompanyInfo();
            setCompanyInfo(companyData);
          } catch (companyError) {
            // Silently fail - not critical for page load
            console.warn('Failed to load company info:', companyError.message);
          }
        }
      } catch (error) {
        toast.error('Failed to load settings');
      }
    };

    fetchData();
  }, [setCurrentUser]);

  // Fetch billing data when tab changes to subscription
  useEffect(() => {
    const requestedTab = searchParams.get('tab');
    if (requestedTab !== currentTab) {
      setSettingsTab(currentTab, { replace: true });
      return;
    }

    if (!subscriptionFeaturesEnabled && currentTab === 'subscription') {
      setSettingsTab('profile', { replace: true });
      return;
    }

    if (currentTab === 'subscription') {
      fetchBillingHistory();
      fetchPendingPlan();
    }
    if (currentTab === 'pos') {
      loadFiscalTerminalRegistrations({ silent: true });
      loadESalesReports({ silent: true });
      loadFiscalLedgerIntegrity({ silent: true });
    }
  }, [currentTab, loadESalesReports, loadFiscalLedgerIntegrity, loadFiscalTerminalRegistrations, searchParams, setSettingsTab, subscriptionFeaturesEnabled]);

  useEffect(() => {
    if (!settingsDeepLink.normalizedHash) {
      return undefined;
    }

    if (settingsDeepLink.hashStatus === 'unknown') {
      if (unknownHashToastRef.current !== settingsDeepLink.normalizedHash) {
        unknownHashToastRef.current = settingsDeepLink.normalizedHash;
        toast.info('Section link not found on Settings. Staying on the selected tab.');
      }
      return undefined;
    }

    let cancelled = false;
    let attemptCount = 0;
    const maxAttempts = 20;

    const tryScroll = () => {
      if (cancelled) return;
      const node = findElementByHashTarget(settingsDeepLink.normalizedHash);
      if (node) {
        node.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }
      attemptCount += 1;
      if (attemptCount >= maxAttempts) {
        if (unknownHashToastRef.current !== settingsDeepLink.normalizedHash) {
          unknownHashToastRef.current = settingsDeepLink.normalizedHash;
          toast.info('Section link is not currently available. Complete page loading and try again.');
        }
        return;
      }
      window.setTimeout(tryScroll, 50);
    };

    window.setTimeout(tryScroll, 0);

    return () => {
      cancelled = true;
    };
  }, [settingsDeepLink.hashStatus, settingsDeepLink.normalizedHash, currentTab]);

  const fetchPendingPlan = async () => {
    try {
      const data = await paymentService.getPendingPlan();
      setPendingPlanInfo(data);
    } catch {
      // silently ignore — unauthenticated or no pending plan
    }
  };

  const fetchBillingHistory = async () => {
    setIsLoadingHistory(true);
    try {
      const history = await paymentService.getBillingHistory();
      setBillingHistory(history);
    } catch (err) {
      console.error('Failed to fetch billing history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleChange = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  const handleStorefrontWhyChange = (index, value) => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontWhyChooseUs) ? [...prev.storefrontWhyChooseUs] : [''];
      next[index] = String(value || '');
      return { ...prev, storefrontWhyChooseUs: next };
    });
  };

  const addStorefrontWhy = () => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontWhyChooseUs) ? [...prev.storefrontWhyChooseUs] : [];
      if (next.length >= 6) return prev;
      next.push('');
      return { ...prev, storefrontWhyChooseUs: next };
    });
  };

  const removeStorefrontWhy = (index) => {
    setSettings((prev) => {
      const next = (Array.isArray(prev.storefrontWhyChooseUs) ? prev.storefrontWhyChooseUs : ['']).filter((_, i) => i !== index);
      return { ...prev, storefrontWhyChooseUs: next.length > 0 ? next : [''] };
    });
  };

  const handleStorefrontCategoryChange = (index, value) => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontCategories) ? [...prev.storefrontCategories] : [''];
      next[index] = String(value || '');
      return { ...prev, storefrontCategories: next };
    });
  };

  const addStorefrontCategory = () => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontCategories) ? [...prev.storefrontCategories] : [];
      if (next.length >= 12) return prev;
      next.push('');
      return { ...prev, storefrontCategories: next };
    });
  };

  const removeStorefrontCategory = (index) => {
    setSettings((prev) => {
      const next = (Array.isArray(prev.storefrontCategories) ? prev.storefrontCategories : ['']).filter((_, i) => i !== index);
      return { ...prev, storefrontCategories: next.length > 0 ? next : [''] };
    });
  };

  const handleStorefrontGalleryChange = (index, key, value) => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontGalleryImages)
        ? [...prev.storefrontGalleryImages]
        : [{ url: '', path: '', caption: '', alt: '', sort_order: 0 }];
      const current = next[index] || { url: '', path: '', caption: '', alt: '', sort_order: index };
      next[index] = { ...current, [key]: value };
      return { ...prev, storefrontGalleryImages: next };
    });
  };

  const addStorefrontGalleryRow = () => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontGalleryImages) ? [...prev.storefrontGalleryImages] : [];
      if (next.length >= 24) return prev;
      next.push({ url: '', path: '', caption: '', alt: '', sort_order: next.length });
      return { ...prev, storefrontGalleryImages: next };
    });
  };

  const removeStorefrontGalleryRow = (index) => {
    setSettings((prev) => {
      const next = (Array.isArray(prev.storefrontGalleryImages) ? prev.storefrontGalleryImages : []).filter((_, i) => i !== index);
      return {
        ...prev,
        storefrontGalleryImages: next.length > 0 ? next : [{ url: '', path: '', caption: '', alt: '', sort_order: 0 }]
      };
    });
  };

  const handleStorefrontDeliveryPartnerChange = (index, key, value) => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontDeliveryPartners)
        ? [...prev.storefrontDeliveryPartners]
        : [{ partner: 'grab', label: '', url: '' }];
      const current = next[index] || { partner: 'grab', label: '', url: '' };
      next[index] = { ...current, [key]: value };
      return { ...prev, storefrontDeliveryPartners: next };
    });
  };

  const addStorefrontDeliveryPartner = () => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontDeliveryPartners) ? [...prev.storefrontDeliveryPartners] : [];
      if (next.length >= 8) return prev;
      next.push({ partner: 'custom', label: '', url: '' });
      return { ...prev, storefrontDeliveryPartners: next };
    });
  };

  const removeStorefrontDeliveryPartner = (index) => {
    setSettings((prev) => {
      const next = (Array.isArray(prev.storefrontDeliveryPartners) ? prev.storefrontDeliveryPartners : []).filter((_, i) => i !== index);
      return { ...prev, storefrontDeliveryPartners: next.length > 0 ? next : [{ partner: 'grab', label: '', url: '' }] };
    });
  };

  const handleReviewHighlightChange = (index, key, value) => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontReviewHighlights)
        ? [...prev.storefrontReviewHighlights]
        : [{ reviewer_name: '', rating: '', comment: '' }];
      const current = next[index] || { reviewer_name: '', rating: '', comment: '' };
      next[index] = { ...current, [key]: value };
      return { ...prev, storefrontReviewHighlights: next };
    });
  };

  const addReviewHighlight = () => {
    setSettings((prev) => {
      const next = Array.isArray(prev.storefrontReviewHighlights) ? [...prev.storefrontReviewHighlights] : [];
      if (next.length >= 8) return prev;
      next.push({ reviewer_name: '', rating: '', comment: '' });
      return { ...prev, storefrontReviewHighlights: next };
    });
  };

  const removeReviewHighlight = (index) => {
    setSettings((prev) => {
      const next = (Array.isArray(prev.storefrontReviewHighlights) ? prev.storefrontReviewHighlights : []).filter((_, i) => i !== index);
      return { ...prev, storefrontReviewHighlights: next.length > 0 ? next : [{ reviewer_name: '', rating: '', comment: '' }] };
    });
  };

  const handleDiscountProfileChange = (index, key, value) => {
    setSettings((prev) => {
      const nextProfiles = Array.isArray(prev.posDiscountProfiles)
        ? [...prev.posDiscountProfiles]
        : [];
      const existing = nextProfiles[index] || { name: '', percentage: 0, active: true };
      nextProfiles[index] = {
        ...existing,
        [key]: key === 'percentage' ? Number(value) : value
      };
      return { ...prev, posDiscountProfiles: nextProfiles };
    });
  };

  const addDiscountProfile = () => {
    setSettings((prev) => ({
      ...prev,
      posDiscountProfiles: [
        ...(Array.isArray(prev.posDiscountProfiles) ? prev.posDiscountProfiles : []),
        { name: '', percentage: 0, active: true }
      ]
    }));
  };

  const removeDiscountProfile = (index) => {
    setSettings((prev) => ({
      ...prev,
      posDiscountProfiles: (Array.isArray(prev.posDiscountProfiles) ? prev.posDiscountProfiles : [])
        .filter((_, idx) => idx !== index)
    }));
  };

  const handleTerminalRegistryChange = (index, key, value) => {
    setSettings((prev) => {
      const entries = Array.isArray(prev.posTerminalRegistry)
        ? prev.posTerminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalRegistryId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      const existing = entries[index] || {
        terminal_id: '',
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
          ? sanitizeTerminalRegistryId(value)
          : (key === 'location_id' ? toPositiveInt(value) : value)
      };

      if (key === 'is_active' && value === false && entries[index].is_default === true) {
        entries[index].is_default = false;
        const fallbackActiveIndex = entries.findIndex((entry, entryIndex) => entryIndex !== index && entry.is_active);
        if (fallbackActiveIndex >= 0) {
          entries[fallbackActiveIndex].is_default = true;
        }
      }

      if (key === 'is_default' && value === true) {
        entries.forEach((entry, entryIndex) => {
          if (entryIndex !== index) {
            entry.is_default = false;
          }
        });
        entries[index].is_active = true;
      }

      return { ...prev, posTerminalRegistry: entries };
    });
  };

  const addTerminalRegistryEntry = () => {
    setSettings((prev) => {
      const entries = Array.isArray(prev.posTerminalRegistry)
        ? prev.posTerminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalRegistryId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      entries.push({
        terminal_id: '',
        label: '',
        location_id: null,
        is_active: true,
        is_default: entries.length === 0,
        pairing_version: '',
        rotate_pairing: false
      });
      return { ...prev, posTerminalRegistry: entries };
    });
  };

  const removeTerminalRegistryEntry = (index) => {
    setSettings((prev) => {
      const entries = (Array.isArray(prev.posTerminalRegistry) ? prev.posTerminalRegistry : [])
        .map((entry) => ({
          terminal_id: sanitizeTerminalRegistryId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        .filter((_, entryIndex) => entryIndex !== index);

      if (entries.length > 0 && !entries.some((entry) => entry.is_default === true && entry.is_active)) {
        const firstActiveIndex = entries.findIndex((entry) => entry.is_active);
        if (firstActiveIndex >= 0) {
          entries[firstActiveIndex].is_default = true;
        }
      }

      return { ...prev, posTerminalRegistry: entries };
    });
  };

  const handleLocationFormChange = (key, value) => {
    setLocationForm((prev) => {
      if (key === 'is_active' && value === false) {
        return {
          ...prev,
          is_active: false,
          is_primary_storefront: false
        };
      }
      return { ...prev, [key]: value };
    });
  };

  const handleLocationPinChange = ({ latitude, longitude, address_line }) => {
    const nextAddress = String(address_line || '').trim();
    setLocationForm((prev) => ({
      ...prev,
      latitude: latitude == null ? '' : String(latitude),
      longitude: longitude == null ? '' : String(longitude),
      pin_confirmed: latitude != null && longitude != null,
      ...(nextAddress ? { address_line: nextAddress } : {})
    }));
  };

  const handleEditLocation = (location) => {
    const latitude = Number(location?.latitude);
    const longitude = Number(location?.longitude);
    const pinConfirmed = Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && !(latitude === 0 && longitude === 0);
    setEditingLocationId(location?.location_id || null);
    setLocationForm({
      name: String(location?.name || ''),
      address_line: String(location?.address_line || ''),
      latitude: location?.latitude == null ? '' : String(location.latitude),
      longitude: location?.longitude == null ? '' : String(location.longitude),
      pin_confirmed: pinConfirmed,
      location_version: String(location?.updated_at || ''),
      delivery_radius_km: location?.delivery_radius_km == null ? '5' : String(location.delivery_radius_km),
      current_wait_time_minutes: location?.current_wait_time_minutes == null ? '15' : String(location.current_wait_time_minutes),
      is_open: location?.is_open !== false,
      is_active: location?.is_active !== false,
      is_primary_storefront: location?.is_primary_storefront === true,
      allow_out_of_stock_sales: location?.allow_out_of_stock_sales === true,
      supports_delivery: location?.supports_delivery !== false,
      supports_pickup: location?.supports_pickup !== false,
      supports_dine_in: location?.supports_dine_in !== false
    });
  };

  const handleSaveLocation = async () => {
    const payload = {
      name: String(locationForm.name || '').trim(),
      address_line: String(locationForm.address_line || '').trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      delivery_radius_km: Number(locationForm.delivery_radius_km || 0),
      current_wait_time_minutes: Number(locationForm.current_wait_time_minutes || 0),
      is_open: locationForm.is_open === true,
      is_active: locationForm.is_active !== false,
      is_primary_storefront: locationForm.is_primary_storefront === true,
      allow_out_of_stock_sales: locationForm.allow_out_of_stock_sales === true,
      supports_delivery: locationForm.supports_delivery !== false,
      supports_pickup: locationForm.supports_pickup !== false,
      supports_dine_in: locationForm.supports_dine_in !== false
    };
    if (editingLocationId && locationForm.location_version) {
      payload.last_known_updated_at = locationForm.location_version;
    }

    if (!payload.name || !payload.address_line) {
      toast.error('Location name and address are required.');
      return;
    }

    const hasUsablePhilippinesPin = locationForm.pin_confirmed === true
      && Number.isFinite(payload.latitude)
      && Number.isFinite(payload.longitude)
      && !(payload.latitude === 0 && payload.longitude === 0)
      && payload.latitude >= 4.5
      && payload.latitude <= 21.5
      && payload.longitude >= 116
      && payload.longitude <= 127;
    if (!hasUsablePhilippinesPin) {
      toast.error('Please pin the location on the map.');
      return;
    }

    setLocationSaving(true);
    try {
      if (editingLocationId) {
        await tenantLocationService.updateTenantLocation(editingLocationId, payload);
        toast.success('Tenant location updated.');
      } else {
        await tenantLocationService.createTenantLocation(payload);
        toast.success('Tenant location created.');
      }

      await loadTenantLocations({ silent: true });
      resetLocationForm();
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) {
        toast.error(error?.response?.data?.message || 'Location was updated elsewhere. Please refresh and try again.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to save tenant location');
      }
    } finally {
      setLocationSaving(false);
    }
  };

  const handleSetPrimaryLocation = async (location) => {
    if (!location?.location_id) {
      return;
    }

    if (location.is_active !== true) {
      toast.error('Reactivate this location before setting it as primary.');
      return;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.updateTenantLocation(location.location_id, {
        is_primary_storefront: true
      });
      toast.success('Primary storefront location updated.');
      await loadTenantLocations({ silent: true });
      if (editingLocationId === location.location_id) {
        setLocationForm((prev) => ({
          ...prev,
          is_primary_storefront: true
        }));
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to set primary storefront location');
    } finally {
      setLocationSaving(false);
    }
  };

  const handleDeactivateLocation = async (locationId, { skipConfirm = false } = {}) => {
    if (!skipConfirm) {
      setConfirmationAction({ type: 'deactivate-location', locationId });
      return true;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.deactivateTenantLocation(locationId);
      toast.success('Tenant location deactivated.');
      await loadTenantLocations({ silent: true });
      if (editingLocationId === locationId) {
        resetLocationForm();
      }
      if (deleteLocationCandidate?.location_id === locationId) {
        setDeleteLocationCandidate(null);
        setDeleteLocationErrors([]);
      }
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to deactivate tenant location';
      toast.error(message);
      return { success: false, message };
    } finally {
      setLocationSaving(false);
    }
  };

  const openDeleteLocationDialog = (location) => {
    if (!location?.location_id) {
      return;
    }
    setDeleteLocationCandidate(location);
    setDeleteLocationErrors([]);
  };

  const closeDeleteLocationDialog = () => {
    if (locationSaving) return;
    setDeleteLocationCandidate(null);
    setDeleteLocationErrors([]);
  };

  const handleConfirmDeleteLocation = async () => {
    const locationId = deleteLocationCandidate?.location_id;
    if (!locationId) return;

    setLocationSaving(true);
    setDeleteLocationErrors([]);
    try {
      await tenantLocationService.deleteTenantLocation(locationId);
      toast.success('Tenant location pin deleted.');
      await loadTenantLocations({ silent: true });
      if (editingLocationId === locationId) {
        resetLocationForm();
      }
      setDeleteLocationCandidate(null);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 409) {
        setDeleteLocationErrors(formatLocationDeleteErrors(error));
        toast.error(error?.response?.data?.message || 'Location has operational history. Deactivate it instead.');
      } else {
        toast.error(error?.response?.data?.message || 'Failed to delete tenant location pin');
      }
    } finally {
      setLocationSaving(false);
    }
  };

  const handleReactivateLocation = async (locationId, { skipConfirm = false } = {}) => {
    if (!skipConfirm) {
      setConfirmationAction({ type: 'reactivate-location', locationId });
      return true;
    }

    setLocationSaving(true);
    try {
      await tenantLocationService.reactivateTenantLocation(locationId);
      toast.success('Tenant location reactivated.');
      await loadTenantLocations();
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to reactivate tenant location';
      toast.error(message);
      return { success: false, message };
    } finally {
      setLocationSaving(false);
    }
  };

  const handleProfileChange = (key, value) => {
    setProfileSettings(prev => ({
      ...prev,
      [key]: value,
      ...(key === 'email' ? { emailOtpCode: '' } : {})
    }));
    // Clear error for this field
    setProfileErrors(prev => ({ ...prev, [key]: '' }));
    if (key === 'email') {
      setProfileEmailOtpSentTo('');
    }
  };

  const copyToClipboard = async (value, successMessage) => {
    try {
      if (!navigator?.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(String(value || ''));
      toast.success(successMessage);
    } catch {
      toast.error('Clipboard copy failed. Please copy the value manually.');
    }
  };

  const handleRequestProfileEmailOtp = async () => {
    setProfileErrors({});
    const email = String(profileSettings.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setProfileErrors({ email: 'Please provide a valid email address' });
      toast.error('Please provide a valid email address');
      return;
    }
    if (!isProfileEmailChanged) {
      toast.info('Change the email address before requesting a verification code');
      return;
    }

    setIsRequestingProfileEmailOtp(true);
    try {
      await userService.requestEmailChangeOtp({ email });
      setProfileEmailOtpSentTo(email);
      setProfileSettings(prev => ({ ...prev, emailOtpCode: '' }));
      toast.success('Verification code sent');
    } catch (error) {
      const message = error.response?.data?.message || 'Could not send verification code';
      setProfileErrors({ emailOtpCode: message });
      toast.error(message);
    } finally {
      setIsRequestingProfileEmailOtp(false);
    }
  };

  const handleGenerateProfilePassword = () => {
    const generatedPassword = generateReadablePassword();
    setProfileSettings(prev => ({
      ...prev,
      newPassword: generatedPassword,
      confirmPassword: generatedPassword
    }));
    setProfileErrors(prev => ({
      ...prev,
      newPassword: undefined,
      confirmPassword: undefined
    }));
  };

  const handleSave = async () => {
    setProfileErrors({});

    try {
      // Validate password fields if changing password
      if (profileSettings.newPassword || profileSettings.currentPassword) {
        if (!profileSettings.currentPassword) {
          setProfileErrors({ currentPassword: 'Current password is required' });
          toast.error('Please enter your current password');
          return;
        }

        if (!isPasswordLongEnough(profileSettings.newPassword)) {
          setProfileErrors({ newPassword: 'New password must be at least 8 characters' });
          toast.error('New password must be at least 8 characters');
          return;
        }

        if (profileSettings.newPassword !== profileSettings.confirmPassword) {
          setProfileErrors({ confirmPassword: 'Passwords do not match' });
          toast.error('New passwords do not match');
          return;
        }
      }

      // Update profile identity fields if changed
      if (profileSettings.username !== currentUser?.username ||
        profileSettings.email !== currentUser?.email ||
        profileSettings.phoneNumber !== (currentUser?.phone_number || '')) {
        const normalizedPhoneNumber = normalizePhoneNumber(profileSettings.phoneNumber);
        const phoneNumberError = getPhoneNumberError(normalizedPhoneNumber);
        if (phoneNumberError) {
          setProfileErrors({ phoneNumber: phoneNumberError });
          toast.error(phoneNumberError);
          return;
        }

        if (isProfileEmailChanged && !/^\d{6}$/.test(String(profileSettings.emailOtpCode || '').trim())) {
          setProfileErrors({ emailOtpCode: 'Enter the 6-digit verification code sent to the new email' });
          toast.error('Enter the email verification code');
          return;
        }

        const profilePayload = {
          username: profileSettings.username,
          email: profileSettings.email,
          phone_number: normalizedPhoneNumber
        };
        if (isProfileEmailChanged) {
          profilePayload.email_otp_code = String(profileSettings.emailOtpCode || '').trim();
        }

        await userService.updateProfile(profilePayload);

        // Update current user
        const newUser = await userService.getCurrentUser();
        setCurrentUser(newUser);
        setProfileEmailOtpSentTo('');
        setProfileSettings(prev => ({ ...prev, emailOtpCode: '' }));
      }

      // Change password if provided
      if (profileSettings.newPassword && profileSettings.currentPassword) {
        await userService.changePassword({
          currentPassword: profileSettings.currentPassword,
          newPassword: profileSettings.newPassword
        });

        // Clear password fields
        setProfileSettings(prev => ({
          ...prev,
          currentPassword: '',
          newPassword: '',
          confirmPassword: ''
        }));
      }

      const posDiscountProfiles = (Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : [])
        .map(sanitizeDiscountProfile)
        .filter((profile) => profile.name.length > 0);

      const normalizedNames = new Set();
      for (const profile of posDiscountProfiles) {
        const normalizedName = profile.name.toLowerCase();
        if (normalizedNames.has(normalizedName)) {
          toast.error(`Duplicate POS discount name: ${profile.name}`);
          return;
        }
        normalizedNames.add(normalizedName);
      }

      const rawTerminalRegistry = Array.isArray(settings.posTerminalRegistry)
        ? settings.posTerminalRegistry
        : [];

      const candidateTerminalEntries = rawTerminalRegistry
        .map((entry) => ({
          terminal_id: sanitizeTerminalRegistryId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        .filter((entry) => (
          entry.terminal_id
          || entry.label
          || entry.is_default
          || entry.is_active === false
        ));

      const invalidTerminalEntry = candidateTerminalEntries.find((entry) => (
        !entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id)
      ));
      if (invalidTerminalEntry) {
        toast.error(`Invalid terminal ID: ${invalidTerminalEntry.terminal_id || '(empty)'}`);
        return;
      }

      const seenTerminalIds = new Set();
      for (const entry of candidateTerminalEntries) {
        if (seenTerminalIds.has(entry.terminal_id)) {
          toast.error(`Duplicate terminal ID: ${entry.terminal_id}`);
          return;
        }
        seenTerminalIds.add(entry.terminal_id);
      }

      const defaultTerminalCount = candidateTerminalEntries.filter((entry) => entry.is_default === true).length;
      if (defaultTerminalCount > 1) {
        toast.error('Only one default terminal can be configured.');
        return;
      }

      const posTerminalRegistry = normalizeTerminalRegistry(candidateTerminalEntries);
      const posTerminalRegistryMode = TERMINAL_REGISTRY_MODE_OPTIONS.includes(
        String(settings.posTerminalRegistryMode || '').trim().toLowerCase()
      )
        ? String(settings.posTerminalRegistryMode || '').trim().toLowerCase()
        : 'warn';
      const activeRegistryEntries = posTerminalRegistry.filter((entry) => entry?.is_active !== false);
      if (posTerminalRegistryMode === 'enforce' && activeRegistryEntries.length === 0) {
        toast.error('Terminal registry mode "enforce" requires at least one active terminal entry.');
        return;
      }

      const nextWorkflowMode = normalizeWorkflowMode(settings.opsWorkflowMode);
      const storefrontWhyChooseUs = normalizeStringList(settings.storefrontWhyChooseUs, 6, 120);
      const storefrontCategories = normalizeStringList(settings.storefrontCategories, 12, 60);
      const storefrontGalleryImages = (Array.isArray(settings.storefrontGalleryImages) ? settings.storefrontGalleryImages : [])
        .map((entry, index) => ({
          url: String(entry?.url || '').trim().slice(0, 500),
          path: String(entry?.path || '').trim().slice(0, 500),
          caption: String(entry?.caption || '').trim().slice(0, 140),
          alt: String(entry?.alt || '').trim().slice(0, 140),
          sort_order: Number.isInteger(Number(entry?.sort_order)) ? Number(entry.sort_order) : index
        }))
        .filter((entry) => entry.url || entry.path)
        .slice(0, 24);
      const storefrontDeliveryPartners = (Array.isArray(settings.storefrontDeliveryPartners) ? settings.storefrontDeliveryPartners : [])
        .map((entry) => ({
          partner: String(entry?.partner || '').trim().toLowerCase(),
          label: String(entry?.label || '').trim().slice(0, 60),
          url: String(entry?.url || '').trim().slice(0, 255)
        }))
        .filter((entry) => entry.partner)
        .slice(0, 8);
      const storefrontReviewSummaryScore = parseNullableNumberInput(settings.storefrontReviewSummaryScore, { min: 0, max: 5, precision: 2 });
      const storefrontReviewSummaryTotalCount = parseNullableNumberInput(settings.storefrontReviewSummaryTotalCount, { integer: true, min: 0 });
      const storefrontReviewSummaryStars = {
        1: parseNullableNumberInput(settings.storefrontReviewSummaryStar1, { integer: true, min: 0 }),
        2: parseNullableNumberInput(settings.storefrontReviewSummaryStar2, { integer: true, min: 0 }),
        3: parseNullableNumberInput(settings.storefrontReviewSummaryStar3, { integer: true, min: 0 }),
        4: parseNullableNumberInput(settings.storefrontReviewSummaryStar4, { integer: true, min: 0 }),
        5: parseNullableNumberInput(settings.storefrontReviewSummaryStar5, { integer: true, min: 0 })
      };
      const storefrontReviewSummaryDistribution = Object.entries(storefrontReviewSummaryStars).reduce((acc, [key, value]) => {
        if (value != null) acc[key] = value;
        return acc;
      }, {});
      const storefrontReviewSummary = {
        score: storefrontReviewSummaryScore,
        total_count: storefrontReviewSummaryTotalCount,
        star_distribution: storefrontReviewSummaryDistribution
      };
      const storefrontReviewHighlights = (Array.isArray(settings.storefrontReviewHighlights) ? settings.storefrontReviewHighlights : [])
        .map((entry) => {
          const normalizedRating = parseNullableNumberInput(entry?.rating, { min: 1, max: 5, precision: 1 });
          const nextEntry = {
            reviewer_name: String(entry?.reviewer_name || '').trim().slice(0, 80),
            comment: String(entry?.comment || '').trim().slice(0, 280)
          };
          if (normalizedRating != null) {
            nextEntry.rating = normalizedRating;
          }
          return nextEntry;
        })
        .filter((entry) => entry.comment.length > 0)
        .slice(0, 8);
      const updatePayload = {
        enable_auto_reorder: settings.autoCalculateThresholds,
        min_stock_threshold_percent: settings.defaultMinThreshold,
        purchase_allowance_percent: settings.defaultPurchaseAllowance,
        pos_registered_name: settings.posRegisteredName,
        pos_business_name: settings.posBusinessName,
        pos_business_style: settings.posBusinessStyle,
        pos_taxpayer_type: settings.posTaxpayerType,
        pos_tin_branch: settings.posTinBranch,
        pos_address: settings.posAddress,
        pos_ptu_number: settings.posPtuNumber,
        pos_min_number: settings.posMinNumber,
        pos_accreditation_number: settings.posAccreditationNumber,
        pos_fiscal_buyer_details_required: settings.posFiscalBuyerDetailsRequired === true,
        pos_receipt_footer_message: settings.posReceiptFooterMessage,
        pos_discount_profiles: posDiscountProfiles,
        pos_terminal_registry: posTerminalRegistry,
        pos_terminal_registry_mode: posTerminalRegistryMode,
        pos_terminal_location_binding_enforced: settings.posTerminalLocationBindingEnforced === true,
        pos_petty_cash_symbol: settings.posPettyCashSymbol,
        pos_petty_cash_amount: Number(settings.posPettyCashAmount || 0),
        store_delivery_fee: Number(settings.storeDeliveryFee || 0),
        store_tenant_slug: String(settings.storeTenantSlug || '').trim().toLowerCase(),
        store_is_visible: settings.storeIsVisible === true,
        store_has_no_location: settings.storeHasNoLocation === true,
        pos_open_status: settings.posOpenStatus === true,
        pos_wait_time_minutes: Number(settings.posWaitTimeMinutes || 0),
        customer_access_mode: normalizeCustomerAccessMode(settings.customerAccessMode),
        inventory_display_mode: normalizeInventoryDisplayMode(settings.inventoryDisplayMode),
        inventory_low_stock_display_threshold: Number(settings.inventoryLowStockDisplayThreshold || 5),
        storefront_tagline: String(settings.storefrontTagline || '').trim(),
        storefront_about: String(settings.storefrontAbout || '').trim(),
        storefront_phone: String(settings.storefrontPhone || '').trim(),
        storefront_email: String(settings.storefrontEmail || '').trim(),
        storefront_hours: serializeStorefrontBusinessHours(settings.storefrontHours),
        storefront_why_choose_us: storefrontWhyChooseUs,
        storefront_social_links: {
          messenger: String(settings.storefrontSocialMessenger || '').trim(),
          facebook: String(settings.storefrontSocialFacebook || '').trim(),
          instagram: String(settings.storefrontSocialInstagram || '').trim()
        },
        storefront_review_highlights: storefrontReviewHighlights,
        storefront_review_summary: serializeStorefrontReviewSummary(settings),
        // #695: storefront_promo is intentionally omitted from this write payload. This editor is
        // frozen (see the Promo Card (Legacy) block below) and only ever knows 11 of the fields
        // the promo engine actually persists -- it has no target_item_ids, valid_from/valid_until,
        // or channels/fulfillment_methods/order_timing eligibility maps. Before this change every
        // save here silently rebuilt storefront_promo from just those 11 fields, which both
        // narrowed a richer tenant record and re-created the key after the #695 migration deletes
        // it. settingsRepository.updateSettings only touches keys present in the body, so omitting
        // the key here leaves whatever is stored strictly alone.
        storefront_ui_v2_enabled: settings.storefrontUiV2Enabled === true,
        storefront_categories: storefrontCategories,
        storefront_gallery_images: serializeStorefrontGallerySettings(settings.storefrontGalleryImages),
        storefront_delivery_partners: storefrontDeliveryPartners,
        storefront_follow_enabled: settings.storefrontFollowEnabled === true,
        storefront_share_enabled: settings.storefrontShareEnabled === true
      };
      if (currentUser?.is_master_admin === true) {
        updatePayload.ops_workflow_mode = nextWorkflowMode;
      }

      // Save only the settings owned by the active tab. This prevents Storefront
      // saves from carrying POS receipt metadata into the platform approval flow.
      const scopedUpdatePayload = scopeSettingsPayloadForTab(updatePayload, currentTab);
      const saveResult = await settingsService.updateSettings(scopedUpdatePayload);

      if (currentUser?.is_master_admin === true && nextWorkflowMode !== persistedWorkflowMode) {
        setPersistedWorkflowMode(nextWorkflowMode);
        broadcastWorkflowModeChange({
          mode: nextWorkflowMode,
          source: 'settings_save'
        });
      }

      const refreshedSettings = await settingsService.getAllSettings({ force: true }).catch(() => null);
      if (refreshedSettings) {
        setSettings((current) => ({
          ...current,
          ...mapCustomerAccessRuntimeSettings(refreshedSettings),
          posReceiptMetadataPendingReview: refreshedSettings.pos_receipt_metadata_pending_changes?.value?.status === 'pending_review'
            ? refreshedSettings.pos_receipt_metadata_pending_changes.value
            : current.posReceiptMetadataPendingReview
        }));
      }

      if (Array.isArray(saveResult?.pending_review_keys) && saveResult.pending_review_keys.length > 0) {
        toast.success('Settings saved. Receipt metadata changes are pending platform admin approval.');
      } else {
        toast.success("Settings saved successfully!");
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || 'Failed to save settings';
      const validationErrors = Array.isArray(error.response?.data?.errors)
        ? error.response.data.errors
        : [];
      const validationDescription = formatValidationErrorDescription(validationErrors);
      toast.error(errorMsg, validationDescription ? { description: validationDescription } : undefined);

      if (validationErrors.length > 0) {
        const errors = {};
        validationErrors.forEach(err => {
          const fieldKey = err.field === 'phone_number' ? 'phoneNumber' : err.field;
          errors[fieldKey] = err.message;
        });
        setProfileErrors(errors);
      }
    }
  };

  const handleUploadStorefrontAsset = async (assetType, file) => {
    if (!file) return;
    setAssetUploadingType(assetType);
    try {
      const result = await settingsService.uploadStorefrontAsset(assetType, file);
      setStorefrontAssets((prev) => ({
        ...prev,
        [assetType]: String(result?.image_url || '')
      }));
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} updated.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || `Failed to upload ${assetType} image`);
    } finally {
      setAssetUploadingType('');
    }
  };

  const handleUploadStorefrontGalleryAsset = async (index, file) => {
    if (!file) return;
    const uploadKey = `gallery-${index}`;
    setAssetUploadingType(uploadKey);
    try {
      const result = await settingsService.uploadStorefrontAsset('gallery', file);
      handleStorefrontGalleryChange(index, 'path', String(result?.path || ''));
      handleStorefrontGalleryChange(index, 'url', '');
      toast.success('Gallery image uploaded. Save Changes to publish it.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload gallery image');
    } finally {
      setAssetUploadingType('');
    }
  };

  const handleDeleteStorefrontAsset = async (assetType) => {
    setAssetDeletingType(assetType);
    try {
      await settingsService.deleteStorefrontAsset(assetType);
      setStorefrontAssets((prev) => ({
        ...prev,
        [assetType]: ''
      }));
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} removed.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || `Failed to remove ${assetType} image`);
    } finally {
      setAssetDeletingType('');
    }
  };

  const handleReset = () => {
    // Reset profile to current user data
    if (currentUser) {
      setProfileSettings({
        username: currentUser.username,
        email: currentUser.email,
        phoneNumber: currentUser.phone_number || '',
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
        emailOtpCode: ''
      });
      setProfileEmailOtpSentTo('');
    }

    // Reset system settings
    setSettings(createDefaultSettings({
      workflowMode: currentUser?.is_master_admin === true ? persistedWorkflowMode : DEFAULT_WORKFLOW_MODE
    }));
    setStorefrontAssets({
      cover: '',
      profile: ''
    });
    resetLocationForm();
    toast.success("Settings reset to defaults");
  };

  const handleSetupPayMongoRecurring = async () => {
    setIsStartingPayMongoSetup(true);
    try {
      const result = await paymentService.setupPayMongoRecurring();
      if (result?.checkoutLink) {
        window.open(result.checkoutLink, '_blank', 'noopener,noreferrer');
        toast.success('PayMongo checkout link opened in a new tab. Complete setup to activate recurring billing.');
      } else {
        toast.success('PayMongo recurring setup initiated.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to start PayMongo setup.');
    } finally {
      setIsStartingPayMongoSetup(false);
    }
  };

  const handleCancelSubscription = async ({ skipConfirm = false } = {}) => {
    if (!skipConfirm) {
      setConfirmationAction({ type: 'cancel-subscription' });
      return true;
    }

    setIsCancelling(true);
    try {
      const result = await paymentService.cancelPayMongoSubscription('User initiated cancellation from settings');
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success(result.message || "Subscription cancelled successfully.");
      return true;
    } catch (err) {
      const message = err.response?.data?.message || "Failed to cancel subscription.";
      toast.error(message);
      return { success: false, message };
    } finally {
      setIsCancelling(false);
    }
  };

  const handleSyncSubscription = async () => {
    setIsSyncing(true);
    try {
      await paymentService.syncPayMongoSubscription();
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success("Subscription status updated from PayMongo.");
      fetchBillingHistory();
    } catch (err) {
      toast.error("Failed to sync status. Please try again later.");
    } finally {
      setIsSyncing(false);
    }
  };

  const handleChangePlan = async (newPlan) => {
    setIsChangingPlan(true);
    try {
      const result = await paymentService.changePayMongoPlan(newPlan);
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      toast.success(result?.effective_immediately
        ? `Plan changed to ${newPlan} successfully.`
        : `Plan change to ${newPlan} was scheduled successfully.`);
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to change plan.");
    } finally {
      setIsChangingPlan(false);
    }
  };

  const handleMigrateToPayMongo = async (subscriptionId) => {
    setIsMigratingToPayMongo(true);
    try {
      await paymentService.migrateToPayMongo(subscriptionId);
      const updatedUser = await userService.getCurrentUser();
      setCurrentUser(updatedUser);
      setPaymongoSubscriptionIdInput('');
      toast.success("PayMongo subscription linked successfully.");
    } catch (err) {
      toast.error(err.response?.data?.message || "Failed to link PayMongo subscription.");
    } finally {
      setIsMigratingToPayMongo(false);
    }
  };

  const primaryStorefrontLocation = tenantLocations.find((location) => location?.is_primary_storefront === true) || null;
  const hasActivePrimaryStorefrontLocation = primaryStorefrontLocation?.is_active === true;
  const publicVisibilityMissingPrimary = settings.storeIsVisible === true && settings.storeHasNoLocation !== true && !hasActivePrimaryStorefrontLocation;
  const primaryStorefrontLastSyncAt = (
    primaryStorefrontLocation?.storefront_last_synced_at
    || tenantLocations.find((location) => Boolean(location?.storefront_last_synced_at))?.storefront_last_synced_at
    || null
  );
  const primaryStorefrontHealthCopy = primaryStorefrontLocation
    ? `Primary storefront location: ${primaryStorefrontLocation.name}`
    : 'No primary storefront location selected yet.';
  const primaryStorefrontLastSyncCopy = primaryStorefrontLastSyncAt
    ? new Date(primaryStorefrontLastSyncAt).toLocaleString()
    : 'Not synced yet';
  const storefrontSyncHealthLabel = storefrontSyncHealth?.status === 'healthy'
    ? 'Healthy'
    : storefrontSyncHealth?.status === 'degraded'
      ? 'Degraded'
      : 'Unknown';
  const storefrontSyncHealthClass = storefrontSyncHealth?.status === 'healthy'
    ? 'bg-emerald-100 text-emerald-700'
    : storefrontSyncHealth?.status === 'degraded'
      ? 'bg-amber-100 text-amber-700'
      : 'bg-slate-100 text-slate-600';
  const storefrontSyncCheckedAtCopy = storefrontSyncHealth?.last_checked_at
    ? new Date(storefrontSyncHealth.last_checked_at).toLocaleString()
    : 'No sync health event yet';
  const coverPreviewUrl = resolveAssetUrl(storefrontAssets.cover);
  const profilePreviewUrl = resolveAssetUrl(storefrontAssets.profile);
  const storefrontBrandingMediaControls = (
    <div className="space-y-2">
      <Label>Storefront Cover + Profile Media</Label>
      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
        <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-slate-100 h-32 md:h-40">
          {coverPreviewUrl ? (
            <img src={coverPreviewUrl} alt="Storefront cover preview" className="h-full w-full object-cover" />
          ) : (
            <div className="h-full w-full flex items-center justify-center text-xs text-slate-500 font-medium">
              No cover photo uploaded
            </div>
          )}
          <div className="absolute -bottom-8 left-4 h-16 w-16 md:h-20 md:w-20 rounded-full border-4 border-white bg-slate-100 overflow-hidden shadow">
            {profilePreviewUrl ? (
              <img src={profilePreviewUrl} alt="Storefront profile preview" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[10px] md:text-xs text-slate-500 font-semibold">
                No icon
              </div>
            )}
          </div>
        </div>
        <div className="pt-8 grid md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Cover photo</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="file"
                accept="image/*"
                disabled={!canEditStorefrontBranding || assetUploadingType === 'cover' || assetDeletingType === 'cover'}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleUploadStorefrontAsset('cover', file);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!canEditStorefrontBranding || !storefrontAssets.cover || assetUploadingType === 'cover' || assetDeletingType === 'cover'}
                onClick={() => handleDeleteStorefrontAsset('cover')}
              >
                Remove
              </Button>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 p-3 space-y-2">
            <p className="text-sm font-semibold text-slate-900">Profile icon</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                type="file"
                accept="image/*"
                disabled={!canEditStorefrontBranding || assetUploadingType === 'profile' || assetDeletingType === 'profile'}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  handleUploadStorefrontAsset('profile', file);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                disabled={!canEditStorefrontBranding || !storefrontAssets.profile || assetUploadingType === 'profile' || assetDeletingType === 'profile'}
                onClick={() => handleDeleteStorefrontAsset('profile')}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
        <p className="text-xs text-slate-500">
          Images auto-fit with center-crop for consistent desktop/mobile layout and appear on storefront discovery + tenant page.
        </p>
        {!canEditStorefrontBranding && (
          <p className="text-xs text-amber-700">
            Only Admin or Master Admin can edit storefront branding unless user has the <code>settings:storefront_branding_edit</code> micropermission.
          </p>
        )}
      </div>
    </div>
  );

  const requestedCustomerAccessMode = normalizeCustomerAccessMode(settings.customerAccessMode);
  const maxCustomerAccessMode = normalizeCustomerAccessMode(settings.customerAccessMaxMode || 'transaction', 'transaction');
  const platformMaxCustomerAccessMode = normalizeCustomerAccessMode(settings.customerAccessPlatformMaxMode || 'transaction', 'transaction');
  const effectiveCustomerAccessMode = normalizeCustomerAccessMode(settings.customerAccessEffectiveMode || requestedCustomerAccessMode);
  const customerAccessLimitation = effectiveCustomerAccessMode !== requestedCustomerAccessMode
    ? (settings.customerAccessLimitationReason || `Requested mode is capped at ${maxCustomerAccessMode} mode.`)
    : 'No platform or registration-stage cap is reducing the requested mode.';
  const customerAccessRollbackActive = settings.customerAccessFlagStatus === 'rollback';
  const customerAccessRuntimeLabel = customerAccessRollbackActive ? 'Rollback active' : 'Enforced';
  const customerAccessRuntimeDescription = customerAccessRollbackActive
    ? 'Public Storefront access-mode enforcement is globally disabled except for allowlisted tenants.'
    : 'Public Storefront access-mode enforcement is active for this tenant.';

  return (
    <div className="space-y-4 pb-28 sm:space-y-6 sm:pb-0 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight sm:text-3xl">Settings</h1>
          <p className="text-sm text-slate-500 mt-1 sm:text-base">Configure your workspace and profile</p>
          <p className="text-xs text-slate-400 mt-1">Build {settingsBuildStamp}</p>
        </div>
        <div className="hidden gap-3 sm:flex">
          {currentTab !== 'compliance' ? (
            <>
              <Button type="button" variant="outline" onClick={handleReset} className="whitespace-nowrap">
                <RefreshCw className="w-4 h-4 mr-2" />
                Reset
              </Button>
              <Button type="button" onClick={handleSave} className="whitespace-nowrap bg-teal-600 hover:bg-teal-700">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Compliance has its own save actions per section.
            </div>
          )}
        </div>
      </div>

      <Tabs value={currentTab} onValueChange={(v) => setSettingsTab(v, { preserveHash: false })} className="w-full">
        <TabsList
          aria-label="Settings sections"
          className="sticky top-16 z-20 -mx-6 mb-4 flex h-auto w-[calc(100%+3rem)] justify-start gap-1 overflow-x-auto rounded-none border-y border-slate-200 bg-slate-50/95 px-6 py-2 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:static sm:mx-0 sm:mb-8 sm:w-full sm:rounded-lg sm:border-0 sm:bg-slate-100 sm:p-1"
        >
          <TabsTrigger value="profile" className="flex-none px-4">Profile</TabsTrigger>
          <TabsTrigger value="company" className="flex-none px-4">Company</TabsTrigger>
          <TabsTrigger value="storefront" className="flex-none px-4">Storefront</TabsTrigger>
          {subscriptionFeaturesEnabled && <TabsTrigger value="subscription" className="flex-none px-4">Subscription</TabsTrigger>}
          <TabsTrigger value="pos" className="flex-none px-4">POS Setup</TabsTrigger>
          <TabsTrigger value="compliance" className="flex-none px-4">Compliance</TabsTrigger>
          <TabsTrigger value="system" className="flex-none px-4">System</TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" id="tab-profile" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <User className="w-5 h-5 text-teal-600" />
                Profile Settings
              </CardTitle>
              <CardDescription>Manage your account security</CardDescription>
              <p className="text-xs text-slate-500">
                Storefront cover/profile image uploads are in <span className="font-semibold">Storefront</span> tab under <span className="font-semibold">Storefront Media</span>.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={profileSettings.username}
                  onChange={(e) => handleProfileChange('username', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={profileSettings.email}
                  onChange={(e) => handleProfileChange('email', e.target.value)}
                  aria-invalid={Boolean(profileErrors.email)}
                />
                {profileErrors.email && (
                  <p className="text-xs text-red-600">{profileErrors.email}</p>
                )}
                {isProfileEmailChanged && (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="flex-1">
                        <Label htmlFor="profileEmailOtpCode">Email Verification Code</Label>
                        <Input
                          id="profileEmailOtpCode"
                          inputMode="numeric"
                          pattern="[0-9]{6}"
                          maxLength={6}
                          placeholder="123456"
                          value={profileSettings.emailOtpCode}
                          onChange={(e) => handleProfileChange('emailOtpCode', e.target.value.replace(/\D/g, '').slice(0, 6))}
                          aria-invalid={Boolean(profileErrors.emailOtpCode)}
                          className="mt-1"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRequestProfileEmailOtp}
                        disabled={isRequestingProfileEmailOtp}
                      >
                        {isRequestingProfileEmailOtp ? 'Sending...' : profileEmailOtpSentTo ? 'Resend Code' : 'Send Code'}
                      </Button>
                    </div>
                    <p className={`mt-2 text-xs ${profileErrors.emailOtpCode ? 'text-red-600' : 'text-slate-500'}`}>
                      {profileErrors.emailOtpCode || (
                        profileEmailOtpSentTo
                          ? `Code sent to ${profileEmailOtpSentTo}.`
                          : 'Send a code to the new email before saving.'
                      )}
                    </p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumber">Phone Number</Label>
                <Input
                  id="phoneNumber"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+63 912 345 6789"
                  value={profileSettings.phoneNumber}
                  onChange={(e) => handleProfileChange('phoneNumber', e.target.value)}
                  aria-invalid={Boolean(profileErrors.phoneNumber)}
                />
                <p className={`text-xs ${profileErrors.phoneNumber ? 'text-red-600' : 'text-slate-500'}`}>
                  {profileErrors.phoneNumber || PHONE_NUMBER_HELP_TEXT}
                </p>
              </div>
              <Separator />
              <div className="space-y-4">
                <Label className="text-base font-semibold">Change Password</Label>
                <div className="grid gap-4">
                  <Input
                    id="currentPassword"
                    type="password"
                    placeholder="Current Password"
                    value={profileSettings.currentPassword}
                    onChange={(e) => handleProfileChange('currentPassword', e.target.value)}
                    aria-invalid={Boolean(profileErrors.currentPassword)}
                  />
                  {profileErrors.currentPassword && (
                    <p className="text-xs text-red-600">{profileErrors.currentPassword}</p>
                  )}
                  <div className="grid gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor="newPassword">New Password</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateProfilePassword}
                        className="ml-auto h-8 gap-1.5"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Generate
                      </Button>
                    </div>
                    <Input
                      id="newPassword"
                      type="password"
                      placeholder="New Password"
                      value={profileSettings.newPassword}
                      onChange={(e) => handleProfileChange('newPassword', e.target.value)}
                      aria-invalid={Boolean(profileErrors.newPassword)}
                    />
                    <p className={`text-xs ${profileErrors.newPassword ? 'text-red-600' : 'text-slate-500'}`}>
                      {profileErrors.newPassword || 'At least 8 characters'}
                    </p>
                  </div>
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="Confirm New Password"
                    value={profileSettings.confirmPassword}
                    onChange={(e) => handleProfileChange('confirmPassword', e.target.value)}
                    aria-invalid={Boolean(profileErrors.confirmPassword)}
                  />
                  {profileErrors.confirmPassword && (
                    <p className="text-xs text-red-600">{profileErrors.confirmPassword}</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Tab */}
        <TabsContent value="company" id="tab-company" className="space-y-6">
          {currentUser?.is_master_admin && companyInfo ? (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                    <Building2 className="w-5 h-5 text-teal-600" />
                    Company Details
                  </CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowUserManagement(true)}>
                    <Users className="w-4 h-4 mr-2" />
                    Manage Users
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-xs uppercase text-slate-500">Company Name</Label>
                  <p className="font-bold text-slate-900">{companyInfo.company_name}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Label className="text-xs uppercase text-slate-500">Company Token</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-white px-2 py-1 rounded border flex-1">{companyInfo.company_token}</code>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Copy company token"
                      onClick={() => copyToClipboard(companyInfo.company_token, 'Token copied!')}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center text-slate-500 mb-4">
                  View company details and manage team members.
                </div>
                {currentUser?.role === 'admin' && (
                  <Button type="button" onClick={() => setShowUserManagement(true)} className="w-full sm:w-auto">
                    <Users className="w-4 h-4 mr-2" />
                    Manage Users
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card id="business-mode-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Building2 className="w-5 h-5 text-teal-600" />
                Business Mode
              </CardTitle>
              <CardDescription>
                Template mode controls presets and navigation behavior. Manufacturing-family modes keep full IMS/POS surfaces, while Simple (MSME) keeps streamlined flows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <Label>Workflow Mode</Label>
                <select
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
                  value={normalizeWorkflowMode(settings.opsWorkflowMode)}
                  onChange={(event) => handleChange('opsWorkflowMode', normalizeWorkflowMode(event.target.value))}
                  disabled={currentUser?.is_master_admin !== true}
                >
                  {WORKFLOW_MODE_SELECT_VALUES.map((mode) => (
                    <option key={mode} value={mode}>{WORKFLOW_MODE_LABELS[mode] || mode}</option>
                  ))}
                </select>
              </div>
              <p className="text-xs text-slate-600">
                Active mode after save: <span className="font-semibold text-slate-900">{getWorkflowModeLabel(settings.opsWorkflowMode)}</span>
              </p>
              {currentUser?.is_master_admin !== true && (
                <p className="text-xs text-amber-700">
                  Only master admin can change Business Mode.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Storefront Tab */}
        <TabsContent value="storefront" id="tab-storefront" className="space-y-6">
          <Card id="storefront-operations-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Building2 className="w-5 h-5 text-teal-600" />
                Storefront Visibility & Ordering
              </CardTitle>
              <CardDescription>
                Control the public store URL, public map/page visibility, buyer-facing open status, wait time, and delivery fee.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Storefront Slug</Label>
                  <Input
                    value={settings.storeTenantSlug}
                    onChange={(e) => handleChange('storeTenantSlug', e.target.value)}
                    placeholder="your-store-slug"
                    maxLength={80}
                  />
                  <p className="text-xs text-slate-500">
                    Used for the public storefront URL path: `/:slug`.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Store Delivery Fee (PHP)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={settings.storeDeliveryFee}
                    onChange={(e) => handleChange('storeDeliveryFee', e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Public Map and Storefront Page</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Show this company on the DGFY map and public storefront page</span>
                    <Switch
                      aria-label="Show company on DGFY map and public storefront page"
                      checked={settings.storeIsVisible === true}
                      onCheckedChange={(v) => handleChange('storeIsVisible', v)}
                    />
                  </div>
                  {publicVisibilityMissingPrimary && (
                    <p className="text-xs text-amber-700">
                      Public visibility is on, but this company will not publish until an active primary storefront pin is saved below.
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Storefront Open Status</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Open or closed status shown to buyers</span>
                    <Switch
                      checked={settings.posOpenStatus === true}
                      onCheckedChange={(v) => handleChange('posOpenStatus', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Customer Wait Time (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="720"
                    value={settings.posWaitTimeMinutes}
                    onChange={(e) => handleChange('posWaitTimeMinutes', e.target.value)}
                    placeholder="15"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card id="storefront-access-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Building2 className="w-5 h-5 text-teal-600" />
                Storefront Access
              </CardTitle>
              <CardDescription>
                Control what customers can do on the storefront and how inventory is presented publicly.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer-access-mode">Customer Access Mode</Label>
                  <select
                    id="customer-access-mode"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={requestedCustomerAccessMode}
                    onChange={(e) => handleChange('customerAccessMode', e.target.value)}
                  >
                    {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxCustomerAccessMode]}
                      >
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    Effective mode: <span className="font-semibold text-slate-900">{effectiveCustomerAccessMode}</span>. Max allowed: <span className="font-semibold text-slate-900">{maxCustomerAccessMode}</span>.
                  </p>
                  <p className="text-xs text-slate-500">
                    Platform max: <span className="font-semibold text-slate-900">{settings.customerAccessPlatformMaxMode}</span>. Registration max: <span className="font-semibold text-slate-900">{settings.customerAccessRegistrationStageMaxMode}</span>.
                  </p>
                  <p className="text-xs text-slate-500">
                    Company admins can request modes up to platform max; checkout still follows the effective mode after registration readiness is applied.
                  </p>
                  <p className="text-xs text-slate-500">{customerAccessLimitation}</p>
                </div>
                <div className="space-y-2">
                  <Label>Inventory Display</Label>
                  <select
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    value={normalizeInventoryDisplayMode(settings.inventoryDisplayMode)}
                    onChange={(e) => handleChange('inventoryDisplayMode', e.target.value)}
                  >
                    {INVENTORY_DISPLAY_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    Raw stock and cost remain private; storefront APIs expose customer-facing labels.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Low Stock Display Threshold</Label>
                  <Input
                    type="number"
                    min="1"
                    max="9999"
                    value={settings.inventoryLowStockDisplayThreshold}
                    onChange={(e) => handleChange('inventoryLowStockDisplayThreshold', e.target.value)}
                  />
                </div>
                <div
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    customerAccessRollbackActive
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {customerAccessRollbackActive ? (
                      <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                    )}
                    <p className="font-semibold">Runtime enforcement: {customerAccessRuntimeLabel}</p>
                  </div>
                  <p className="mt-1">{customerAccessRuntimeDescription}</p>
                  <p className="mt-1 text-xs">
                    <code>CUSTOMER_ACCESS_MODES_ENABLED=false</code> is reserved for rollback; <code>CUSTOMER_ACCESS_MODES_ENABLED_TENANTS</code> can re-enable selected tenants during recovery.
                  </p>
                </div>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
                  <div key={option.value} className="rounded-lg border border-slate-200 p-3">
                    <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                    <p className="text-xs text-slate-600">{option.description}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card id="storefront-locations-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Warehouse className="w-5 h-5 text-teal-600" />
                Storefront Locations & Fulfillment
              </CardTitle>
              <CardDescription>
                Manage buyer-facing fulfillment locations, storefront discovery health, and the primary map pin.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2">
                <p className="text-sm font-semibold text-sky-900">{primaryStorefrontHealthCopy}</p>
                <p className="text-xs text-sky-700">Discovery last synced: {primaryStorefrontLastSyncCopy}</p>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Label>This Store Has No Location</Label>
                    <p className="mt-1 text-xs text-slate-500">
                      The storefront remains public and searchable, but it is excluded from map pins until this is turned off and a primary location is published.
                    </p>
                  </div>
                  <Switch
                    checked={settings.storeHasNoLocation === true}
                    onCheckedChange={(checked) => {
                      const nextHasNoLocation = checked === true;
                      handleChange('storeHasNoLocation', nextHasNoLocation);
                      if (!nextHasNoLocation && !hasActivePrimaryStorefrontLocation) {
                        setLocationForm((prev) => (
                          prev.is_active === false
                            ? prev
                            : { ...prev, is_primary_storefront: true }
                        ));
                      }
                    }}
                  />
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-900">Storefront Sync Health</p>
                  <span className={`text-xs font-semibold px-2 py-1 rounded-full ${storefrontSyncHealthClass}`}>
                    {storefrontSyncHealthLabel}
                  </span>
                </div>
                <div className="grid md:grid-cols-2 gap-2 text-xs text-slate-600">
                  <p>Last checked: {storefrontSyncCheckedAtCopy}</p>
                  <p>Source: {storefrontSyncHealth?.source || 'N/A'}</p>
                  <p>Attempts: {Number.isFinite(Number(storefrontSyncHealth?.attempts)) ? Number(storefrontSyncHealth.attempts) : 0}</p>
                  <p>Recovered by reconcile: {storefrontSyncHealth?.reconciled === true ? 'Yes' : 'No'}</p>
                </div>
                {Array.isArray(storefrontSyncHealth?.errors) && storefrontSyncHealth.errors.length > 0 && (
                  <p className="text-xs text-amber-700">
                    Recent sync issues: {storefrontSyncHealth.errors.slice(0, 3).join(' | ')}
                  </p>
                )}
              </div>
              {settings.storeHasNoLocation === true ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-900">Map publication is disabled for this store.</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Saved locations are preserved. Turn off &quot;This Store Has No Location&quot; to edit pins or publish a primary storefront location.
                  </p>
                </div>
              ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location Name</Label>
                  <Input
                    value={locationForm.name}
                    onChange={(e) => handleLocationFormChange('name', e.target.value)}
                    placeholder="Main Branch"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    value={locationForm.address_line}
                    onChange={(e) => handleLocationFormChange('address_line', e.target.value)}
                    placeholder="Street, City, Province"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Map Pin (MapLibre)</Label>
                  <MapPinPicker
                    latitude={locationForm.latitude}
                    longitude={locationForm.longitude}
                    deliveryRadiusKm={locationForm.delivery_radius_km}
                    onChange={handleLocationPinChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delivery Radius (km)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={locationForm.delivery_radius_km}
                    onChange={(e) => handleLocationFormChange('delivery_radius_km', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Wait Time (minutes)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="720"
                    value={locationForm.current_wait_time_minutes}
                    onChange={(e) => handleLocationFormChange('current_wait_time_minutes', e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location Is Open</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Open status visible to buyers</span>
                    <Switch
                      checked={locationForm.is_open === true}
                      onCheckedChange={(v) => handleLocationFormChange('is_open', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary Storefront Pin</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Use this as the storefront discovery map pin</span>
                    <Switch
                      checked={locationForm.is_primary_storefront === true}
                      disabled={locationForm.is_active !== true}
                      onCheckedChange={(v) => handleLocationFormChange('is_primary_storefront', v)}
                    />
                  </div>
                  {locationForm.is_active !== true && (
                    <p className="text-xs text-amber-700">Primary storefront pin can only be set on an active location.</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Allow Out-Of-Stock Sales</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Allow ordering items even when stock is zero</span>
                    <Switch
                      checked={locationForm.allow_out_of_stock_sales === true}
                      onCheckedChange={(v) => handleLocationFormChange('allow_out_of_stock_sales', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supports Delivery</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Enable delivery orders for this location</span>
                    <Switch
                      checked={locationForm.supports_delivery === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_delivery', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Supports Pickup</Label>
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <span className="text-sm text-slate-600">Enable pickup orders for this location</span>
                    <Switch
                      checked={locationForm.supports_pickup === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_pickup', v)}
                    />
                  </div>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                    <div>
                      <Label>Supports Dine-In</Label>
                      <p className="text-xs text-slate-500">Enable dine-in reservations or walk-in routing for this location</p>
                    </div>
                    <Switch
                      checked={locationForm.supports_dine_in === true}
                      onCheckedChange={(v) => handleLocationFormChange('supports_dine_in', v)}
                    />
                  </div>
                </div>
              </div>
              )}

              {settings.storeHasNoLocation !== true && (
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={handleSaveLocation} disabled={locationSaving}>
                  {locationSaving ? 'Saving...' : editingLocationId ? 'Update Location' : 'Add Location'}
                </Button>
                {editingLocationId && (
                  <Button type="button" variant="outline" onClick={resetLocationForm} disabled={locationSaving}>
                    Cancel Edit
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => loadTenantLocations()} disabled={locationsLoading || locationSaving}>
                  Refresh List
                </Button>
              </div>
              )}

              <div className="space-y-2">
                <Label>Configured Locations</Label>
                {locationsLoading ? (
                  <p className="text-sm text-slate-500">Loading locations...</p>
                ) : tenantLocations.length === 0 ? (
                  <p className="text-sm text-slate-500 border border-dashed border-slate-300 rounded-lg p-3">
                    No locations configured yet.
                  </p>
                ) : (
                  tenantLocations.map((location) => (
                    <div
                      key={`tenant-location-${location.location_id}`}
                      className="rounded-lg border border-slate-200 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-slate-900">{location.name}</p>
                          <p className="text-xs text-slate-500">{location.address_line}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${location.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
                            {location.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${location.is_open ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>
                            {location.is_open ? 'Open' : 'Closed'}
                          </span>
                          {location.is_primary_storefront === true && (
                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
                        <p>Lat: {location.latitude}</p>
                        <p>Lng: {location.longitude}</p>
                        <p>Radius: {location.delivery_radius_km} km</p>
                        <p>Wait: {location.current_wait_time_minutes} min</p>
                      </div>
                      {settings.storeHasNoLocation === true ? (
                        <p className="text-xs text-slate-500">Location actions are paused while the store is excluded from map pins.</p>
                      ) : (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => handleEditLocation(location)}>
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => handleSetPrimaryLocation(location)}
                            disabled={locationSaving || location.is_active !== true || location.is_primary_storefront === true}
                          >
                            {location.is_primary_storefront === true ? 'Primary' : 'Set Primary'}
                          </Button>
                          {location.is_active ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeactivateLocation(location.location_id)}
                              disabled={locationSaving}
                            >
                              Deactivate
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleReactivateLocation(location.location_id)}
                              disabled={locationSaving}
                            >
                              Reactivate
                            </Button>
                          )}
                          {location.is_active ? (
                            <span className="self-center text-xs text-slate-500">
                              Deactivate before permanent delete
                            </span>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="border-red-200 text-red-700 hover:bg-red-50"
                              onClick={() => openDeleteLocationDialog(location)}
                              disabled={locationSaving}
                            >
                              Delete Pin
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
          <Card id="storefront-branding-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Building2 className="w-5 h-5 text-teal-600" />
                Storefront Media
              </CardTitle>
              <CardDescription>
                Upload public storefront cover photo and profile icon used in discovery cards, map popups, and the tenant storefront header.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {storefrontBrandingMediaControls}
            </CardContent>
          </Card>

          <Card id="storefront-content-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Star className="w-5 h-5 text-orange-500" />
                Storefront Content
              </CardTitle>
              <CardDescription>
                Configure tenant-page sections (about, contact, social, highlights, promo). Empty values stay hidden on the public storefront.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Tagline</Label>
                  <Input value={settings.storefrontTagline} onChange={(e) => handleChange('storefrontTagline', e.target.value)} placeholder="Grilled to perfection. Made with love." />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input value={settings.storefrontPhone} onChange={(e) => handleChange('storefrontPhone', e.target.value)} placeholder="0917 123 4567" />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input value={settings.storefrontEmail} onChange={(e) => handleChange('storefrontEmail', e.target.value)} placeholder="store@email.com" />
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                <StorefrontBusinessHoursScheduler
                  value={settings.storefrontHours}
                  onChange={(nextHours) => handleChange('storefrontHours', nextHours)}
                />
              </div>
              <div className="space-y-2">
                <Label>About</Label>
                <textarea className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm min-h-[96px]" value={settings.storefrontAbout} onChange={(e) => handleChange('storefrontAbout', e.target.value)} placeholder="Short store description for customers." />
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Enable Harmonized Storefront UI</Label>
                    <Switch checked={settings.storefrontUiV2Enabled === true} onCheckedChange={(checked) => handleChange('storefrontUiV2Enabled', checked === true)} />
                  </div>
                  <p className="text-xs text-slate-500">Turns on the high-fidelity storefront v2 layout for this tenant.</p>
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Show Follow Button</Label>
                    <Switch checked={settings.storefrontFollowEnabled === true} onCheckedChange={(checked) => handleChange('storefrontFollowEnabled', checked === true)} />
                  </div>
                  <p className="text-xs text-slate-500">Controls the mobile/desktop follow action visibility.</p>
                </div>
                <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between">
                    <Label>Show Share Button</Label>
                    <Switch checked={settings.storefrontShareEnabled === true} onCheckedChange={(checked) => handleChange('storefrontShareEnabled', checked === true)} />
                  </div>
                  <p className="text-xs text-slate-500">Controls storefront share action visibility.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Store Categories</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStorefrontCategory}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {(Array.isArray(settings.storefrontCategories) ? settings.storefrontCategories : ['']).map((entry, index) => (
                  <div key={`category-${index}`} className="flex gap-2">
                    <Input value={entry} onChange={(e) => handleStorefrontCategoryChange(index, e.target.value)} placeholder="BBQ" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontCategory(index)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Why Choose Us</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStorefrontWhy}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {(Array.isArray(settings.storefrontWhyChooseUs) ? settings.storefrontWhyChooseUs : ['']).map((entry, index) => (
                  <div key={`why-${index}`} className="flex gap-2">
                    <Input value={entry} onChange={(e) => handleStorefrontWhyChange(index, e.target.value)} placeholder="Freshly grilled daily" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontWhy(index)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Messenger Link</Label>
                  <Input value={settings.storefrontSocialMessenger} onChange={(e) => handleChange('storefrontSocialMessenger', e.target.value)} placeholder="https://m.me/..." />
                </div>
                <div className="space-y-2">
                  <Label>Facebook Link</Label>
                  <Input value={settings.storefrontSocialFacebook} onChange={(e) => handleChange('storefrontSocialFacebook', e.target.value)} placeholder="https://facebook.com/..." />
                </div>
                <div className="space-y-2">
                  <Label>Instagram Link</Label>
                  <Input value={settings.storefrontSocialInstagram} onChange={(e) => handleChange('storefrontSocialInstagram', e.target.value)} placeholder="https://instagram.com/..." />
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Gallery Images</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStorefrontGalleryRow}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {(Array.isArray(settings.storefrontGalleryImages) ? settings.storefrontGalleryImages : []).map((row, index) => (
                  <div key={`gallery-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[180px_1fr_1fr_120px_auto]">
                    <div className="flex items-center gap-2">
                      <input
                        id={`settings-gallery-upload-${index}`}
                        type="file"
                        accept="image/*"
                        aria-label={`Upload gallery image ${index + 1}`}
                        className="sr-only"
                        disabled={!canEditStorefrontBranding || assetUploadingType === `gallery-${index}`}
                        onChange={(event) => {
                          const file = event.target.files?.[0] || null;
                          handleUploadStorefrontGalleryAsset(index, file);
                          event.target.value = '';
                        }}
                      />
                      <label
                        htmlFor={`settings-gallery-upload-${index}`}
                        className={cn(
                          'flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50',
                          (!canEditStorefrontBranding || assetUploadingType === `gallery-${index}`) && 'pointer-events-none opacity-50'
                        )}
                      >
                        <ImagePlus className="h-4 w-4" />
                        {assetUploadingType === `gallery-${index}` ? 'Uploading...' : 'Upload image'}
                      </label>
                    </div>
                    <Input value={row.caption || ''} onChange={(e) => handleStorefrontGalleryChange(index, 'caption', e.target.value)} placeholder="Caption" />
                    <Input value={row.alt || ''} onChange={(e) => handleStorefrontGalleryChange(index, 'alt', e.target.value)} placeholder="Alt text" />
                    <Input value={row.sort_order ?? ''} onChange={(e) => handleStorefrontGalleryChange(index, 'sort_order', e.target.value)} placeholder="Sort" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontGalleryRow(index)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Delivery Partners</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addStorefrontDeliveryPartner}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {(Array.isArray(settings.storefrontDeliveryPartners) ? settings.storefrontDeliveryPartners : []).map((row, index) => (
                  <div key={`delivery-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[160px_1fr_1fr_auto]">
                    <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={row.partner || ''} onChange={(e) => handleStorefrontDeliveryPartnerChange(index, 'partner', e.target.value)}>
                      <option value="grab">grab</option>
                      <option value="foodpanda">foodpanda</option>
                      <option value="lalamove">lalamove</option>
                      <option value="custom">custom</option>
                    </select>
                    <Input value={row.label || ''} onChange={(e) => handleStorefrontDeliveryPartnerChange(index, 'label', e.target.value)} placeholder="Display label" />
                    <Input value={row.url || ''} onChange={(e) => handleStorefrontDeliveryPartnerChange(index, 'url', e.target.value)} placeholder="https://partner.example.com" />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontDeliveryPartner(index)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Review Highlights</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addReviewHighlight}><Plus className="w-4 h-4 mr-1" />Add</Button>
                </div>
                {(Array.isArray(settings.storefrontReviewHighlights) ? settings.storefrontReviewHighlights : []).map((row, index) => (
                  <div key={`review-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_120px_2fr_auto]">
                    <Input value={row.reviewer_name || ''} onChange={(e) => handleReviewHighlightChange(index, 'reviewer_name', e.target.value)} placeholder="Reviewer name" />
                    <Input value={row.rating || ''} onChange={(e) => handleReviewHighlightChange(index, 'rating', e.target.value)} placeholder="4.8" />
                    <Input value={row.comment || ''} onChange={(e) => handleReviewHighlightChange(index, 'comment', e.target.value)} placeholder="Great food and service." />
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeReviewHighlight(index)}><Trash2 className="w-4 h-4" /></Button>
                  </div>
                ))}
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 p-4">
                <Label>Review Summary</Label>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input value={settings.storefrontReviewSummaryScore} onChange={(e) => handleChange('storefrontReviewSummaryScore', e.target.value)} placeholder="Average score (e.g. 4.8)" />
                  <Input value={settings.storefrontReviewSummaryTotalCount} onChange={(e) => handleChange('storefrontReviewSummaryTotalCount', e.target.value)} placeholder="Total reviews" />
                </div>
                <div className="grid gap-2 md:grid-cols-5">
                  <Input value={settings.storefrontReviewSummaryStar5} onChange={(e) => handleChange('storefrontReviewSummaryStar5', e.target.value)} placeholder="5★ count" />
                  <Input value={settings.storefrontReviewSummaryStar4} onChange={(e) => handleChange('storefrontReviewSummaryStar4', e.target.value)} placeholder="4★ count" />
                  <Input value={settings.storefrontReviewSummaryStar3} onChange={(e) => handleChange('storefrontReviewSummaryStar3', e.target.value)} placeholder="3★ count" />
                  <Input value={settings.storefrontReviewSummaryStar2} onChange={(e) => handleChange('storefrontReviewSummaryStar2', e.target.value)} placeholder="2★ count" />
                  <Input value={settings.storefrontReviewSummaryStar1} onChange={(e) => handleChange('storefrontReviewSummaryStar1', e.target.value)} placeholder="1★ count" />
                </div>
              </div>
              {/* #695: frozen, not removed -- matches the #776 precedent in
                  packages/web-core/.../TerminalOperationsWorkspace.jsx for the plural
                  storefront_promos "Add Promo" button. This is the singular storefront_promo
                  editor that freeze never touched, and commercialPromoPolicy.js still redeems
                  whatever is stored here on both POS and storefront checkout -- so disabling every
                  input here, not just relabeling, is what actually stops a new legacy discount
                  code from being authored. Existing values still load and render (see
                  storefrontPromo* hydration above) so a tenant's current card stays visible;
                  nothing here can be edited or newly created. Full removal stays deferred per
                  Pat's call until the voucher-based system is prod-proven. */}
              <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Promo Card (Legacy)</Label>
                    <p className="text-[12px] text-slate-500">
                      Promo codes now run on Vouchers -- create new discount codes there instead.
                      This card stays visible but is no longer editable (#695).
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <span>Active</span>
                    <Switch disabled checked={settings.storefrontPromoActive === true} onCheckedChange={(checked) => handleChange('storefrontPromoActive', checked === true)} />
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Input disabled value={settings.storefrontPromoTitle} onChange={(e) => handleChange('storefrontPromoTitle', e.target.value)} placeholder="10% OFF" />
                  <Input disabled value={settings.storefrontPromoBadge} onChange={(e) => handleChange('storefrontPromoBadge', e.target.value)} placeholder="Today's Promo" />
                  <Input disabled value={settings.storefrontPromoSubtitle} onChange={(e) => handleChange('storefrontPromoSubtitle', e.target.value)} placeholder="All BBQ items, min order ₱100" className="md:col-span-2" />
                  <Input disabled value={settings.storefrontPromoValidityText} onChange={(e) => handleChange('storefrontPromoValidityText', e.target.value)} placeholder="Valid today only" className="md:col-span-2" />
                  <Input disabled value={settings.storefrontPromoCode} onChange={(e) => handleChange('storefrontPromoCode', String(e.target.value || '').toUpperCase())} placeholder="Promo Code (e.g. SAVE20)" />
                  <Input disabled type="number" min="0" max="100" step="0.01" value={settings.storefrontPromoDiscountPercent} onChange={(e) => handleChange('storefrontPromoDiscountPercent', e.target.value)} placeholder="Discount % (e.g. 20)" />
                  <Input disabled type="number" min="1" step="1" value={settings.storefrontPromoUsageLimit} onChange={(e) => handleChange('storefrontPromoUsageLimit', e.target.value)} placeholder="Usage Limit (e.g. 30)" />
                  <Input disabled value={settings.storefrontPromoUsedCount} readOnly placeholder="Used Count" />
                  <Input disabled type="time" value={settings.storefrontPromoValidTimeStart} onChange={(e) => handleChange('storefrontPromoValidTimeStart', e.target.value)} />
                  <Input disabled type="time" value={settings.storefrontPromoValidTimeEnd} onChange={(e) => handleChange('storefrontPromoValidTimeEnd', e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card id="fiscal-terminal-registration">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <CreditCard className="w-5 h-5 text-teal-600" />
                Fiscal Terminal Registration
              </CardTitle>
              <CardDescription>
                Register terminal-specific MIN, machine, software, PTU, and evidence data required before fiscal invoice checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn(
                'grid gap-3 rounded-md border p-3 text-sm md:grid-cols-3',
                fiscalTerminalReadiness.ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              )}>
                <div>
                  <p className="text-xs font-semibold uppercase">Activation readiness</p>
                  <p className="font-semibold">{fiscalTerminalReadiness.ready ? 'Verified terminal available' : 'Verified terminal required'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase">Verified terminals</p>
                  <p className="font-semibold">{fiscalTerminalReadiness.verified} of {fiscalTerminalReadiness.total}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase">Records needing evidence</p>
                  <p className="font-semibold">{fiscalTerminalReadiness.blocked}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Terminal ID</Label>
                  <Input value={fiscalTerminalForm.terminal_id} onChange={(event) => setFiscalTerminalField('terminal_id', event.target.value)} placeholder="COUNTER-01" />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Location</Label>
                  <select
                    value={fiscalTerminalForm.location_id || ''}
                    onChange={(event) => setFiscalTerminalField('location_id', event.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="">Unassigned</option>
                    {terminalLocationOptions.map((location) => (
                      <option key={`fiscal-terminal-location-${location.location_id}`} value={location.location_id}>
                        {location.name}{location.is_primary_storefront === true ? ' (Primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Accreditation Status</Label>
                  <select
                    value={fiscalTerminalForm.accreditation_status}
                    onChange={(event) => setFiscalTerminalField('accreditation_status', event.target.value)}
                    className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="draft">Draft</option>
                    <option value="pending_review">Pending Review</option>
                    <option value="verified">Verified</option>
                    <option value="revoked">Revoked</option>
                  </select>
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Evidence Reference</Label>
                  <Input value={fiscalTerminalForm.evidence_ref} onChange={(event) => setFiscalTerminalField('evidence_ref', event.target.value)} placeholder="Filing artifact or approval ref" />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">MIN Number</Label>
                  <Input value={fiscalTerminalForm.min_number} onChange={(event) => setFiscalTerminalField('min_number', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Machine Serial</Label>
                  <Input value={fiscalTerminalForm.machine_serial_number} onChange={(event) => setFiscalTerminalField('machine_serial_number', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Software Version</Label>
                  <Input value={fiscalTerminalForm.software_version} onChange={(event) => setFiscalTerminalField('software_version', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Software Serial</Label>
                  <Input value={fiscalTerminalForm.software_serial_number} onChange={(event) => setFiscalTerminalField('software_serial_number', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">PTU Number</Label>
                  <Input value={fiscalTerminalForm.ptu_number} onChange={(event) => setFiscalTerminalField('ptu_number', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Permit Issued</Label>
                  <Input type="date" value={fiscalTerminalForm.permit_issued_at} onChange={(event) => setFiscalTerminalField('permit_issued_at', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Permit Effective</Label>
                  <Input type="date" value={fiscalTerminalForm.permit_effective_at} onChange={(event) => setFiscalTerminalField('permit_effective_at', event.target.value)} />
                </div>
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Permit Expires</Label>
                  <Input type="date" value={fiscalTerminalForm.permit_expires_at} onChange={(event) => setFiscalTerminalField('permit_expires_at', event.target.value)} />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-xs text-slate-500">Receipt Printer Binding</Label>
                  <Input value={fiscalTerminalForm.receipt_printer_binding} onChange={(event) => setFiscalTerminalField('receipt_printer_binding', event.target.value)} />
                </div>
                <div className="md:col-span-4 space-y-1">
                  <Label className="text-xs text-slate-500">Cash Drawer Binding</Label>
                  <Input value={fiscalTerminalForm.cash_drawer_binding} onChange={(event) => setFiscalTerminalField('cash_drawer_binding', event.target.value)} />
                </div>
                <div className="md:col-span-4 flex items-end gap-2">
                  <Button type="button" onClick={saveFiscalTerminal} disabled={!canManageFiscalTerminals || fiscalTerminalSaving}>
                    {fiscalTerminalSaving ? 'Saving...' : 'Save Fiscal Terminal'}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setFiscalTerminalForm(createDefaultFiscalTerminalForm())}>
                    Clear
                  </Button>
                </div>
              </div>
              {!canManageFiscalTerminals && (
                <p className="text-xs text-amber-700">You need fiscal terminal management permission to save terminal accreditation records.</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Terminal</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">MIN</th>
                      <th className="px-3 py-2">PTU</th>
                      <th className="px-3 py-2">Evidence</th>
                      <th className="px-3 py-2">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fiscalTerminalRegistrations.map((registration) => (
                      <tr key={registration.pos_fiscal_terminal_registration_id || registration.terminal_id} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">{registration.terminal_id}</td>
                        <td className="px-3 py-2">{registration.accreditation_status}</td>
                        <td className="px-3 py-2">{registration.min_number || '-'}</td>
                        <td className="px-3 py-2">{registration.ptu_number || '-'}</td>
                        <td className="px-3 py-2">{registration.evidence_ref || '-'}</td>
                        <td className="px-3 py-2">
                          <Button type="button" variant="outline" size="sm" onClick={() => editFiscalTerminalRegistration(registration)}>
                            Edit
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {!fiscalTerminalLoading && fiscalTerminalRegistrations.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={6}>No fiscal terminal registrations yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card id="fiscal-ledger-integrity">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                {fiscalLedgerIntegrity?.ready ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600" />
                )}
                Fiscal Ledger Integrity
              </CardTitle>
              <CardDescription>
                Verify event sequence continuity, previous-hash linkage, and event hash recomputation for the fiscal event ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className={cn(
                'grid gap-3 rounded-md border p-3 text-sm md:grid-cols-4',
                fiscalLedgerIntegrity?.ready
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              )}>
                <div>
                  <p className="text-xs font-semibold uppercase">Status</p>
                  <p className="font-semibold">{fiscalLedgerIntegrity?.ready ? 'Verified' : 'Needs review'}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase">Events checked</p>
                  <p className="font-semibold">{fiscalLedgerIntegrity?.checked_event_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase">Issues</p>
                  <p className="font-semibold">{fiscalLedgerIntegrity?.issue_count ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase">Latest sequence</p>
                  <p className="font-semibold">{fiscalLedgerIntegrity?.latest_event_sequence || '-'}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" variant="outline" onClick={() => loadFiscalLedgerIntegrity()} disabled={fiscalLedgerLoading}>
                  {fiscalLedgerLoading ? 'Verifying...' : 'Verify Fiscal Ledger'}
                </Button>
                <span className="text-xs text-slate-500">
                  Last verified: {fiscalLedgerIntegrity?.verified_at ? new Date(fiscalLedgerIntegrity.verified_at).toLocaleString() : 'Not verified in this session'}
                </span>
              </div>
              {Array.isArray(fiscalLedgerIntegrity?.issues) && fiscalLedgerIntegrity.issues.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-amber-200">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-amber-50 uppercase text-amber-700">
                      <tr>
                        <th className="px-3 py-2">Sequence</th>
                        <th className="px-3 py-2">Event</th>
                        <th className="px-3 py-2">Issue</th>
                        <th className="px-3 py-2">Invoice</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fiscalLedgerIntegrity.issues.slice(0, 10).map((issue, index) => (
                        <tr key={`${issue.code}-${issue.event_sequence}-${index}`} className="border-t border-amber-100">
                          <td className="px-3 py-2">{issue.event_sequence || '-'}</td>
                          <td className="px-3 py-2">{issue.event_type || '-'}</td>
                          <td className="px-3 py-2 font-semibold">{issue.code}</td>
                          <td className="px-3 py-2">{issue.invoice_number || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card id="esales-reporting">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <History className="w-5 h-5 text-teal-600" />
                eSales Reporting Packages
              </CardTitle>
              <CardDescription>
                Generate monthly fiscal sales packages, retain checksum evidence, and track submission acknowledgement status.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="md:col-span-3 space-y-1">
                  <Label className="text-xs text-slate-500">Report Month</Label>
                  <Input type="month" value={esalesForm.report_month} onChange={(event) => setESalesForm((current) => ({ ...current, report_month: event.target.value }))} />
                </div>
                <div className="md:col-span-6 space-y-1">
                  <Label className="text-xs text-slate-500">Generation Evidence Reference</Label>
                  <Input value={esalesForm.evidence_ref} onChange={(event) => setESalesForm((current) => ({ ...current, evidence_ref: event.target.value }))} placeholder="Dry run, filing packet, or checksum manifest ref" />
                </div>
                <div className="md:col-span-3 flex items-end">
                  <Button type="button" onClick={generateESales} disabled={!canManageESalesReports || esalesSaving}>
                    {esalesSaving ? 'Working...' : 'Generate eSales Package'}
                  </Button>
                </div>
              </div>
              {!canManageESalesReports && (
                <p className="text-xs text-amber-700">You need eSales report management permission to generate or update report status.</p>
              )}
              <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Month</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Checksum</th>
                      <th className="px-3 py-2">Evidence</th>
                      <th className="px-3 py-2">Update</th>
                    </tr>
                  </thead>
                  <tbody>
                    {esalesReports.map((report) => {
                      const reportId = report.pos_esales_report_id;
                      const draft = esalesStatusForm?.[reportId] || {};
                      return (
                        <tr key={reportId || report.report_month} className="border-t border-slate-100 align-top">
                          <td className="px-3 py-2 font-semibold text-slate-900">{report.report_month}</td>
                          <td className="px-3 py-2">{report.status}</td>
                          <td className="px-3 py-2 font-mono text-xs">{String(report.payload_hash || '').slice(0, 16)}...</td>
                          <td className="px-3 py-2">{report.evidence_ref || report.status_evidence_ref || '-'}</td>
                          <td className="px-3 py-2">
                            <div className="grid min-w-[360px] grid-cols-1 gap-2 md:grid-cols-4">
                              <select
                                value={draft.status || 'submitted'}
                                onChange={(event) => setESalesStatusDraft(reportId, 'status', event.target.value)}
                                className="rounded-md border border-slate-200 px-2 py-1 text-xs"
                              >
                                <option value="submitted">Submitted</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                              </select>
                              <Input className="h-8 text-xs md:col-span-2" value={draft.status_evidence_ref || ''} onChange={(event) => setESalesStatusDraft(reportId, 'status_evidence_ref', event.target.value)} placeholder="Acknowledgement ref" />
                              <Button type="button" variant="outline" size="sm" disabled={!canManageESalesReports || esalesSaving} onClick={() => saveESalesStatus(report)}>
                                Save
                              </Button>
                              <Input className="h-8 text-xs md:col-span-4" value={draft.status_note || ''} onChange={(event) => setESalesStatusDraft(reportId, 'status_note', event.target.value)} placeholder="Optional status note" />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {!esalesLoading && esalesReports.length === 0 && (
                      <tr>
                        <td className="px-3 py-4 text-slate-500" colSpan={5}>No eSales reports generated yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        {subscriptionFeaturesEnabled && (
        <>
        {/* Subscription Tab */}
        <TabsContent value="subscription" id="tab-subscription" className="space-y-6">
          <Card className="overflow-hidden">
            <div className={`h-2 w-full ${currentUser?.company?.plan === 'premium' ? 'bg-amber-400' : 'bg-slate-300'}`} />
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                    <CreditCard className="w-5 h-5 text-teal-600" />
                    Subscription Management
                  </CardTitle>
                  <CardDescription>Manage your plan and billing details</CardDescription>
                </div>
                <div className={cn(
                  "px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm",
                  currentUser?.company?.plan === 'premium' ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-700"
                )}>
                  {currentUser?.company?.plan || 'Standard'} Plan
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-tight mb-3">Plan Details</h4>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Status</span>
                      <span className={cn(
                        "text-sm font-bold capitalize",
                        currentUser?.company?.subscription_status === 'active' ? "text-green-600" : "text-amber-600"
                      )}>
                        {currentUser?.company?.subscription_status || 'Inactive'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-slate-600">Cycle End</span>
                      <span className="text-sm font-medium">
                        {currentUser?.company?.current_period_end ? new Date(currentUser.company.current_period_end).toLocaleDateString() : 'N/A'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                  <h4 className="text-sm font-semibold text-indigo-900 uppercase tracking-tight mb-3">AI Features</h4>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      <CheckCircle2 className={cn("w-4 h-4", currentUser?.company?.plan === 'premium' ? "text-indigo-600" : "text-slate-300")} />
                      AI Inventory Assistant
                    </div>
                    <div className="flex items-center gap-2 text-sm text-indigo-700">
                      <CheckCircle2 className={cn("w-4 h-4", currentUser?.company?.plan === 'premium' ? "text-indigo-600" : "text-slate-300")} />
                      Smart Stock Predictions
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending plan change notice */}
              {pendingPlanInfo?.pending_plan && (
                <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-start gap-3 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-semibold text-indigo-800">Plan change pending: </span>
                    <span className="text-indigo-700 capitalize">{pendingPlanInfo.pending_plan}</span>
                    {pendingPlanInfo.pending_plan_approved
                      ? ' — approved, will apply on next billing cycle.'
                      : ' — awaiting provider approval.'}
                  </div>
                </div>
              )}

              {/* PayMongo tenant actions */}
              {currentUser?.company?.payment_method === 'paymongo' && (
                <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-slate-100">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleSyncSubscription}
                    disabled={isSyncing}
                  >
                    <RefreshCw className={cn("w-4 h-4 mr-2", isSyncing && "animate-spin")} />
                    Sync with PayMongo
                  </Button>

                  {currentUser?.company?.plan === 'standard' && !pendingPlanInfo?.pending_plan && (
                    <Button
                      type="button"
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white"
                      onClick={() => handleChangePlan('premium')}
                      disabled={isChangingPlan}
                    >
                      {isChangingPlan ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                      Upgrade to Premium
                    </Button>
                  )}

                  {currentUser?.company?.plan === 'premium' && !pendingPlanInfo?.pending_plan && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-slate-600"
                      onClick={() => handleChangePlan('standard')}
                      disabled={isChangingPlan}
                    >
                      {isChangingPlan ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : null}
                      Downgrade to Standard
                    </Button>
                  )}

                  {currentUser?.company?.subscription_status !== 'cancelled' && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-slate-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                      onClick={handleCancelSubscription}
                      disabled={isCancelling}
                    >
                      <XCircle className="w-4 h-4 mr-2" />
                      Cancel Subscription
                    </Button>
                  )}

                  {currentUser?.company?.subscription_status === 'past_due' && (
                    <div className="w-full mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-amber-800 text-sm">
                      <AlertTriangle className="w-5 h-5 text-amber-600" />
                      <div>
                        <strong>Payment Failed.</strong> Update your payment method to avoid service interruption.
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Migrate to PayMongo (manual tenants, master admin only) */}
              {shouldShowMigrateToPayMongoSection({
                company: currentUser?.company,
                isMasterAdmin: currentUser?.is_master_admin
              }) && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <h4 className="text-sm font-semibold text-slate-700 mb-2">Link PayMongo Subscription</h4>
                  <p className="text-xs text-slate-500 mb-3">
                    Enter an existing PayMongo subscription ID to enable automatic renewals for your current plan.
                  </p>
                  {isMigratingToPayMongo ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Linking subscription...
                    </div>
                  ) : (
                    <div className="max-w-md space-y-3">
                      <Input
                        placeholder="PayMongo subscription ID"
                        value={paymongoSubscriptionIdInput}
                        onChange={(e) => setPaymongoSubscriptionIdInput(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          onClick={() => handleMigrateToPayMongo(paymongoSubscriptionIdInput)}
                          disabled={!paymongoSubscriptionIdInput.trim()}
                          className="bg-teal-600 hover:bg-teal-700"
                        >
                          <LinkIcon className="w-4 h-4 mr-2" />
                          Link Subscription
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={handleSetupPayMongoRecurring}
                          disabled={isStartingPayMongoSetup}
                        >
                          {isStartingPayMongoSetup ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CreditCard className="w-4 h-4 mr-2" />}
                          Start Checkout
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Billing History Section */}
              {currentUser?.company?.payment_method === 'paymongo' && (
                <div className="mt-8">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
                    <History className="w-4 h-4 text-teal-600" />
                    Billing History
                  </h4>
                  <div className="rounded-xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-100">
                          <th className="px-4 py-3 font-semibold text-slate-600">Date</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">Transaction ID</th>
                          <th className="px-4 py-3 font-semibold text-slate-600">Amount</th>
                          <th className="px-4 py-3 font-semibold text-slate-600 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {isLoadingHistory ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-slate-400">Loading history...</td>
                          </tr>
                        ) : billingHistory.length === 0 ? (
                          <tr>
                            <td colSpan="4" className="px-4 py-8 text-center text-slate-400">No transactions recorded yet.</td>
                          </tr>
                        ) : (
                          billingHistory.map((pmt) => (
                            <tr key={pmt.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50/50 transition-colors">
                              <td className="px-4 py-3 text-slate-600">{new Date(pmt.createdAt).toLocaleDateString()}</td>
                              <td className="px-4 py-3 font-mono text-xs text-slate-500 uppercase">{pmt.transaction_id}</td>
                              <td className="px-4 py-3 font-medium text-slate-700">${pmt.amount} {pmt.currency}</td>
                              <td className="px-4 py-3 text-right">
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-green-100 text-green-700">
                                  {pmt.status}
                                </span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {currentUser?.company?.plan === 'standard' && currentUser?.company?.payment_method !== 'paymongo' && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                  <div className="bg-gradient-to-br from-indigo-600 to-teal-600 rounded-2xl p-6 text-white relative overflow-hidden shadow-xl">
                    <Star className="absolute top-4 right-4 w-12 h-12 text-white/10 rotate-12" />
                    <div className="relative z-10">
                      <h3 className="text-xl font-bold mb-2">Upgrade to Premium</h3>
                      <p className="text-white/80 text-sm mb-6 max-w-md">
                        Unlock AI features, smart predictions, and prioritized support for your entire company. Just ₱3,000/month.
                      </p>

                      <div className="max-w-[320px]">
                        <Button
                          type="button"
                          className="bg-white text-indigo-700 hover:bg-slate-100"
                          onClick={handleSetupPayMongoRecurring}
                          disabled={isStartingPayMongoSetup}
                        >
                          {isStartingPayMongoSetup ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Star className="w-4 h-4 mr-2" />}
                          Open PayMongo Checkout
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        </>
        )}

        {/* POS Setup Tab */}
        <TabsContent value="pos" id="tab-pos" className="space-y-6">
          <Card id="receipt-contract-settings">
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <Building2 className="w-5 h-5 text-teal-600" />
                Receipt & POS Metadata
              </CardTitle>
              <CardDescription>
                Configure receipt identity changes for platform-admin review, plus cashier closeout defaults, terminal policy, and checkout presets.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <p className="font-semibold">Receipt metadata edits require platform admin approval.</p>
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Software name, software version, and software serial number are managed by platform admin for the DGFY POS and are not shown on this admin settings form.
                </p>
                {settings.posReceiptMetadataPendingReview ? (
                  <div className="mt-2 space-y-2">
                    <p className="text-xs font-semibold text-amber-800">
                      Pending review submitted {settings.posReceiptMetadataPendingReview.requested_at
                        ? new Date(settings.posReceiptMetadataPendingReview.requested_at).toLocaleString()
                        : 'recently'}.
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {Object.entries(settings.posReceiptMetadataPendingReview.changes || {}).map(([key, value]) => (
                        <div key={key} className="rounded-md border border-amber-200 bg-white/70 px-2 py-1.5 text-xs">
                          <div className="font-semibold text-amber-900">{SETTINGS_FIELD_LABELS[key] || key}</div>
                          <div className="mt-0.5 break-words text-amber-800">
                            {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : (String(value ?? '').trim() || '-')}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Registered Name</Label>
                  <Input
                    value={settings.posRegisteredName}
                    onChange={(e) => handleChange('posRegisteredName', e.target.value)}
                    placeholder="BIR registered name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Business Name</Label>
                  <Input
                    value={settings.posBusinessName}
                    onChange={(e) => handleChange('posBusinessName', e.target.value)}
                    placeholder="Registered business name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Business Style</Label>
                  <Input
                    value={settings.posBusinessStyle}
                    onChange={(e) => handleChange('posBusinessStyle', e.target.value)}
                    placeholder="Trade name or business style"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Taxpayer Type</Label>
                  <Input
                    value={settings.posTaxpayerType}
                    onChange={(e) => handleChange('posTaxpayerType', e.target.value)}
                    placeholder="VAT or non-VAT"
                  />
                </div>
                <div className="space-y-2">
                  <Label>TIN / Branch</Label>
                  <Input
                    value={settings.posTinBranch}
                    onChange={(e) => handleChange('posTinBranch', e.target.value)}
                    placeholder="e.g. 123-456-789-000"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>Business Address</Label>
                  <Input
                    value={settings.posAddress}
                    onChange={(e) => handleChange('posAddress', e.target.value)}
                    placeholder="Complete branch/business address"
                  />
                </div>
                <div className="space-y-2">
                  <Label>PTU Number</Label>
                  <Input
                    value={settings.posPtuNumber}
                    onChange={(e) => handleChange('posPtuNumber', e.target.value)}
                    placeholder="Permit to Use reference"
                  />
                </div>
                <div className="space-y-2">
                  <Label>MIN Number</Label>
                  <Input
                    value={settings.posMinNumber}
                    onChange={(e) => handleChange('posMinNumber', e.target.value)}
                    placeholder="Machine Identification Number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Accreditation Number</Label>
                  <Input
                    value={settings.posAccreditationNumber}
                    onChange={(e) => handleChange('posAccreditationNumber', e.target.value)}
                    placeholder="BIR accreditation reference"
                  />
                </div>
                <div className="md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <label className="flex items-center justify-between gap-3 text-sm font-medium text-slate-700">
                    <span>Require buyer fiscal details on fiscal invoices</span>
                    <input
                      type="checkbox"
                      checked={settings.posFiscalBuyerDetailsRequired === true}
                      onChange={(e) => handleChange('posFiscalBuyerDetailsRequired', e.target.checked)}
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <Label>Receipt Footer Message</Label>
                  <Input
                    value={settings.posReceiptFooterMessage}
                    onChange={(e) => handleChange('posReceiptFooterMessage', e.target.value)}
                    placeholder="Optional receipt footer"
                  />
                </div>
                <div className="md:col-span-2 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Cashier closeout defaults</h3>
                  <p className="text-xs text-slate-500">Used by shifts and daily reconciliation without changing receipt identity.</p>
                </div>
                <div className="space-y-2">
                  <Label>Petty Cash Currency Symbol</Label>
                  <Input
                    value={settings.posPettyCashSymbol}
                    onChange={(e) => handleChange('posPettyCashSymbol', e.target.value)}
                    placeholder="e.g. PHP"
                    maxLength={12}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Petty Cash Amount</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={settings.posPettyCashAmount}
                    onChange={(e) => handleChange('posPettyCashAmount', e.target.value)}
                    placeholder="0.00"
                  />
                  <p className="text-xs text-slate-500">
                    Used for cashier reconciliation and daily closeout context. Not counted as sales.
                  </p>
                </div>
                <div className="md:col-span-2 border-t border-slate-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-900">Terminal and checkout controls</h3>
                  <p className="text-xs text-slate-500">Set terminal identity rules, non-editable fee policy context, and cashier discount presets.</p>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>Terminal Registry</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addTerminalRegistryEntry}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Terminal
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Managed list of terminal identities used in POS unlock and shift-open flows.
                  </p>
                  <p className="text-xs text-slate-500">
                    Assign each active terminal to a store location. When strict binding is enabled, active terminals without a location are auto-assigned to the primary location during save.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <div className="md:col-span-5 space-y-1">
                      <Label className="text-xs text-slate-500">Terminal Registry Mode</Label>
                      <select
                        value={settings.posTerminalRegistryMode || 'warn'}
                        onChange={(event) => handleChange('posTerminalRegistryMode', event.target.value)}
                        className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                      >
                        <option value="warn">Warn (allow manual IDs)</option>
                        <option value="enforce">Enforce (registry only)</option>
                      </select>
                    </div>
                    <div className="md:col-span-7 text-xs text-slate-600">
                      {(settings.posTerminalRegistryMode || 'warn') === 'enforce'
                        ? 'Enforce mode blocks unlock/open-shift/checkout when terminal_id is not an active registry entry.'
                        : 'Warn mode allows manual/fallback terminal IDs but surfaces policy warnings.'}
                    </div>
                    <div className="md:col-span-12">
                      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-700">Strict Shift Location Binding</p>
                          <p className="text-xs text-slate-500">
                            When enabled, shift open/checkout/switch strictly require location-bound terminal policy readiness.
                          </p>
                        </div>
                        <Switch
                          checked={settings.posTerminalLocationBindingEnforced === true}
                          onCheckedChange={(checked) => handleChange('posTerminalLocationBindingEnforced', checked)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {(Array.isArray(settings.posTerminalRegistry) ? settings.posTerminalRegistry : []).map((terminal, index) => (
                      <div
                        key={`terminal-registry-${index}`}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3"
                      >
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs text-slate-500">Terminal ID</Label>
                          <Input
                            value={terminal.terminal_id || ''}
                            onChange={(e) => handleTerminalRegistryChange(index, 'terminal_id', e.target.value)}
                            placeholder="COUNTER-01"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs text-slate-500">Label</Label>
                          <Input
                            value={terminal.label || ''}
                            onChange={(e) => handleTerminalRegistryChange(index, 'label', e.target.value)}
                            placeholder="Front Counter"
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs text-slate-500">Location</Label>
                          <select
                            aria-label={`Terminal location ${terminal.terminal_id || index + 1}`}
                            value={terminal.location_id || ''}
                            onChange={(event) => handleTerminalRegistryChange(index, 'location_id', event.target.value)}
                            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                          >
                            <option value="">Unassigned</option>
                            {terminalLocationOptions.map((location) => (
                              <option key={`terminal-location-${location.location_id}`} value={location.location_id}>
                                {location.name}{location.is_primary_storefront === true ? ' (Primary)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-xs text-slate-500">Device Pairing</Label>
                          <div className="min-h-10 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            {terminal.pairing_version ? 'Registry ready. Pair the physical device from POS onboarding.' : 'Save this terminal, then pair the physical device as master admin.'}
                          </div>
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <Label className="text-xs text-slate-500">Active</Label>
                          <div className="h-10 flex items-center px-2 border border-slate-200 rounded-lg">
                            <Switch
                              checked={terminal.is_active !== false}
                              onCheckedChange={(checked) => handleTerminalRegistryChange(index, 'is_active', checked)}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1 space-y-1">
                          <Label className="text-xs text-slate-500">Default</Label>
                          <div className="h-10 flex items-center px-2 border border-slate-200 rounded-lg">
                            <Switch
                              checked={terminal.is_default === true}
                              disabled={terminal.is_active === false}
                              onCheckedChange={(checked) => handleTerminalRegistryChange(index, 'is_default', checked)}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeTerminalRegistryEntry(index)}
                            aria-label={`Remove terminal ${terminal.terminal_id || index + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(Array.isArray(settings.posTerminalRegistry) ? settings.posTerminalRegistry : []).length === 0 && (
                      <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-3">
                        {(settings.posTerminalRegistryMode || 'warn') === 'enforce'
                          ? 'No terminals configured yet. Add at least one active terminal before enabling enforce mode.'
                          : 'No terminals configured yet. In warn mode, terminal users can still enter an ID manually.'}
                      </p>
                    )}
                  </div>
                </div>
                <div className="space-y-3 md:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Label>DGFY Convenience Fee Policy</Label>
                  <p className="text-xs text-slate-500">
                    Checkout fee editing is retired. POS and storefront now apply a mandatory non-overridable 1% DGFY convenience fee on gross item subtotal.
                  </p>
                </div>
                <div className="space-y-3 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <Label>POS Discount Presets (Percentage)</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addDiscountProfile}>
                      <Plus className="w-4 h-4 mr-1" />
                      Add Discount
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Example: Employee Discount at 20%. Cashiers can select these at checkout.
                  </p>
                  <div className="space-y-2">
                    {(Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : []).map((profile, index) => (
                      <div
                        key={`discount-profile-${index}`}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-slate-200 rounded-lg p-3"
                      >
                        <div className="md:col-span-6 space-y-1">
                          <Label className="text-xs text-slate-500">Discount Name</Label>
                          <Input
                            value={profile.name}
                            onChange={(e) => handleDiscountProfileChange(index, 'name', e.target.value)}
                            placeholder="e.g. Employee Discount"
                          />
                        </div>
                        <div className="md:col-span-3 space-y-1">
                          <Label className="text-xs text-slate-500">Percent</Label>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={profile.percentage}
                            onChange={(e) => handleDiscountProfileChange(index, 'percentage', e.target.value)}
                          />
                        </div>
                        <div className="md:col-span-2 space-y-1">
                          <Label className="text-xs text-slate-500">Active</Label>
                          <div className="h-10 flex items-center px-2 border border-slate-200 rounded-lg">
                            <Switch
                              checked={profile.active !== false}
                              onCheckedChange={(checked) => handleDiscountProfileChange(index, 'active', checked)}
                            />
                          </div>
                        </div>
                        <div className="md:col-span-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => removeDiscountProfile(index)}
                            aria-label={`Remove discount profile ${index + 1}`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                    {(Array.isArray(settings.posDiscountProfiles) ? settings.posDiscountProfiles : []).length === 0 && (
                      <p className="text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg p-3">
                        No discount presets configured yet.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

        </TabsContent>

        <TabsContent value="compliance" id="tab-compliance" className="space-y-6">
          <ComplianceProgramPanel isMasterAdmin={currentUser?.is_master_admin === true} />
        </TabsContent>

        {/* System Tab */}
        <TabsContent value="system" id="tab-system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className={SETTINGS_CARD_TITLE_CLASS}>
                <SettingsIcon className="w-5 h-5 text-teal-600" />
                Stock Thresholds
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Auto-calculate Thresholds</Label>
                  <p className="text-xs text-slate-500">Automatically set min/max levels</p>
                </div>
                <Switch checked={settings.autoCalculateThresholds} onCheckedChange={(v) => handleChange('autoCalculateThresholds', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label>Low Stock Alerts</Label>
                  <p className="text-xs text-slate-500">Get notified when items fall below threshold</p>
                </div>
                <Switch
                  checked={settings.lowStockAlertEnabled}
                  onCheckedChange={(v) => handleChange('lowStockAlertEnabled', v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Surplus & Expiry Alerts</Label>
                  <p className="text-xs text-slate-500">Warnings for overstock and expiring items</p>
                </div>
                <Switch
                  checked={settings.surplusAlertEnabled}
                  onCheckedChange={(v) => handleChange('surplusAlertEnabled', v)}
                />
              </div>

              <Separator />

              <div className="space-y-4">
                <h3 className="text-sm font-medium text-slate-900">Inventory Thresholds</h3>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label>Minimum Stock Level ({settings.defaultMinThreshold}%)</Label>
                    <span className="text-xs text-slate-500">Triggers reorder suggestions</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Slider
                      value={[settings.defaultMinThreshold]}
                      min={5}
                      max={90}
                      step={5}
                      onValueChange={([v]) => handleChange('defaultMinThreshold', v)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={settings.defaultMinThreshold}
                      onChange={(e) => handleChange('defaultMinThreshold', parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <Label>Purchase Allowance ({settings.defaultPurchaseAllowance}%)</Label>
                    <span className="text-xs text-slate-500">Extra stock to order above min</span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <Slider
                      value={[settings.defaultPurchaseAllowance]}
                      min={0}
                      max={100}
                      step={5}
                      onValueChange={([v]) => handleChange('defaultPurchaseAllowance', v)}
                      className="flex-1"
                    />
                    <Input
                      type="number"
                      value={settings.defaultPurchaseAllowance}
                      onChange={(e) => handleChange('defaultPurchaseAllowance', parseInt(e.target.value) || 0)}
                      className="w-16 h-8 text-center"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="grid md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label>Procurement Reminder (Hours)</Label>
                  <p className="text-xs text-slate-500 mb-2">How often to check for reorders</p>
                  <Input
                    type="number"
                    value={settings.procurementReminderDay}
                    onChange={(e) => handleChange('procurementReminderDay', parseInt(e.target.value) || 24)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Supplier Quality Standard ({settings.qualityThreshold})</Label>
                  <p className="text-xs text-slate-500 mb-2">Minimum rating for auto-approval</p>
                  <div className="pt-2">
                    <Slider
                      value={[settings.qualityThreshold]}
                      min={1}
                      max={5}
                      step={0.1}
                      onValueChange={([v]) => handleChange('qualityThreshold', v)}
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden">
        {currentTab !== 'compliance' ? (
          <div className="mx-auto flex max-w-4xl gap-2 pr-14">
            <Button type="button" variant="outline" onClick={handleReset} className="flex-1">
              <RefreshCw className="w-4 h-4 mr-2" />
              Revert
            </Button>
            <Button type="button" onClick={handleSave} className="flex-[1.35] bg-teal-600 hover:bg-teal-700">
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 pr-14 text-xs text-emerald-800">
            Compliance sections save independently.
          </div>
        )}
      </div>

      <Dialog open={Boolean(deleteLocationCandidate)} onOpenChange={(open) => {
        if (!open) {
          closeDeleteLocationDialog();
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Delete Location Pin</DialogTitle>
            <DialogDescription>
              Permanently delete {deleteLocationCandidate?.name || 'this location'} only when it has no inventory,
              POS, booking, service, or user-location history. Locations with history should be deactivated so
              reports and operational records stay intact.
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pb-2 space-y-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Delete removes the map/storefront pin row. It does not archive past records. If this location has ever
              been used operationally, the backend will block deletion and return the blocking reference counts.
            </div>
            {deleteLocationErrors.length > 0 && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm font-medium text-red-800">Delete is blocked by existing references:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-red-700">
                  {deleteLocationErrors.map((error) => (
                    <li key={error}>{error}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={closeDeleteLocationDialog} disabled={locationSaving}>
              Cancel
            </Button>
            {deleteLocationCandidate?.is_active === true && (
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDeactivateLocation(deleteLocationCandidate.location_id, { skipConfirm: true })}
                disabled={locationSaving}
              >
                Deactivate Instead
              </Button>
            )}
            <Button
              type="button"
              onClick={handleConfirmDeleteLocation}
              disabled={locationSaving}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(confirmationAction)}
        onOpenChange={(open) => { if (!open) setConfirmationAction(null); }}
        title={confirmationAction?.type === 'cancel-subscription'
          ? 'Cancel Premium Subscription'
          : (confirmationAction?.type === 'reactivate-location' ? 'Reactivate Location' : 'Deactivate Location')}
        description={confirmationAction?.type === 'cancel-subscription'
          ? 'Your Premium subscription will stop renewing. You will retain access until the end of the current billing period.'
          : (confirmationAction?.type === 'reactivate-location'
            ? 'This location will become available again for storefront and operational use.'
            : 'This location will be removed from active operational and storefront choices. Historical records will be preserved.')}
        confirmLabel={confirmationAction?.type === 'cancel-subscription'
          ? 'Cancel Subscription'
          : (confirmationAction?.type === 'reactivate-location' ? 'Reactivate' : 'Deactivate')}
        variant={confirmationAction?.type === 'reactivate-location' ? 'default' : 'destructive'}
        onConfirm={() => {
          if (confirmationAction?.type === 'cancel-subscription') {
            return handleCancelSubscription({ skipConfirm: true });
          }
          if (confirmationAction?.type === 'reactivate-location') {
            return handleReactivateLocation(confirmationAction.locationId, { skipConfirm: true });
          }
          return handleDeactivateLocation(confirmationAction?.locationId, { skipConfirm: true });
        }}
      />

      {/* User Management Modal */}
      {showUserManagement && (
        <UserManagementModal
          open={showUserManagement}
          onOpenChange={setShowUserManagement}
        />
      )}
    </div>
  );
}
