import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';
import { createPortal } from 'react-dom';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core';
import {
  AlertCircle,
  AlertTriangle,
  Award,
  Banknote,
  BarChart3,
  BookOpen,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Clock,
  Compass,
  Copy,
  Barcode,
  FileText,
  Ghost,
  GripVertical,
  History,
  ImagePlus,
  Info,
  KeyRound,
  Mail,
  MapPin,
  MessageSquare,
  Monitor,
  Pencil,
  MapPinned,
  Package,
  Percent,
  Phone,
  Plus,
  Receipt,
  RefreshCcw,
  Save,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Star,
  Store,
  UserRound,
  Users,
  Tags,
  Ticket,
  Trash2,
  TrendingUp,
  Truck,
  Upload,
  UtensilsCrossed,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import StorefrontItemQrCard from '@/components/items/StorefrontItemQrCard.jsx';
import CSVImportModal from '@/components/items/CSVImportModal.jsx';
import { resolveStorefrontItemUrl, resolveStorefrontTenantUrl } from '@/src/features/dgfyRouteHelpers.js';
import { isShiftOwnedByUserId, resolvePosUserId } from '../utils/shiftOwnership.js';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useCreateItem, useDeleteItem, useUpdateItem } from '@/hooks/useItems.js';
import {
  attachItemBarcode,
  createFolder,
  deleteFolder,
  generateItemBarcode,
  getFolders,
  getItems,
  listItemFolders,
  lookupExternalProduct,
  replaceItemFolders,
  reorderFolders,
  updateItemBarcode,
  updateFolder
} from '@/services/itemService.js';
import { updatePosCatalogOverride } from '@/services/posCatalogService.js';
import {
  getGtinValidationMessage,
  normalizeBarcodeEntry,
  resolveProductBarcodeInput
} from '@/src/utils/barcodePolicy.js';
import ProductQrScannerModal from '@/src/features/inventory/components/ProductQrScannerModal.jsx';
import {
  notifyPosCatalogUpdated,
  subscribeToPosCatalogUpdates,
  subscribeToRemotePosCatalogUpdates
} from '../utils/posCatalogRefresh.js';
import { persistPosItemBarcode } from '../utils/posItemBarcodePersistence.js';
import { useItemImageGenerationPoll } from '../hooks/useItemImageGenerationPoll.js';
import {
  bindPendingPosItemImagePreviewJob,
  markPendingPosItemImagePreviewFailed,
  stagePendingPosItemImagePreview
} from '../services/posPendingItemImagePreviewStore.js';
import {
  updateStorefrontCatalogOverride,
  importExternalStorefrontCatalogImage,
  queueStorefrontCatalogImage,
  queueStorefrontCatalogImages,
  updateStorefrontCatalogGallery,
  deleteStorefrontCatalogImage,
  generateStorefrontCatalogImage
} from '@/services/storefrontCatalogService.js';
import SelectedItemImageCarousel from '@/components/items/SelectedItemImageCarousel';
import {
  deleteStorefrontAsset,
  generateStorefrontSlug,
  getCompanyInfo,
  getAllSettings,
  updateSettingByKey,
  updateSettings,
  uploadStorefrontAsset
} from '@/services/settingsService.js';
import { getAllUsers, updatePosApprovalPin, updatePosDayClosePin, updateProfile, updateUserPermissions } from '@/services/userService.js';
import * as tenantLocationService from '@/services/tenantLocationService.js';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveEditItemSaveError } from '../utils/editItemSaveErrors.js';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from '@/src/features/pos/utils/terminalIdentity.js';
import { resolveModeItemTaxonomy } from '@/src/features/settings/modeItemTaxonomy.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';
import StorefrontBusinessHoursScheduler from '@/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { normalizeStorefrontBusinessHours, serializeStorefrontBusinessHours } from '@/src/features/settings/storefrontBusinessHours.js';
import { evaluateFulfillmentLeadTime } from '@/src/features/settings/fulfillmentLeadTime.js';
import resolveAssetUrl, { advanceAssetImageFallback } from '@/src/utils/assetUrl.js';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import { resolvePosCatalogImageSources, resolvePosCatalogPreviewGallery } from '../utils/posCheckoutTerminalUtils.js';
import PosItemImageViewer from './PosItemImageViewer.jsx';
import UserInvitationModal from '@/components/users/UserInvitationModal.jsx';
import PdfMenuImportModal from '@/components/items/PdfMenuImportModal.jsx';
import MenuImportBatchModal from '@/components/items/MenuImportBatchModal.jsx';
import { isPdfMenuImportEnabled } from '@/hooks/usePdfMenuImport.js';
import { isMenuImportBatchEnabled } from '@/services/menuImportService.js';
import { IncomingQueueWorkspace, WorkspaceShell } from './TerminalOperationsPanels.jsx';
import PosServicesOperationsWorkspace from './PosServicesOperationsWorkspace.jsx';
import PosFnbModifiersWorkspace from './PosFnbModifiersWorkspace.jsx';
import {
  fetchPosSetupCashiers,
  fetchPosCatalog,
  fetchPosCatalogPage,
  fetchPosTransactions,
  fetchTerminalTodayDashboard,
  fetchMerchantTenderReconciliation,
  reviewMerchantTenderReconciliation
} from '../services/posService.js';
import PosReportsAnalyticsWorkspace from './PosReportsAnalyticsWorkspace.jsx';
import CashierHistoryPanel from './CashierHistoryPanel.jsx';
import EmployeeCreditManagementPanel from './EmployeeCreditManagementPanel.jsx';
import EmployeeManagementPanel from './EmployeeManagementPanel.jsx';
import DeliveryPersonnelManagementPanel from './DeliveryPersonnelManagementPanel.jsx';
import AffiliatesWorkspacePanel from './AffiliatesWorkspacePanel.jsx';
import VoucherManagementPanel from './VoucherManagementPanel.jsx';
import PricelistManagementPanel from './PricelistManagementPanel.jsx';
import DownpaymentSettingsPanel from './DownpaymentSettingsPanel.jsx';
import PosDeliveryPricingSettingsCard from './PosDeliveryPricingSettingsCard.jsx';
import PosCashierAttendanceSettingsCard from './PosCashierAttendanceSettingsCard.jsx';
import PosServiceOptionsWorkspace from './PosServiceOptionsWorkspace.jsx';
import PosServiceCatalogCreateModal from './PosServiceCatalogCreateModal.jsx';
import PosServiceCatalogEditModal from './PosServiceCatalogEditModal.jsx';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE } from '@sieitzz/shared-constants/orderMethods';

const MapPinPicker = lazyWithChunkRetry(() => import('@/src/components/maps/MapPinPicker.jsx'));
const POS_ITEMS_PAGE_SIZE = 15;
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';

const MODE_META = {
  incoming_queue: {
    icon: Truck,
    title: 'Incoming Online Queue',
    subtitle: 'Accept, reject, and progress online orders from this focused queue view.'
  },
  location_scope: {
    icon: Settings2,
    title: 'Settings',
    subtitle: 'Manage shared profile, POS setup, and storefront settings inside the POS surface.'
  },
  settings_profile: {
    icon: UserRound,
    title: 'Settings',
    subtitle: 'Manage shared profile, POS setup, and storefront settings inside the POS surface.'
  },
  settings_pos: {
    icon: Settings2,
    title: 'Settings',
    subtitle: 'Manage shared profile, POS setup, and storefront settings inside the POS surface.'
  },
  settings_storefront: {
    icon: Store,
    title: 'Settings',
    subtitle: 'Manage shared profile, POS setup, and storefront settings inside the POS surface.'
  },
  shift_controls: {
    icon: Store,
    title: 'Shift Controls',
    subtitle: 'Open, monitor, and close cashier shifts before transactions proceed.'
  },
  cash_drawer: {
    icon: Banknote,
    title: 'Cash Drawer Event',
    subtitle: 'Record and audit cash in/out events with operator reasons.'
  },
  close_shift: {
    icon: ShieldCheck,
    title: 'Shift Controls',
    subtitle: 'Open, monitor, and close cashier shifts before transactions proceed.'
  },
  reports: {
    icon: BarChart3,
    title: 'Reports & Analytics',
    subtitle: 'Daily totals, sales comparison, POS profit/loss, top items, and transaction performance.'
  },
  settings_affiliates: {
    icon: Percent,
    title: 'Affiliates',
    subtitle: 'Enroll affiliates, set commission rates, generate share codes, and review earnings.'
  },
  // #732: promoted out of the Settings tab strip, top-level nav now, mirroring settings_affiliates.
  settings_vouchers: {
    icon: Ticket,
    title: 'Vouchers',
    subtitle: 'Create and manage vouchers, codes, and redemption rules.'
  },
  settings_pricelists: {
    icon: Tags,
    title: 'Pricelists',
    subtitle: 'Set per-item fixed prices for wholesale/B2B-via-B2C vouchers.'
  },
  items: {
    icon: ClipboardList,
    title: 'Items',
    subtitle: 'Manage POS items and the categories used to organize the catalog.'
  },
  services: {
    icon: CalendarDays,
    title: 'Services',
    subtitle: 'Manage appointments, resources, waitlist, reminders, and client activity.'
  },
  terminal_setup: {
    icon: Settings2,
    title: 'Settings',
    subtitle: 'Manage shared profile, POS setup, and storefront settings inside the POS surface.'
  },
};

const SETTINGS_FIELD_LABELS = {
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

const money = (value) => Number(value || 0).toFixed(2);
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;

const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;

const resolveStoredItemImageUrl = (urlOrPath) => {
  const raw = String(urlOrPath || '').trim();
  if (!raw) return '';
  if (/^(data|blob):/i.test(raw)) return raw;
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/uploads/') || raw.startsWith('/')) {
    return resolveAssetUrl(raw);
  }
  return resolveAssetUrl(`/uploads/${raw.replace(/^\/+/, '')}`);
};

const parseStorefrontItemImageGallery = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeStorefrontItemGallery = (item = {}) => {
  const entries = parseStorefrontItemImageGallery(item?.storefront_image_gallery);
  const primaryUrl = resolveStoredItemImageUrl(item?.storefront_image_url || item?.storefront_image_path || null) || null;
  const gallery = entries
    .map((entry, index) => ({
      path: entry?.path || null,
      url: resolveStoredItemImageUrl(entry?.url || entry?.image_url || entry?.path || entry),
      variants: entry?.variants || entry?.image_variants || null,
      is_primary: index === 0,
      sort_order: index
    }))
    .filter((entry) => entry.url || entry.path);
  if (primaryUrl && !gallery.some((entry) => entry.url === primaryUrl)) {
    gallery.unshift({
      path: item?.storefront_image_path || null,
      url: primaryUrl,
      variants: item?.storefront_image_variants || null,
      is_primary: true,
      sort_order: 0
    });
  }
  return gallery.map((entry, index) => ({
    ...entry,
    is_primary: index === 0,
    sort_order: index
  }));
};
const TERMINAL_REGISTRY_MODE_OPTIONS = ['warn', 'enforce'];
const CUSTOMER_ACCESS_MODE_OPTIONS = [
  { value: 'ghost', label: 'Ghost', description: 'Profile and contact only; catalog, cart, checkout, and booking are hidden.', icon: Ghost, iconClassName: 'bg-indigo-50 text-indigo-500' },
  { value: 'catalog', label: 'Catalog Only', description: 'Customers can browse catalog, prices, and inventory labels only.', icon: BookOpen, iconClassName: 'bg-emerald-50 text-emerald-600' },
  { value: 'inquiry', label: 'Inquiry', description: 'Customers can browse and contact you through existing channels.', icon: MessageSquare, iconClassName: 'bg-amber-50 text-amber-500' },
  { value: 'transaction', label: 'Transaction', description: 'Customers can quote, checkout, and book services online.', icon: ShoppingCart, iconClassName: 'bg-blue-50 text-blue-600' }
];
const CUSTOMER_ACCESS_MODE_RANK = { ghost: 0, catalog: 1, inquiry: 2, transaction: 3 };
const normalizeCustomerAccessMode = (value, fallback = 'catalog') => (
  CUSTOMER_ACCESS_MODE_OPTIONS.some((option) => option.value === String(value || '').trim().toLowerCase())
    ? String(value || '').trim().toLowerCase()
    : fallback
);
const mapCustomerAccessRuntimeSettings = (systemSettings = {}) => ({
  customerAccessMode: normalizeCustomerAccessMode(systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessEffectiveMode: normalizeCustomerAccessMode(systemSettings.effective_customer_access_mode?.value || systemSettings.customer_access_mode?.value || 'catalog'),
  customerAccessMaxMode: normalizeCustomerAccessMode(systemSettings.max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessPlatformMaxMode: normalizeCustomerAccessMode(systemSettings.platform_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessRegistrationStageMaxMode: normalizeCustomerAccessMode(systemSettings.registration_stage_max_customer_access_mode?.value || 'transaction', 'transaction'),
  customerAccessLimitationReason: String(systemSettings.customer_access_limitation_reason?.value || ''),
  customerAccessRegistrationStage: String(systemSettings.customer_access_registration_stage?.value || 'registered').trim().toLowerCase() || 'registered',
  customerAccessFlagStatus: systemSettings.customer_access_modes_enabled?.value === false ? 'rollback' : 'enabled'
});

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

const toPositiveInt = (value) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const sanitizeDiscountProfile = (profile) => ({
  name: String(profile?.name || '').trim(),
  percentage: Number(profile?.percentage ?? 0),
  active: profile?.active !== false
});

const resolveUserPermissionList = (user) => {
  if (Array.isArray(user?.permissions)) return user.permissions;
  if (typeof user?.permissions !== 'string') return [];
  try {
    const parsed = JSON.parse(user.permissions);
    if (Array.isArray(parsed)) return parsed;
    if (!parsed || typeof parsed !== 'object') return [];
    return Object.entries(parsed).flatMap(([entity, actions]) => (
      actions && typeof actions === 'object'
        ? Object.entries(actions)
          .filter(([, allowed]) => allowed === true)
          .map(([action]) => `${entity}:${action}`)
        : []
    ));
  } catch {
    return [];
  }
};

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

const serializeStorefrontReviewSummary = (form = {}) => {
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

const formatFirstValidationError = (error, fallbackMessage) => {
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

const getReadableFieldName = (field) => SETTINGS_FIELD_LABELS[field] || field;

const formatValidationErrorDescription = (apiErrors) => {
  if (!Array.isArray(apiErrors) || apiErrors.length === 0) {
    return '';
  }

  return apiErrors
    .slice(0, 5)
    .map((entry) => `${getReadableFieldName(entry.field)}: ${entry.message}`)
    .join(' | ');
};

const collectValidationErrors = (error, fallbackMessage = 'Validation failed') => {
  const responseErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
      .map((entry) => ({
        field: String(entry?.field || '').trim(),
        message: String(entry?.message || '').trim()
      }))
      .filter((entry) => entry.message)
    : [];

  if (responseErrors.length > 0) {
    return responseErrors;
  }

  const responseMessage = String(error?.response?.data?.message || error?.message || fallbackMessage).trim();
  return responseMessage ? [{ field: '', message: responseMessage }] : [];
};

const formatValidationModalTitle = (contextLabel) => `${contextLabel} Error`;

const RequiredMark = () => <span className="ml-1 text-rose-600">*</span>;

const createDefaultLocationForm = () => ({
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
  // #1246/#1218: buyer-facing scheduling/lead-time settings, surfaced read-write on POS.
  scheduling_enabled: true,
  immediate_fulfillment_enabled: true,
  fulfillment_lead_time_min_days: '',
  fulfillment_lead_time_max_days: ''
});

const isValidOpeningCashAmount = (value) => {
  const rawValue = String(value ?? '').trim();
  const numericValue = Number(rawValue);
  return rawValue !== '' && Number.isFinite(numericValue) && numericValue >= 0;
};

const parseIsoDateTime = (value) => {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
};

const MERCHANT_TENDER_METHODS = [
  { key: 'gcash', label: 'GCash' },
  { key: 'maya', label: 'Maya' },
  { key: 'card', label: 'Card terminal' },
  { key: 'bank_transfer', label: 'Bank transfer' }
];

function MerchantTenderReconciliationPanel({ shiftId, salesSummary = null, disabled = false }) {
  const emptyObserved = { gcash: '', maya: '', card: '', bank_transfer: '' };
  const [state, setState] = useState({ loading: true, saving: false, data: null, error: '' });
  const [observed, setObserved] = useState(emptyObserved);
  const [reviewNote, setReviewNote] = useState('');
  const employeeCredit = (Array.isArray(salesSummary?.payment_breakdown) ? salesSummary.payment_breakdown : [])
    .find((entry) => String(entry?.payment_type || '').trim().toLowerCase() === 'employee_credit') || {};
  const employeeCreditCount = Number(employeeCredit.count || 0);

  const load = useCallback(async () => {
    if (!shiftId) return;
    setState((previous) => ({ ...previous, loading: true, error: '' }));
    try {
      const data = await fetchMerchantTenderReconciliation(shiftId);
      const latestObserved = data?.latest_reconciliation?.observed_breakdown;
      setObserved(Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [
        key,
        latestObserved?.[key] != null
          ? String(Number(latestObserved[key]).toFixed(2))
          : String(Number(data?.expected?.breakdown?.[key]?.amount || 0).toFixed(2))
      ])));
      setReviewNote(data?.latest_reconciliation?.review_note || '');
      setState({ loading: false, saving: false, data, error: '' });
    } catch (error) {
      setState({ loading: false, saving: false, data: null, error: error?.response?.data?.message || 'Unable to load merchant tender totals.' });
    }
  }, [shiftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const variances = Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [
    key,
    Number(observed[key] || 0) - Number(state.data?.expected?.breakdown?.[key]?.amount || 0)
  ]));
  const hasVariance = MERCHANT_TENDER_METHODS.some(({ key }) => Math.abs(variances[key]) > 0.0001);

  const save = async () => {
    if (hasVariance && reviewNote.trim().length < 8) {
      toast.error('Add a manager note of at least 8 characters for the variance.');
      return;
    }
    setState((previous) => ({ ...previous, saving: true, error: '' }));
    try {
      const data = await reviewMerchantTenderReconciliation(shiftId, {
        idempotency_key: `merchant-tender:${shiftId}:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`,
        observed_breakdown: Object.fromEntries(MERCHANT_TENDER_METHODS.map(({ key }) => [key, Number(observed[key] || 0)])),
        review_note: reviewNote.trim() || undefined
      });
      setState({ loading: false, saving: false, data, error: '' });
      toast.success(hasVariance ? 'Tender variance reviewed and recorded.' : 'Merchant tenders reconciled with no variance.');
    } catch (error) {
      setState((previous) => ({ ...previous, saving: false, error: error?.response?.data?.message || 'Unable to save the reconciliation.' }));
    }
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3" data-testid="merchant-tender-reconciliation">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-[12px] font-black text-[#0F172A]">Store-owned tender reconciliation</p>
          <p className="mt-1 text-[11px] leading-4 text-[#475569]">Compare the POS ledger with the store QR, card terminal, and bank account. Employee Credit is shown read-only because it is an internal receivable. This review never calls PayMongo or changes sales.</p>
        </div>
        <Button type="button" variant="outline" className="h-8 bg-white px-3 text-[11px] font-bold" onClick={() => void load()} disabled={state.loading || state.saving || disabled}>
          <RefreshCcw className={`mr-1.5 h-3.5 w-3.5 ${state.loading ? 'animate-spin' : ''}`} /> Refresh
        </Button>
      </div>
      {state.error ? <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-2.5 py-2 text-[11px] text-rose-700">{state.error}</p> : null}
      {state.loading ? <p className="mt-3 text-[11px] text-slate-600">Loading expected tender totals...</p> : (
        <>
          {state.data?.is_stale ? <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] font-semibold text-amber-800">New tender activity exists since the last review. Submit a new review; the old record will remain in the audit trail.</p> : null}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-[11px]">
              <thead><tr className="text-slate-500"><th className="pb-2">Tender</th><th className="pb-2">POS expected</th><th className="pb-2">Observed</th><th className="pb-2 text-right">Variance</th></tr></thead>
              <tbody>
                {MERCHANT_TENDER_METHODS.map(({ key, label }) => (
                  <tr key={key} className="border-t border-blue-100">
                    <td className="py-2 font-bold text-slate-800">{label}</td>
                    <td className="py-2">PHP {money(state.data?.expected?.breakdown?.[key]?.amount)}</td>
                    <td className="py-2"><Input aria-label={`${label} observed total`} type="number" min="0" step="0.01" className="h-8 w-32 bg-white text-[11px]" value={observed[key]} onChange={(event) => setObserved((previous) => ({ ...previous, [key]: event.target.value }))} disabled={state.saving || disabled} /></td>
                    <td className={`py-2 text-right font-bold ${Math.abs(variances[key]) > 0.0001 ? 'text-amber-800' : 'text-emerald-700'}`}>PHP {money(variances[key])}</td>
                  </tr>
                ))}
                <tr className="border-t border-blue-200 bg-white/60" data-testid="employee-credit-reconciliation-row">
                  <td className="py-2 font-bold text-slate-800">
                    Employee Credit <span className="block text-[10px] font-medium text-slate-500">Internal receivable · {employeeCreditCount} transaction{employeeCreditCount === 1 ? '' : 's'}</span>
                  </td>
                  <td className="py-2 font-bold text-[#1A4E8D]">PHP {money(employeeCredit.amount)}</td>
                  <td className="py-2 text-slate-500">Not applicable</td>
                  <td className="py-2 text-right text-slate-500">Not applicable</td>
                </tr>
              </tbody>
            </table>
          </div>
          <Label className="mt-3 block text-[11px] font-bold text-slate-700">Manager review note {hasVariance ? '(required)' : '(optional)'}</Label>
          <Input className="mt-1 h-9 bg-white text-[11px]" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} placeholder="Explain any difference from the POS ledger" disabled={state.saving || disabled} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-600">Latest: {state.data?.latest_reconciliation ? `${String(state.data.latest_reconciliation.status || '').replace(/_/g, ' ')} · ${parseIsoDateTime(state.data.latest_reconciliation.reviewed_at)}` : 'Not reviewed yet'}</p>
            <Button type="button" className="h-9 !bg-[#1A4E8D] px-4 text-[11px] font-extrabold text-white" onClick={() => void save()} disabled={state.saving || disabled || (hasVariance && reviewNote.trim().length < 8)}>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5" /> {state.saving ? 'Recording...' : 'Record Manager Review'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
function ShiftControlsWorkspace({
  shiftState,
  terminalMeta,
  operatorUserId,
  activeTerminalId,
  terminalRegistry = [],
  locationsState,
  operatingLocationId,
  setOperatingLocationId,
  canSwitchPosLocation,
  handleSwitchShiftLocation,
  openShiftForm,
  setOpenShiftForm,
  handleOpenShift,
  shiftActionLoading,
  canOpenShift = false,
  canCloseShift,
  canCloseDay,
  dayCloseReadinessState = { loading: false, readiness: null, errorMessage: '' },
  refreshDayCloseReadiness = async () => null,
  canAdminBypassShiftPrompt = false,
  closeShiftForm,
  setCloseShiftForm,
  handleCloseShift,
  handleCloseDay = () => {},
  handleViewShiftSummary = () => {},
  cashierHistoryState = { loading: false, records: [], pagination: null, errorMessage: '' },
  refreshCashierHistory = async () => {},
  handleViewCashierHistoryShift = () => {},
  locked,
  refreshOperationalContext,
  canAdjustCashDrawer,
  cashEventForm,
  setCashEventForm,
  handleRecordCashEvent,
  adminLocationMonitorState = { loading: false, orders: [], terminalShifts: [], errorMessage: '' },
  adminTerminalSwitching = false,
  onSelectAdminTerminal = async () => false,
  refreshAdminLocationMonitor = async () => {},
  canRecoverStaleShifts = false,
  handleForceCloseStaleShift = async () => false,
  isOnline = true,
  sectionId,
  initialTab = 'shift_location'
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const [switchReason, setSwitchReason] = useState('');
  const [requestedAdminTerminalId, setRequestedAdminTerminalId] = useState('');
  const [pendingAdminTerminalId, setPendingAdminTerminalId] = useState('');
  const [staleRecoveryShift, setStaleRecoveryShift] = useState(null);
  const [staleRecoveryForm, setStaleRecoveryForm] = useState({
    closingCashAmount: '',
    reason: ''
  });
  const [activeTab, setActiveTab] = useState(initialTab);
  const [renderedTab, setRenderedTab] = useState(initialTab);
  const [paneInlineStyle, setPaneInlineStyle] = useState({
    transform: 'translateX(0)',
    opacity: 1,
    transition: 'transform 150ms ease, opacity 150ms ease'
  });
  const animationTimersRef = useRef([]);
  const previousInitialTabRef = useRef(initialTab);
  const shiftLocationId = Number(shiftState?.shift?.location_id || 0) || null;
  const activeShift = shiftState?.shift || null;
  const canSubmitOpenShift = isValidOpeningCashAmount(openShiftForm.openingFloatAmount);
  const shiftLocationLabel = activeShift?.location?.name || activeShift?.location_name || activeShift?.location_id || 'Unassigned';
  const shiftCashierLabel = activeShift?.cashier?.username
    || activeShift?.cashier?.email
    || (activeShift?.cashier_id ? `Cashier #${activeShift.cashier_id}` : 'Current cashier');
  const canRenderAdminShiftOpen = canOpenShift;
  const activeTerminals = useMemo(
    () => (Array.isArray(terminalRegistry) ? terminalRegistry : [])
      .filter((entry) => entry?.is_active !== false),
    [terminalRegistry]
  );
  const locationTerminals = useMemo(
    () => activeTerminals.filter(
      (entry) => Number(entry?.location_id || 0) === Number(operatingLocationId || 0)
    ),
    [activeTerminals, operatingLocationId]
  );
  const openTerminalShiftById = useMemo(() => {
    const shifts = Array.isArray(adminLocationMonitorState?.terminalShifts)
      ? adminLocationMonitorState.terminalShifts
      : [];
    return new Map(shifts.map((shift) => [String(shift?.terminal_id || '').trim(), shift]));
  }, [adminLocationMonitorState]);
  const currentTerminalId = String(activeTerminalId || '').trim();
  const currentTerminalMatches = locationTerminals.some(
    (entry) => String(entry?.terminal_id || '').trim() === currentTerminalId
  );
  const requestedTerminalMatches = locationTerminals.some(
    (entry) => String(entry?.terminal_id || '').trim() === requestedAdminTerminalId
  );
  const selectedAdminTerminalId = requestedTerminalMatches
    ? requestedAdminTerminalId
    : (currentTerminalMatches ? currentTerminalId : '');
  const activeTerminalRegistryEntry = activeTerminals.find(
    (entry) => String(entry?.terminal_id || '').trim() === String(activeTerminalId || '').trim()
  );
  const activeTerminalMatchesOperatingLocation = !canAdminBypassShiftPrompt || Boolean(
    activeTerminalRegistryEntry
    && Number(activeTerminalRegistryEntry?.location_id || 0) === Number(operatingLocationId || 0)
  );
  const selectedTerminalShift = openTerminalShiftById.get(String(selectedAdminTerminalId || '').trim()) || null;
  const selectedTerminalShiftOwnedByCurrentUser = isShiftOwnedByUserId(
    selectedTerminalShift,
    operatorUserId
  );
  const branchMonitorOrders = Array.isArray(adminLocationMonitorState?.orders)
    ? adminLocationMonitorState.orders
    : [];
  const branchTerminalShifts = Array.isArray(adminLocationMonitorState?.terminalShifts)
    ? adminLocationMonitorState.terminalShifts
    : [];
  const SHIFT_TABS = [
    { id: 'shift_location', label: 'Shift Location', icon: MapPinned },
    { id: 'close_shift', label: 'Close Shift', icon: ShieldCheck },
    { id: 'cash_drawer', label: 'Cash Drawer', icon: Banknote },
    { id: 'cashier_history', label: 'Cashier History', icon: History }
  ];
  const resolveTabIndex = (tabId) => {
    const index = SHIFT_TABS.findIndex((tab) => tab.id === tabId);
    return index >= 0 ? index : 0;
  };

  const clearAnimationTimers = useCallback(() => {
    animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    animationTimersRef.current = [];
  }, []);

  useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);

  useEffect(() => {
    if (!initialTab) return;
    if (previousInitialTabRef.current === initialTab) return;
    previousInitialTabRef.current = initialTab;
    clearAnimationTimers();
    const resetTimerId = window.setTimeout(() => {
      setActiveTab(initialTab);
      setRenderedTab(initialTab);
      setPaneInlineStyle({
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'transform 150ms ease, opacity 150ms ease'
      });
    }, 0);
    animationTimersRef.current.push(resetTimerId);
  }, [clearAnimationTimers, initialTab]);

  const handleTabChange = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) return;
    clearAnimationTimers();

    const movingForward = resolveTabIndex(nextTab) > resolveTabIndex(activeTab);
    const exitOffset = movingForward ? -28 : 28;
    const enterOffset = movingForward ? 28 : -28;

    setActiveTab(nextTab);
    setPaneInlineStyle({
      transform: `translateX(${exitOffset}px)`,
      opacity: 0,
      transition: 'transform 150ms ease, opacity 150ms ease'
    });

    const swapTimer = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setPaneInlineStyle({
        transform: `translateX(${enterOffset}px)`,
        opacity: 0,
        transition: 'none'
      });

      const enterTimer = window.setTimeout(() => {
        setPaneInlineStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: 'transform 150ms ease, opacity 150ms ease'
        });
      }, 16);

      animationTimersRef.current.push(enterTimer);
    }, 150);

    animationTimersRef.current.push(swapTimer);
  }, [activeTab, clearAnimationTimers]);

  const summaryRows = activeShift ? [
    {
      icon: ClipboardList,
      label: 'Shift ID:',
      value: `#${activeShift.pos_terminal_shift_id}`,
      valueClassName: 'text-[18px] font-black text-[#2563EB]'
    },
    {
      icon: UserRound,
      label: 'Opened By:',
      value: shiftCashierLabel,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: CalendarDays,
      label: 'Business Date:',
      value: activeShift.business_date || '-',
      valueClassName: 'text-[18px] font-black text-[#2563EB]'
    },
    {
      icon: AlertCircle,
      label: 'Opened At:',
      value: parseIsoDateTime(activeShift.opened_at),
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: CircleDollarSign,
      label: 'Opening/Petty Cash:',
      value: `${terminalMeta.pettyCashSymbol} ${money(activeShift.opening_float_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: Receipt,
      label: 'Total Sales (excluding opening cash):',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.salesSummary?.total_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-[#1A4E8D]'
    },
    {
      icon: Banknote,
      label: 'Expected Cash in Drawer:',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.expected_cash_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-emerald-700'
    },
    {
      icon: Banknote,
      label: 'Cash Sales:',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.cash_sales_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-emerald-700'
    },
    {
      icon: MapPinned,
      label: 'Shift location:',
      value: shiftLocationLabel,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    }
  ] : [];

  const openStaleRecoveryDialog = (shift) => {
    setStaleRecoveryShift(shift);
    setStaleRecoveryForm({
      closingCashAmount: '',
      reason: ''
    });
  };

  const closeStaleRecoveryDialog = () => {
    if (shiftActionLoading?.staleRecovery) return;
    setStaleRecoveryShift(null);
    setStaleRecoveryForm({
      closingCashAmount: '',
      reason: ''
    });
  };

  const submitStaleShiftRecovery = async (event) => {
    event.preventDefault();
    const completed = await handleForceCloseStaleShift?.({
      shiftId: staleRecoveryShift?.pos_terminal_shift_id,
      closingCashAmount: staleRecoveryForm.closingCashAmount,
      reason: staleRecoveryForm.reason
    });
    if (completed) {
      setStaleRecoveryShift(null);
      setStaleRecoveryForm({
        closingCashAmount: '',
        reason: ''
      });
    }
  };

  const renderAdminBranchContext = () => {
    if (!canAdminBypassShiftPrompt) return null;

    return (
      <>
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
          <Label htmlFor="admin-operating-location" className="block text-[12px] font-black text-[#0F172A]">
            Operating Location
          </Label>
          <select
            id="admin-operating-location"
            className="mt-2 h-11 w-full rounded-lg border border-blue-300 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
            value={operatingLocationId || ''}
            onChange={(event) => {
              const nextValue = event.target.value ? Number(event.target.value) : null;
              setRequestedAdminTerminalId('');
              setPendingAdminTerminalId('');
              setOperatingLocationId(nextValue);
            }}
          >
            {locations.map((location) => (
              <option key={`admin-operating-location-${location.location_id}`} value={location.location_id}>
                {location.name}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] leading-4 text-[#475569]">
            Admin navigation can use this location without a shift for read-only monitoring. Select an available terminal below before opening a shift or transacting.
          </p>

          <div className="mt-4 border-t border-blue-100 pt-3">
            <Label htmlFor="admin-operating-terminal" className="block text-[12px] font-black text-[#0F172A]">
              Branch Terminal
            </Label>
            <select
              id="admin-operating-terminal"
              className="mt-2 h-11 w-full rounded-lg border border-blue-300 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={selectedAdminTerminalId}
              onChange={(event) => setRequestedAdminTerminalId(event.target.value)}
              disabled={adminTerminalSwitching || !isOnline || locationTerminals.length === 0}
            >
              <option value="">Select an available terminal</option>
              {locationTerminals.map((entry) => {
                const terminalId = String(entry?.terminal_id || '').trim();
                const occupiedShift = openTerminalShiftById.get(terminalId);
                const ownedByCurrentUser = isShiftOwnedByUserId(occupiedShift, operatorUserId);
                const cashier = occupiedShift?.cashier?.username
                  || occupiedShift?.cashier?.email
                  || (occupiedShift?.cashier_id ? `Cashier #${occupiedShift.cashier_id}` : 'cashier');
                const occupancyLabel = occupiedShift
                  ? (
                    ownedByCurrentUser
                      ? `Your active shift since ${parseIsoDateTime(occupiedShift.opened_at)}`
                      : `In use by ${cashier} since ${parseIsoDateTime(occupiedShift.opened_at)}`
                  )
                  : 'Available';
                return (
                  <option
                    key={`admin-terminal-${terminalId}`}
                    value={terminalId}
                    disabled={Boolean(occupiedShift) && !ownedByCurrentUser}
                  >
                    {entry?.label ? `${entry.label} (${terminalId})` : terminalId} - {occupancyLabel}
                  </option>
                );
              })}
            </select>
            {locationTerminals.length === 0 ? (
              <p className="mt-2 text-[11px] text-amber-700">
                No active terminal is assigned to this branch. Configure one in POS Setup.
              </p>
            ) : null}
            {!activeTerminalMatchesOperatingLocation ? (
              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
                The current terminal belongs to another branch. Confirm a terminal for this branch before opening a shift.
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-emerald-700">
                Current terminal: {String(activeTerminalId || '').trim() || 'Not selected'}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="mt-3 h-10 rounded-lg border-blue-300 bg-white px-4 text-[13px] font-extrabold text-[#1A4E8D] hover:bg-blue-50"
              disabled={
                adminTerminalSwitching
                || !isOnline
                || !selectedAdminTerminalId
                || (Boolean(selectedTerminalShift) && !selectedTerminalShiftOwnedByCurrentUser)
                || (
                  activeTerminalMatchesOperatingLocation
                  && String(selectedAdminTerminalId) === String(activeTerminalId || '').trim()
                )
              }
              onClick={() => setPendingAdminTerminalId(selectedAdminTerminalId)}
            >
              <Monitor className="mr-2 h-4 w-4" />
              {adminTerminalSwitching ? 'Selecting Terminal...' : 'Use Selected Terminal'}
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12px] font-black text-[#0F172A]">Branch Shift Monitor</p>
              <p className="mt-1 text-[11px] text-[#64748B]">
                Active shift owner and opening time for each terminal in this branch.
              </p>
            </div>
          </div>
          {branchTerminalShifts.length === 0 ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-[11px] text-slate-600">
              No active terminal shifts for this branch.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {branchTerminalShifts.map((shift) => {
                const shiftOwner = shift?.cashier?.username
                  || shift?.cashier?.email
                  || (shift?.cashier_id ? `Operator #${shift.cashier_id}` : 'Unknown operator');
                const staleStatus = shift?.stale_recovery || {};
                const ageMinutes = Number(staleStatus?.age_minutes || 0);
                const ageHours = Number.isFinite(ageMinutes) ? Math.floor(ageMinutes / 60) : 0;
                return (
                  <div
                    key={`admin-branch-shift-${shift.pos_terminal_shift_id}`}
                    className={`rounded-lg border bg-white p-3 ${
                      staleStatus?.is_stale ? 'border-amber-300' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-black text-[#0F172A]">
                          {shift.terminal_id || `Shift #${shift.pos_terminal_shift_id}`}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-600">Opened by {shiftOwner}</p>
                      </div>
                      <span className={`rounded-md border px-2 py-1 text-[10px] font-extrabold ${
                        staleStatus?.is_stale
                          ? 'border-amber-200 bg-amber-50 text-amber-800'
                          : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      }`}>
                        {staleStatus?.is_stale ? 'Stale' : 'Active'}
                      </span>
                    </div>
                    <div className="mt-2 space-y-1 text-[11px] text-slate-600">
                      <p>Opened: {parseIsoDateTime(shift.opened_at)}</p>
                      <p>Shift ID: #{shift.pos_terminal_shift_id}</p>
                      {staleStatus?.is_stale ? <p>Open for approximately {ageHours} hour(s)</p> : null}
                    </div>
                    {canRecoverStaleShifts && staleStatus?.is_stale ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="mt-3 h-9 w-full rounded-lg border-amber-300 bg-amber-50 px-3 text-[12px] font-extrabold text-amber-900 hover:bg-amber-100"
                        onClick={() => openStaleRecoveryDialog(shift)}
                        disabled={!isOnline || shiftActionLoading?.staleRecovery}
                      >
                        <AlertTriangle className="mr-2 h-3.5 w-3.5" />
                        Recover Stale Shift
                      </Button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[12px] font-black text-[#0F172A]">Branch Order Monitor</p>
              <p className="mt-1 text-[11px] text-[#64748B]">Read-only active online orders for the selected branch.</p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-lg border-slate-300 bg-white px-3 text-[12px] font-extrabold text-[#0F172A] hover:bg-slate-100"
              onClick={() => refreshAdminLocationMonitor?.()}
              disabled={adminLocationMonitorState?.loading || !isOnline}
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              {adminLocationMonitorState?.loading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
          {adminLocationMonitorState?.errorMessage ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] text-rose-700">
              {adminLocationMonitorState.errorMessage}
            </p>
          ) : adminLocationMonitorState?.loading && branchMonitorOrders.length === 0 ? (
            <p className="mt-3 text-[11px] text-slate-500">Loading branch orders...</p>
          ) : branchMonitorOrders.length === 0 ? (
            <p className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-3 text-[11px] text-slate-600">
              No active online orders for this branch.
            </p>
          ) : (
            <div className="mt-3 grid gap-2 md:grid-cols-2">
              {branchMonitorOrders.map((order) => (
                <div
                  key={`admin-branch-order-${order.pos_transaction_id}`}
                  className="rounded-lg border border-slate-200 bg-white p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-[#0F172A]">
                        {order.customer_name || 'Guest Buyer'}
                      </p>
                      <p className="mt-1 text-[11px] text-slate-500">
                        {order.tracking_pin || `Order #${order.pos_transaction_id}`}
                      </p>
                    </div>
                    <span className="rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-extrabold text-[#1A4E8D]">
                      {String(order.fulfillment_status || 'placed').replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                    <span>{String(order.order_method || '-').replace(/_/g, ' ')}</span>
                    <span className="text-right">{String(order.payment_status || 'unpaid').replace(/_/g, ' ')}</span>
                    <span className="col-span-2">{parseIsoDateTime(order.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </>
    );
  };

  const renderShiftLocationPane = () => {
    if (!activeShift) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            Shift Closed. Please open your shift before using the POS.
          </p>
          {renderAdminBranchContext()}
          <div className="mt-4 space-y-3">
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Float ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              type="number"
              min="0"
              step="0.01"
              required
              value={openShiftForm.openingFloatAmount}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
              placeholder="0.00"
            />
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Note (Optional)</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={openShiftForm.openingNote}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
              placeholder="Opening shift cash note"
            />
            <Button
              type="button"
              className="h-10 rounded-lg !bg-[#2563EB] px-5 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
              onClick={handleOpenShift}
              disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen || !isOnline || !activeTerminalMatchesOperatingLocation}
            >
              {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
            </Button>
            {!canRenderAdminShiftOpen && canAdminBypassShiftPrompt ? (
              <p className="text-[11px] text-slate-500">Administrator navigation is read-only. A cashier must open the shift.</p>
            ) : !canRenderAdminShiftOpen ? (
              <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>
            ) : null}
            {canAdminBypassShiftPrompt && !activeTerminalMatchesOperatingLocation && (
              <p className="text-[11px] text-amber-700">Select and confirm a terminal assigned to this branch before opening a shift.</p>
            )}
            {!isOnline && <p className="text-[11px] text-amber-700">Reconnect before opening a shift.</p>}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="flex items-start gap-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2563EB]">
            <MapPinned className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-[#0F172A]">Shift Location</p>
            <p className="mt-1 text-[12px] leading-5 text-[#475569]">
              Current location used by catalog, checkout, and dashboard for this terminal.
            </p>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
              <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Current Shift Location</p>
              <p className="mt-1 text-[13px] font-extrabold text-[#0F172A]">{shiftLocationLabel}</p>
            </div>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 md:hidden">
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {summaryRows.map((row) => (
                  <div key={`shift-summary-mobile-${row.label}`} className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-medium text-[#5B6B86]">{row.label}</span>
                    <span className={`${row.valueClassName} break-words leading-6`}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 hidden border-t border-slate-200 pt-4 md:block">
              <div className="grid gap-0 md:grid-cols-2">
                <div className="space-y-0 md:border-r md:border-slate-200 md:pr-4">
                  {summaryRows.slice(0, 4).map((row, index) => {
                    const RowIcon = row.icon;
                    return (
                      <div key={`shift-summary-left-${row.label}`} className={`flex items-center gap-3 py-3 ${index < 3 ? 'border-b border-slate-100' : ''}`}>
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#2563EB]">
                          <RowIcon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-[#5B6B86]">{row.label}</p>
                          <p className={`${row.valueClassName} mt-0.5 break-words leading-6`}>{row.value}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="space-y-0 md:pl-4">
                  {summaryRows.slice(4).map((row, index) => {
                    const RowIcon = row.icon;
                    return (
                      <div key={`shift-summary-right-${row.label}`} className={`flex items-center gap-3 py-3 ${index < 3 ? 'border-b border-slate-100' : ''}`}>
                        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50 text-[#2563EB]">
                          <RowIcon className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-[#5B6B86]">{row.label}</p>
                          <p className={`${row.valueClassName} mt-0.5 break-words leading-6`}>{row.value}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-[12px] font-black text-[#0F172A]">Change Active Shift Location</p>
              <p className="mt-1 text-[12px] leading-5 text-[#475569]">
                Reassign the active shift to another location. This requires a reason and permission.
              </p>
              {canSwitchPosLocation ? (
                <>
                  <Label className="mt-3 block text-[12px] font-black text-[#0F172A]">New Shift Location</Label>
                  <select
                    className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                    value={operatingLocationId || ''}
                    onChange={(event) => {
                      const nextValue = event.target.value ? Number(event.target.value) : null;
                      setOperatingLocationId(nextValue);
                    }}
                  >
                    {locations.map((location) => (
                      <option key={`switch-location-${location.location_id}`} value={location.location_id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="mt-3 h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                    value={switchReason}
                    onChange={(event) => setSwitchReason(event.target.value)}
                    placeholder="Reason for shift location change"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                    disabled={shiftActionLoading.switchLocation || !operatingLocationId || Number(operatingLocationId) === Number(shiftLocationId)}
                    onClick={() => handleSwitchShiftLocation?.({
                      targetLocationId: operatingLocationId,
                      reason: switchReason
                    })}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {shiftActionLoading.switchLocation ? 'Switching...' : 'Change Shift Location'}
                  </Button>
                </>
              ) : (
                <p className="mt-3 text-[11px] text-slate-500">
                  You do not have permission to change the active shift location.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
              <div>
                <p className="text-[12px] font-black text-[#0F172A]">Shift Actions</p>
                <p className="mt-1 text-[12px] leading-5 text-[#475569]">
                  Refresh the active shift context from this same card.
                </p>
              </div>
              <Button
                type="button"
                onClick={refreshOperationalContext}
                className="h-10 rounded-lg !bg-[#2563EB] px-5 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
              >
                <RefreshCcw className="mr-2 h-4 w-4" />
                Refresh Shift Data
              </Button>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const renderCloseShiftPane = () => {
    const dayCloseReadiness = dayCloseReadinessState?.readiness || null;
    const dayCloseOpenShiftCount = Number(dayCloseReadiness?.open_shift_count || 0);
    const dayCloseReady = !activeShift && dayCloseReadiness?.ready === true;
    const dayCloseActionDisabled = shiftActionLoading.zReading
      || dayCloseReadinessState?.loading
      || locked
      || !isOnline
      || !activeTerminalMatchesOperatingLocation
      || !dayCloseReady;
    const closeDayAction = canCloseDay ? (
      <div className="mt-4 border-t border-slate-200 pt-4">
        <p className="text-[12px] font-black text-[#0F172A]">Day-end Z-reading</p>
        <p className="mt-1 text-[12px] leading-5 text-[#475569]">
          Closes the branch day report using financially recognized sales from all cashiers, then sends the Z-reading to the configured printer.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            data-testid="pos-close-day-button"
            className="h-10 rounded-lg !bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#143F73] disabled:!bg-slate-300 disabled:text-slate-600"
            onClick={handleCloseDay}
            disabled={dayCloseActionDisabled}
          >
            <Receipt className="mr-2 h-4 w-4" />
            {shiftActionLoading.zReading
              ? 'Closing Day...'
              : (dayCloseReadiness?.already_closed ? 'Print Z-reading' : 'Close Day & Print Z-reading')}
          </Button>
          <Button
            type="button"
            variant="outline"
            data-testid="pos-close-day-refresh"
            className="h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
            onClick={() => void refreshDayCloseReadiness()}
            disabled={dayCloseReadinessState?.loading || shiftActionLoading.zReading || locked || !isOnline || !activeTerminalMatchesOperatingLocation}
          >
            <RefreshCcw className={`mr-2 h-4 w-4 ${dayCloseReadinessState?.loading ? 'animate-spin' : ''}`} />
            {dayCloseReadinessState?.loading ? 'Checking...' : 'Refresh Status'}
          </Button>
        </div>
        <div className="mt-2" data-testid="pos-close-day-readiness">
          {activeShift ? (
            <p className="text-[11px] font-semibold text-amber-700">
              Close this cashier shift before generating the branch Z-reading.
            </p>
          ) : dayCloseReadinessState?.loading ? (
            <p className="text-[11px] text-slate-600">Checking whether every cashier shift is closed...</p>
          ) : dayCloseReadinessState?.errorMessage ? (
            <p className="text-[11px] text-rose-700">{dayCloseReadinessState.errorMessage}</p>
          ) : dayCloseReadiness && !dayCloseReadiness.ready ? (
            <div className="text-[11px] text-amber-700">
              <p className="font-semibold">
                Close every cashier shift in this branch before generating the Z-reading. {dayCloseOpenShiftCount} shift{dayCloseOpenShiftCount === 1 ? '' : 's'} remain open.
              </p>
              {Array.isArray(dayCloseReadiness.open_shifts) && dayCloseReadiness.open_shifts.length > 0 ? (
                <ul className="mt-1 space-y-0.5 pl-4">
                  {dayCloseReadiness.open_shifts.map((shift) => (
                    <li key={shift.shift_id || `${shift.terminal_id}-${shift.cashier_name}`} className="list-disc">
                      {shift.terminal_id || 'Terminal'} — {shift.cashier_name || 'Cashier'}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : dayCloseReady ? (
            <p className="text-[11px] font-semibold text-emerald-700">
              {dayCloseReadiness?.already_closed
                ? 'The branch Z-reading is already generated and ready to print again.'
                : 'All cashier shifts are closed. The branch Z-reading is ready to generate.'}
            </p>
          ) : (
            <p className="text-[11px] text-slate-600">Check Day Close status before generating the Z-reading.</p>
          )}
        </div>
        {!isOnline ? <p className="mt-2 text-[11px] text-amber-700">Reconnect before closing the day.</p> : null}
      </div>
    ) : null;

    if (!activeShift) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
          <p className="text-[13px] font-black text-[#0F172A]">Open Shift</p>
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            No active shift is open. Start a shift here before using cashier-only actions.
          </p>
          <div className="mt-4 space-y-3">
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Cash ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              type="number"
              min="0"
              step="0.01"
              value={openShiftForm.openingFloatAmount}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
              placeholder="0.00"
            />
            <Label className="text-[12px] font-black text-[#0F172A]">Opening Note (Optional)</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={openShiftForm.openingNote}
              onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
              placeholder="Opening shift cash note"
            />
            <Button
              type="button"
              className="h-10 rounded-lg !bg-[#2563EB] px-5 text-[13px] font-extrabold text-white shadow-sm shadow-blue-900/20 hover:!bg-[#1D4ED8]"
              onClick={handleOpenShift}
              disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen || !isOnline || !activeTerminalMatchesOperatingLocation}
            >
              {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
            </Button>
            {!canRenderAdminShiftOpen && canAdminBypassShiftPrompt ? (
              <p className="text-[11px] text-slate-500">Administrator navigation is read-only. A cashier must open the shift.</p>
            ) : !canRenderAdminShiftOpen ? (
              <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>
            ) : null}
            {canAdminBypassShiftPrompt && !activeTerminalMatchesOperatingLocation && (
              <p className="text-[11px] text-amber-700">Select and confirm a terminal assigned to this branch before opening a shift.</p>
            )}
            {!isOnline && <p className="text-[11px] text-amber-700">Reconnect before opening a shift.</p>}
          </div>
          {closeDayAction}
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Close Shift</p>
        {!canCloseShift ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            You need shift-close or close-day permission to close shifts.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
              <span className="text-xs font-semibold text-slate-600">Total Sales (excluding opening cash)</span>
              <span className="text-sm font-black text-[#1A4E8D]">{terminalMeta.pettyCashSymbol} {money(shiftState.salesSummary?.total_amount)}</span>
            </div>
            <p className="text-xs text-slate-600">
              Expected Cash in Drawer: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.expected_cash_amount)}</span>
            </p>
            {canCloseDay ? (
              <MerchantTenderReconciliationPanel
                shiftId={activeShift.pos_terminal_shift_id}
                salesSummary={shiftState.salesSummary}
                disabled={locked || !isOnline}
              />
            ) : null}
            <Label className="text-[12px] font-black text-[#0F172A]">Closing Cash ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              type="number"
              min="0"
              step="0.01"
              value={closeShiftForm.closingCashAmount}
              onChange={(event) => setCloseShiftForm((prev) => ({ ...prev, closingCashAmount: event.target.value }))}
              placeholder={money(shiftState.cashSummary?.expected_cash_amount || 0)}
            />
            <Label className="text-[12px] font-black text-[#0F172A]">Closing Note (Optional)</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={closeShiftForm.closingNote}
              onChange={(event) => setCloseShiftForm((prev) => ({ ...prev, closingNote: event.target.value }))}
              placeholder="End-of-shift note"
            />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                onClick={handleViewShiftSummary}
                disabled={shiftActionLoading.close || shiftActionLoading.summary || locked}
              >
                {shiftActionLoading.summary ? <RefreshCcw className="mr-2 h-4 w-4 animate-spin" /> : <BarChart3 className="mr-2 h-4 w-4" />}
                {shiftActionLoading.summary ? 'Refreshing Summary...' : 'View Shift Summary'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
                onClick={handleCloseShift}
                disabled={shiftActionLoading.close || locked}
              >
                {shiftActionLoading.close ? 'Closing Shift...' : 'Close Shift'}
              </Button>
            </div>
          </div>
        )}
        {closeDayAction}
      </div>
    );
  };

  const renderCashDrawerPane = () => {
    if (!activeShift) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 shadow-sm shadow-amber-100/70">
          <p>Open a shift first before recording cash drawer events.</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 h-9 rounded-lg border-amber-300 bg-white px-3 text-xs font-extrabold text-amber-900 hover:bg-amber-100"
            onClick={() => handleTabChange('cashier_history')}
          >
            <History className="mr-1.5 h-3.5 w-3.5" />
            Cashier History
          </Button>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Cash Drawer Event</p>
        {!canAdjustCashDrawer ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            You need cash drawer adjustment permission to use this section.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <Label className="text-[12px] font-black text-[#0F172A]">Event Type</Label>
            <select
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={cashEventForm.eventType}
              onChange={(event) => setCashEventForm((prev) => ({ ...prev, eventType: event.target.value }))}
            >
              <option value="cash_in">Cash In</option>
              <option value="cash_out">Cash Out</option>
              <option value="opening_adjustment">Opening Adjustment</option>
              <option value="closing_adjustment">Closing Adjustment</option>
            </select>
            <Label className="text-[12px] font-black text-[#0F172A]">Amount ({terminalMeta.pettyCashSymbol})</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              type="number"
              min="0.01"
              step="0.01"
              value={cashEventForm.amount}
              onChange={(event) => setCashEventForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder="0.00"
            />
            <Label className="text-[12px] font-black text-[#0F172A]">Reason</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={cashEventForm.reason}
              onChange={(event) => setCashEventForm((prev) => ({ ...prev, reason: event.target.value }))}
              placeholder="Reason for adjustment"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
              onClick={handleRecordCashEvent}
              disabled={shiftActionLoading.cashEvent || locked}
            >
              {shiftActionLoading.cashEvent ? 'Saving Event...' : 'Record Cash Event'}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-lg border-slate-300 bg-white px-4 text-[13px] font-extrabold text-[#0F172A] hover:bg-slate-50"
              onClick={() => handleTabChange('cashier_history')}
            >
              <History className="mr-1.5 h-3.5 w-3.5" />
              Cashier History
            </Button>
          </div>
        )}
      </div>
    );
  };

  const renderCashierHistoryPane = () => (
    <CashierHistoryPanel
      state={cashierHistoryState}
      onRefresh={refreshCashierHistory}
      onViewSummary={handleViewCashierHistoryShift}
      activeShift={activeShift}
      locked={locked}
      isOnline={isOnline}
      currency={terminalMeta.pettyCashSymbol}
    />
  );

  const renderActivePane = () => {
    if (renderedTab === 'close_shift') return renderCloseShiftPane();
    if (renderedTab === 'cash_drawer') return renderCashDrawerPane();
    if (renderedTab === 'cashier_history') return renderCashierHistoryPane();
    return renderShiftLocationPane();
  };

  return (
    <>
    <div id={sectionId} className="space-y-4">
      <h2 className="sr-only">Shift Controls</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/70">
        <div className="hidden gap-2 sm:grid md:grid-cols-4">
          {SHIFT_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-black transition ${
                  active
                    ? 'bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
                    : 'bg-slate-50 text-[#0F172A] hover:bg-slate-100'
                }`}
              >
                <TabIcon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 sm:hidden">
          {SHIFT_TABS.map((tab) => {
            const TabIcon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={`mobile-${tab.id}`}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex min-h-14 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${
                  active
                    ? 'bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
                    : 'bg-slate-50 text-[#0F172A] hover:bg-slate-100'
                }`}
              >
                <TabIcon className="h-4 w-4 shrink-0" />
                <span className="text-center leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {shiftState.loading ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">Loading shift context...</p>
      ) : (
        <div className="overflow-hidden">
          <div style={paneInlineStyle}>
            {renderActivePane()}
          </div>
        </div>
      )}
    </div>
    <ConfirmActionDialog
      open={Boolean(pendingAdminTerminalId)}
      onOpenChange={(open) => {
        if (!open) setPendingAdminTerminalId('');
      }}
      title={
        selectedTerminalShiftOwnedByCurrentUser
          ? `Resume your shift on ${pendingAdminTerminalId}?`
          : (pendingAdminTerminalId ? `Use terminal ${pendingAdminTerminalId}?` : 'Use selected terminal?')
      }
      description={
        selectedTerminalShiftOwnedByCurrentUser
          ? 'This restores the existing shift you opened. It does not create a new shift or change the original opening record.'
          : "This changes the Admin terminal context for the selected branch. It does not open a shift, take over another cashier's shift, or enable checkout until you open your own shift."
      }
      confirmLabel={selectedTerminalShiftOwnedByCurrentUser ? 'Resume Shift' : 'Use Terminal'}
      onConfirm={() => onSelectAdminTerminal?.(pendingAdminTerminalId)}
    />
    <Dialog
      open={Boolean(staleRecoveryShift)}
      onOpenChange={(open) => {
        if (!open) closeStaleRecoveryDialog();
      }}
    >
      <DialogContent className="w-[calc(100vw-1.5rem)] max-w-lg rounded-2xl border border-amber-200 bg-white p-0 shadow-2xl shadow-slate-950/20">
        <form onSubmit={submitStaleShiftRecovery}>
          <DialogHeader className="border-b border-amber-100 bg-amber-50/70 px-5 py-4">
            <DialogTitle className="flex items-center gap-2 text-lg font-black text-amber-950">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Recover Stale Shift
            </DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-amber-900">
              Force-close this stale shift without changing its original owner. This action is audited and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-black text-slate-900">
                {staleRecoveryShift?.terminal_id || `Shift #${staleRecoveryShift?.pos_terminal_shift_id || ''}`}
              </p>
              <p className="mt-1">
                Opened by {staleRecoveryShift?.cashier?.username
                  || staleRecoveryShift?.cashier?.email
                  || (staleRecoveryShift?.cashier_id ? `Operator #${staleRecoveryShift.cashier_id}` : 'Unknown operator')}
              </p>
              <p className="mt-1">Opened: {parseIsoDateTime(staleRecoveryShift?.opened_at)}</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="stale-shift-closing-cash" className="text-sm font-black text-slate-900">
                Closing Cash Amount
              </Label>
              <Input
                id="stale-shift-closing-cash"
                type="number"
                min="0"
                step="0.01"
                required
                value={staleRecoveryForm.closingCashAmount}
                onChange={(event) => setStaleRecoveryForm((current) => ({
                  ...current,
                  closingCashAmount: event.target.value
                }))}
                placeholder="0.00"
                disabled={shiftActionLoading?.staleRecovery}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stale-shift-recovery-reason" className="text-sm font-black text-slate-900">
                Recovery Reason
              </Label>
              <Input
                id="stale-shift-recovery-reason"
                required
                minLength={8}
                value={staleRecoveryForm.reason}
                onChange={(event) => setStaleRecoveryForm((current) => ({
                  ...current,
                  reason: event.target.value
                }))}
                placeholder="Explain why this stale shift must be closed"
                disabled={shiftActionLoading?.staleRecovery}
              />
              <p className="text-xs text-slate-500">At least 8 characters are required for the audit record.</p>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-5 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={closeStaleRecoveryDialog}
              disabled={shiftActionLoading?.staleRecovery}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={
                shiftActionLoading?.staleRecovery
                || !isOnline
                || !isValidOpeningCashAmount(staleRecoveryForm.closingCashAmount)
                || staleRecoveryForm.reason.trim().length < 8
              }
            >
              {shiftActionLoading?.staleRecovery ? 'Recovering Shift...' : 'Force Close Stale Shift'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}

const normalizeFolderNameKey = (value = '') => (
  String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()
);

const createFolderFilterValue = (folder = {}) => {
  const folderId = Number(folder?.folder_id);
  if (Number.isInteger(folderId) && folderId > 0) return `folder:${folderId}`;
  return `name:${normalizeFolderNameKey(folder?.name)}`;
};

const createFoodCategoryOption = (folder = {}) => {
  const name = String(folder?.name || '').trim();
  return {
    value: createFolderFilterValue(folder),
    label: name,
    name,
    folder_id: Number.isInteger(Number(folder?.folder_id)) && Number(folder.folder_id) > 0
      ? Number(folder.folder_id)
      : null
  };
};

function EditableFoodCategoryCombobox({
  id,
  value,
  options = [],
  onChange,
  onSelect,
  disabled = false
}) {
  const [open, setOpen] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const containerRef = useRef(null);
  const normalizedValue = normalizeFolderNameKey(value);
  const normalizedQuery = isFiltering ? normalizedValue : '';
  const filteredOptions = options.filter((option) => (
    !normalizedQuery || normalizeFolderNameKey(option.name).includes(normalizedQuery)
  ));

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, []);

  const selectOption = (option) => {
    onChange(option.name);
    onSelect(option);
    setIsFiltering(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={`${id}-listbox`}
        aria-expanded={open}
        value={value}
        onFocus={() => {
          setIsFiltering(false);
          setOpen(true);
        }}
        onChange={(event) => {
          onChange(event.target.value);
          setIsFiltering(true);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') setOpen(false);
          if (event.key === 'ArrowDown') setOpen(true);
        }}
        className="h-11 rounded-xl border-slate-200 pr-10 text-xs font-medium focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
        disabled={disabled}
        placeholder="Select or create a category"
      />
      <button
        type="button"
        className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-500 hover:text-[#1A4E8D] disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          setIsFiltering(false);
          setOpen((current) => !current);
        }}
        disabled={disabled}
        aria-label="Show food categories"
        aria-expanded={open}
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open ? (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label="Food categories"
          className="absolute z-30 mt-1 max-h-52 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={normalizeFolderNameKey(option.name) === normalizedValue}
              className="flex w-full rounded-lg px-3 py-2 text-left text-xs font-medium text-[#0F172A] hover:bg-blue-50 focus:bg-blue-50 focus:outline-none sm:text-sm"
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          )) : (
            <p className="px-3 py-2 text-xs text-slate-500">No existing category matches. Save to create “{value.trim()}”.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

const createEmptyPosItemForm = () => ({
  name: '',
  default_sale_price: '',
  cost_per_unit: '',
  current_stock: '0',
  pos_always_available: false,
  pos_best_seller_mode: 'auto',
  senior_pwd_discount_eligible: false,
  description: '',
  sku_code: '',
  pos_category: ''
});

const normalizeMoneyInput = (value) => {
  const sanitized = String(value ?? '').replace(/,/g, '').replace(/[^\d.]/g, '');
  const [whole = '', ...fractionParts] = sanitized.split('.');
  if (fractionParts.length === 0) return whole;
  return `${whole}.${fractionParts.join('').slice(0, 2)}`;
};

const formatMoneyInput = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return '';
  const numericValue = Number(normalized);
  if (!Number.isFinite(numericValue)) return normalized;
  return numericValue.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

const resolveSellablePosItemPreset = (workflowMode = '') => {
  const taxonomy = resolveModeItemTaxonomy(workflowMode);
  const productPresets = Array.isArray(taxonomy?.presets)
    ? taxonomy.presets.filter((preset) => preset?.category === 'product')
    : [];
  const preferredKeys = ['menu_item', 'finished_product', 'product', 'physical_add_on', 'packaged_beverage', 'minibar_retail_product'];
  const preset = preferredKeys
    .map((key) => productPresets.find((entry) => entry.key === key))
    .find(Boolean) || productPresets[0] || null;

  return preset || {
    key: 'product',
    label: 'Product',
    category: 'product',
    product_type: 'finished_goods',
    default_unit: 'pcs',
    fifo_enabled: true
  };
};

const resolveItemWorkspacePresentation = (workflowMode = '') => {
  const normalizedMode = normalizeWorkflowMode(workflowMode);

  if (normalizedMode === 'fnb') {
    return {
      categoryLabel: 'Food Category',
      savingAriaLabel: 'Saving menu item',
      savingStatusLabel: 'F&B KITCHEN & MENU SYNC',
      savingTitle: 'Saving Menu Item…',
      savingDescription: 'Updating food & beverage details and syncing menu changes across POS terminals & Kitchen Displays.',
      savingIcon: UtensilsCrossed,
      accent: 'amber'
    };
  }

  if (normalizedMode === 'retail') {
    return {
      categoryLabel: 'Product Category',
      savingAriaLabel: 'Saving retail product',
      savingStatusLabel: 'RETAIL CATALOG SYNC',
      savingTitle: 'Saving Product…',
      savingDescription: 'Updating product details and syncing catalog changes across POS terminals and Storefront.',
      savingIcon: ShoppingBag,
      accent: 'blue'
    };
  }

  return {
    categoryLabel: 'Item Category',
    savingAriaLabel: 'Saving item',
    savingStatusLabel: 'POS CATALOG SYNC',
    savingTitle: 'Saving Item…',
    savingDescription: 'Updating item details across POS terminals and Storefront.',
    savingIcon: Package,
    accent: 'blue'
  };
};

function ItemsWorkspace({
  canViewPos,
  canCreateItems = false,
  canImportItems = false,
  canManageServiceCatalog = false,
  canEditItems = false,
  canDeleteItems = false,
  canManageCategories = false,
  stockFilterPreset = '',
  onStockFilterPresetApplied = () => {},
  workflowMode = '',
  locked,
  isOnline = true,
  onQueueOfflineItemDraft = async () => '',
  operatingLocationId = null,
  storefrontSlug = '',
  sectionId
}) {
  const [items, setItems] = useState([]);
  const [itemsTotal, setItemsTotal] = useState(0);
  const itemsReadSequence = useRef(0);
  const itemsLoaded = useRef(false);
  const [primaryBarcodes, setPrimaryBarcodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { createItem, loading: creatingItem } = useCreateItem();
  const [showPdfMenuImport, setShowPdfMenuImport] = useState(false);
  const pdfMenuImportEnabled = isPdfMenuImportEnabled();
  // Batch (multi-file) import supersedes the single-file wizard wherever it is
  // enabled; both flags default OFF and are independently killable.
  const menuImportBatchEnabled = isMenuImportBatchEnabled();
  const menuImportEntryEnabled = pdfMenuImportEnabled || menuImportBatchEnabled;
  const menuImportButtonLabel = menuImportBatchEnabled ? 'Import Menu' : 'Import from PDF';
  const [showCsvImport, setShowCsvImport] = useState(false);
  const { updateItem, loading: savingItem } = useUpdateItem();
  const { deleteItem, loading: deletingItem } = useDeleteItem();
  const [editingItemId, setEditingItemId] = useState(null);
  const [persistingEditAssets, setPersistingEditAssets] = useState(false);
  const [selectedEditImageFiles, setSelectedEditImageFiles] = useState([]);
  const [isEditImageDragActive, setIsEditImageDragActive] = useState(false);
  const [deferredEditImageFiles, setDeferredEditImageFiles] = useState([]);
  const [selectedEditPrimaryFile, setSelectedEditPrimaryFile] = useState(null);
  const [editImageUploadJob, setEditImageUploadJob] = useState(null);
  const [pendingEditImageRefresh, setPendingEditImageRefresh] = useState(null);
  // generatingEditImage covers the POST that queues the job; pollingEditImage
  // covers the wait for a terminal status afterwards — split so the button
  // label can tell the operator which stage it's actually in.
  const [generatingEditImage, setGeneratingEditImage] = useState(false);
  const [pollingEditImage, setPollingEditImage] = useState(false);
  const { pollItemImageGeneration, cancel: cancelImageGenerationPoll } = useItemImageGenerationPoll();
  const [editForm, setEditForm] = useState({
    name: '',
    current_stock: '0',
    default_sale_price: '',
    cost_per_unit: '',
    pos_always_available: false,
    pos_best_seller_mode: 'auto',
    senior_pwd_discount_eligible: false,
    description: '',
    pos_category: '',
    manual_barcode: '',
    gtin: ''
  });
  const [focusedEditMoneyField, setFocusedEditMoneyField] = useState('');
  const [savedMessage, setSavedMessage] = useState({ name: '', barcode: '', action: 'updated' });
  const [itemSaveInFlight, setItemSaveInFlight] = useState(false);
  const [deletedItemName, setDeletedItemName] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [itemImagePreview, setItemImagePreview] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [itemsPage, setItemsPage] = useState(1);
  const deferredItemsSearch = React.useDeferredValue(searchQuery);
  const [editingItemSnapshot, setEditingItemSnapshot] = useState(null);
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateServiceModal, setShowCreateServiceModal] = useState(false);
  const [editingServiceItem, setEditingServiceItem] = useState(null);
  const [createForm, setCreateForm] = useState(createEmptyPosItemForm());
  const [createCategoryInput, setCreateCategoryInput] = useState('');
  const [editCategoryInput, setEditCategoryInput] = useState('');
  // #1318 Wave C/C5 — POS's own "Additional Categories" secondary-membership
  // editor, mirroring packages/web-core/Components/items/ItemFormModal.jsx's
  // Phase 268 section but adapted to this file's activeEditItem-based state
  // (no itemIdForFolders equivalent exists here since this modal only ever
  // opens for an already-persisted item — see availableSecondaryFolders below).
  const [secondaryFolderIds, setSecondaryFolderIds] = useState([]);
  const [secondaryFoldersLoading, setSecondaryFoldersLoading] = useState(false);
  const [secondaryFoldersSaving, setSecondaryFoldersSaving] = useState(false);
  // #1318 PR #1581 review RF-3 — true only when the memberships GET itself
  // failed with 403 (categories:manage required server-side), distinct from
  // a genuinely empty membership list. See fetchSecondaryFolders below.
  const [secondaryFoldersUnavailable, setSecondaryFoldersUnavailable] = useState(false);
  const [posFolders, setPosFolders] = useState([]);
  const [skuSeedItems, setSkuSeedItems] = useState([]);
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [isCreateImageDragActive, setIsCreateImageDragActive] = useState(false);
  const [manualBarcode, setManualBarcode] = useState('');
  const [externalBarcode, setExternalBarcode] = useState('');
  const [externalLookupLoading, setExternalLookupLoading] = useState(false);
  const [externalLookupError, setExternalLookupError] = useState('');
  const [externalProductLookup, setExternalProductLookup] = useState(null);
  const [acceptedExternalProduct, setAcceptedExternalProduct] = useState(null);
  const [externalQrScannerOpen, setExternalQrScannerOpen] = useState(false);
  const [pendingCreateRecovery, setPendingCreateRecovery] = useState(null);
  const [postCreateSaving, setPostCreateSaving] = useState(false);

  const posItemPreset = useMemo(() => resolveSellablePosItemPreset(workflowMode), [workflowMode]);
  const isServicesMode = normalizeWorkflowMode(workflowMode) === 'services';
  const itemWorkspacePresentation = useMemo(
    () => resolveItemWorkspacePresentation(workflowMode),
    [workflowMode]
  );
  const SavingItemIcon = itemWorkspacePresentation.savingIcon;
  const usesWarmSavingAccent = itemWorkspacePresentation.accent === 'amber';

  useEffect(() => {
    const normalizedPreset = String(stockFilterPreset || '').trim();
    if (!normalizedPreset) return;
    setStockFilter(normalizedPreset);
    onStockFilterPresetApplied();
  }, [onStockFilterPresetApplied, stockFilterPreset]);

  const loadPrimaryBarcodes = useCallback((catalogItems = []) => {
    const normalizedItems = Array.isArray(catalogItems)
      ? catalogItems.filter((item) => Number(item?.item_id) > 0)
      : [];

    if (normalizedItems.length === 0) {
      setPrimaryBarcodes({});
      return;
    }

    const nextBarcodes = {};
    normalizedItems.forEach((item) => {
      const barcode = item?.primary_barcode;
      if (barcode?.code) {
        nextBarcodes[String(item.item_id)] = barcode;
      }
    });
    setPrimaryBarcodes(nextBarcodes);
  }, []);

  const loadItems = useCallback(async () => {
    const sequence = ++itemsReadSequence.current;
    if (!canViewPos || locked) {
      itemsLoaded.current = false;
      setItems([]);
      setItemsTotal(0);
      setPrimaryBarcodes({});
      setError('');
      setLoading(false);
      return;
    }

    setLoading(!itemsLoaded.current);
    setError('');
    try {
      const data = await fetchPosCatalogPage({
        search: deferredItemsSearch,
        page: itemsPage,
        page_size: POS_ITEMS_PAGE_SIZE,
        category_filter: categoryFilter,
        stock_filter: stockFilter,
        ...(operatingLocationId ? { location_id: operatingLocationId } : {})
      });
      if (itemsReadSequence.current !== sequence) return;
      const catalogItems = Array.isArray(data?.items) ? data.items : [];
      setItems(catalogItems);
      setItemsTotal(Number(data?.pagination?.total || 0));
      itemsLoaded.current = true;
      loadPrimaryBarcodes(catalogItems);
    } catch (loadError) {
      if (itemsReadSequence.current !== sequence) return;
      setError(loadError?.response?.data?.message || 'Failed to load POS-visible IMS items.');
    } finally {
      if (itemsReadSequence.current === sequence) setLoading(false);
    }
  }, [canViewPos, categoryFilter, deferredItemsSearch, itemsPage, loadPrimaryBarcodes, locked, operatingLocationId, stockFilter]);

  useEffect(() => () => { itemsReadSequence.current++; }, [loadItems]);
  const normalizePosFolders = useCallback((rows = []) => (
    (Array.isArray(rows) ? rows : [])
      .map((folder) => ({
        ...folder,
        folder_id: Number(folder?.folder_id),
        name: String(folder?.name || '').trim(),
        is_active: folder?.is_active !== false,
        show_in_pos_filter: folder?.show_in_pos_filter !== false
      }))
      .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0 && folder.name)
  ), []);

  const loadPosFolders = useCallback(async () => {
    if (!canViewPos) {
      setPosFolders([]);
      return [];
    }

    try {
      const folders = normalizePosFolders(await getFolders());
      setPosFolders(folders);
      return folders;
    } catch (folderError) {
      setPosFolders([]);
      return [];
    }
  }, [canViewPos, normalizePosFolders]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    if (locked || !canViewPos) return undefined;
    const refreshItems = () => {
      void loadItems();
    };
    const unsubscribeLocal = subscribeToPosCatalogUpdates(refreshItems);
    const unsubscribeRemote = subscribeToRemotePosCatalogUpdates();
    return () => {
      unsubscribeLocal();
      unsubscribeRemote();
    };
  }, [canViewPos, loadItems, locked]);

  useEffect(() => {
    loadPosFolders();
  }, [loadPosFolders]);

  useEffect(() => {
    if (!showCreateModal || !canCreateItems) return;
    let cancelled = false;

    (async () => {
      try {
        const payload = await getItems({ fields: 'dropdown', limit: 10000 });
        if (cancelled) return;
        setSkuSeedItems(Array.isArray(payload?.items) ? payload.items : []);
      } catch {
        if (!cancelled) {
          setSkuSeedItems([]);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canCreateItems, showCreateModal]);

  useEffect(() => {
    if (!showCreateModal) return;
    const suggestedSku = suggestNextSku({
      name: createForm.name,
      category: 'product',
      existingItems: skuSeedItems
    });
    setCreateForm((current) => (
      current.sku_code === suggestedSku
        ? current
        : { ...current, sku_code: suggestedSku }
    ));
  }, [createForm.name, showCreateModal, skuSeedItems]);

  const sortedItems = useMemo(
    () => [...(Array.isArray(items) ? items : [])].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [items]
  );

  const foodCategoryOptions = useMemo(() => {
    const byName = new Map();
    posFolders
      .filter((folder) => folder?.is_active !== false && folder?.show_in_pos_filter !== false)
      .forEach((folder) => {
        byName.set(normalizeFolderNameKey(folder.name), createFoodCategoryOption(folder));
      });
    return Array.from(byName.values()).filter((option) => option.name);
  }, [posFolders]);

  const categoryOptions = useMemo(() => ['all', ...foodCategoryOptions.map((option) => option.value)], [foodCategoryOptions]);

  const categoryOptionLabels = useMemo(() => {
    const labels = new Map([['all', 'All categories']]);
    foodCategoryOptions.forEach((option) => labels.set(option.value, option.label));
    return labels;
  }, [foodCategoryOptions]);
  const resolveFoodCategorySelection = useCallback((selection = '') => {
    const normalizedSelection = String(selection || '').trim();
    return foodCategoryOptions.find((option) => option.value === normalizedSelection) || null;
  }, [foodCategoryOptions]);

  const filteredItems = sortedItems;
  const hasActiveItemsFilters = Boolean(String(searchQuery || '').trim())
    || categoryFilter !== 'all'
    || stockFilter !== 'all';

  useEffect(() => {
    setItemsPage(1);
  }, [categoryFilter, searchQuery, stockFilter]);

  const totalItemsPages = Math.max(1, Math.ceil(itemsTotal / POS_ITEMS_PAGE_SIZE));
  const currentItemsPage = Math.min(itemsPage, totalItemsPages);
  const paginatedItems = filteredItems;

  useEffect(() => {
    if (itemsPage !== currentItemsPage) {
      setItemsPage(currentItemsPage);
    }
  }, [currentItemsPage, itemsPage]);

  const activeEditItem = useMemo(
    () => sortedItems.find((item) => Number(item?.item_id) === Number(editingItemId)) || editingItemSnapshot,
    [editingItemId, editingItemSnapshot, sortedItems]
  );
  const visibleSelectedEditImageFiles = useMemo(() => {
    if (!pendingEditImageRefresh || !activeEditItem) return selectedEditImageFiles;
    if (Number(activeEditItem.item_id) !== Number(pendingEditImageRefresh.itemId)) {
      return selectedEditImageFiles;
    }

    const savedUploadCount = Math.max(0, Math.min(
      Number(pendingEditImageRefresh.pendingCount || 0),
      normalizeStorefrontItemGallery(activeEditItem).length
        - Number(pendingEditImageRefresh.existingGalleryCount || 0)
    ));
    return selectedEditImageFiles.slice(savedUploadCount);
  }, [activeEditItem, pendingEditImageRefresh, selectedEditImageFiles]);

  // Real, already-persisted item id backing the open edit modal, or 0 when
  // there isn't one. This modal only ever opens for an item found in
  // sortedItems (activeEditItem above), so in practice this is always > 0
  // while the modal is rendered -- unlike IMS's ItemFormModal, which is
  // shared between create and edit and needs this guard to actually matter.
  // Kept as an explicit, defensive gate anyway so the Additional Categories
  // section never renders against an unsaved/invalid item.
  const editItemIdForFolders = Number(activeEditItem?.item_id) > 0 ? Number(activeEditItem.item_id) : 0;

  // #1318 PR #1581 review RF-1 (blocker) — the primary category field in this
  // same modal (EditableFoodCategoryCombobox / the read-only <select> above)
  // lets a manager stage a DIFFERENT primary category in editForm before
  // "Save Item" is ever clicked. "Save Additional Categories" is a separate,
  // independent write that can land while that staged change is still
  // unsaved -- the server's disjointness guard only ever sees the DB's
  // *current* primary at write time, so it cannot catch a pending primary
  // change that would collide with an already-saved secondary membership (or
  // the reverse order: stage primary -> save secondary against the still-old
  // DB primary -> save item, landing both as primary AND secondary at once).
  // Mirrors handleSave's own foodCategory resolution exactly (below, at
  // categoryPayload) so the two can never disagree about what the pending
  // primary actually is.
  const pendingPrimaryFolderId = useMemo(() => {
    const typedCategoryName = String(editCategoryInput || '').trim().replace(/\s+/g, ' ');
    const foodCategory = resolveFoodCategorySelection(editForm.pos_category)
      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));
    if (Number.isInteger(Number(foodCategory?.folder_id)) && Number(foodCategory.folder_id) > 0) {
      return Number(foodCategory.folder_id);
    }
    // No resolvable pending category (blank, or a brand-new not-yet-created
    // name) -- nothing has actually changed from the persisted primary yet.
    return Number(activeEditItem?.folder_id) || 0;
  }, [editCategoryInput, editForm.pos_category, resolveFoodCategorySelection, foodCategoryOptions, activeEditItem?.folder_id]);

  // Every folder id that is, or is about to become, this item's primary
  // category -- both the currently-persisted one (already-excluded, as
  // before) and the staged-but-unsaved pending one, when they differ.
  const excludedPrimaryFolderIds = useMemo(() => {
    const ids = new Set();
    const persisted = Number(activeEditItem?.folder_id);
    if (Number.isInteger(persisted) && persisted > 0) ids.add(persisted);
    if (Number.isInteger(pendingPrimaryFolderId) && pendingPrimaryFolderId > 0) ids.add(pendingPrimaryFolderId);
    return ids;
  }, [activeEditItem?.folder_id, pendingPrimaryFolderId]);

  // #1318 Wave C/C5 — every persisted folder except the item's own primary
  // one (selecting it would be redundant, and the API silently drops it
  // anyway per the disjointness guard, ADR 0080 clause 2) *and* except any
  // pending, not-yet-saved primary selection (RF-1 above). Mirrors
  // ItemFormModal.jsx's availableSecondaryFolders, widened for the
  // pending-primary case IMS's own modal doesn't have to contend with here.
  const availableSecondaryFolders = useMemo(
    () => posFolders.filter((folder) => !excludedPrimaryFolderIds.has(Number(folder.folder_id))),
    [posFolders, excludedPrimaryFolderIds]
  );

  const fetchSecondaryFolders = useCallback(async (itemId) => {
    if (!itemId) return;
    setSecondaryFoldersLoading(true);
    setSecondaryFoldersUnavailable(false);
    try {
      const response = await listItemFolders(itemId);
      const memberships = Array.isArray(response?.memberships) ? response.memberships : [];
      setSecondaryFolderIds(memberships.map((membership) => String(membership.folder_id)));
    } catch (folderFetchError) {
      console.error('Failed to load item category memberships:', folderFetchError);
      setSecondaryFolderIds([]);
      // #1318 PR #1581 review RF-3 (should-fix) — GET /items/:item_id/folders
      // is gated by requireTenantAdmin (categories:manage) server-side, the
      // same permission canManageCategories mirrors client-side. The two can
      // drift (stale client permission cache, a race, direct testing), so
      // trust the *actual* response rather than the client flag: a 403 here
      // means the memberships genuinely could not be read, which is a
      // distinct state from "this item has zero secondary memberships" and
      // must not render the same "0/10 selected" as a real empty result.
      setSecondaryFoldersUnavailable(folderFetchError?.response?.status === 403);
    } finally {
      setSecondaryFoldersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (editItemIdForFolders) {
      fetchSecondaryFolders(editItemIdForFolders);
    } else {
      setSecondaryFolderIds([]);
      setSecondaryFoldersUnavailable(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editItemIdForFolders]);

  // RF-1 continued: if the pending primary selection changes (or the item's
  // persisted primary itself changes, e.g. after a reload) to a folder id
  // that is already checked as a secondary category, drop it immediately --
  // otherwise a stale checked-but-now-excluded id could still be sent by
  // "Save Additional Categories" even though its checkbox is no longer shown.
  useEffect(() => {
    setSecondaryFolderIds((current) => {
      const filtered = current.filter((id) => !excludedPrimaryFolderIds.has(Number(id)));
      return filtered.length === current.length ? current : filtered;
    });
  }, [excludedPrimaryFolderIds]);

  const toggleSecondaryFolder = (folderId, checked) => {
    const normalizedId = String(folderId);
    if (checked && excludedPrimaryFolderIds.has(Number(folderId))) return;
    setSecondaryFolderIds((current) => {
      if (checked) {
        if (current.includes(normalizedId) || current.length >= 10) return current;
        return [...current, normalizedId];
      }
      return current.filter((entry) => entry !== normalizedId);
    });
  };

  const saveSecondaryFolders = async () => {
    if (!editItemIdForFolders) return;
    // Defensive re-filter at the actual write boundary (RF-1) -- belt and
    // suspenders alongside the render-time exclusion and the cleanup effect
    // above, so a pending primary can never reach the API as a secondary
    // selection no matter which state update ordering got us here.
    const outgoingFolderIds = secondaryFolderIds
      .map((id) => Number(id))
      .filter((id) => !excludedPrimaryFolderIds.has(id));
    setSecondaryFoldersSaving(true);
    try {
      await replaceItemFolders(editItemIdForFolders, outgoingFolderIds);
      toast.success('Additional categories saved.');
    } catch (saveFolderError) {
      toast.error(saveFolderError?.response?.data?.message || 'Unable to save additional categories.');
    } finally {
      setSecondaryFoldersSaving(false);
    }
  };

  const queueDeferredEditImageFiles = useCallback(async ({ itemId, files, existingGalleryCount }) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const availableSlots = Math.max(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT - existingGalleryCount);
    const filesToUpload = normalizedFiles.slice(0, availableSlots);
    const remainingFiles = normalizedFiles.slice(filesToUpload.length);
    if (!itemId || filesToUpload.length === 0) return;

    setPendingEditImageRefresh({
      itemId,
      existingGalleryCount,
      pendingCount: filesToUpload.length,
      remainingFiles
    });
    setEditImageUploadJob({ itemId, jobId: null });
    try {
      const queued = await queueStorefrontCatalogImages(itemId, filesToUpload);
      setEditImageUploadJob((current) => (
        current?.itemId === itemId
          ? { ...current, jobId: queued?.job_id || null }
          : current
      ));
    } catch (error) {
      setSelectedEditImageFiles([]);
      setDeferredEditImageFiles([]);
      setSelectedEditPrimaryFile(null);
      setPendingEditImageRefresh((current) => (
        current?.itemId === itemId ? null : current
      ));
      toast.error(error?.response?.data?.message || 'Image upload failed. Try selecting the image again.');
    } finally {
      setEditImageUploadJob((current) => (
        current?.itemId === itemId ? null : current
      ));
    }
  }, []);

  useEffect(() => {
    if (!pendingEditImageRefresh || !activeEditItem) return;
    if (Number(activeEditItem.item_id) !== Number(pendingEditImageRefresh.itemId)) return;
    const galleryCount = normalizeStorefrontItemGallery(activeEditItem).length;
    const expectedGalleryCount = pendingEditImageRefresh.existingGalleryCount
      + pendingEditImageRefresh.pendingCount;
    if (galleryCount < expectedGalleryCount) return;
    const remainingFiles = Array.isArray(pendingEditImageRefresh.remainingFiles)
      ? pendingEditImageRefresh.remainingFiles.filter(Boolean)
      : [];
    setSelectedEditImageFiles(remainingFiles);
    setDeferredEditImageFiles(remainingFiles);
    setSelectedEditPrimaryFile(null);
    setPendingEditImageRefresh(null);
  }, [activeEditItem, pendingEditImageRefresh]);

  useEffect(() => {
    if (!activeEditItem || deferredEditImageFiles.length === 0 || editImageUploadJob || pendingEditImageRefresh) return;
    const itemId = Number(activeEditItem.item_id || 0);
    if (!itemId) return;
    const existingGalleryCount = normalizeStorefrontItemGallery(activeEditItem).length;
    if (existingGalleryCount >= STOREFRONT_ITEM_IMAGE_MAX_COUNT) return;
    void queueDeferredEditImageFiles({
      itemId,
      files: deferredEditImageFiles,
      existingGalleryCount
    });
  }, [activeEditItem, deferredEditImageFiles, editImageUploadJob, pendingEditImageRefresh, queueDeferredEditImageFiles]);

  const activeEditStorefrontUrl = useMemo(() => resolveStorefrontItemUrl({
    slug: storefrontSlug,
    itemId: activeEditItem?.item_id
  }), [activeEditItem?.item_id, storefrontSlug]);
  const openEdit = (item) => {
    if (isServiceCatalogItem(item)) {
      if (canManageServiceCatalog) setEditingServiceItem(item);
      return;
    }
    const savedFolderId = Number(item?.folder_id || 0);
    const savedFolderName = String(item?.folder?.name || item?.product_folder || '').trim();
    const matchedActiveCategory = savedFolderId > 0
      ? foodCategoryOptions.find((option) => Number(option?.folder_id) === savedFolderId)
      : foodCategoryOptions.find((option) => normalizeFolderNameKey(option?.name) === normalizeFolderNameKey(savedFolderName));
    setEditingItemId(item?.item_id || null);
    setEditingItemSnapshot(item || null);
    setFocusedEditMoneyField('');
    const savedBarcode = primaryBarcodes[String(item?.item_id)] || item?.primary_barcode || null;
    const savedBarcodeCode = String(savedBarcode?.code || '').trim();
    const savedBarcodeIsGtin = String(savedBarcode?.source || '').toLowerCase() === 'manufacturer';
    setEditForm({
      name: String(item?.name || ''),
      current_stock: String(item?.current_stock ?? '0'),
      default_sale_price: String(item?.default_sale_price ?? ''),
      cost_per_unit: String(item?.cost_per_unit ?? ''),
      pos_always_available: item?.pos_always_available === true,
      pos_best_seller_mode: ['force', 'never'].includes(String(item?.pos_best_seller_mode || '').toLowerCase())
        ? String(item.pos_best_seller_mode).toLowerCase()
        : 'auto',
      senior_pwd_discount_eligible: item?.senior_pwd_discount_eligible === true || Number(item?.senior_pwd_discount_eligible) === 1,
      description: String(item?.description || ''),
      // Item lists do not always hydrate the nested folder name. Resolve by saved ID first.
      pos_category: matchedActiveCategory?.value || (savedFolderId
        ? createFolderFilterValue({ folder_id: savedFolderId, name: item?.folder?.name || item?.product_folder })
        : ''),
      manual_barcode: savedBarcodeIsGtin ? '' : savedBarcodeCode,
      gtin: savedBarcodeIsGtin ? savedBarcodeCode : ''
    });
    setEditCategoryInput(String(item?.folder?.name || item?.product_folder || ''));
    setSelectedEditImageFiles([]);
    setIsEditImageDragActive(false);
    setDeferredEditImageFiles([]);
    setSelectedEditPrimaryFile(null);
    setEditImageUploadJob(null);
    setPendingEditImageRefresh(null);
  };

  const closeEdit = ({ force = false } = {}) => {
    if (!force && (savingItem || persistingEditAssets || generatingEditImage || pollingEditImage)) return;
    cancelImageGenerationPoll();
    setEditingItemId(null);
    setEditingItemSnapshot(null);
    setFocusedEditMoneyField('');
    setPersistingEditAssets(false);
    setSelectedEditImageFiles([]);
    setIsEditImageDragActive(false);
    setDeferredEditImageFiles([]);
    setSelectedEditPrimaryFile(null);
    setEditImageUploadJob(null);
    setPendingEditImageRefresh(null);
    setGeneratingEditImage(false);
    setPollingEditImage(false);
    setEditCategoryInput('');
    setEditForm({
      name: '',
      current_stock: '0',
      default_sale_price: '',
      cost_per_unit: '',
      pos_always_available: false,
      pos_best_seller_mode: 'auto',
      senior_pwd_discount_eligible: false,
      description: '',
      pos_category: '',
      manual_barcode: '',
      gtin: ''
    });
  };

  const openCreate = () => {
    setCreateForm(createEmptyPosItemForm());
    setCreateCategoryInput('');
    setSelectedImageFiles([]);
    setIsCreateImageDragActive(false);
    setManualBarcode('');
    setExternalBarcode('');
    setExternalLookupLoading(false);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    setExternalQrScannerOpen(false);
    setPendingCreateRecovery(null);
    setShowCreateModal(true);
  };

  const closeCreate = ({ force = false } = {}) => {
    if ((creatingItem || postCreateSaving) && !force) return;
    setShowCreateModal(false);
    setCreateForm(createEmptyPosItemForm());
    setCreateCategoryInput('');
    setSelectedImageFiles([]);
    setIsCreateImageDragActive(false);
    setManualBarcode('');
    setExternalBarcode('');
    setExternalLookupLoading(false);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    setExternalQrScannerOpen(false);
    if (force) setPendingCreateRecovery(null);
  };

  const parseMoneyValue = (rawValue) => Number(String(rawValue || '').trim());

  const getStageErrorMessage = (error) => (
    error?.response?.data?.message
    || error?.message
    || 'Unexpected error'
  );

  const handleSave = async () => {
    if (!activeEditItem) return;

    const editItemId = activeEditItem.item_id;
    let editSaveStage = 'item_details';
    const name = String(editForm.name || '').trim();
    const description = String(editForm.description || '').trim();
    const category = String(activeEditItem?.category || '').trim().toLowerCase() === 'service'
      ? 'service'
      : 'product';
    const stock = Number(String(editForm.current_stock || '0').trim());
    const price = parseMoneyValue(editForm.default_sale_price);
    const cost = parseMoneyValue(editForm.cost_per_unit);
    const barcodeSelection = resolveProductBarcodeInput({
      manualBarcode: editForm.manual_barcode,
      gtin: editForm.gtin
    });

    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Selling price is required.');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Cost price is required.');
      return;
    }
    if (price <= cost) {
      toast.error('Selling price must be greater than cost.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error('Stock quantity cannot be negative.');
      return;
    }
    if (barcodeSelection.validationMessage) {
      toast.error(barcodeSelection.validationMessage);
      return;
    }

    try {
      setItemSaveInFlight(true);
      setPersistingEditAssets(true);
      const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
      const currentFolderId = Number(activeEditItem.folder_id || 0);
      const currentFolderName = String(activeEditItem?.folder?.name || activeEditItem?.product_folder || '').trim();
      const typedCategoryName = String(editCategoryInput || '').trim().replace(/\s+/g, ' ');
      const foodCategory = resolveFoodCategorySelection(editForm.pos_category)
        || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));
      // Admins can type a brand-new category name (mirrors handleCreateItem) - but only treat it
      // as "create a new one" when it actually differs from the item's current category, so an
      // untouched field never gets misread as a create request.
      const categoryUnchanged = !foodCategory && normalizeFolderNameKey(typedCategoryName) === normalizeFolderNameKey(currentFolderName);
      const isTypingNewCategory = canManageCategories && !foodCategory && !categoryUnchanged && Boolean(typedCategoryName);
      if (!foodCategory && !currentFolderId && !isTypingNewCategory) {
        toast.error('Select an active category managed by an administrator.');
        return;
      }
      // foodCategory resolves to null whenever the item's current category is inactive
      // (foodCategoryOptions only lists active folders) even though the item still legitimately
      // has that folder assigned. Previously that silently dropped product_folder/folder_id from
      // the payload entirely, which cleared the item's category on every save. Fall back to the
      // item's existing folder so an untouched (inactive) category is preserved instead of wiped.
      const categoryPayload = foodCategory
        ? { product_folder: foodCategory.name, folder_id: foodCategory.folder_id }
        : isTypingNewCategory
          ? { create_category_name: typedCategoryName }
          : { product_folder: currentFolderName, folder_id: currentFolderId };
      await updateItem(editItemId, {
        name,
        category,
        description,
        ...categoryPayload,
        current_stock: resolvedStock,
        location_id: Number.isInteger(Number(operatingLocationId)) && Number(operatingLocationId) > 0
          ? Number(operatingLocationId)
          : null,
        product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
        mode_item_preset: category === 'product' ? posItemPreset.key : 'service',
        unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : 'service',
        fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : false,
        max_capacity: category === 'service' ? 1 : Math.max(resolvedStock, 1),
        min_threshold: category === 'service' ? 0 : Math.min(5, Math.max(resolvedStock, 0)),
        default_sale_price: price,
        cost_per_unit: cost,
        senior_pwd_discount_eligible: editForm.senior_pwd_discount_eligible === true
      });
      editSaveStage = 'pos_catalog';
      await updatePosCatalogOverride(editItemId, {
        pos_always_available: editForm.pos_always_available === true,
        pos_best_seller_mode: editForm.pos_best_seller_mode
      });
      editSaveStage = 'barcode';
      const existingPrimaryBarcode = primaryBarcodes[String(editItemId)] || activeEditItem?.primary_barcode || null;
      const existingPrimaryCode = normalizeBarcodeEntry(existingPrimaryBarcode?.code || '');
      await persistPosItemBarcode({
        itemId: editItemId,
        barcodeSelection,
        existingPrimaryBarcode,
        attachBarcode: attachItemBarcode,
        updateBarcode: updateItemBarcode
      });
      editSaveStage = 'refresh';
      closeEdit({ force: true });
      await Promise.all([loadItems(), loadPosFolders()]);
      notifyPosCatalogUpdated();
      setSavedMessage({
        name,
        barcode: barcodeSelection.shouldGenerate ? existingPrimaryCode : barcodeSelection.code,
        action: 'updated'
      });
    } catch (updateError) {
      toast.error(resolveEditItemSaveError(updateError, editSaveStage).message);
    } finally {
      setPersistingEditAssets(false);
      setItemSaveInFlight(false);
    }
  };

  const handleSelectCreateImageFiles = (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (normalizedFiles.length === 0) return;
    const remainingSlots = STOREFRONT_ITEM_IMAGE_MAX_COUNT - selectedImageFiles.length;
    if (remainingSlots <= 0) {
      toast.error(`Only ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} images are allowed per item.`);
      return;
    }
    if (normalizedFiles.length > remainingSlots) {
      toast.error(`Only ${remainingSlots} more item image${remainingSlots === 1 ? '' : 's'} can be selected.`);
    }
    setSelectedImageFiles((current) => [
      ...current,
      ...normalizedFiles.slice(0, remainingSlots)
    ]);
  };

  const removeSelectedCreateImageFile = (imageIndex) => {
    setSelectedImageFiles((current) => current.filter((_, index) => index !== imageIndex));
  };

  const handleCreateImageDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsCreateImageDragActive(false);
    if (creatingItem || postCreateSaving) return;

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    const imageFiles = droppedFiles.filter((file) => file.type?.startsWith('image/'));
    if (droppedFiles.length > imageFiles.length) {
      toast.error('Only image files can be added as item images.');
    }
    if (imageFiles.length > 0) {
      handleSelectCreateImageFiles(imageFiles);
      return;
    }

    const droppedUrl = String(event.dataTransfer?.getData('text/uri-list') || '')
      .split(/\r?\n/)
      .find((value) => value && !value.startsWith('#'));
    if (!droppedUrl || !/^https?:\/\//i.test(droppedUrl)) {
      toast.error('Drag the saved image from File Explorer into this box.');
      return;
    }

    try {
      const response = await fetch(droppedUrl);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Dropped URL is not an image');
      const urlName = new URL(droppedUrl).pathname.split('/').pop() || 'dragged-item-image';
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = urlName.includes('.') ? urlName : `${urlName}.${extension}`;
      handleSelectCreateImageFiles([new File([blob], filename, { type: blob.type })]);
    } catch {
      toast.error('Chrome blocked access to that image. Save it first, then drag it from File Explorer.');
    }
  };

  const handleExternalBarcodeChange = (value) => {
    const normalized = normalizeBarcodeEntry(value);
    setExternalBarcode(normalized);
    if (normalized !== externalProductLookup?.code) {
      setExternalLookupError('');
      setExternalProductLookup(null);
      setAcceptedExternalProduct(null);
    }
  };

  const handleExternalProductLookup = async (codeOverride) => {
    if (externalLookupLoading) return;
    const lookupCode = typeof codeOverride === 'string' ? codeOverride : externalBarcode;
    const validationMessage = getGtinValidationMessage(lookupCode);
    if (validationMessage) {
      setExternalLookupError(validationMessage);
      return;
    }

    setExternalLookupLoading(true);
    setExternalLookupError('');
    setExternalProductLookup(null);
    setAcceptedExternalProduct(null);
    try {
      const result = await lookupExternalProduct(lookupCode);
      setExternalProductLookup(result);
      if (!result?.found) {
        setExternalLookupError('Barcode captured. No registry details were found. Complete the remaining item details; this barcode will still be saved.');
      }
    } catch (lookupError) {
      setExternalLookupError(
        lookupError?.response?.data?.message
        || 'The product registry is unavailable. Complete the item manually; this valid barcode will still be saved.'
      );
    } finally {
      setExternalLookupLoading(false);
    }
  };

  const handleExternalQrDetected = (code) => {
    setExternalQrScannerOpen(false);
    handleExternalBarcodeChange(code);
    void handleExternalProductLookup(code);
  };

  const applyExternalProductDetails = () => {
    if (!externalProductLookup?.found) return;
    const product = externalProductLookup.product || {};
    const descriptionParts = [product.brand, product.quantity].filter(Boolean);
    const categorySuggestion = String(product.category_suggestion || '').trim().replace(/\s+/g, ' ').slice(0, 100);
    const matchedCategory = categorySuggestion
      ? foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(categorySuggestion))
      : null;
    setCreateForm((current) => ({
      ...current,
      name: product.name || current.name,
      description: current.description || descriptionParts.join(' - '),
      pos_category: matchedCategory?.value || current.pos_category
    }));
    if (matchedCategory) {
      setCreateCategoryInput(matchedCategory.name);
    } else if (categorySuggestion && canManageCategories) {
      setCreateCategoryInput(categorySuggestion);
      setCreateForm((current) => ({ ...current, pos_category: '' }));
    } else if (categorySuggestion && !canManageCategories) {
      setExternalLookupError('Product details selected. Choose an existing category; only an administrator can create the suggested category.');
    }
    setAcceptedExternalProduct(externalProductLookup);
  };

  const applyExternalSuggestedPrice = () => {
    const amount = Number(externalProductLookup?.suggested_price?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setCreateForm((current) => ({ ...current, default_sale_price: String(amount.toFixed(2)) }));
  };

  const handleSelectEditImageFile = (files) => {
    const normalizedFiles = Array.isArray(files) ? files.filter(Boolean) : (files ? [files] : []);
    const itemId = Number(activeEditItem?.item_id || 0);
    if (normalizedFiles.length === 0 || !itemId) return;
    if (editImageUploadJob || pendingEditImageRefresh) {
      toast.info('The previous image is still being optimized. It will be replaced automatically when ready.');
      return;
    }
    const existingGalleryCount = normalizeStorefrontItemGallery(activeEditItem || {}).length;
    const filesToPreview = normalizedFiles.slice(0, STOREFRONT_ITEM_IMAGE_MAX_COUNT);
    if (normalizedFiles.length > filesToPreview.length) {
      toast.error(`Only ${STOREFRONT_ITEM_IMAGE_MAX_COUNT} pending images can be selected at once.`);
    }

    // Always mount the local preview first. If legacy data already exceeds
    // the gallery limit, the selected files stay deferred until the operator
    // removes enough existing images; no existing image is deleted silently.
    setSelectedEditImageFiles(filesToPreview);
    setDeferredEditImageFiles(filesToPreview);
    setSelectedEditPrimaryFile(null);
    if (existingGalleryCount >= STOREFRONT_ITEM_IMAGE_MAX_COUNT) {
      toast.info('Preview shown. Remove existing images to make room; upload will continue automatically.');
    }
  };

  const handleEditImageDrop = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsEditImageDragActive(false);
    if (savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh) return;

    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    const imageFiles = droppedFiles.filter((file) => file.type?.startsWith('image/'));
    if (droppedFiles.length > imageFiles.length) {
      toast.error('Only image files can be added as item images.');
    }
    if (imageFiles.length > 0) {
      handleSelectEditImageFile(imageFiles);
      return;
    }

    const droppedUrl = String(event.dataTransfer?.getData('text/uri-list') || '')
      .split(/\r?\n/)
      .find((value) => value && !value.startsWith('#'));
    if (!droppedUrl || !/^https?:\/\//i.test(droppedUrl)) {
      toast.error('Drag the saved image from File Explorer into this box.');
      return;
    }

    try {
      const response = await fetch(droppedUrl);
      if (!response.ok) throw new Error(`Image request failed with ${response.status}`);
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('Dropped URL is not an image');
      const urlName = new URL(droppedUrl).pathname.split('/').pop() || 'dragged-item-image';
      const extension = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg';
      const filename = urlName.includes('.') ? urlName : `${urlName}.${extension}`;
      handleSelectEditImageFile([new File([blob], filename, { type: blob.type })]);
    } catch {
      toast.error('Chrome blocked access to that image. Save it first, then drag it from File Explorer.');
    }
  };

  const handleRemoveSelectedEditImageFile = (imageIndex) => {
    const removedFile = selectedEditImageFiles[imageIndex];
    if (removedFile === selectedEditPrimaryFile) {
      setSelectedEditPrimaryFile(null);
    }
    setSelectedEditImageFiles((current) => current.filter((_, index) => index !== imageIndex));
    setDeferredEditImageFiles((current) => current.filter((_, index) => index !== imageIndex));
  };

  const handleSetPendingEditPrimary = (file) => {
    setSelectedEditPrimaryFile(file || null);
  };

  const handleSetSavedEditPrimary = async (imageIndex) => {
    setSelectedEditPrimaryFile(null);
    await handleSetPrimaryStorefrontImage(activeEditItem, imageIndex);
  };

  const handleRemoveSavedEditImage = async (imageIndex) => {
    await handleDeleteStorefrontImage(activeEditItem, imageIndex);
  };

  const handleSetPrimaryStorefrontImage = async (item, imageIndex) => {
    const itemId = item?.item_id;
    if (!itemId) return;
    const current = normalizeStorefrontItemGallery(item);
    const normalizedImageIndex = Number.parseInt(imageIndex, 10);
    if (!Number.isInteger(normalizedImageIndex) || normalizedImageIndex <= 0 || normalizedImageIndex >= current.length) return;
    const nextGallery = [
      current[normalizedImageIndex],
      ...current.filter((_, index) => index !== normalizedImageIndex)
    ].map((entry, index) => ({ ...entry, is_primary: index === 0, sort_order: index }));

    try {
      await updateStorefrontCatalogGallery(itemId, nextGallery);
      await loadItems();
      toast.success(`Primary item image updated for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update primary item image');
    }
  };

  const handleDeleteStorefrontImage = async (item, imageIndex = null) => {
    const itemId = item?.item_id;
    if (!itemId) return;

    try {
      const normalizedImageIndex = Number.parseInt(imageIndex, 10);
      const isSingleImageDelete = Number.isInteger(normalizedImageIndex) && normalizedImageIndex >= 0;
      if (isSingleImageDelete) {
        const currentGallery = normalizeStorefrontItemGallery(item);
        if (normalizedImageIndex >= currentGallery.length) {
          toast.error('This item image is no longer available. Reopen the item and try again.');
          return;
        }
        const nextGallery = currentGallery
          .filter((_, index) => index !== normalizedImageIndex)
          .map((entry, index) => ({ ...entry, is_primary: index === 0, sort_order: index }));
        await updateStorefrontCatalogGallery(itemId, nextGallery);
      } else {
        await deleteStorefrontCatalogImage(itemId);
      }
      await loadItems();
      toast.success(isSingleImageDelete ? `Item gallery image removed for ${item.name}` : `Item image removed for ${item.name}`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove item image');
    }
  };

  // The POST only confirms the item was queued, not that a photo exists yet
  // (#199/#200) — generation happens minutes later in itemImageWorker.js.
  // What used to be a fire-and-forget "queued" toast with no way to learn
  // the outcome now polls the status endpoint (itemImageStatusStore.js)
  // until the worker records a terminal result, so the operator actually
  // finds out whether the photo landed — no manual save step either way,
  // the worker attaches it directly.
  const handleGenerateEditImage = async (item) => {
    const itemId = item?.item_id;
    if (!itemId) return;

    setGeneratingEditImage(true);
    try {
      await generateStorefrontCatalogImage(itemId);
      setGeneratingEditImage(false);
      setPollingEditImage(true);

      const result = await pollItemImageGeneration(itemId);
      if (result.status === 'cancelled') return; // modal closed mid-poll — no toast for an item no longer in view
      if (result.status === 'completed') {
        await loadItems();
        notifyPosCatalogUpdated();
        toast.success(`Image generated for ${item.name}.`);
      } else if (result.status === 'failed') {
        toast.error(`Image generation failed for ${item.name}${result.error_message ? `: ${result.error_message}` : '.'}`);
      } else {
        toast.error(`Still working on ${item.name}'s image — check back in a bit.`);
      }
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to queue image generation');
    } finally {
      setGeneratingEditImage(false);
      setPollingEditImage(false);
    }
  };

  const runPostCreateStages = async ({
    itemId,
    itemName,
    imageFiles,
    externalProductCode = '',
    requestedBarcodeCode = '',
    posAlwaysAvailable,
    posBestSellerMode = 'auto',
    retryStageKeys = null,
    imageAttemptId = null
  }) => {

    const failedStages = [];
    let barcodeCode = String(requestedBarcodeCode || '').trim();

    const runStage = async (key, label, action) => {
      if (retryStageKeys instanceof Set && !retryStageKeys.has(key)) return null;
      try {
        return await action();
      } catch (error) {
        failedStages.push({
          key,
          label,
          message: getStageErrorMessage(error),
          readinessBlocked: error?.is_pos_readiness_blocked === true,
          missingRequirements: Array.isArray(error?.missing_requirements)
            ? error.missing_requirements
            : []
        });
        return null;
      }
    };

    if (Array.isArray(imageFiles) && imageFiles.length > 0) {
      const imageUploadJob = await runStage(
        'storefront_images',
        imageFiles.length === 1 ? 'Item image upload' : 'Item image gallery upload',
        () => (imageFiles.length === 1
          ? queueStorefrontCatalogImage(itemId, imageFiles[0])
          : queueStorefrontCatalogImages(itemId, imageFiles))
      );

      // The local primary preview remains visible while the accepted job runs.
      // Authorized catalog refreshes reconcile it with the stored image later,
      // so item creation never waits for every gallery variant to be encoded.
      if (imageUploadJob?.job_id) {
        bindPendingPosItemImagePreviewJob({
          itemId,
          attemptId: imageAttemptId,
          jobId: imageUploadJob.job_id
        });
      } else if (imageAttemptId) {
        markPendingPosItemImagePreviewFailed({ itemId, attemptId: imageAttemptId });
      }
    } else if (externalProductCode) {
      await runStage(
        'external_product_image',
        'Registry image import',
        () => importExternalStorefrontCatalogImage(itemId, externalProductCode)
      );
    }

    if (!barcodeCode) {
      const generatedBarcode = await runStage('barcode', 'barcode generation', () => generateItemBarcode(itemId, {
        scope: 'pos',
        packaging_level: 'unit'
      }));
      barcodeCode = String(generatedBarcode?.code || generatedBarcode?.barcode?.code || '').trim();
    }

    await runStage('storefront_visibility', 'Storefront visibility', () => updateStorefrontCatalogOverride(itemId, { storefront_visible: true }));
    await runStage('always_available', 'Always Available', () => updatePosCatalogOverride(itemId, {
      pos_always_available: posAlwaysAvailable === true
    }));
    await runStage('best_seller_mode', 'Best Seller', () => updatePosCatalogOverride(itemId, {
      pos_best_seller_mode: ['force', 'never'].includes(String(posBestSellerMode || '').toLowerCase())
        ? String(posBestSellerMode).toLowerCase()
        : 'auto'
    }));
    await runStage('pos_visibility', 'POS visibility', () => updatePosCatalogOverride(itemId, {
      pos_visible: true,
      location_id: operatingLocationId
    }));

    if (failedStages.length > 0) {
      setPendingCreateRecovery({
        itemId,
        name: itemName,
        imageFiles: failedStages.some((stage) => stage.key === 'storefront_images') ? imageFiles : [],
        externalProductCode,
        requestedBarcodeCode: barcodeCode,
        posAlwaysAvailable,
        posBestSellerMode,
        imageAttemptId,
        failedStages
      });
      const labels = failedStages.map((stage) => stage.label).join(', ');
      throw new Error(`${itemName} was created, but setup needs attention: ${labels}. Your item was saved and will not be duplicated.`);
    }

    setPendingCreateRecovery(null);
    return { barcodeCode };
  };

  const handleCreateItem = async () => {
    const name = String(createForm.name || '').trim();
    const description = String(createForm.description || '').trim();
    const category = 'product';
    const price = parseMoneyValue(createForm.default_sale_price);
    const cost = parseMoneyValue(createForm.cost_per_unit);
    const stock = Number(String(createForm.current_stock || '0').trim());
    const skuCode = String(createForm.sku_code || '').trim();
    const typedCategoryName = String(createCategoryInput || '').trim().replace(/\s+/g, ' ');
    const foodCategory = resolveFoodCategorySelection(createForm.pos_category)
      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(typedCategoryName));

    if (!name) {
      toast.error('Item name is required.');
      return;
    }
    if (!skuCode) {
      toast.error('SKU is not ready yet. Add an item name first.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      toast.error('Selling price is required.');
      return;
    }
    if (!Number.isFinite(cost) || cost < 0) {
      toast.error('Cost price is required.');
      return;
    }
    if (price <= cost) {
      toast.error('Selling price must be greater than cost.');
      return;
    }
    if (!Number.isFinite(stock) || stock < 0) {
      toast.error('Stock quantity cannot be negative.');
      return;
    }

    if (!foodCategory?.folder_id && !typedCategoryName) {
      toast.error('Select an active category or enter a new category name.');
      return;
    }
    if (!foodCategory?.folder_id && !canManageCategories) {
      toast.error('Admin access is required to create a new category.');
      return;
    }

    const barcodeSelection = resolveProductBarcodeInput({ manualBarcode, gtin: externalBarcode });
    if (barcodeSelection.validationMessage) {
      setExternalLookupError(barcodeSelection.validationMessage);
      toast.error(barcodeSelection.validationMessage);
      return;
    }

    const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
    const payload = {
      sku_code: skuCode,
      name,
      category,
      product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
      mode_item_preset: category === 'product' ? posItemPreset.key : undefined,
      ...(foodCategory?.folder_id
        ? { product_folder: foodCategory.name, folder_id: foodCategory.folder_id }
        : { create_category_name: typedCategoryName }),
      description,
      current_stock: resolvedStock,
      location_id: Number.isInteger(Number(operatingLocationId)) && Number(operatingLocationId) > 0
        ? Number(operatingLocationId)
        : null,
      max_capacity: Math.max(resolvedStock, 1),
      min_threshold: Math.min(5, Math.max(resolvedStock, 0)),
      purchase_allowance: 0,
      unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : 'pcs',
      cost_per_unit: cost,
      default_sale_price: price,
      fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : true,
      vat_type: 'vatable',
      senior_pwd_discount_eligible: createForm.senior_pwd_discount_eligible === true,
      ...(barcodeSelection.code
        ? barcodeSelection.kind === 'manual'
          ? { internal_barcode: { code: barcodeSelection.code } }
          : { manufacturer_barcode: { code: barcodeSelection.code, scope: 'pos' } }
        : {}),
      status: 'active'
    };

    if (!isOnline) {
      if (selectedImageFiles.length > 0) {
        toast.error('Item images require an online connection. Remove the image and save this item as an offline draft.');
        return;
      }
      try {
        await onQueueOfflineItemDraft({
          ...payload,
          pos_always_available: createForm.pos_always_available === true
        });
        closeCreate({ force: true });
        toast.success('Offline item draft saved. Press Sync to create it when you are online.');
      } catch (queueError) {
        toast.error(queueError?.message || 'Failed to save the offline item draft.');
      }
      return;
    }

    const finalizeCreatedItem = async ({ barcode = '', warningMessage = '', action = 'created' } = {}) => {
      closeCreate({ force: true });
      await Promise.all([loadItems(), loadPosFolders()]);
      notifyPosCatalogUpdated();
      setSavedMessage({ name, barcode, action });
      if (warningMessage) {
        toast.warning(warningMessage);
      }
    };

    try {
      setItemSaveInFlight(true);
      setPostCreateSaving(true);
      if (pendingCreateRecovery?.itemId) {
        const recoveryName = pendingCreateRecovery.name || name;
        const recoveryItemPatch = { ...payload };
        delete recoveryItemPatch.manufacturer_barcode;
        delete recoveryItemPatch.internal_barcode;
        delete recoveryItemPatch.create_category_name;
        await updateItem(pendingCreateRecovery.itemId, recoveryItemPatch);
        const retryStageKeys = new Set([
          ...pendingCreateRecovery.failedStages.map((stage) => stage.key),
          'always_available',
          'best_seller_mode'
        ]);
        const result = await runPostCreateStages({
          itemId: pendingCreateRecovery.itemId,
          itemName: recoveryName,
          imageFiles: pendingCreateRecovery.imageFiles || [],
          externalProductCode: pendingCreateRecovery.externalProductCode || '',
          requestedBarcodeCode: pendingCreateRecovery.requestedBarcodeCode || '',
          posAlwaysAvailable: createForm.pos_always_available === true,
          posBestSellerMode: createForm.pos_best_seller_mode,
          retryStageKeys,
          imageAttemptId: pendingCreateRecovery.imageAttemptId || null
        });
        await finalizeCreatedItem({
          barcode: result.barcodeCode,
          action: 'created',
          warningMessage: `${recoveryName} setup completed.`
        });
        toast.success('POS item setup resumed successfully.');
        return;
      }

      const createdItem = await createItem(payload);
      const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new Error('Item was created but no valid item ID was returned.');
      }

      if (foodCategory?.folder_id && Number(createdItem?.folder_id || 0) !== foodCategory.folder_id) {
        await updateItem(itemId, {
          product_folder: foodCategory.name,
          folder_id: foodCategory.folder_id
        });
      }

      const imageAttemptId = selectedImageFiles[0]
        ? stagePendingPosItemImagePreview({ itemId, file: selectedImageFiles[0] })
        : null;

      const result = await runPostCreateStages({
        itemId,
        itemName: name,
        imageFiles: selectedImageFiles,
        externalProductCode: selectedImageFiles.length === 0 && acceptedExternalProduct?.product?.image_url
          ? acceptedExternalProduct.code
          : '',
        requestedBarcodeCode: barcodeSelection.code,
        posAlwaysAvailable: createForm.pos_always_available === true,
        posBestSellerMode: createForm.pos_best_seller_mode,
        imageAttemptId
      });

      await finalizeCreatedItem({ barcode: result.barcodeCode });
      toast.success('POS item created.');
    } catch (createError) {
      if (pendingCreateRecovery?.itemId || /setup needs attention/i.test(String(createError?.message || ''))) {
        await loadItems().catch(() => {});
        toast.warning(createError.message);
      } else {
        toast.error(createError?.response?.data?.message || createError?.message || 'Failed to create item.');
      }
    } finally {
      setPostCreateSaving(false);
      setItemSaveInFlight(false);
    }
  };

  const closeDeleteConfirm = () => {
    if (deletingItem) return;
    setDeleteConfirmItem(null);
  };

  const handleDelete = async (item = deleteConfirmItem) => {
    if (!item?.item_id) return;
    const itemName = String(item?.name || 'this item').trim();
    try {
      await deleteItem(item.item_id);
      closeDeleteConfirm();
      if (Number(editingItemId) === Number(item.item_id)) {
        closeEdit();
      }
      await loadItems();
      setDeletedItemName(itemName);
    } catch (deleteError) {
      toast.error(deleteError?.response?.data?.message || 'Failed to delete item.');
    }
  };

  if (!canViewPos) {
    return (
      <p id={sectionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You need POS view permission to access SKUpervisor items.
      </p>
    );
  }

  return (
    <div id={sectionId} className="min-w-0 max-w-full space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70">
        <div className="hidden w-full gap-3 sm:grid xl:w-auto xl:grid-cols-[minmax(18rem,24rem)_12rem_13rem_auto]">
            <div>
              <Label htmlFor="pos-items-search" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Search</Label>
              <Input
                id="pos-items-search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by item name, SKU, or barcode"
                className="mt-2 h-11 rounded-xl border-slate-200 bg-slate-50/70"
              />
            </div>
            <div>
              <Label htmlFor="pos-items-category-filter" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Category</Label>
              <select
                id="pos-items-category-filter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {categoryOptionLabels.get(option) || option}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="pos-items-stock-filter" className="text-xs font-semibold uppercase tracking-[0.18em] text-[#64748B]">Stock</Label>
              <select
                id="pos-items-stock-filter"
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-slate-50/70 px-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
              >
                <option value="all">All stock</option>
                <option value="in_stock">In stock</option>
                <option value="low_stock">Low stock</option>
                <option value="almost_out">Almost out of stock</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </div>
            {canCreateItems ? (
              <Button
                type="button"
                onClick={openCreate}
                disabled={locked || creatingItem}
                className="h-11 rounded-xl bg-[#1A4E8D] px-5 text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73] xl:self-end"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Item
              </Button>
            ) : null}
            {canImportItems ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCsvImport(true)}
                disabled={locked || !isOnline}
                title={!isOnline ? 'Reconnect to import items.' : 'Import items using the IMS CSV template.'}
                className="h-11 rounded-xl border-[#1A4E8D]/30 px-5 text-[#1A4E8D] shadow-sm hover:bg-[#1A4E8D]/5 xl:self-end"
              >
                <Upload className="mr-2 h-4 w-4" />
                Import Items
              </Button>
            ) : null}
            {isServicesMode && canManageServiceCatalog ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateServiceModal(true)}
                disabled={locked}
                className="h-11 rounded-xl border-teal-600/30 px-5 text-teal-700 shadow-sm hover:bg-teal-50 xl:self-end"
              >
                <CalendarPlus className="mr-2 h-4 w-4" />
                Add Service
              </Button>
            ) : null}
            {canCreateItems && menuImportEntryEnabled ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowPdfMenuImport(true)}
                disabled={locked}
                className="h-11 rounded-xl border-[#1A4E8D]/30 px-5 text-[#1A4E8D] shadow-sm hover:bg-[#1A4E8D]/5 xl:self-end"
              >
                <Upload className="mr-2 h-4 w-4" />
                {menuImportButtonLabel}
              </Button>
            ) : null}
        </div>

        <div className="sm:hidden">
          {isMobileSearchActive ? (
            <div className="flex items-center gap-2">
              <Input
                id="pos-items-search-mobile"
                autoFocus
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search by item name, SKU, or barcode"
                className="h-11 min-w-0 flex-1 rounded-xl border-slate-200 bg-slate-50/70"
              />
              <button
                type="button"
                onClick={() => setIsMobileSearchActive(false)}
                aria-label="Close search"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMobileSearchActive(true)}
                aria-label="Search items"
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-slate-50/70 text-[#1A4E8D]"
              >
                <Search className="h-5 w-5" />
              </button>
              <select
                id="pos-items-category-filter-mobile"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-2 text-xs text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
              >
                {categoryOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'all' ? 'All Filters' : option}
                  </option>
                ))}
              </select>
              <select
                id="pos-items-stock-filter-mobile"
                value={stockFilter}
                onChange={(event) => setStockFilter(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50/70 px-2 text-xs text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
              >
                <option value="all">All Stock</option>
                <option value="in_stock">In stock</option>
                <option value="low_stock">Low stock</option>
                <option value="almost_out">Almost out</option>
                <option value="out_of_stock">Out of stock</option>
              </select>
            </div>
          )}
          {canCreateItems ? (
            <Button
              type="button"
              onClick={openCreate}
              disabled={locked || creatingItem}
              className="mt-2 h-11 w-full rounded-xl bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/15 hover:bg-[#143F73]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          ) : null}
          {canImportItems ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCsvImport(true)}
              disabled={locked || !isOnline}
              title={!isOnline ? 'Reconnect to import items.' : 'Import items using the IMS CSV template.'}
              className="mt-2 h-11 w-full rounded-xl border-[#1A4E8D]/30 text-[#1A4E8D] hover:bg-[#1A4E8D]/5"
            >
              <Upload className="mr-2 h-4 w-4" />
              Import Items
            </Button>
          ) : null}
          {isServicesMode && canManageServiceCatalog ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateServiceModal(true)}
              disabled={locked}
              className="mt-2 h-11 w-full rounded-xl border-teal-600/30 text-teal-700 hover:bg-teal-50"
            >
              <CalendarPlus className="mr-2 h-4 w-4" />
              Add Service
            </Button>
          ) : null}
          {canCreateItems && menuImportEntryEnabled ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPdfMenuImport(true)}
              disabled={locked}
              className="mt-2 h-11 w-full rounded-xl border-[#1A4E8D]/30 text-[#1A4E8D] hover:bg-[#1A4E8D]/5"
            >
              <Upload className="mr-2 h-4 w-4" />
              {menuImportButtonLabel}
            </Button>
          ) : null}
        </div>
      </div>

      {canCreateItems && menuImportBatchEnabled ? (
        <MenuImportBatchModal
          open={showPdfMenuImport}
          onClose={() => setShowPdfMenuImport(false)}
          onSuccess={() => { loadItems(); }}
        />
      ) : canCreateItems && pdfMenuImportEnabled ? (
        <PdfMenuImportModal
          open={showPdfMenuImport}
          onClose={() => setShowPdfMenuImport(false)}
          onSuccess={() => { loadItems(); }}
        />
      ) : null}

      {canImportItems ? (
        <CSVImportModal
          open={showCsvImport}
          onClose={() => setShowCsvImport(false)}
          onSuccess={async () => {
            await Promise.all([loadItems(), loadPosFolders()]);
            notifyPosCatalogUpdated();
          }}
        />
      ) : null}

      <PosServiceCatalogCreateModal
        open={showCreateServiceModal}
        isOnline={isOnline}
        onClose={() => setShowCreateServiceModal(false)}
        onCreated={async () => {
          await loadItems();
          notifyPosCatalogUpdated();
        }}
      />

      <PosServiceCatalogEditModal
        open={Boolean(editingServiceItem)}
        serviceItem={editingServiceItem}
        isOnline={isOnline}
        onClose={() => setEditingServiceItem(null)}
        onUpdated={async (updatedService) => {
          setEditingServiceItem(null);
          await loadItems();
          notifyPosCatalogUpdated();
          setSavedMessage({
            name: updatedService?.service?.name || updatedService?.name || editingServiceItem?.name || 'Service',
            barcode: '',
            action: 'updated'
          });
        }}
      />

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : null}

      {loading && filteredItems.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-500">Loading POS-visible IMS items...</p>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center shadow-sm shadow-slate-200/60">
          <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-base font-black text-[#0F172A]">
            {hasActiveItemsFilters ? 'No matching items' : 'No POS items found'}
          </p>
          <p className="mt-1 text-sm text-[#64748B]">
            {hasActiveItemsFilters
              ? 'Try changing your search or filters.'
              : 'Only IMS items with POS visibility enabled appear here.'}
          </p>
          {canCreateItems && !hasActiveItemsFilters && (
            <Button
              type="button"
              onClick={openCreate}
              disabled={locked || creatingItem}
              className="mt-4 h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
            >
              <Plus className="mr-2 h-4 w-4" />
              Add your first POS item
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {paginatedItems.map((item) => {
            const isServiceItem = isServiceCatalogItem(item);
            const barcode = primaryBarcodes[String(item.item_id)]?.code || '';
            const imageSources = resolvePosCatalogImageSources(item);
            const previewSources = resolvePosCatalogPreviewGallery(item);
            const stockQuantity = Number(item?.current_stock || 0);
            const isAlwaysAvailable = item?.pos_always_available === true;
            const profit = Number(item?.default_sale_price || 0) - Number(item?.cost_per_unit || 0);
            const profitMargin = Number(item?.default_sale_price || 0) > 0
              ? (profit / Number(item.default_sale_price)) * 100
              : 0;
            const threshold = Number(item?.min_threshold);
            const lowStockThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
            const almostOutOfStock = !isAlwaysAvailable && stockQuantity > 0 && stockQuantity <= lowStockThreshold;
            const stockStatusLabel = isServiceItem
              ? 'Stock Exempt'
              : isAlwaysAvailable
              ? 'Always Available'
              : stockQuantity <= 0 ? 'Out of Stock' : almostOutOfStock ? 'Almost Out of Stock' : 'In Stock';
            const stockStatusClassName = isServiceItem
              ? 'border-teal-200 bg-teal-50 text-teal-700'
              : isAlwaysAvailable
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : stockQuantity <= 0
              ? 'border-rose-200 bg-rose-50 text-rose-600'
              : almostOutOfStock
                ? 'border-amber-200 bg-amber-50 text-amber-700'
                : 'border-emerald-200 bg-emerald-50 text-emerald-700';

            return (
              <div
                key={item.item_id}
                className="rounded-[18px] border border-slate-100 bg-white p-2.5 shadow-[0_8px_20px_rgba(148,163,184,0.08)] transition-shadow hover:shadow-[0_12px_24px_rgba(148,163,184,0.12)] sm:p-3"
              >
                <div className="grid gap-2.5 xl:grid-cols-[minmax(0,1.18fr)_minmax(18.5rem,0.96fr)] xl:items-center">
                  <div className="flex min-w-0 gap-2.5 xl:border-r xl:border-slate-100 xl:pr-3">
                    <button
                      type="button"
                      disabled={previewSources.gallery.length === 0}
                      aria-label={previewSources.gallery.length > 0 ? `View ${item.name || 'item'} image` : undefined}
                      onClick={() => setItemImagePreview({
                        itemName: item.name,
                        sellingPrice: item.default_sale_price,
                        gallery: previewSources.gallery
                      })}
                      className="relative flex h-[4rem] w-[4rem] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 enabled:cursor-zoom-in sm:h-[4.5rem] sm:w-[4.5rem]"
                    >
                      <ImagePlus className="h-5 w-5 text-slate-300" />
                      {imageSources.src ? (
                        <ResponsiveImage
                          sources={imageSources}
                          alt={item?.name || 'Item image'}
                          sizes="72px"
                          width={288}
                          height={288}
                          className="absolute h-full w-full object-cover"
                          onError={(event) => {
                            if (advanceAssetImageFallback(event, [imageSources.configuredLargeSrc])) return;
                            event.currentTarget.hidden = true;
                          }}
                        />
                      ) : null}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-h-full flex-col">
                        <div className="min-h-[2.875rem]">
                          <div className="min-w-0 max-w-[15rem]">
                            <p className="truncate text-base font-black leading-5 tracking-tight text-[#0F172A]">{item.name || 'Unnamed item'}</p>
                            <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-[#64748B]">{isServiceItem ? 'Service catalog entry' : 'Inventory item synced from IMS'}</p>
                          </div>
                        </div>
                        <div className="my-2.5 h-px bg-slate-100" />
                        <div className="space-y-2 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-blue-50 to-blue-100/70 text-[#2563EB]">
                              <Tags className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-2">
                                <p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">SKU</p>
                                <p className="truncate text-xs font-bold text-[#0F172A]">{item.sku_code || 'Not set'}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex min-w-0 items-center gap-2 md:border-l md:border-slate-100 md:pl-3">
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] bg-gradient-to-br from-blue-50 to-blue-100/70 text-[#2563EB]">
                              <Barcode className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-col gap-1 md:flex-row md:items-center md:gap-2">
                                <p className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Barcode</p>
                                <p className="truncate text-xs font-bold text-[#0F172A]">{barcode || 'Not generated yet'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-2 xl:grid-cols-[minmax(15.25rem,1.16fr)_minmax(14.5rem,0.98fr)] xl:items-stretch">
                    <div className="rounded-[14px] border border-slate-200 bg-white px-3.5 py-2 shadow-[0_4px_10px_rgba(15,23,42,0.03)]">
                      <div className="grid gap-2">
                        <div className="flex items-start gap-2">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br from-blue-50 to-blue-100/70 text-[#2563EB]">
                            <ClipboardList className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Category</p>
                            {/* Reflects the item's food category (POS folder) - item.category is
                                a fixed inventory enum (always "product" here), not what the Food
                                Category field on the item form actually sets. */}
                            <p className="mt-0.5 truncate text-xs font-bold text-[#0F172A]">{isServiceItem ? 'Service' : (item.folder?.name || item.product_folder || 'Uncategorized')}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Stock</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-bold text-[#0F172A]">{isServiceItem ? '—' : stockQuantity}</p>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${stockStatusClassName}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                                {stockStatusLabel}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">{isServiceItem && item.cost_per_unit == null ? 'Internal Cost' : 'Profit'}</p>
                            <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                              {isServiceItem && item.cost_per_unit == null
                                ? 'Not tracked'
                                : <>PHP {money(profit)} <span className="text-[#2563EB]">({Number.isFinite(profitMargin) ? profitMargin.toFixed(1) : '0.0'}%)</span></>}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid min-w-0 gap-2">
                      <div className="overflow-hidden rounded-[14px] border border-slate-200 bg-white shadow-[0_4px_10px_rgba(15,23,42,0.04)]">
                        <div className="grid min-w-0 grid-cols-2">
                          <div className="flex min-w-0 items-center bg-gradient-to-br from-blue-50 via-white to-blue-50/40 px-3 py-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[#2563EB]">
                                <Receipt className="h-[15px] w-[15px]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Price</p>
                                <div className="mt-0.5 min-w-0 leading-none">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#1A4E8D]">PHP</p>
                                  <p className="text-[0.95rem] font-black tracking-tight text-[#1A4E8D]">{money(item.default_sale_price)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="flex min-w-0 items-center border-l border-slate-200 bg-gradient-to-br from-emerald-50 via-white to-emerald-50/40 px-3 py-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                <CircleDollarSign className="h-[15px] w-[15px]" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Cost</p>
                                <div className="mt-0.5 min-w-0 leading-none">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700">{isServiceItem && item.cost_per_unit == null ? 'OPTIONAL' : 'PHP'}</p>
                                  <p className="text-[0.95rem] font-black tracking-tight text-emerald-700">{isServiceItem && item.cost_per_unit == null ? 'Not tracked' : money(item.cost_per_unit)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 sm:items-stretch">
                        {(isServiceItem ? canManageServiceCatalog : canEditItems) && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openEdit(item)}
                            disabled={locked || savingItem || deletingItem || creatingItem || (isServiceItem && !isOnline)}
                            className="h-8.5 rounded-[14px] border-[#3B82F6] bg-white px-3 text-xs font-bold text-[#2563EB] shadow-sm hover:bg-blue-50"
                            title={`Edit ${item.name || 'item'}`}
                          >
                            <Pencil className="mr-1.5 h-3.5 w-3.5" />
                            Edit
                          </Button>
                        )}
                        {canDeleteItems && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setDeleteConfirmItem(item)}
                            disabled={locked || savingItem || deletingItem || creatingItem}
                            className="h-8.5 rounded-[14px] border-rose-300 bg-white px-3 text-xs font-bold text-rose-600 shadow-sm hover:bg-rose-50"
                            title={`Delete ${item.name || 'item'}`}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm shadow-slate-200/60 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-[#64748B]">
              Showing {itemsTotal === 0 ? 0 : ((currentItemsPage - 1) * POS_ITEMS_PAGE_SIZE) + 1}–{Math.min(currentItemsPage * POS_ITEMS_PAGE_SIZE, itemsTotal)} of {itemsTotal} items
            </p>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setItemsPage((page) => Math.max(1, page - 1))}
                disabled={currentItemsPage === 1}
                aria-label="Previous items page"
              >
                Previous
              </Button>
              <span className="min-w-[5.5rem] text-center text-sm font-semibold text-[#0F172A]">
                Page {currentItemsPage} of {totalItemsPages}
              </span>
              <Button
                type="button"
                variant="outline"
                onClick={() => setItemsPage((page) => Math.min(totalItemsPages, page + 1))}
                disabled={currentItemsPage === totalItemsPages}
                aria-label="Next items page"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      )}

      <PosItemImageViewer preview={itemImagePreview} onClose={() => setItemImagePreview(null)} />

      {showCreateModal && typeof document !== 'undefined' && createPortal((
        <div
          className="pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 backdrop-blur-sm px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-create-modal-title"
          onClick={closeCreate}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <div
            className="relative flex h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-950/20 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 bg-[#0F172A] px-5 py-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                  <ShoppingBag className="h-5.5 w-5.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p id="pos-items-create-modal-title" className="text-base font-extrabold text-white sm:text-lg">Add POS Item</p>
                  <p className="mt-0.5 text-xs text-slate-300">
                    This creates a POS item and enables storefront visibility on the same record.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCreate}
                disabled={creatingItem || postCreateSaving}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-transparent px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-6 bg-white">
              <section className="mb-5 space-y-3 rounded-xl border border-blue-200 bg-blue-50/70 p-4" aria-labelledby="pos-external-barcode-heading">
                <div className="flex items-start gap-3">
                  <div className="rounded-lg bg-white p-2 text-blue-700 shadow-sm">
                    <Barcode className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 id="pos-external-barcode-heading" className="text-sm font-semibold text-slate-900">Product Barcode</h3>
                    <p className="text-xs text-slate-600">Manual barcode takes priority. Otherwise a valid GTIN is used; a code is generated only when both fields are empty.</p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pos-create-manual-barcode" className="text-xs font-semibold text-slate-800">Manual Barcode (optional)</Label>
                  <Input
                    id="pos-create-manual-barcode"
                    value={manualBarcode}
                    onChange={(event) => setManualBarcode(normalizeBarcodeEntry(event.target.value))}
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Enter supplier or company barcode"
                    disabled={externalLookupLoading || creatingItem || postCreateSaving}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pos-create-gtin" className="text-xs font-semibold text-slate-800">GTIN / UPC / EAN (optional)</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="pos-create-gtin"
                    value={externalBarcode}
                    onChange={(event) => handleExternalBarcodeChange(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        handleExternalProductLookup();
                      }
                    }}
                    inputMode="text"
                    autoCapitalize="characters"
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="Scan or enter GTIN / UPC / EAN"
                    aria-label="Product GTIN"
                    disabled={externalLookupLoading || creatingItem || postCreateSaving}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    onClick={() => setExternalQrScannerOpen(true)}
                    disabled={externalLookupLoading || creatingItem || postCreateSaving}
                  >
                    <ScanLine className="mr-2 h-4 w-4" aria-hidden="true" />
                    Scan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="shrink-0 bg-white"
                    onClick={handleExternalProductLookup}
                    disabled={externalLookupLoading || creatingItem || postCreateSaving || !externalBarcode}
                  >
                    <Search className="mr-2 h-4 w-4" aria-hidden="true" />
                    {externalLookupLoading ? 'Looking up...' : 'Look up'}
                  </Button>
                </div>
                </div>

                {externalLookupError ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800" role="status">
                    {externalLookupError}
                  </p>
                ) : null}

                {manualBarcode ? (
                  <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900" role="status">
                    Manual barcode selected. The GTIN remains available for product lookup, but the manual code will be saved as the primary POS barcode.
                  </p>
                ) : null}

                {externalProductLookup?.found ? (
                  <div className="rounded-xl border border-blue-200 bg-white p-3">
                    <div className="flex flex-col gap-3 sm:flex-row">
                      {externalProductLookup.product?.image_url ? (
                        <img
                          src={externalProductLookup.product.image_url}
                          alt="External product preview"
                          className="h-20 w-20 shrink-0 rounded-lg border border-slate-200 object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : null}
                      <div className="min-w-0 flex-1 space-y-1">
                        <p className="font-semibold text-slate-900">{externalProductLookup.product?.name || 'Unnamed registry product'}</p>
                        {externalProductLookup.product?.brand ? <p className="text-xs text-slate-600">Brand: {externalProductLookup.product.brand}</p> : null}
                        {externalProductLookup.product?.quantity ? <p className="text-xs text-slate-600">Package: {externalProductLookup.product.quantity}</p> : null}
                        {externalProductLookup.product?.category_suggestion ? <p className="text-xs text-slate-600">Category suggestion: {externalProductLookup.product.category_suggestion}</p> : null}
                        {externalProductLookup.suggested_price ? (
                          <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                            <p className="font-semibold">
                              Suggested selling price: PHP {Number(externalProductLookup.suggested_price.amount).toFixed(2)}
                            </p>
                            <p>
                              {externalProductLookup.suggested_price.label} from Open Prices
                              {externalProductLookup.suggested_price.location ? ` at ${externalProductLookup.suggested_price.location}` : ''}
                              {externalProductLookup.suggested_price.observed_at ? ` on ${externalProductLookup.suggested_price.observed_at}` : ''}.
                            </p>
                            <p className="mt-1 text-emerald-800">{externalProductLookup.suggested_price.disclaimer}</p>
                          </div>
                        ) : null}
                        <p className="text-xs text-amber-700">Review before saving. Details are applied only after you select Use product details.</p>
                      </div>
                      <div className="flex shrink-0 flex-col gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={applyExternalProductDetails}
                          disabled={acceptedExternalProduct?.code === externalProductLookup.code}
                        >
                          {acceptedExternalProduct?.code === externalProductLookup.code ? <Check className="mr-2 h-4 w-4" /> : null}
                          {acceptedExternalProduct?.code === externalProductLookup.code ? 'Details selected' : 'Use product details'}
                        </Button>
                        {externalProductLookup.suggested_price ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={applyExternalSuggestedPrice}
                            disabled={Number(createForm.default_sale_price) === Number(externalProductLookup.suggested_price.amount)}
                          >
                            {Number(createForm.default_sale_price) === Number(externalProductLookup.suggested_price.amount) ? 'Price selected' : 'Use suggested price'}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="space-y-4">
                  <div>
                    <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Product Image</label>
                    <p className="mt-0.5 text-[11px] leading-normal text-[#64748B]">
                      The same image will be used for POS and storefront visibility.
                    </p>
                  </div>

                  <label
                    htmlFor="pos-item-image"
                    data-testid="pos-create-item-image-drop-zone"
                    className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-5 text-center transition-colors ${(isCreateImageDragActive ? 'border-blue-500 bg-blue-100/70 ring-2 ring-blue-200' : 'border-blue-200 bg-blue-50/10 hover:bg-blue-50/20')} ${(creatingItem || postCreateSaving) ? 'cursor-not-allowed opacity-50' : ''}`}
                    onDragEnter={(event) => {
                      event.preventDefault();
                      setIsCreateImageDragActive(true);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'copy';
                      setIsCreateImageDragActive(true);
                    }}
                    onDragLeave={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget)) {
                        setIsCreateImageDragActive(false);
                      }
                    }}
                    onDrop={handleCreateImageDrop}
                  >
                    <Upload className="mx-auto h-10 w-10 text-blue-500" aria-hidden="true" />
                    <p className="mt-3 text-xs sm:text-sm font-semibold text-[#0F172A]">Drag item images here or choose files</p>
                    <p className="mt-1 text-[11px] font-medium text-[#64748B]">JPG, PNG or WEBP (large files optimized by server)</p>
                    <p className="mt-3 text-[10px] leading-normal text-[#94A3B8]">
                      Up to 5 images per item. The first image is the primary image; all images are shared with Storefront.
                    </p>
                    <input
                      id="pos-item-image"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={creatingItem || postCreateSaving}
                      onChange={(event) => {
                        const files = Array.from(event.target.files || []);
                        if (files.length) {
                          handleSelectCreateImageFiles(files);
                        }
                        event.target.value = '';
                      }}
                    />
                  </label>

                  <SelectedItemImageCarousel
                    files={selectedImageFiles}
                    itemName={createForm.name || 'Item'}
                    disabled={creatingItem || postCreateSaving}
                    onRemove={removeSelectedCreateImageFile}
                  />
                  {selectedImageFiles.length === 0 && acceptedExternalProduct?.product?.image_url ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      The accepted registry image will be optimized and saved to DGFY storage when this item is created.
                    </div>
                  ) : null}
                </div>

                {/* Right Column - Form Fields */}
                <div className="space-y-4">
                  {pendingCreateRecovery?.itemId ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs sm:text-sm text-amber-800">
                      <p className="font-bold">
                        {pendingCreateRecovery.name || 'Your item'} was created, but setup needs attention. Your item was saved and will not be duplicated.
                      </p>
                      {Array.isArray(pendingCreateRecovery.failedStages) && pendingCreateRecovery.failedStages.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {pendingCreateRecovery.failedStages.flatMap((stage) => {
                            if (stage.readinessBlocked && stage.missingRequirements.length > 0) {
                              return stage.missingRequirements.map((requirement, index) => (
                                <li key={`${stage.key}-${requirement?.code || index}`}>
                                  {requirement?.fix_hint || requirement?.label || 'Complete the missing POS requirement.'}
                                </li>
                              ));
                            }
                            return [<li key={stage.key}>{stage.label}: {stage.message}</li>];
                          })}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid gap-4 sm:grid-cols-2">
                    {/* Item Name */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        Item Name <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        value={createForm.name}
                        onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        className="h-11 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Classic Milk Tea"
                      />
                    </div>

                    {/* Workflow-aware category */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        {itemWorkspacePresentation.categoryLabel} <span className="text-rose-500">*</span>
                      </label>
                      {canManageCategories ? (
                        <>
                          <EditableFoodCategoryCombobox
                            id="pos-items-create-category"
                            value={createCategoryInput}
                            onChange={(nextValue) => {
                              const matchedCategory = foodCategoryOptions.find((option) => (
                                normalizeFolderNameKey(option.name) === normalizeFolderNameKey(nextValue)
                              ));
                              setCreateCategoryInput(nextValue);
                              setCreateForm((current) => ({
                                ...current,
                                pos_category: matchedCategory?.value || ''
                              }));
                            }}
                            onSelect={(option) => {
                              setCreateCategoryInput(option.name);
                              setCreateForm((current) => ({ ...current, pos_category: option.value }));
                            }}
                            options={foodCategoryOptions}
                            disabled={creatingItem || postCreateSaving}
                          />
                          <p className="text-[11px] text-slate-500">Select an existing category, or enter a new name to create it when this item is saved.</p>
                        </>
                      ) : (
                        <>
                          <select
                            value={createForm.pos_category}
                            onChange={(event) => setCreateForm((current) => ({ ...current, pos_category: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F172A] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                            disabled={creatingItem || postCreateSaving}
                          >
                            <option value="">Select an active category</option>
                            {foodCategoryOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <p className="text-[11px] text-slate-500">Only an administrator can create categories.</p>
                        </>
                      )}
                    </div>

                    {/* Stock Quantity */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        Stock Quantity <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={createForm.current_stock}
                        onChange={(event) => setCreateForm((current) => ({ ...current, current_stock: event.target.value }))}
                        className="h-11 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        disabled={creatingItem || postCreateSaving}
                      />
                    </div>

                    {/* Always Available Toggle Switch */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                      <div className="min-w-0">
                        <label htmlFor="pos-items-create-always-available" className="block text-xs sm:text-[13px] font-bold text-[#0F172A]">
                          Always Available
                        </label>
                        <span className="block text-[10px] text-[#64748B]">Allow POS sales at zero stock.</span>
                      </div>
                      <Switch
                        id="pos-items-create-always-available"
                        checked={createForm.pos_always_available === true}
                        onCheckedChange={(checked) => setCreateForm((current) => ({
                          ...current,
                          pos_always_available: Boolean(checked)
                        }))}
                        disabled={creatingItem || postCreateSaving}
                      />
                    </div>

                    {/* Best Seller toggle - manual on/off, mirroring the Always Available switch
                        above. Turning it on force-tags the item; turning it off defers back to
                        the auto sales-ranking policy (there is no manual "never" state here).
                        Visible on every viewport (mobile, tablet, desktop) - same as Always
                        Available, no responsive hiding. */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                      <div className="min-w-0">
                        <label htmlFor="pos-items-create-best-seller-mode" className="block text-xs sm:text-[13px] font-bold text-[#0F172A]">
                          Best Seller
                        </label>
                        <span className="block text-[10px] text-[#64748B]">Manually tag this item as a Best Seller.</span>
                      </div>
                      <Switch
                        id="pos-items-create-best-seller-mode"
                        checked={createForm.pos_best_seller_mode === 'force'}
                        onCheckedChange={(checked) => setCreateForm((current) => ({
                          ...current,
                          pos_best_seller_mode: checked ? 'force' : 'never'
                        }))}
                        disabled={creatingItem || postCreateSaving}
                      />
                    </div>

                    {/* Selling Price */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        Selling Price <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-medium text-slate-400">₱</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createForm.default_sale_price}
                          onChange={(event) => setCreateForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                          className="h-11 rounded-xl border-slate-200 pl-8 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                          disabled={creatingItem || postCreateSaving}
                        />
                      </div>
                    </div>

                    {/* Cost Price */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        Cost Price <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-medium text-slate-400">₱</span>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={createForm.cost_per_unit}
                          onChange={(event) => setCreateForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                          className="h-11 rounded-xl border-slate-200 pl-8 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                          disabled={creatingItem || postCreateSaving}
                        />
                      </div>
                    </div>

                    {/* SKU (POS Rule) */}
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">SKU (POS Rule)</label>
                      <Input
                        value={createForm.sku_code}
                        className="h-11 rounded-xl border-slate-200 bg-slate-50 font-mono text-xs sm:text-sm text-slate-500"
                        disabled
                        readOnly
                      />
                    </div>

                    {/* Senior/PWD Eligible Toggle switch */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                      <div className="min-w-0">
                        <label htmlFor="pos-items-create-senior-pwd" className="block text-xs sm:text-[13px] font-bold text-[#0F172A]">
                          Senior/PWD Eligible
                        </label>
                        <span className="block text-[10px] text-[#64748B]">Allow statutory discount selection.</span>
                      </div>
                      <Switch
                        id="pos-items-create-senior-pwd"
                        aria-checked={createForm.senior_pwd_discount_eligible}
                        checked={createForm.senior_pwd_discount_eligible === true}
                        onCheckedChange={(checked) => setCreateForm((current) => ({
                          ...current,
                          senior_pwd_discount_eligible: Boolean(checked)
                        }))}
                        disabled={creatingItem || postCreateSaving}
                      />
                    </div>

                    {/* Description / notes */}
                    <div className="space-y-1.5 sm:col-span-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Description / Notes</label>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {String(createForm.description || '').length} / 500
                        </span>
                      </div>
                      <textarea
                        value={createForm.description}
                        onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value.slice(0, 500) }))}
                        className="mt-2 min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm text-[#0F172A] shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Optional notes for the POS item record"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 bg-[#0F172A] px-5 py-3 sm:px-6 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="outline"
                onClick={closeCreate}
                disabled={creatingItem || postCreateSaving}
                className="h-11 rounded-xl border-slate-700 bg-transparent px-5 text-xs sm:text-sm font-semibold text-white hover:bg-slate-800 hover:text-white transition-colors"
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={handleCreateItem}
                disabled={creatingItem || postCreateSaving || locked}
                className="h-11 rounded-xl bg-blue-600 px-5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
              >
                <Save className="h-4 w-4" />
                {creatingItem || postCreateSaving ? 'Saving...' : (pendingCreateRecovery?.itemId ? 'Resume Item Setup' : 'Save Item')}
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      <ProductQrScannerModal
        open={externalQrScannerOpen}
        onOpenChange={setExternalQrScannerOpen}
        onDetected={handleExternalQrDetected}
      />

      {activeEditItem && typeof document !== 'undefined' && createPortal((
        <div
          className="pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 backdrop-blur-sm px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-edit-modal-title"
          onClick={closeEdit}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => event.preventDefault()}
        >
          <div
            className="relative flex h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl shadow-slate-950/20 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Header */}
            <div className="shrink-0 bg-[#0F172A] px-5 py-4 sm:px-6 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-600 text-white">
                  <ShoppingBag className="h-5.5 w-5.5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p id="pos-items-edit-modal-title" className="text-base font-extrabold text-white sm:text-lg">Edit Item</p>
                  <p className="mt-0.5 text-xs text-slate-300">Update the shared POS item details and image used by POS and storefront.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeEdit}
                disabled={savingItem || persistingEditAssets}
                className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-transparent px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 transition-colors focus-visible:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-900"
              >
                <X className="h-4 w-4" />
                <span>Close</span>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50 space-y-4 sm:space-y-5">
              {/* Top Horizontal Row: 3 Toggle Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5 sm:gap-4">
                {/* Toggle Card 1: Always Available */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Package className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="pos-items-edit-always-available" className="block text-xs sm:text-[13px] font-bold text-[#0F172A] cursor-pointer">
                        Always Available
                      </label>
                      <span className="block text-[10px] text-[#64748B] truncate">Allow POS sales at zero stock.</span>
                    </div>
                  </div>
                  <Switch
                    id="pos-items-edit-always-available"
                    checked={editForm.pos_always_available === true}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      pos_always_available: Boolean(checked)
                    }))}
                    disabled={savingItem || persistingEditAssets}
                  />
                </div>

                {/* Toggle Card 2: Best Seller */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                      <Star className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="pos-items-edit-best-seller-mode" className="block text-xs sm:text-[13px] font-bold text-[#0F172A] cursor-pointer">
                        Best Seller
                      </label>
                      <span className="block text-[10px] text-[#64748B] truncate">Manually tag this item as a Best Seller.</span>
                    </div>
                  </div>
                  <Switch
                    id="pos-items-edit-best-seller-mode"
                    checked={editForm.pos_best_seller_mode === 'force'}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      pos_best_seller_mode: checked ? 'force' : 'never'
                    }))}
                    disabled={savingItem || persistingEditAssets}
                  />
                </div>

                {/* Toggle Card 3: Senior/PWD Eligible */}
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                      <Percent className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor="pos-items-edit-senior-pwd" className="block text-xs sm:text-[13px] font-bold text-[#0F172A] cursor-pointer">
                        Senior/PWD Eligible
                      </label>
                      <span className="block text-[10px] text-[#64748B] truncate">Allow statutory discount selection.</span>
                    </div>
                  </div>
                  <Switch
                    id="pos-items-edit-senior-pwd"
                    aria-checked={editForm.senior_pwd_discount_eligible}
                    checked={editForm.senior_pwd_discount_eligible === true}
                    onCheckedChange={(checked) => setEditForm((current) => ({
                      ...current,
                      senior_pwd_discount_eligible: Boolean(checked)
                    }))}
                    disabled={savingItem || persistingEditAssets}
                  />
                </div>
              </div>

              {/* Main Body: 3 Columns Grid */}
              <div className="grid gap-4 sm:gap-5 lg:grid-cols-3 items-stretch">
                {/* Column 1: Product Image */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-4">
                    <div>
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Product Image</label>
                      <p className="mt-0.5 text-[11px] leading-normal text-[#64748B]">
                        The same image will be used for POS and storefront visibility.
                      </p>
                    </div>

                    {(() => {
                      const editGallery = normalizeStorefrontItemGallery(activeEditItem || {});
                      return (
                        <div className="space-y-3">
                          <label
                            htmlFor="pos-item-edit-image"
                            data-testid="pos-edit-item-image-drop-zone"
                            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed p-4 text-center transition-colors ${(isEditImageDragActive ? 'border-blue-500 bg-blue-100/70 ring-2 ring-blue-200' : 'border-blue-200 bg-blue-50/10 hover:bg-blue-50/20')} ${(savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh) ? 'cursor-not-allowed opacity-50' : ''}`}
                            onDragEnter={(event) => {
                              event.preventDefault();
                              setIsEditImageDragActive(true);
                            }}
                            onDragOver={(event) => {
                              event.preventDefault();
                              event.dataTransfer.dropEffect = 'copy';
                              setIsEditImageDragActive(true);
                            }}
                            onDragLeave={(event) => {
                              if (!event.currentTarget.contains(event.relatedTarget)) {
                                setIsEditImageDragActive(false);
                              }
                            }}
                            onDrop={handleEditImageDrop}
                          >
                            <Upload className="mx-auto h-9 w-9 text-blue-500" aria-hidden="true" />
                            <p className="mt-2.5 text-xs sm:text-sm font-semibold text-[#0F172A]">Drag item images here or choose files</p>
                            <p className="mt-0.5 text-[11px] font-medium text-[#64748B]">JPG, PNG or WEBP (large files optimized by server, up to 5 total)</p>
                            <p className="mt-2 text-[10px] leading-normal text-[#94A3B8]">
                              The preview appears immediately. The optimized image is saved automatically and then replaces the preview.
                            </p>
                            <input
                              id="pos-item-edit-image"
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              disabled={savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh}
                              onChange={(event) => {
                                const files = Array.from(event.target.files || []);
                                void handleSelectEditImageFile(files);
                                event.target.value = '';
                              }}
                            />
                          </label>

                          <SelectedItemImageCarousel
                            files={visibleSelectedEditImageFiles}
                            savedGallery={editGallery}
                            itemName={editForm.name || activeEditItem?.name || 'Item'}
                            disabled={savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh}
                            showPrimaryToggle
                            onRemove={handleRemoveSelectedEditImageFile}
                            onSetPendingPrimary={handleSetPendingEditPrimary}
                            onSetSavedPrimary={handleSetSavedEditPrimary}
                            onRemoveSaved={handleRemoveSavedEditImage}
                          />

                          {selectedEditImageFiles.length > 0
                            && editGallery.length >= STOREFRONT_ITEM_IMAGE_MAX_COUNT
                            && !editImageUploadJob
                            && !pendingEditImageRefresh && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium leading-normal text-amber-800" role="status">
                              Preview ready. Remove existing images to make room; the upload will continue automatically.
                            </p>
                          )}

                          {canEditItems && (
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => handleGenerateEditImage(activeEditItem)}
                              disabled={savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh || generatingEditImage || pollingEditImage}
                              className="w-full rounded-xl"
                              title={
                                editGallery.length > 0
                                  ? 'Generate a new AI photo, replacing the current one.'
                                  : 'Generate an AI photo for this item (watermarked).'
                              }
                            >
                              <ImagePlus className="mr-2 h-4 w-4" />
                              {generatingEditImage
                                ? 'Queuing…'
                                : pollingEditImage
                                  ? 'Generating…'
                                  : editGallery.length > 0 ? 'Regenerate Image (AI)' : 'Generate Image (AI)'}
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Column 1 Footer Notice */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/90 p-2.5 flex items-center gap-2 text-xs text-slate-500">
                    <Info className="h-4 w-4 shrink-0 text-blue-500" aria-hidden="true" />
                    <span>Image will be visible in POS and storefront.</span>
                  </div>
                </div>

                {/* Column 2: Item Details */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-3.5">
                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                      Item Name <span className="text-rose-500">*</span>
                    </label>
                    <Input
                      value={editForm.name}
                      onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                      className="h-11 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                      disabled={savingItem || persistingEditAssets}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                      Stock Quantity <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded bg-blue-50 text-blue-600">
                        <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      </span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={editForm.current_stock}
                        onChange={(event) => setEditForm((current) => ({ ...current, current_stock: event.target.value }))}
                        className="h-11 rounded-xl border-slate-200 pl-10 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                      Selling Price <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-medium text-slate-400">₱</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={focusedEditMoneyField === 'default_sale_price'
                          ? editForm.default_sale_price
                          : formatMoneyInput(editForm.default_sale_price)}
                        onFocus={() => setFocusedEditMoneyField('default_sale_price')}
                        onBlur={() => setFocusedEditMoneyField('')}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          default_sale_price: normalizeMoneyInput(event.target.value)
                        }))}
                        className="h-11 rounded-xl border-slate-200 pl-8 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                      Cost Price <span className="text-rose-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-xs sm:text-sm font-medium text-slate-400">₱</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={focusedEditMoneyField === 'cost_per_unit'
                          ? editForm.cost_per_unit
                          : formatMoneyInput(editForm.cost_per_unit)}
                        onFocus={() => setFocusedEditMoneyField('cost_per_unit')}
                        onBlur={() => setFocusedEditMoneyField('')}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          cost_per_unit: normalizeMoneyInput(event.target.value)
                        }))}
                        className="h-11 rounded-xl border-slate-200 pl-8 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Description / Notes</label>
                      <span className="text-[10px] text-slate-400 font-medium">
                        {String(editForm.description || '').length} / 500
                      </span>
                    </div>
                    <textarea
                      value={editForm.description}
                      onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value.slice(0, 500) }))}
                      className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs sm:text-sm text-[#0F172A] shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                      disabled={savingItem || persistingEditAssets}
                      placeholder="Optional notes visible in POS"
                    />
                  </div>
                </div>

                {/* Column 3: Category & QR Section */}
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 sm:p-5 shadow-sm space-y-4 flex flex-col justify-between">
                  <div className="space-y-3.5">
                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">
                        {itemWorkspacePresentation.categoryLabel} <span className="text-rose-500">*</span>
                      </label>
                      {canManageCategories ? (
                        <>
                          <EditableFoodCategoryCombobox
                            id="pos-items-edit-category"
                            value={editCategoryInput}
                            onChange={(nextValue) => {
                              const matchedCategory = foodCategoryOptions.find((option) => (
                                normalizeFolderNameKey(option.name) === normalizeFolderNameKey(nextValue)
                              ));
                              setEditCategoryInput(nextValue);
                              setEditForm((current) => ({
                                ...current,
                                pos_category: matchedCategory?.value || ''
                              }));
                            }}
                            onSelect={(option) => {
                              setEditCategoryInput(option.name);
                              setEditForm((current) => ({ ...current, pos_category: option.value }));
                            }}
                            options={foodCategoryOptions}
                            disabled={savingItem || persistingEditAssets}
                          />
                          <p className="mt-1 text-[11px] text-slate-500 leading-normal">Select an existing category, or enter a new name to create it when this item is saved.</p>
                        </>
                      ) : (
                        <>
                          <select
                            value={editForm.pos_category}
                            onChange={(event) => setEditForm((current) => ({ ...current, pos_category: event.target.value }))}
                            className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-medium text-[#0F172A] outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:text-sm"
                            disabled={savingItem || persistingEditAssets}
                          >
                            {!editForm.pos_category && <option value="">Select an active category</option>}
                            {editForm.pos_category && !foodCategoryOptions.some((option) => option.value === editForm.pos_category) && (
                              <option value={editForm.pos_category} disabled>Current category is inactive</option>
                            )}
                            {foodCategoryOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                          <p className="mt-1 text-[11px] text-slate-500 leading-normal">Inactive categories remain on existing items but cannot be selected again. Only an administrator can create new categories.</p>
                        </>
                      )}
                    </div>

                    {/* #1318 Wave C/C5 — Additional Categories: secondary-membership editor,
                        POS's own equivalent of ItemFormModal.jsx's Phase 268 section. Visible
                        (never hidden) when the operator lacks canManageCategories, matching the
                        primary category field's own visible-but-read-only convention above; only
                        hidden when there is no real persisted item to attach memberships to. */}
                    {editItemIdForFolders > 0 && (
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                        <label className="flex items-center gap-2 text-xs sm:text-[13px] font-bold text-[#0F172A]">
                          <Tags className="w-4 h-4" />
                          Additional Categories
                        </label>
                        <p className="text-[11px] text-slate-500 leading-normal">
                          Optional. List this item under up to 10 more categories, alongside its primary category above. This does not change the primary category.
                        </p>
                        {secondaryFoldersLoading ? (
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <RefreshCcw className="w-3.5 h-3.5 animate-spin" />
                            Loading additional categories...
                          </div>
                        ) : secondaryFoldersUnavailable ? (
                          // RF-3: an honest "could not be loaded" state -- never the same
                          // "0/10 selected" a genuinely empty membership list would show.
                          <p role="status" className="text-xs text-amber-600">
                            Additional categories are unavailable right now -- you don't have permission to view them.
                          </p>
                        ) : (
                          <>
                            {availableSecondaryFolders.length > 0 ? (
                              <fieldset
                                className="grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                                disabled={!canManageCategories || secondaryFoldersSaving}
                              >
                                <legend className="sr-only">Additional categories</legend>
                                {availableSecondaryFolders.map((folder) => {
                                  const normalizedId = String(folder.folder_id);
                                  const checked = secondaryFolderIds.includes(normalizedId);
                                  const atCap = !checked && secondaryFolderIds.length >= 10;
                                  return (
                                    <label
                                      key={folder.folder_id}
                                      className={`flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 ${atCap ? 'opacity-50' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        disabled={atCap}
                                        onChange={(event) => toggleSecondaryFolder(folder.folder_id, event.target.checked)}
                                      />
                                      {folder.name}
                                    </label>
                                  );
                                })}
                              </fieldset>
                            ) : (
                              <p className="text-xs text-slate-500">No other categories available yet.</p>
                            )}
                            <div className="flex items-center justify-between gap-3">
                              {canManageCategories ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  onClick={saveSecondaryFolders}
                                  disabled={secondaryFoldersSaving}
                                >
                                  {secondaryFoldersSaving ? 'Saving...' : 'Save Additional Categories'}
                                </Button>
                              ) : (
                                <p role="status" className="text-[11px] text-slate-500">
                                  You can review additional categories, but your role cannot change them.
                                </p>
                              )}
                              <p className="text-[11px] text-slate-400">{secondaryFolderIds.length}/10 selected</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">Manual Barcode (priority)</label>
                      <Input
                        value={editForm.manual_barcode}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          manual_barcode: normalizeBarcodeEntry(event.target.value)
                        }))}
                        className="h-11 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        placeholder="Supplier or company barcode"
                        disabled={savingItem || persistingEditAssets}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs sm:text-[13px] font-bold text-[#0F172A]">GTIN / UPC / EAN</label>
                      <Input
                        value={editForm.gtin}
                        onChange={(event) => setEditForm((current) => ({
                          ...current,
                          gtin: normalizeBarcodeEntry(event.target.value)
                        }))}
                        className="h-11 rounded-xl border-slate-200 text-xs sm:text-sm font-medium focus:border-blue-500 focus:ring-blue-500"
                        placeholder="8, 12, 13, or 14 digit GTIN"
                        disabled={savingItem || persistingEditAssets}
                      />
                      <p className="text-[11px] leading-normal text-slate-500">Manual barcode wins when both fields are filled. Leaving both empty preserves the current barcode.</p>
                    </div>
                  </div>

                  {/* QR Card Container */}
                  <div className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4 text-center space-y-3 flex-1 flex flex-col items-center justify-center">
                    <StorefrontItemQrCard
                      itemName={editForm.name || activeEditItem.name}
                      itemUrl={activeEditStorefrontUrl}
                      helperText=""
                      compact
                      qrSize={104}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 bg-white border-t border-slate-200/80 px-5 py-3.5 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-2 text-xs font-medium text-slate-600 w-full sm:w-auto">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>Changes will update this item across POS and storefront immediately.</span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeEdit}
                  disabled={savingItem || persistingEditAssets}
                  className="h-11 rounded-xl border-slate-200 bg-white px-5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={savingItem || persistingEditAssets}
                  className="h-11 rounded-xl bg-blue-600 px-5 text-xs sm:text-sm font-bold text-white hover:bg-blue-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Save className="h-4 w-4" />
                  {savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {itemSaveInFlight && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 px-4 backdrop-blur-md transition-all duration-300"
          role="status"
          aria-live="assertive"
          aria-label={itemWorkspacePresentation.savingAriaLabel}
        >
          <div className={`relative w-full max-w-sm overflow-hidden rounded-3xl bg-white/95 p-8 text-center backdrop-blur-xl animate-float ${usesWarmSavingAccent ? 'border border-amber-100/80 shadow-[0_25px_60px_-15px_rgba(245,158,11,0.25)]' : 'border border-blue-100/80 shadow-[0_25px_60px_-15px_rgba(37,99,235,0.22)]'}`}>

            {/* Top Warm Accent Shimmer Bar */}
            <div className={`absolute top-0 left-0 right-0 h-1.5 overflow-hidden ${usesWarmSavingAccent ? 'bg-amber-50' : 'bg-blue-50'}`}>
              <div className={`h-full w-1/2 rounded-full animate-shimmer ${usesWarmSavingAccent ? 'bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600' : 'bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600'}`} />
            </div>

            {/* F&B Status Pill */}
            <div className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold tracking-wide border mb-2 ${usesWarmSavingAccent ? 'bg-amber-50 text-amber-700 border-amber-200/60' : 'bg-blue-50 text-blue-700 border-blue-200/60'}`}>
              <span className={`h-1.5 w-1.5 rounded-full animate-ping ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              {itemWorkspacePresentation.savingStatusLabel}
            </div>

            {/* Icon Container with Animated Orbital Rings */}
            <div className="relative mx-auto my-3 flex h-20 w-20 items-center justify-center">
              {/* Outer Glowing Pulse Ring */}
              <div className={`absolute inset-0 rounded-full animate-pulse-ring ${usesWarmSavingAccent ? 'bg-amber-500/10' : 'bg-blue-500/10'}`} />

              {/* Outer Rotating Gradient Ring */}
              <div className={`absolute inset-0 rounded-full border-2 border-dashed animate-spin-slow ${usesWarmSavingAccent ? 'border-amber-400/50' : 'border-blue-400/50'}`} />

              {/* Inner Counter-rotating Gradient Ring */}
              <div className={`absolute inset-1 rounded-full border-2 animate-spin-reverse ${usesWarmSavingAccent ? 'border-orange-500/30 border-t-orange-500' : 'border-indigo-500/30 border-t-indigo-500'}`} />

              {/* Center F&B Emblem Container */}
              <div className={`relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br shadow-lg text-white ${usesWarmSavingAccent ? 'from-amber-500 via-orange-500 to-amber-600 shadow-orange-500/35' : 'from-blue-500 via-indigo-500 to-blue-600 shadow-blue-500/30'}`}>
                <SavingItemIcon className="h-7 w-7 text-white drop-shadow" />
              </div>
            </div>

            {/* Title */}
            <h3 className="mt-3 text-xl font-extrabold tracking-tight text-slate-900">
              {itemWorkspacePresentation.savingTitle}
            </h3>

            {/* Subtitle */}
            <p className="mt-2 text-xs font-medium leading-relaxed text-slate-500 px-1">
              {itemWorkspacePresentation.savingDescription}
            </p>

            {/* Animated Dots Indicator */}
            <div className={`mt-5 flex items-center justify-center gap-1.5 ${usesWarmSavingAccent ? 'text-amber-600' : 'text-blue-600'}`}>
              <span className={`h-2 w-2 rounded-full dot-1 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className={`h-2 w-2 rounded-full dot-2 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
              <span className={`h-2 w-2 rounded-full dot-3 ${usesWarmSavingAccent ? 'bg-amber-500' : 'bg-blue-500'}`} />
            </div>

          </div>
        </div>
      ), document.body)}

      {savedMessage.name && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-slate-950/60 backdrop-blur-sm px-4 py-6 animate-pos-overlay-fade-in"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-saved-modal-title"
          onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
        >
          <div
            className="relative flex w-full max-w-[420px] flex-col overflow-hidden rounded-[28px] border border-slate-100 bg-white p-7 sm:p-8 text-center shadow-2xl shadow-slate-900/10 animate-pos-card-scale-up"
            onClick={(event) => event.stopPropagation()}
          >
            {/* Top Centered Success Badge */}
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-200/80 shadow-[0_0_20px_rgba(16,185,129,0.18)] text-emerald-600">
              <Check className="h-8 w-8 stroke-[2.5]" aria-hidden="true" />
            </div>

            {/* Title */}
            <p id="pos-items-saved-modal-title" className="mt-4 text-xl font-bold tracking-tight text-[#0F172A]">
              Item {savedMessage.action === 'created' ? 'created' : 'saved'} successfully
            </p>

            {/* Main Subtitle */}
            <p className="mt-1.5 text-xs sm:text-sm font-medium text-[#64748B] leading-relaxed">
              <span className="font-semibold text-slate-800">{savedMessage.name}</span> was {savedMessage.action === 'created' ? 'created in IMS and added to POS.' : 'updated in POS and IMS.'}
            </p>

            {/* Inner Summary Detail Card */}
            <div className="my-5 flex items-center gap-3.5 rounded-2xl border border-slate-200/70 bg-[#F8FAFC] p-4 text-left shadow-sm">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <UtensilsCrossed className="h-6 w-6" aria-hidden="true" />
              </div>
              <div className="h-9 w-px bg-slate-200/80 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[#0F172A] truncate">{savedMessage.name}</p>
                <div className="mt-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                  <span>{savedMessage.action === 'created' ? 'Created in IMS and added to POS' : 'Updated in POS and IMS'}</span>
                </div>
                {savedMessage.barcode ? (
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Barcode: <span className="font-mono text-slate-700">{savedMessage.barcode}</span>
                  </p>
                ) : null}
              </div>
            </div>

            {/* Bottom Centered Action Button */}
            <div className="mt-1 flex justify-center">
              <Button
                type="button"
                onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
                className="h-11 w-full max-w-[200px] rounded-xl bg-[#0B3067] px-6 text-sm font-bold text-white hover:bg-[#072047] transition-colors shadow-sm"
              >
                Got it
              </Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {deleteConfirmItem && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-delete-confirm-modal-title"
          onClick={closeDeleteConfirm}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-rose-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p id="pos-items-delete-confirm-modal-title" className="text-lg font-black text-[#0F172A]">Delete item?</p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    <span className="font-bold text-[#0F172A]">{deleteConfirmItem.name || 'This item'}</span> will be removed from POS and IMS.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDeleteConfirm}
                  disabled={deletingItem}
                  className="h-11 rounded-lg"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => handleDelete(deleteConfirmItem)}
                  disabled={deletingItem}
                  className="h-11 rounded-lg bg-rose-600 text-white hover:bg-rose-700"
                >
                  {deletingItem ? 'Deleting...' : 'Delete Item'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {deletedItemName && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-deleted-modal-title"
          onClick={() => setDeletedItemName('')}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-rose-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-100 text-rose-700">
                  <Trash2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p id="pos-items-deleted-modal-title" className="text-lg font-black text-[#0F172A]">Item deleted</p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    <span className="font-bold text-[#0F172A]">{deletedItemName}</span> was removed from POS and IMS.
                  </p>
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setDeletedItemName('')}
                  className="h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
                >
                  OK
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function DraggableCategoryRow({ folder, disabled, children }) {
  const { attributes, listeners, setNodeRef: setDragRef, transform, isDragging } = useDraggable({ id: folder.folder_id, disabled });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: folder.folder_id, disabled });
  const setNodeRef = useCallback((node) => { setDragRef(node); setDropRef(node); }, [setDragRef, setDropRef]);
  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={`${isDragging ? 'relative z-10 opacity-70 shadow-lg' : ''} ${isOver && !isDragging ? 'bg-blue-50' : 'bg-white'}`}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

function CategoryManagementWorkspace() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [pendingAction, setPendingAction] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const loadFolders = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError('');
    try {
      const response = await getFolders();
      setFolders(
        (Array.isArray(response) ? response : [])
          .map((folder) => ({
            ...folder,
            folder_id: Number(folder?.folder_id),
            name: String(folder?.name || '').trim(),
            description: String(folder?.description || '').trim(),
            item_count: Number(folder?.item_count || 0),
            // #1318 follow-up (ADR 0080 Consequences item 4) — items that list this
            // folder only as a secondary category, invisible to item_count above.
            secondary_item_count: Number(folder?.secondary_item_count || 0),
            is_active: folder?.is_active !== false,
            sort_order: Number(folder?.sort_order || 0)
          }))
          .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0 && folder.name)
      );
    } catch (loadError) {
      setFolders([]);
      setError(loadError?.response?.data?.message || 'Failed to load categories.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  const filteredFolders = useMemo(() => {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    return [...folders]
      .filter((folder) => !normalizedQuery || `${folder.name} ${folder.description}`.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name));
  }, [folders, query]);

  const handleCategoryDragEnd = async ({ active, over }) => {
    if (!over || active.id === over.id || query.trim() || busy) return;
    const previous = folders;
    const fromIndex = folders.findIndex((folder) => folder.folder_id === Number(active.id));
    const toIndex = folders.findIndex((folder) => folder.folder_id === Number(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    const next = [...folders];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    const normalized = next.map((folder, index) => ({ ...folder, sort_order: index }));
    setFolders(normalized);
    setBusy(true);
    try {
      await reorderFolders(normalized.map((folder) => folder.folder_id));
      notifyPosCatalogUpdated({ reason: 'category_order_updated' });
      toast.success('Category order updated.');
    } catch (reorderError) {
      setFolders(previous);
      toast.error(reorderError?.response?.data?.message || 'Unable to save category order.');
    } finally {
      setBusy(false);
    }
  };

  const replacementFolders = useMemo(() => folders
    .filter((folder) => folder.is_active && Number(folder.folder_id) !== Number(pendingAction?.folder?.folder_id))
    .sort((left, right) => left.name.localeCompare(right.name)), [folders, pendingAction?.folder?.folder_id]);

  const openCreate = () => {
    setEditor({ mode: 'create', folder: null });
    setForm({ name: '', description: '' });
  };

  const openEdit = (folder) => {
    setEditor({ mode: 'edit', folder });
    setForm({ name: folder.name, description: folder.description || '' });
  };

  const saveFolder = async () => {
    const name = String(form.name || '').trim();
    const description = String(form.description || '').trim();
    if (!name) {
      toast.error('Category name is required.');
      return;
    }

    setBusy(true);
    try {
      if (editor?.mode === 'edit' && editor.folder?.folder_id) {
        await updateFolder(editor.folder.folder_id, { name, description });
        toast.success('Category updated.');
      } else {
        await createFolder({ name, description });
        toast.success('Category created.');
      }
      setEditor(null);
      await loadFolders({ silent: true });
    } catch (saveError) {
      toast.error(saveError?.response?.data?.message || 'Unable to save this category.');
    } finally {
      setBusy(false);
    }
  };

  const confirmLifecycleAction = async () => {
    const folder = pendingAction?.folder;
    if (!folder?.folder_id) return;
    const replacementFolderId = String(pendingAction?.replacementFolderId || '').trim();
    const replacementFolderIdNumber = Number(replacementFolderId);

    if (pendingAction.type === 'delete' && folder.item_count > 0 && (!Number.isInteger(replacementFolderIdNumber) || replacementFolderIdNumber <= 0)) {
      toast.error('Select an active replacement category before deleting this category.');
      return;
    }

    setBusy(true);
    try {
      if (pendingAction.type === 'delete') {
        const payload = replacementFolderId && Number.isInteger(replacementFolderIdNumber) && replacementFolderIdNumber > 0
          ? { replacement_folder_id: replacementFolderIdNumber }
          : {};
        const result = await deleteFolder(folder.folder_id, payload);
        toast.success(result?.data?.message || 'Category deleted.');
      } else {
        await updateFolder(folder.folder_id, { is_active: pendingAction.type === 'activate' });
        toast.success(pendingAction.type === 'activate' ? 'Category activated.' : 'Category deactivated.');
      }
      setPendingAction(null);
      await loadFolders({ silent: true });
    } catch (actionError) {
      toast.error(actionError?.response?.data?.message || 'Unable to update this category.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/70 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]">
              <Tags className="h-5 w-5" />
            </div>
            <div>
              <p className="text-lg font-black text-[#0F172A]">Category Management</p>
              <p className="mt-1 text-sm text-slate-600">Create and control the categories available when POS items are added or edited.</p>
            </div>
          </div>
        </div>
        <Button type="button" onClick={openCreate} className="h-11 rounded-xl bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]">
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/70">
        <div className="flex flex-col gap-3 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 rounded-xl border-slate-200 pl-9" placeholder="Search categories" />
          </div>
          <Button type="button" variant="outline" onClick={() => loadFolders()} disabled={loading || busy} className="h-10 rounded-xl">
            <RefreshCcw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">Drag the handle to rearrange categories. Clear search before rearranging.</p>

        {error ? (
          <div className="m-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div>
        ) : loading ? (
          <div className="p-8 text-center text-sm text-slate-500">Loading categories...</div>
        ) : filteredFolders.length === 0 ? (
          <div className="p-10 text-center">
            <Tags className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-bold text-slate-800">No categories found</p>
            <p className="mt-1 text-sm text-slate-500">Create a category before adding POS items.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleCategoryDragEnd}>
            <div className="divide-y divide-slate-100">
              {filteredFolders.map((folder) => (
                <DraggableCategoryRow key={folder.folder_id} folder={folder} disabled={Boolean(query.trim()) || busy}>
                  {({ attributes, listeners }) => <div className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" aria-label={`Move ${folder.name}`} title={query.trim() ? 'Clear search to rearrange categories.' : 'Drag to rearrange'} disabled={Boolean(query.trim()) || busy} className="touch-none rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-40" {...attributes} {...listeners}><GripVertical className="h-5 w-5" /></button>
                    <p className="font-extrabold text-[#0F172A]">{folder.name}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${folder.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>{folder.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">{folder.description || 'No description provided.'}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-500">{folder.item_count} assigned item{folder.item_count === 1 ? '' : 's'}</p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  <Button type="button" variant="outline" onClick={() => openEdit(folder)} disabled={busy} className="h-9 rounded-lg"><Pencil className="mr-1.5 h-3.5 w-3.5" />Edit</Button>
                  <Button type="button" variant="outline" onClick={() => setPendingAction({ type: folder.is_active ? 'deactivate' : 'activate', folder })} disabled={busy} className="h-9 rounded-lg">{folder.is_active ? 'Deactivate' : 'Activate'}</Button>
                  <Button type="button" variant="outline" onClick={() => setPendingAction({ type: 'delete', folder, replacementFolderId: '' })} disabled={busy} title={folder.item_count > 0 ? 'Delete and reassign assigned items.' : 'Delete category'} className="h-9 rounded-lg border-rose-200 text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete</Button>
                </div>
                  </div>}
                </DraggableCategoryRow>
              ))}
            </div>
          </DndContext>
        )}
      </div>

      {editor && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-category-editor-title"
          onClick={() => { if (!busy) setEditor(null); }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="pos-category-editor-title" className="text-lg font-black text-[#0F172A]">{editor.mode === 'edit' ? 'Edit Category' : 'Add Category'}</h2>
              <p className="mt-1 text-sm text-slate-500">Categories are tenant-private and available to POS item forms only while active.</p>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="space-y-1.5">
                <Label htmlFor="pos-category-name">Category name</Label>
                <Input id="pos-category-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} disabled={busy} maxLength={100} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pos-category-description">Description <span className="font-normal text-slate-400">(optional)</span></Label>
                <textarea id="pos-category-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} disabled={busy} maxLength={1000} className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setEditor(null)} disabled={busy}>Cancel</Button>
              <Button type="button" onClick={saveFolder} disabled={busy} className="bg-[#1A4E8D] text-white hover:bg-[#143F73]">{busy ? 'Saving...' : 'Save Category'}</Button>
            </div>
          </div>
        </div>
      ), document.body)}

      {pendingAction && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/60 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-category-action-title"
          onClick={() => { if (!busy) setPendingAction(null); }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 id="pos-category-action-title" className="text-lg font-black text-[#0F172A]">{pendingAction.type === 'delete' ? 'Delete Category' : (pendingAction.type === 'activate' ? 'Activate Category' : 'Deactivate Category')}</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                {pendingAction.type === 'delete'
                  ? (pendingAction.folder?.item_count > 0
                    ? `Delete ${pendingAction.folder?.name || 'this category'}? Its ${pendingAction.folder.item_count} assigned item(s) must move to another active category first.`
                    : `Delete ${pendingAction.folder?.name || 'this category'}? It has no assigned active items, so no reassignment is required.`)
                  : (pendingAction.type === 'activate'
                    ? `Make ${pendingAction.folder?.name || 'this category'} available again for new POS items?`
                    : `Remove ${pendingAction.folder?.name || 'this category'} from new item selection while retaining existing item assignments?`)}
              </p>
              {pendingAction.type === 'delete' && pendingAction.folder?.secondary_item_count > 0 ? (
                <p className="mt-2 text-sm leading-6 text-amber-700">
                  {pendingAction.folder.secondary_item_count} item(s) also list this as a secondary category and will lose that link — no reassignment is offered for those, since each keeps its primary category elsewhere.
                </p>
              ) : null}
            </div>
            {pendingAction.type === 'delete' && pendingAction.folder?.item_count > 0 ? (
              <div className="space-y-2 px-5 py-4">
                <Label htmlFor="pos-category-replacement">Move assigned items to <span className="font-normal text-slate-400">(required only when items are assigned)</span></Label>
                {replacementFolders.length > 0 ? (
                  <select
                    id="pos-category-replacement"
                    value={pendingAction.replacementFolderId || ''}
                    onChange={(event) => setPendingAction((current) => ({ ...current, replacementFolderId: event.target.value }))}
                    disabled={busy}
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  >
                    <option value="">Select an active category</option>
                    {replacementFolders.map((folder) => <option key={folder.folder_id} value={folder.folder_id}>{folder.name}</option>)}
                  </select>
                ) : (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-900">No active replacement category is available. You can delete this category only when it has no assigned items.</p>
                )}
              </div>
            ) : null}
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" onClick={() => setPendingAction(null)} disabled={busy}>Cancel</Button>
              <Button type="button" onClick={confirmLifecycleAction} disabled={busy} className={pendingAction.type === 'activate' ? 'bg-[#1A4E8D] text-white hover:bg-[#143F73]' : 'bg-rose-600 text-white hover:bg-rose-700'}>{busy ? 'Working...' : (pendingAction.type === 'delete' ? 'Delete Category' : (pendingAction.type === 'activate' ? 'Activate Category' : 'Deactivate Category'))}</Button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}

function ItemsCatalogWorkspace({
  canViewPos = false,
  canManageCategories = false,
  canManageServiceCatalog = false,
  canManageServiceOptions = false,
  canViewFnbModifiers = false,
  canManageFnbModifiers = false,
  locations = [],
  serviceOperationsPermissions = {},
  shiftState,
  activeTerminalId = '',
  operatingLocationId = null,
  isOnline = true,
  sectionId,
  ...itemsWorkspaceProps
}) {
  const availableTabs = useMemo(() => [
    ...(canViewPos ? [{ id: 'items', label: 'Items', icon: ClipboardList }] : []),
    ...(canManageCategories ? [{ id: 'categories', label: 'Categories', icon: Tags }] : []),
    ...(normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && canManageServiceOptions
      ? [{ id: 'service-options', label: 'Service add-ons', icon: SlidersHorizontal }]
      : []),
    ...(normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'fnb' && canViewFnbModifiers
      ? [{ id: 'fnb-modifiers', label: 'Menu modifiers', icon: SlidersHorizontal }]
      : []),
    ...(normalizeWorkflowMode(itemsWorkspaceProps.workflowMode) === 'services' && Object.values(serviceOperationsPermissions).some(Boolean)
      ? [{ id: 'service-operations', label: 'Service operations', icon: CalendarDays }]
      : [])
  ], [canManageCategories, canManageServiceOptions, canViewFnbModifiers, canViewPos, itemsWorkspaceProps.workflowMode, serviceOperationsPermissions]);
  const defaultTab = canViewPos ? 'items' : 'categories';
  const [selectedTab, setSelectedTab] = useState(defaultTab);
  const activeTab = availableTabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : (availableTabs[0]?.id || '');

  if (availableTabs.length === 0) {
    return (
      <p id={sectionId} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
        You need POS view or category-management permission to access Items.
      </p>
    );
  }

  return (
    <div id={sectionId} className="min-w-0 max-w-full space-y-4">
      {availableTabs.length > 1 ? (
          <div
            role="tablist"
            aria-label="Items workspace navigation"
            className="grid min-w-0 gap-2 rounded-xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/70 sm:grid-cols-2 lg:grid-cols-3"
        >
          {availableTabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={active ? `pos-items-${tab.id}-panel` : undefined}
                onClick={() => setSelectedTab(tab.id)}
                className={`flex min-h-11 items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-extrabold transition ${
                  active
                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
                    : 'border-slate-200 bg-slate-50 text-[#0F172A] hover:border-blue-200 hover:bg-white'
                }`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div
        id={`pos-items-${activeTab || 'unavailable'}-panel`}
        role="tabpanel"
        className="min-w-0 max-w-full"
      >
        {activeTab === 'categories' ? (
          isOnline ? (
            <CategoryManagementWorkspace />
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-bold">Category management is available online only.</p>
              <p className="mt-1">Reconnect to create, edit, activate, deactivate, delete, or reassign categories.</p>
            </div>
          )
        ) : activeTab === 'service-options' ? (
          <PosServiceOptionsWorkspace
            isOnline={isOnline}
            canManageServiceOptions={canManageServiceOptions}
            sectionId={`pos-items-${activeTab}-panel`}
          />
        ) : activeTab === 'fnb-modifiers' ? (
          <PosFnbModifiersWorkspace
            isOnline={isOnline}
            canManage={canManageFnbModifiers}
            locations={locations}
            sectionId={`pos-items-${activeTab}-panel`}
          />
        ) : activeTab === 'service-operations' ? (
          <PosServicesOperationsWorkspace
            permissions={serviceOperationsPermissions}
            isOnline={isOnline}
            settlementContext={{ shiftId: shiftState?.shift?.pos_terminal_shift_id, terminalId: activeTerminalId, locationId: shiftState?.shift?.location_id || operatingLocationId }}
          />
        ) : (
          <ItemsWorkspace
            {...itemsWorkspaceProps}
            canViewPos={canViewPos}
            canManageCategories={canManageCategories}
            canManageServiceCatalog={canManageServiceCatalog}
            operatingLocationId={operatingLocationId}
            isOnline={isOnline}
          />
        )}
      </div>
    </div>
  );
}

function SettingsWorkspace({
  terminalUser,
  terminalMeta,
  locationsState,
  queueLocationScopeId,
  incomingOrdersState,
  onlineOrderSoundEnabled = true,
  setOnlineOrderSoundEnabled = () => {},
  locked,
  sectionId,
  initialTab = 'pos_setup',
  onRefreshTerminalUser = async () => {},
  onRefreshTerminalMeta = async () => {},
  onPosSetupSaved = async () => {},
  onStorefrontSetupSaved = async () => {},
  onDeliveryPersonnelChanged = () => {}
  // #732: canManageVouchers used to gate the Vouchers/Pricelists panes rendered inside this
  // tab strip -- both moved to their own top-level view modes, this prop is no longer consumed
  // here.
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const canManageCashiers = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('users:manage');
  const canEditSettings = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('settings:edit');
  const canManageDiscountApprovalPins = terminalUser?.is_master_admin === true;
  const canManageDayClosePins = terminalUser?.is_master_admin === true;
  const canManageEmployeeCredit = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('pos:employee_credit:manage');
  const canManageEmployees = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('pos:employees:manage');
  // Reuses pos:employees:manage (Phase 205, #1080) -- declared under its own name so a
  // future permission split for the delivery personnel registry is a one-line change.
  const canManageDeliveryPersonnel = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('pos:employees:manage');
  // Phase 143 (#848): separate view/manage gate for the Payments tab -- downpayment:view
  // sees it, downpayment:settings can save it, mirroring the same two-tier split
  // downpaymentSettings.js already enforces server-side.
  const canViewDownpayment = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('downpayment:view')
    || resolveUserPermissionList(terminalUser).includes('downpayment:settings');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [renderedTab, setRenderedTab] = useState(initialTab);
  const [paneInlineStyle, setPaneInlineStyle] = useState({
    transform: 'translateX(0)',
    opacity: 1,
    transition: 'transform 150ms ease, opacity 150ms ease'
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingTab, setSavingTab] = useState('');
  const [companyInfo, setCompanyInfo] = useState(null);
  const [cashierUsers, setCashierUsers] = useState([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);
  const [cashiersLoaded, setCashiersLoaded] = useState(false);
  const [cashierVoidAccessSavingUserId, setCashierVoidAccessSavingUserId] = useState(null);
  const [cashierInvitationOpen, setCashierInvitationOpen] = useState(false);
  const [discountApprovers, setDiscountApprovers] = useState([]);
  const [discountApproversLoading, setDiscountApproversLoading] = useState(false);
  const [discountAuthorizationSavingUserId, setDiscountAuthorizationSavingUserId] = useState(null);
  const [approvalPinUser, setApprovalPinUser] = useState(null);
  const [approvalPin, setApprovalPin] = useState('');
  const [savingApprovalPin, setSavingApprovalPin] = useState(false);
  const [dayCloseOperators, setDayCloseOperators] = useState([]);
  const [dayCloseOperatorsLoading, setDayCloseOperatorsLoading] = useState(false);
  const [dayCloseAccessSavingUserId, setDayCloseAccessSavingUserId] = useState(null);
  const [dayClosePinUser, setDayClosePinUser] = useState(null);
  const [savingDayClosePin, setSavingDayClosePin] = useState(false);
  const [employeeDirectoryRevision, setEmployeeDirectoryRevision] = useState(0);
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    phoneNumber: ''
  });
  const [posForm, setPosForm] = useState({
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
  const [storefrontForm, setStorefrontForm] = useState({
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
    storefrontDeliveryPartners: [{ partner: 'grab', label: '', url: '' }],
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
  const [storefrontAssets, setStorefrontAssets] = useState({ cover: '', profile: '' });
  const [assetUploadingType, setAssetUploadingType] = useState('');
  const [assetDeletingType, setAssetDeletingType] = useState('');
  const [storefrontLocations, setStorefrontLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [pendingLocationAction, setPendingLocationAction] = useState(null);
  const [editingLocationId, setEditingLocationId] = useState(null);
  const [locationForm, setLocationForm] = useState(createDefaultLocationForm());
  const [validationModalState, setValidationModalState] = useState({
    open: false,
    title: '',
    description: '',
    errors: []
  });
  const animationTimersRef = useRef([]);
  const previousInitialTabRef = useRef(initialTab);
  const readiness = terminalMeta?.locationBindingReadiness || null;
  const storefrontPublicUrl = useMemo(() => resolveStorefrontTenantUrl({
    slug: storefrontForm.storeTenantSlug
  }), [storefrontForm.storeTenantSlug]);
  const hasActivePrimaryStorefrontLocation = storefrontLocations.some((location) => location?.is_active === true && location?.is_primary_storefront === true);
  const storefrontLocationRequired = storefrontForm.storeIsVisible === true && storefrontForm.storeHasNoLocation !== true;
  const requestedCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMode);
  const effectiveCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessEffectiveMode || requestedCustomerAccessMode);
  const lastFulfillmentMethodLocked = effectiveCustomerAccessMode === 'transaction'
    && locationForm.supports_delivery !== locationForm.supports_pickup;
  // #1218: mirrors tenantLocationUseCases.js's assertFulfillmentLeadTimeValid via the shared
  // evaluateFulfillmentLeadTime helper -- same rule handleSaveLocation's own localErrors check
  // below re-runs against the built payload; this is the live-typing render-time version.
  const { requiredMissing: leadTimeRequiredMissing, rangeInverted: leadTimeRangeInverted } = evaluateFulfillmentLeadTime(locationForm);
  const maxCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMaxMode || 'transaction', 'transaction');
  const platformMaxCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessPlatformMaxMode || 'transaction', 'transaction');
  const customerAccessRollbackActive = storefrontForm.customerAccessFlagStatus === 'rollback';
  const customerAccessLimitation = CUSTOMER_ACCESS_MODE_RANK[requestedCustomerAccessMode] > CUSTOMER_ACCESS_MODE_RANK[maxCustomerAccessMode]
    ? (storefrontForm.customerAccessLimitationReason || `Requested mode is currently capped at ${maxCustomerAccessMode}.`)
    : (storefrontForm.customerAccessLimitationReason || 'Requested mode is currently available.');
  const activeCashierUsers = useMemo(() => (
    cashierUsers.filter((user) => String(user?.role || '').toLowerCase() === 'cashier' && user?.is_active !== false && !user?.deleted_at)
  ), [cashierUsers]);
  const getCashiersForLocation = useCallback((locationId) => {
    const normalizedLocationId = toPositiveInt(locationId);
    if (!normalizedLocationId) return [];
    return activeCashierUsers.filter((cashier) => (
      Array.isArray(cashier?.location_ids)
      && cashier.location_ids.some((entry) => toPositiveInt(entry) === normalizedLocationId)
    ));
  }, [activeCashierUsers]);
  const openValidationModal = useCallback(({ title, description = '', errors = [] }) => {
    setValidationModalState({
      open: true,
      title: String(title || '').trim(),
      description: String(description || '').trim(),
      errors: Array.isArray(errors) ? errors : []
    });
  }, []);
  const closeValidationModal = useCallback(() => {
    setValidationModalState((current) => ({
      ...current,
      open: false
    }));
  }, []);
  const SETTINGS_TABS = [
    { id: 'profile', label: 'Profile Setting', icon: UserRound },
    { id: 'pos_setup', label: 'POS Setup', icon: Settings2 },
    { id: 'storefront', label: 'Storefront', icon: Store },
    // Phase 143 (#848): downpayment policy config -- gated on downpayment:view/downpayment:settings,
    // not on any of the other tabs' permissions.
    ...(canViewDownpayment
      ? [{ id: 'payments', label: 'Payments', icon: Banknote }]
      : []),
    // Phase 233b (#1341, epic #1321): hidden entirely (not merely disabled) for a POS role
    // without settings:edit -- matches #1341's acceptance evidence ("a POS role without the
    // required permission cannot see or use the screen").
    ...(canEditSettings
      ? [{ id: 'delivery_pricing', label: 'Delivery Pricing', icon: Truck }]
      : []),
    ...(canManageEmployees || canManageEmployeeCredit
      ? [{ id: 'employees', label: 'Employees', icon: Users }]
      : [])
    // #732: Vouchers and Pricelists moved out of this tab strip to their own top-level nav modes
    // (settings_vouchers / settings_pricelists) -- see the outer renderWorkspace switch.
  ];
  const resolveTabIndex = (tabId) => {
    const index = SETTINGS_TABS.findIndex((tab) => tab.id === tabId);
    return index >= 0 ? index : 0;
  };

  const clearAnimationTimers = useCallback(() => {
    animationTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    animationTimersRef.current = [];
  }, []);

  useEffect(() => () => clearAnimationTimers(), [clearAnimationTimers]);

  useEffect(() => {
    if (!initialTab) return;
    if (previousInitialTabRef.current === initialTab) return;
    previousInitialTabRef.current = initialTab;
    clearAnimationTimers();
    const resetTimerId = window.setTimeout(() => {
      setActiveTab(initialTab);
      setRenderedTab(initialTab);
      setPaneInlineStyle({
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'transform 150ms ease, opacity 150ms ease'
      });
    }, 0);
    animationTimersRef.current.push(resetTimerId);
  }, [clearAnimationTimers, initialTab]);

  useEffect(() => {
    setProfileForm({
      username: String(terminalUser?.username || ''),
      email: String(terminalUser?.email || ''),
      phoneNumber: String(terminalUser?.phone_number || '')
    });
  }, [terminalUser]);

  const loadStorefrontLocations = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLocationsLoading(true);
    }
    try {
      const rows = await tenantLocationService.listTenantLocations({ include_inactive: true });
      setStorefrontLocations(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load storefront locations.');
      }
    } finally {
      setLocationsLoading(false);
    }
  }, []);

  const loadCashierAccounts = useCallback(async ({ silent = false } = {}) => {
    if (!canManageCashiers) {
      setCashierUsers([]);
      setCashiersLoaded(true);
      return;
    }
    if (!silent) setCashiersLoading(true);
    try {
      const rows = await fetchPosSetupCashiers();
      setCashierUsers(Array.isArray(rows) ? rows : []);
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load cashier accounts.');
      }
    } finally {
      setCashiersLoading(false);
      setCashiersLoaded(true);
    }
  }, [canManageCashiers]);

  const updateCashierVoidAccess = useCallback(async (user, enabled) => {
    const userId = Number(user?.user_id);
    const role = String(user?.role || '').trim().toLowerCase();
    if (!canManageCashiers || !Number.isInteger(userId) || userId <= 0 || role !== 'cashier' || user?.is_master_admin === true) {
      return;
    }

    const permissions = resolveUserPermissionList(user);
    const nextPermissions = enabled
      ? Array.from(new Set([...permissions, 'pos:void']))
      : permissions.filter((permission) => permission !== 'pos:void');

    setCashierVoidAccessSavingUserId(userId);
    try {
      const updated = await updateUserPermissions(userId, nextPermissions);
      setCashierUsers((current) => current.map((entry) => (
        Number(entry?.user_id) === userId
          ? { ...entry, permissions: updated?.permissions || nextPermissions }
          : entry
      )));
      toast.success(enabled
        ? 'POS void access enabled for this cashier.'
        : 'POS void access disabled for this cashier.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update cashier POS void access.');
    } finally {
      setCashierVoidAccessSavingUserId(null);
    }
  }, [canManageCashiers]);

  const updateCashierDrawerAccess = useCallback(async (user, enabled) => {
    const userId = Number(user?.user_id);
    const role = String(user?.role || '').trim().toLowerCase();
    if (!canManageCashiers || !Number.isInteger(userId) || userId <= 0 || role !== 'cashier' || user?.is_master_admin === true) {
      return;
    }

    const permissions = resolveUserPermissionList(user);
    const nextPermissions = enabled
      ? Array.from(new Set([...permissions, 'pos:cash_drawer_adjust']))
      : permissions.filter((permission) => permission !== 'pos:cash_drawer_adjust');

    setCashierVoidAccessSavingUserId(userId);
    try {
      const updated = await updateUserPermissions(userId, nextPermissions);
      setCashierUsers((current) => current.map((entry) => (
        Number(entry?.user_id) === userId
          ? { ...entry, permissions: updated?.permissions || nextPermissions }
          : entry
      )));
      toast.success(enabled
        ? 'Cash refund and drawer adjustment access enabled for this cashier.'
        : 'Cash refund and drawer adjustment access disabled for this cashier.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update cashier cash refund access.');
    } finally {
      setCashierVoidAccessSavingUserId(null);
    }
  }, [canManageCashiers]);

  const loadDiscountApprovers = useCallback(async ({ silent = false } = {}) => {
    if (!canManageDiscountApprovalPins) {
      setDiscountApprovers([]);
      return;
    }
    if (!silent) setDiscountApproversLoading(true);
    try {
      const rows = await getAllUsers({ include_invitations: false });
      setDiscountApprovers((Array.isArray(rows) ? rows : [])
        .filter((user) => user?.is_active !== false && !user?.deleted_at)
        .sort((left, right) => String(left?.username || '').localeCompare(String(right?.username || ''))));
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load discount approvers.');
      }
    } finally {
      setDiscountApproversLoading(false);
    }
  }, [canManageDiscountApprovalPins]);

  const updateDiscountAuthorization = useCallback(async (user, enabled) => {
    const userId = Number(user?.user_id);
    if (!Number.isInteger(userId) || userId <= 0 || user?.is_master_admin === true) return;
    const permissions = resolveUserPermissionList(user);
    const nextPermissions = enabled
      ? Array.from(new Set([...permissions, 'pos:discount_authorize']))
      : permissions.filter((permission) => permission !== 'pos:discount_authorize');

    setDiscountAuthorizationSavingUserId(userId);
    try {
      const updated = await updateUserPermissions(userId, nextPermissions);
      setDiscountApprovers((current) => current.map((entry) => (
        Number(entry?.user_id) === userId
          ? { ...entry, permissions: updated?.permissions || nextPermissions }
          : entry
      )));
      toast.success(enabled
        ? 'POS discount authorization enabled. Set a PIN for this employee.'
        : 'POS discount authorization disabled for this employee.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update POS discount authorization.');
    } finally {
      setDiscountAuthorizationSavingUserId(null);
    }
  }, []);

  const loadDayCloseOperators = useCallback(async ({ silent = false } = {}) => {
    if (!canManageDayClosePins) {
      setDayCloseOperators([]);
      return;
    }
    if (!silent) setDayCloseOperatorsLoading(true);
    try {
      const rows = await getAllUsers({ include_invitations: false });
      setDayCloseOperators((Array.isArray(rows) ? rows : [])
        .filter((user) => user?.is_active !== false && !user?.deleted_at)
        .filter((user) => (
          String(user?.role || '').trim().toLowerCase() === 'cashier'
          || user?.is_master_admin === true
          || resolveUserPermissionList(user).includes('pos:close_day')
        ))
        .sort((left, right) => String(left?.username || '').localeCompare(String(right?.username || ''))));
    } catch (error) {
      if (!silent) {
        toast.error(error?.response?.data?.message || 'Failed to load Day Close operators.');
      }
    } finally {
      setDayCloseOperatorsLoading(false);
    }
  }, [canManageDayClosePins]);

  const updateDayCloseAccess = useCallback(async (user, enabled) => {
    const userId = Number(user?.user_id);
    if (!Number.isInteger(userId) || userId <= 0 || user?.is_master_admin === true) return;
    const permissions = resolveUserPermissionList(user);
    const nextPermissions = enabled
      ? Array.from(new Set([...permissions, 'pos:close_day']))
      : permissions.filter((permission) => permission !== 'pos:close_day');

    setDayCloseAccessSavingUserId(userId);
    try {
      const updated = await updateUserPermissions(userId, nextPermissions);
      setDayCloseOperators((current) => current.map((entry) => (
        Number(entry?.user_id) === userId
          ? { ...entry, permissions: updated?.permissions || nextPermissions }
          : entry
      )));
      toast.success(enabled
        ? 'Z-reading access enabled. The cashier must create their personal PIN in DGFY Business.'
        : 'Z-reading access disabled for this cashier.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update cashier Z-reading access.');
    } finally {
      setDayCloseAccessSavingUserId(null);
    }
  }, []);

  const closeApprovalPinDialog = useCallback(() => {
    if (savingApprovalPin) return;
    setApprovalPinUser(null);
    setApprovalPin('');
  }, [savingApprovalPin]);

  const saveApprovalPin = useCallback(async ({ clear = false } = {}) => {
    if (!approvalPinUser) return;
    if (!clear && !/^\d{4,12}$/.test(approvalPin)) {
      toast.error('POS approval PIN must contain 4 to 12 digits.');
      return;
    }
    setSavingApprovalPin(true);
    try {
      const updated = await updatePosApprovalPin(approvalPinUser.user_id, { pin: approvalPin, clear });
      setDiscountApprovers((current) => current.map((user) => (
        user.user_id === approvalPinUser.user_id
          ? { ...user, pos_approval_pin_configured: updated.pos_approval_pin_configured === true }
          : user
      )));
      toast.success(clear ? 'POS approval PIN cleared.' : 'POS approval PIN configured.');
      setApprovalPinUser(null);
      setApprovalPin('');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update POS approval PIN.');
    } finally {
      setSavingApprovalPin(false);
    }
  }, [approvalPin, approvalPinUser]);

  const closeDayClosePinDialog = useCallback(() => {
    if (savingDayClosePin) return;
    setDayClosePinUser(null);
  }, [savingDayClosePin]);

  const resetDayClosePin = useCallback(async () => {
    if (!dayClosePinUser) return;
    setSavingDayClosePin(true);
    try {
      const updated = await updatePosDayClosePin(dayClosePinUser.user_id);
      setDayCloseOperators((current) => current.map((user) => (
        user.user_id === dayClosePinUser.user_id
          ? { ...user, pos_day_close_pin_configured: updated.pos_day_close_pin_configured === true }
          : user
      )));
      toast.success('POS Day Close PIN reset. The cashier must create a new PIN from DGFY Business.');
      setDayClosePinUser(null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to reset POS Day Close PIN.');
    } finally {
      setSavingDayClosePin(false);
    }
  }, [dayClosePinUser]);

  const hydrateSettingsWorkspace = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const [settingsPayload, companyPayload] = await Promise.all([
        getAllSettings({ force: true }),
        terminalUser?.is_master_admin === true ? getCompanyInfo().catch(() => null) : Promise.resolve(null)
      ]);
      const storefrontSocialLinks = parseJsonObjectSetting(settingsPayload?.storefront_social_links?.value);
      const storefrontReviewSummary = parseJsonObjectSetting(settingsPayload?.storefront_review_summary?.value);
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
      const normalizedReviewSummary = normalizeStorefrontReviewSummarySettings(storefrontReviewSummary);
      const discountProfiles = settingsPayload?.pos_discount_profiles?.value || [];
      const activeDiscountCount = Array.isArray(discountProfiles)
        ? discountProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
        : 0;
      setCompanyInfo(companyPayload);
      setPosForm({
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
        terminalRegistryMode: TERMINAL_REGISTRY_MODE_OPTIONS.includes(String(settingsPayload?.pos_terminal_registry_mode?.value || '').trim().toLowerCase())
          ? String(settingsPayload?.pos_terminal_registry_mode?.value || '').trim().toLowerCase()
          : 'warn',
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
        bestSellerAutoTaggingEnabled: settingsPayload?.pos_best_seller_settings?.value?.enabled !== false,
        dailyTopBestSellerEnabled: settingsPayload?.pos_best_seller_settings?.value?.daily_top_enabled === true
      });
      setStorefrontForm({
        storeTenantSlug: String(settingsPayload?.store_tenant_slug?.value || '').trim().toLowerCase(),
        storeIsVisible: settingsPayload?.store_is_visible?.value === true,
        storeHasNoLocation: settingsPayload?.store_has_no_location?.value === true,
        ...customerAccessRuntime,
        storefrontTagline: String(settingsPayload?.storefront_tagline?.value || ''),
        storefrontPhone: String(settingsPayload?.storefront_phone?.value || ''),
        storefrontEmail: String(settingsPayload?.storefront_email?.value || ''),
        storefrontAbout: String(settingsPayload?.storefront_about?.value || ''),
        storefrontHours: normalizeStorefrontBusinessHours(settingsPayload?.storefront_hours?.value),
        storefrontWhyChooseUs: normalizeStringList(settingsPayload?.storefront_why_choose_us?.value, 6, 120).length > 0
          ? normalizeStringList(settingsPayload?.storefront_why_choose_us?.value, 6, 120)
          : [''],
        storefrontSocialMessenger: String(storefrontSocialLinks.messenger || ''),
        storefrontSocialFacebook: String(storefrontSocialLinks.facebook || ''),
        storefrontSocialInstagram: String(storefrontSocialLinks.instagram || ''),
        storefrontUiV2Enabled: settingsPayload?.storefront_ui_v2_enabled?.value === true,
        storefrontCategories: normalizeStringList(storefrontCategoriesRaw, 12, 60).length > 0
          ? normalizeStringList(storefrontCategoriesRaw, 12, 60)
          : [''],
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
        // #622: fail-open default -- an unset row (every tenant provisioned before this shipped)
        // must hydrate to checked/on, matching the backend's own DEFAULT_GUEST_CHECKOUT_ENABLED.
        storefrontGuestCheckoutEnabled: settingsPayload?.storefront_guest_checkout_enabled?.value !== false,
        // #626 (Phase 203): same fail-open shape, matching DEFAULT_CASH_PAYMENT_ENABLED.
        storefrontCashPaymentEnabled: settingsPayload?.storefront_cash_payment_enabled?.value !== false
      });
      setStorefrontAssets({
        cover: String(settingsPayload?.storefront_cover_image_url?.value || ''),
        profile: String(settingsPayload?.storefront_profile_image_url?.value || '')
      });
    } catch (error) {
      if (!silent) {
        setLoadError(error?.response?.data?.message || 'Failed to load shared settings.');
      }
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [terminalMeta?.pettyCashAmount, terminalMeta?.pettyCashSymbol, terminalUser?.is_master_admin]);

  useEffect(() => {
    hydrateSettingsWorkspace();
  }, [hydrateSettingsWorkspace]);

  useEffect(() => {
    loadStorefrontLocations({ silent: true });
  }, [loadStorefrontLocations]);

  useEffect(() => {
    loadCashierAccounts({ silent: true });
  }, [loadCashierAccounts]);

  useEffect(() => {
    loadDiscountApprovers({ silent: true });
  }, [loadDiscountApprovers]);

  useEffect(() => {
    loadDayCloseOperators({ silent: true });
  }, [loadDayCloseOperators]);

  const handleTabChange = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) return;
    clearAnimationTimers();

    const movingForward = resolveTabIndex(nextTab) > resolveTabIndex(activeTab);
    const exitOffset = movingForward ? -28 : 28;
    const enterOffset = movingForward ? 28 : -28;

    setActiveTab(nextTab);
    setPaneInlineStyle({
      transform: `translateX(${exitOffset}px)`,
      opacity: 0,
      transition: 'transform 150ms ease, opacity 150ms ease'
    });

    const swapTimer = window.setTimeout(() => {
      setRenderedTab(nextTab);
      setPaneInlineStyle({
        transform: `translateX(${enterOffset}px)`,
        opacity: 0,
        transition: 'none'
      });

      const enterTimer = window.setTimeout(() => {
        setPaneInlineStyle({
          transform: 'translateX(0)',
          opacity: 1,
          transition: 'transform 150ms ease, opacity 150ms ease'
        });
      }, 16);

      animationTimersRef.current.push(enterTimer);
    }, 150);

    animationTimersRef.current.push(swapTimer);
  }, [activeTab, clearAnimationTimers]);

  const handleProfileSave = useCallback(async () => {
    setSavingTab('profile');
    try {
      await updateProfile({
        username: String(profileForm.username || '').trim(),
        email: String(profileForm.email || '').trim(),
        phone_number: String(profileForm.phoneNumber || '').trim()
      });
      await onRefreshTerminalUser?.({ suppressGlobalErrors: true });
      toast.success('Profile settings updated.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update profile settings.');
    } finally {
      setSavingTab('');
    }
  }, [onRefreshTerminalUser, profileForm.email, profileForm.phoneNumber, profileForm.username]);

  const handleDiscountProfileChange = useCallback((index, key, value) => {
    setPosForm((current) => {
      const nextProfiles = Array.isArray(current.discountProfiles)
        ? [...current.discountProfiles]
        : [];
      const existing = nextProfiles[index] || { name: '', percentage: 0, active: true };
      nextProfiles[index] = {
        ...existing,
        [key]: key === 'percentage' ? Number(value) : value
      };
      return {
        ...current,
        discountProfiles: nextProfiles,
        activeDiscountCount: nextProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
      };
    });
  }, []);

  const addDiscountProfile = useCallback(() => {
    setPosForm((current) => {
      const nextProfiles = [
        ...(Array.isArray(current.discountProfiles) ? current.discountProfiles : []),
        { name: '', percentage: 0, active: true }
      ];
      return { ...current, discountProfiles: nextProfiles, activeDiscountCount: nextProfiles.length };
    });
  }, []);

  const removeDiscountProfile = useCallback((index) => {
    setPosForm((current) => {
      const nextProfiles = (Array.isArray(current.discountProfiles) ? current.discountProfiles : [])
        .filter((_, profileIndex) => profileIndex !== index);
      return {
        ...current,
        discountProfiles: nextProfiles,
        activeDiscountCount: nextProfiles.filter((profile) => profile && profile.active !== false && String(profile.name || '').trim()).length
      };
    });
  }, []);

  const handleTerminalRegistryChange = useCallback((index, key, value) => {
    setPosForm((current) => {
      const entries = Array.isArray(current.terminalRegistry)
        ? current.terminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
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
        if (fallbackIndex >= 0) {
          entries[fallbackIndex].is_default = true;
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

      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const addTerminalRegistryEntry = useCallback(() => {
    setPosForm((current) => {
      const entries = Array.isArray(current.terminalRegistry)
        ? current.terminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id),
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      entries.push({
        terminal_id: createSuggestedTerminalId(entries),
        label: '',
        location_id: null,
        is_active: true,
        is_default: entries.length === 0,
        pairing_version: '',
        rotate_pairing: false
      });
      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const removeTerminalRegistryEntry = useCallback((index) => {
    setPosForm((current) => {
      const entries = (Array.isArray(current.terminalRegistry) ? current.terminalRegistry : [])
        .map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
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

      return { ...current, terminalRegistry: entries };
    });
  }, []);

  const handleLocationPinChange = useCallback(({ latitude, longitude, address_line }) => {
    const formatCoordinate = (value) => {
      const numeric = Number(value);
      return Number.isFinite(numeric) ? numeric.toFixed(6) : String(value || '');
    };

    const nextAddress = String(address_line || '').trim();
    setLocationForm((current) => ({
      ...current,
      latitude: formatCoordinate(latitude),
      longitude: formatCoordinate(longitude),
      ...(nextAddress ? { address_line: nextAddress } : {})
    }));
  }, []);

  const buildTerminalRegistryPayload = useCallback(() => {
    const rawTerminalRegistry = Array.isArray(posForm.terminalRegistry)
      ? posForm.terminalRegistry
      : [];
    const candidateTerminalEntries = rawTerminalRegistry
      .map((entry) => ({
        terminal_id: sanitizeTerminalId(entry?.terminal_id),
        label: String(entry?.label || '').trim(),
        location_id: toPositiveInt(entry?.location_id),
        is_active: entry?.is_active !== false,
        is_default: entry?.is_default === true,
        pairing_version: String(entry?.pairing_version || '').trim(),
        rotate_pairing: entry?.rotate_pairing === true
      }))
      .filter((entry) => entry.terminal_id || entry.label || entry.is_default || entry.is_active === false);

    const invalidTerminalEntry = candidateTerminalEntries.find((entry) => !entry.terminal_id || !TERMINAL_ID_PATTERN.test(entry.terminal_id));
    if (invalidTerminalEntry) {
      throw new Error(`Invalid terminal ID: ${invalidTerminalEntry.terminal_id || '(empty)'}`);
    }

    const seenTerminalIds = new Set();
    for (const entry of candidateTerminalEntries) {
      if (seenTerminalIds.has(entry.terminal_id)) {
        throw new Error(`Duplicate terminal ID: ${entry.terminal_id}`);
      }
      seenTerminalIds.add(entry.terminal_id);
    }

    const defaultTerminalCount = candidateTerminalEntries.filter((entry) => entry.is_default === true).length;
    if (defaultTerminalCount > 1) {
      throw new Error('Only one default terminal can be configured.');
    }

    const posTerminalRegistry = candidateTerminalEntries.map((entry) => ({
      terminal_id: entry.terminal_id,
      label: entry.label,
      location_id: entry.location_id,
      is_active: entry.is_active !== false,
      is_default: entry.is_default === true,
      pairing_version: entry.pairing_version,
      rotate_pairing: entry.rotate_pairing === true
    }));
    const posTerminalRegistryMode = TERMINAL_REGISTRY_MODE_OPTIONS.includes(String(posForm.terminalRegistryMode || '').trim().toLowerCase())
      ? String(posForm.terminalRegistryMode || '').trim().toLowerCase()
      : 'warn';
    const normalizedRegistryState = normalizeTerminalRegistry(posTerminalRegistry);
    const activeRegistryEntries = normalizedRegistryState.filter((entry) => entry?.is_active !== false);
    if (posTerminalRegistryMode === 'enforce' && activeRegistryEntries.length === 0) {
      throw new Error('Terminal registry mode "enforce" requires at least one active terminal entry.');
    }

    return {
      posTerminalRegistry,
      normalizedRegistryState,
      posTerminalRegistryMode
    };
  }, [posForm.terminalRegistry, posForm.terminalRegistryMode]);

  const handleTerminalRegistrySave = useCallback(async () => {
    setSavingTab('terminal_registry');
    try {
      const { posTerminalRegistry, normalizedRegistryState, posTerminalRegistryMode } = buildTerminalRegistryPayload();

      const updatedSettings = await updateSettings({
        pos_terminal_registry: posTerminalRegistry,
        pos_terminal_registry_mode: posTerminalRegistryMode,
        pos_terminal_location_binding_enforced: posForm.terminalLocationBindingEnforced === true
      });

      const savedRegistry = normalizeTerminalRegistry(
        updatedSettings?.pos_terminal_registry?.value
          || updatedSettings?.pos_terminal_registry
          || normalizedRegistryState
      );

      setPosForm((current) => ({
        ...current,
        terminalRegistry: savedRegistry.map((entry) => ({
          ...entry,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: false
        })),
        terminalRegistryMode: posTerminalRegistryMode
      }));

      await Promise.all([
        onRefreshTerminalMeta?.(),
        onRefreshTerminalUser?.({ suppressGlobalErrors: true })
      ]);
      toast.success('Terminal registry saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save terminal registry.');
    } finally {
      setSavingTab('');
    }
  }, [buildTerminalRegistryPayload, onRefreshTerminalMeta, onRefreshTerminalUser, posForm.terminalLocationBindingEnforced]);

  const handlePosSave = useCallback(async () => {
    setSavingTab('pos_setup');
    try {
      const posDiscountProfiles = (Array.isArray(posForm.discountProfiles) ? posForm.discountProfiles : [])
        .map(sanitizeDiscountProfile)
        .filter((profile) => profile.name.length > 0);

      const normalizedDiscountNames = new Set();
      for (const profile of posDiscountProfiles) {
        const normalizedName = profile.name.toLowerCase();
        if (normalizedDiscountNames.has(normalizedName)) {
          toast.error(`Duplicate POS discount name: ${profile.name}`);
          return;
        }
        normalizedDiscountNames.add(normalizedName);
      }

      const { posTerminalRegistry, posTerminalRegistryMode } = buildTerminalRegistryPayload();

      await updateSettings({
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
      });
      await Promise.all([
        hydrateSettingsWorkspace(),
        onRefreshTerminalMeta?.(),
        onRefreshTerminalUser?.({ suppressGlobalErrors: true })
      ]);
      await onPosSetupSaved?.();
      toast.success('POS setup synced to shared settings.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save POS setup.');
    } finally {
      setSavingTab('');
    }
  }, [buildTerminalRegistryPayload, hydrateSettingsWorkspace, onPosSetupSaved, onRefreshTerminalMeta, onRefreshTerminalUser, posForm]);

  const handleStorefrontSave = useCallback(async () => {
    setSavingTab('storefront');
    try {
      if (storefrontLocationRequired && !hasActivePrimaryStorefrontLocation) {
        openValidationModal({
          title: formatValidationModalTitle('Storefront Save'),
          description: 'A public storefront without the no-map-pin option still needs one active primary storefront location before it can be saved.',
          errors: [
            {
              field: 'storefront_locations.primary_location',
              message: 'Add or mark one active location as the primary storefront location.'
            }
          ]
        });
        return;
      }
      const storefrontReviewHighlights = (Array.isArray(storefrontForm.storefrontReviewHighlights) ? storefrontForm.storefrontReviewHighlights : [])
        .map((entry) => ({
          reviewer_name: String(entry?.reviewer_name || '').trim().slice(0, 80),
          rating: parseNullableNumberInput(entry?.rating, { min: 0, max: 5, precision: 1 }),
          comment: String(entry?.comment || '').trim().slice(0, 240)
        }))
        .filter((entry) => entry.reviewer_name || entry.comment || entry.rating !== null);
      await updateSettings({
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
        // #695/#988: storefront_promo and storefront_promos are intentionally omitted here. Every
        // promo control above is now frozen (view-only), but this save handler used to write both
        // legacy keys on EVERY storefront save regardless -- which would silently recreate them
        // after the #695 migration deletes them. updateSettings only touches keys present in the
        // request body, so omitting both here leaves whatever is stored on those keys strictly
        // alone. Mirrors the same fix already applied to the singular editor in
        // apps/dgfy-ims/Pages/Settings.jsx.
        storefront_follow_enabled: storefrontForm.storefrontFollowEnabled === true,
        storefront_share_enabled: storefrontForm.storefrontShareEnabled === true,
        storefront_guest_checkout_enabled: storefrontForm.storefrontGuestCheckoutEnabled !== false,
        storefront_cash_payment_enabled: storefrontForm.storefrontCashPaymentEnabled !== false
      });
      await hydrateSettingsWorkspace({ silent: true });
      await onStorefrontSetupSaved?.();
      toast.success('Storefront settings synced to shared settings.');
    } catch (error) {
      const validationErrors = collectValidationErrors(error, 'Failed to save storefront settings.');
      const validationDescription = formatValidationErrorDescription(validationErrors);
      openValidationModal({
        title: formatValidationModalTitle('Storefront Save'),
        description: 'Review the blocking fields below, then try saving again.',
        errors: validationErrors
      });
      toast.error(
        formatFirstValidationError(error, 'Failed to save storefront settings.'),
        validationDescription ? { description: validationDescription } : undefined
      );
    } finally {
      setSavingTab('');
    }
  }, [hasActivePrimaryStorefrontLocation, hydrateSettingsWorkspace, onStorefrontSetupSaved, openValidationModal, storefrontForm, storefrontLocationRequired]);

  const handleGenerateStorefrontSlug = useCallback(async () => {
    if (savingTab) return;
    setSavingTab('storefront_slug');
    try {
      const generated = await generateStorefrontSlug();
      const slug = String(generated?.store_tenant_slug || '').trim().toLowerCase();
      if (!slug) throw new Error('The server did not return a Storefront ID.');
      setStorefrontForm((current) => ({ ...current, storeTenantSlug: slug }));
      await hydrateSettingsWorkspace({ silent: true });
      await onStorefrontSetupSaved?.();
      toast.success(generated?.generated === false
        ? 'Storefront ID is already configured.'
        : 'Storefront ID generated. Item QR codes are now available.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to generate Storefront ID.');
    } finally {
      setSavingTab('');
    }
  }, [hydrateSettingsWorkspace, onStorefrontSetupSaved, savingTab]);

  const handleCopyStorefrontUrl = useCallback(async () => {
    if (!storefrontPublicUrl) return;
    try {
      await navigator.clipboard.writeText(storefrontPublicUrl);
      toast.success('Storefront URL copied.');
    } catch {
      toast.error('Unable to copy the Storefront URL.');
    }
  }, [storefrontPublicUrl]);

  const handleCustomerAccessModeChange = useCallback(async (nextMode) => {
    const normalizedMode = normalizeCustomerAccessMode(nextMode);
    const previousMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMode);
    if (!normalizedMode || normalizedMode === previousMode) return;

    setStorefrontForm((current) => ({ ...current, customerAccessMode: normalizedMode }));
    setSavingTab('storefront_access_mode');
    try {
      await updateSettingByKey('customer_access_mode', normalizedMode);
      const refreshedSettings = await getAllSettings({ force: true });
      const refreshedRuntime = mapCustomerAccessRuntimeSettings(refreshedSettings);
      setStorefrontForm((current) => ({
        ...current,
        ...refreshedRuntime
      }));
      await onStorefrontSetupSaved?.();
      toast.success('Customer access mode updated.');
    } catch (error) {
      setStorefrontForm((current) => ({
        ...current,
        customerAccessMode: previousMode
      }));
      toast.error(error?.response?.data?.message || 'Failed to update customer access mode.');
    } finally {
      setSavingTab('');
    }
  }, [onStorefrontSetupSaved, storefrontForm.customerAccessMode]);

  const handleStorefrontListChange = useCallback((field, index, value) => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next[index] = value;
      return { ...current, [field]: next };
    });
  }, []);

  const addStorefrontListRow = useCallback((field, fallback = '') => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next.push(fallback);
      return { ...current, [field]: next };
    });
  }, []);

  const removeStorefrontListRow = useCallback((field, index, fallback = '') => {
    setStorefrontForm((current) => {
      const next = (Array.isArray(current[field]) ? current[field] : []).filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [field]: next.length > 0 ? next : [fallback] };
    });
  }, []);

  const handleStorefrontObjectRowChange = useCallback((field, index, key, value) => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next[index] = { ...(next[index] || {}), [key]: value };
      return { ...current, [field]: next };
    });
  }, []);

  const addStorefrontObjectRow = useCallback((field, fallback) => {
    setStorefrontForm((current) => {
      const next = Array.isArray(current[field]) ? [...current[field]] : [];
      next.push(fallback);
      return { ...current, [field]: next };
    });
  }, []);

  const removeStorefrontObjectRow = useCallback((field, index, fallback) => {
    setStorefrontForm((current) => {
      const next = (Array.isArray(current[field]) ? current[field] : []).filter((_, rowIndex) => rowIndex !== index);
      return { ...current, [field]: next.length > 0 ? next : [fallback] };
    });
  }, []);

  const resetLocationForm = useCallback(() => {
    setEditingLocationId(null);
    setLocationForm(createDefaultLocationForm());
  }, []);

  const handleEditLocation = useCallback((location) => {
    if (!location) return;
    setEditingLocationId(location.location_id);
    setLocationForm({
      name: String(location.name || ''),
      address_line: String(location.address_line || ''),
      latitude: String(location.latitude ?? ''),
      longitude: String(location.longitude ?? ''),
      location_version: String(location.updated_at || ''),
      delivery_radius_km: String(location.delivery_radius_km ?? '5'),
      current_wait_time_minutes: String(location.current_wait_time_minutes ?? '15'),
      is_open: location.is_open !== false,
      is_active: location.is_active !== false,
      is_primary_storefront: location.is_primary_storefront === true,
      allow_out_of_stock_sales: location.allow_out_of_stock_sales === true,
      supports_delivery: location.supports_delivery !== false,
      supports_pickup: location.supports_pickup !== false,
      supports_dine_in: location.supports_dine_in !== false,
      scheduling_enabled: location?.scheduling_enabled !== false,
      immediate_fulfillment_enabled: location?.immediate_fulfillment_enabled !== false,
      fulfillment_lead_time_min_days: location?.fulfillment_lead_time_min_days == null ? '' : String(location.fulfillment_lead_time_min_days),
      fulfillment_lead_time_max_days: location?.fulfillment_lead_time_max_days == null ? '' : String(location.fulfillment_lead_time_max_days)
    });
    setRenderedTab('storefront');
    setActiveTab('storefront');
  }, []);

  const handleSaveLocation = useCallback(async () => {
    const payload = {
      name: String(locationForm.name || '').trim(),
      address_line: String(locationForm.address_line || '').trim(),
      latitude: Number(locationForm.latitude),
      longitude: Number(locationForm.longitude),
      delivery_radius_km: Number(locationForm.delivery_radius_km || 0),
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
    const localErrors = [];
    if (!payload.name) {
      localErrors.push({ field: 'name', message: 'Location name is required.' });
    }
    if (!payload.address_line) {
      localErrors.push({ field: 'address_line', message: 'Location address is required.' });
    }
    if (!Number.isFinite(payload.latitude)) {
      localErrors.push({ field: 'latitude', message: 'Latitude is required.' });
    }
    if (!Number.isFinite(payload.longitude)) {
      localErrors.push({ field: 'longitude', message: 'Longitude is required.' });
    }
    // #1218: mirrors tenantLocationUseCases.js's assertFulfillmentLeadTimeValid via the shared
    // evaluateFulfillmentLeadTime helper. The server 422s either way -- this exists so the
    // cashier/owner is told before the round trip, not instead of it.
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

    if (localErrors.length > 0) {
      openValidationModal({
        title: formatValidationModalTitle(editingLocationId ? 'Update Location' : 'Add Location'),
        description: 'Fill in the required location fields before saving.',
        errors: localErrors
      });
      toast.error(localErrors[0].message);
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
      await loadStorefrontLocations({ silent: true });
      resetLocationForm();
    } catch (error) {
      const validationErrors = collectValidationErrors(error, 'Failed to save storefront location.');
      const validationDescription = formatValidationErrorDescription(validationErrors);
      openValidationModal({
        title: formatValidationModalTitle(editingLocationId ? 'Update Location' : 'Add Location'),
        description: 'Review the location errors below, then try again.',
        errors: validationErrors
      });
      toast.error(
        error?.response?.data?.message || 'Failed to save storefront location.',
        validationDescription ? { description: validationDescription } : undefined
      );
    } finally {
      setLocationSaving(false);
    }
  }, [editingLocationId, loadStorefrontLocations, locationForm, openValidationModal, resetLocationForm]);

  const handleSetPrimaryLocation = useCallback(async (location) => {
    if (!location?.location_id) return;
    setLocationSaving(true);
    try {
      await tenantLocationService.updateTenantLocation(location.location_id, { is_primary_storefront: true });
      toast.success('Primary storefront location updated.');
      await loadStorefrontLocations({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to set primary storefront location.');
    } finally {
      setLocationSaving(false);
    }
  }, [loadStorefrontLocations]);

  const handleDeactivateLocation = useCallback(async (locationId, { confirmed = false } = {}) => {
    if (!confirmed) {
      setPendingLocationAction({ type: 'deactivate', locationId });
      return true;
    }
    setLocationSaving(true);
    try {
      await tenantLocationService.deactivateTenantLocation(locationId);
      toast.success('Tenant location deactivated.');
      await loadStorefrontLocations({ silent: true });
      if (editingLocationId === locationId) {
        resetLocationForm();
      }
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to deactivate tenant location.';
      toast.error(message);
      return { success: false, message };
    } finally {
      setLocationSaving(false);
    }
  }, [editingLocationId, loadStorefrontLocations, resetLocationForm]);

  const handleReactivateLocation = useCallback(async (locationId, { confirmed = false } = {}) => {
    if (!confirmed) {
      setPendingLocationAction({ type: 'reactivate', locationId });
      return true;
    }
    setLocationSaving(true);
    try {
      await tenantLocationService.reactivateTenantLocation(locationId);
      toast.success('Tenant location reactivated.');
      await loadStorefrontLocations({ silent: true });
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to reactivate tenant location.';
      toast.error(message);
      return { success: false, message };
    } finally {
      setLocationSaving(false);
    }
  }, [loadStorefrontLocations]);

  const handleDeleteLocation = useCallback(async (locationId, { confirmed = false } = {}) => {
    if (!confirmed) {
      setPendingLocationAction({ type: 'delete', locationId });
      return true;
    }
    setLocationSaving(true);
    try {
      await tenantLocationService.deleteTenantLocation(locationId);
      toast.success('Tenant location pin deleted.');
      await loadStorefrontLocations({ silent: true });
      if (editingLocationId === locationId) {
        resetLocationForm();
      }
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to delete storefront location pin.';
      toast.error(message);
      return { success: false, message };
    } finally {
      setLocationSaving(false);
    }
  }, [editingLocationId, loadStorefrontLocations, resetLocationForm]);

  const handleUploadAsset = useCallback(async (assetType, file) => {
    if (!file) return;
    setAssetUploadingType(assetType);
    try {
      await uploadStorefrontAsset(assetType, file);
      await hydrateSettingsWorkspace();
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} updated.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload storefront asset.');
    } finally {
      setAssetUploadingType('');
    }
  }, [hydrateSettingsWorkspace]);

  const handleGalleryAssetUpload = useCallback(async (index, file) => {
    if (!file) return;
    const uploadKey = `gallery-${index}`;
    setAssetUploadingType(uploadKey);
    try {
      const uploaded = await uploadStorefrontAsset('gallery', file);
      handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'path', String(uploaded?.path || ''));
      handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'url', '');
      toast.success('Gallery image uploaded. Save Storefront Settings to publish it.');
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload gallery image.');
    } finally {
      setAssetUploadingType(null);
    }
  }, [handleStorefrontObjectRowChange]);

  const handleDeleteAsset = useCallback(async (assetType) => {
    setAssetDeletingType(assetType);
    try {
      await deleteStorefrontAsset(assetType);
      await hydrateSettingsWorkspace();
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} removed.`);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete storefront asset.');
    } finally {
      setAssetDeletingType('');
    }
  }, [hydrateSettingsWorkspace]);

  const renderProfilePane = () => (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/40">
        <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
              <UserRound className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-slate-800">Shared Account Profile</h3>
              <p className="mt-1 text-[12px] leading-5 text-slate-400 font-medium">
                These values come from the same tenant account used by IMS and POS.
              </p>
            </div>
          </div>
          {terminalUser?.is_master_admin === true && companyInfo?.company_token ? (
            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-100 rounded-xl px-4 py-2 self-stretch sm:self-auto">
              <ShieldCheck className="h-5 w-5 text-blue-600 shrink-0" />
              <div className="min-w-0">
                <span className="block text-[9px] font-extrabold uppercase tracking-[0.15em] text-slate-400">Company Token</span>
                <span className="block text-[12px] font-bold text-slate-800 break-all">{companyInfo.company_token}</span>
              </div>
            </div>
          ) : null}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-[12px] font-bold text-slate-700">Username</Label>
            <div className="relative flex items-center">
              <UserRound className="absolute left-4 h-5 w-5 text-slate-400" />
              <Input
                className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                value={profileForm.username}
                onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
                disabled={locked || loading}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label className="text-[12px] font-bold text-slate-700">Email</Label>
            <div className="relative flex items-center">
              <Mail className="absolute left-4 h-5 w-5 text-slate-400" />
              <Input
                className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                value={profileForm.email}
                onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
                disabled={locked || loading}
              />
            </div>
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label className="text-[12px] font-bold text-slate-700">Phone Number</Label>
            <div className="relative flex items-center">
              <Phone className="absolute left-4 h-5 w-5 text-slate-400" />
              <Input
                className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                value={profileForm.phoneNumber}
                onChange={(event) => setProfileForm((current) => ({ ...current, phoneNumber: event.target.value }))}
                disabled={locked || loading}
              />
            </div>
            <p className="text-[11px] text-slate-400 font-medium">Phone number stays shared across the same tenant account used by IMS and POS.</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            type="button"
            className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 text-[13px] font-extrabold text-white shadow-md shadow-blue-500/10 flex items-center gap-2 transition-all duration-200"
            disabled={locked || loading || savingTab === 'profile'}
            onClick={handleProfileSave}
          >
            {savingTab === 'profile' ? 'Saving...' : (
              <>
                <Save className="h-4 w-4" />
                <span>Save Profile</span>
              </>
            )}
          </Button>
        </div>
      </div>
      {terminalUser?.is_master_admin === true && companyInfo ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-400">Company Name</p>
            <p className="mt-2 text-[15px] font-black text-[#0F172A]">{companyInfo.company_name || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm shadow-slate-200/40">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-slate-400">Company Token</p>
            <p className="mt-2 break-all text-[13px] font-bold text-[#0F172A]">{companyInfo.company_token || '-'}</p>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderPosSetupPane = () => (
    <div className="grid gap-3">
      <div className="grid gap-3">
          <PosCashierAttendanceSettingsCard locked={locked} canEdit={canEditSettings} />
          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/40">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                  <FileText className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-800">Receipt &amp; POS Metadata</h3>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400 font-medium">
                    Shared receipt identity, terminal policy, cashier defaults, and checkout presets used by both POS and IMS.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 text-[13px] font-extrabold text-white shadow-md shadow-blue-500/10 flex items-center gap-2 transition-all duration-200 self-stretch sm:self-auto"
                  disabled={locked || loading || savingTab === 'pos_setup'}
                  onClick={handlePosSave}
                >
                  {savingTab === 'pos_setup' ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save POS Setup</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {/* Row 1: Registered Name beside Business Name */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Registered Name</Label>
                <div className="relative flex items-center">
                  <UserRound className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.registeredName}
                    onChange={(event) => setPosForm((current) => ({ ...current, registeredName: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Business Name</Label>
                <div className="relative flex items-center">
                  <Store className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.businessName}
                    onChange={(event) => setPosForm((current) => ({ ...current, businessName: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 2: Business Style beside Taxpayer Type */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Business Style</Label>
                <div className="relative flex items-center">
                  <Briefcase className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.businessStyle}
                    onChange={(event) => setPosForm((current) => ({ ...current, businessStyle: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Taxpayer Type</Label>
                <div className="relative flex items-center">
                  <Users className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 pr-10 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.taxpayerType}
                    onChange={(event) => setPosForm((current) => ({ ...current, taxpayerType: event.target.value }))}
                    disabled={locked || loading}
                  />
                  <ChevronDown className="absolute right-4 h-4 w-4 text-slate-400" />
                </div>
              </div>

              {/* Row 3: TIN / Branch beside Accreditation Number */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">TIN / Branch</Label>
                <div className="relative flex items-center">
                  <span className="absolute left-4 text-lg font-bold text-blue-600 select-none">#</span>
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.tinBranch}
                    onChange={(event) => setPosForm((current) => ({ ...current, tinBranch: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Accreditation Number</Label>
                <div className="relative flex items-center">
                  <Award className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.accreditationNumber}
                    onChange={(event) => setPosForm((current) => ({ ...current, accreditationNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 4: Business Address full width */}
              <div className="grid gap-2 md:col-span-2">
                <Label className="text-[12px] font-bold text-slate-700">Business Address</Label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.businessAddress}
                    onChange={(event) => setPosForm((current) => ({ ...current, businessAddress: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 5: PTU Number beside MIN Number */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">PTU Number</Label>
                <div className="relative flex items-center">
                  <FileText className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.ptuNumber}
                    onChange={(event) => setPosForm((current) => ({ ...current, ptuNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">MIN Number</Label>
                <div className="relative flex items-center">
                  <ShieldCheck className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.minNumber}
                    onChange={(event) => setPosForm((current) => ({ ...current, minNumber: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 6: Receipt Footer Message full width */}
              <div className="grid gap-2 md:col-span-2">
                <Label className="text-[12px] font-bold text-slate-700">Receipt Footer Message</Label>
                <div className="relative flex items-center">
                  <MessageSquare className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={posForm.receiptFooterMessage}
                    onChange={(event) => setPosForm((current) => ({ ...current, receiptFooterMessage: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
            </div>

            {/* Bottom: fiscal invoice checkbox card */}
            <div className="mt-5 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/30 p-4">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4.5 w-4.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 accent-blue-600"
                  checked={posForm.fiscalBuyerDetailsRequired === true}
                  onChange={(event) => setPosForm((current) => ({ ...current, fiscalBuyerDetailsRequired: event.target.checked }))}
                  disabled={locked || loading}
                />
                <div>
                  <span className="block text-[13px] font-bold text-slate-800">Require buyer fiscal details on fiscal invoices</span>
                  <span className="block text-[11px] text-slate-400 font-medium mt-0.5">
                    Matches the shared fiscal invoice requirement used across receipt rendering.
                  </span>
                </div>
              </label>
              <div className="text-blue-500 shrink-0">
                <AlertCircle className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/40">
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                  <Settings2 className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-800">Cashier closeout defaults</h3>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400 font-medium">
                    Used by shifts, queue operations, stock alerts, and daily reconciliation without changing receipt identity.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 text-[13px] font-extrabold text-white shadow-md shadow-blue-500/10 flex items-center gap-2 transition-all duration-200 self-stretch sm:self-auto"
                  disabled={locked || loading || savingTab === 'pos_setup'}
                  onClick={handlePosSave}
                >
                  {savingTab === 'pos_setup' ? (
                    'Saving...'
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save Defaults</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {/* Row 1: Shift-bound queue location beside Petty Cash Currency Symbol */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Queue Location (Active Shift)</Label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-4 h-5 w-5 text-blue-600 pointer-events-none" />
                  <select
                    className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-12 pr-10 text-[14px] font-semibold text-[#0F172A] outline-none appearance-none focus:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    value={queueLocationScopeId || ''}
                    disabled
                  >
                    <option value="" disabled>Open a shift to select the branch</option>
                    {locations.map((location) => (
                      <option key={`settings-location-${location.location_id}`} value={location.location_id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-4 h-4 w-4 text-slate-400 pointer-events-none" />
                </div>
                <p className="text-[11px] text-slate-500">Orders from other branches are not visible in this terminal queue.</p>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Petty Cash Currency Symbol</Label>
                <div className="relative flex items-center">
                  <CircleDollarSign className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    maxLength={12}
                    value={posForm.pettyCashSymbol}
                    onChange={(event) => setPosForm((current) => ({ ...current, pettyCashSymbol: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 2: Petty Cash Amount beside Default Wait Time */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Petty Cash Amount</Label>
                <div className="relative flex items-center">
                  <Banknote className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    type="number"
                    min="0"
                    step="0.01"
                    value={posForm.pettyCashAmount}
                    onChange={(event) => setPosForm((current) => ({ ...current, pettyCashAmount: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Default Wait Time (minutes)</Label>
                <div className="relative flex items-center">
                  <Clock className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    type="number"
                    min="0"
                    step="1"
                    value={posForm.posWaitTimeMinutes}
                    onChange={(event) => setPosForm((current) => ({ ...current, posWaitTimeMinutes: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>

              {/* Row 3: Low Stock Alert Threshold beside Live Queue card */}
              <div className="grid gap-2">
                <Label className="text-[12px] font-bold text-slate-700">Low Stock Alert Threshold</Label>
                <div className="relative flex items-center">
                  <AlertTriangle className="absolute left-4 h-5 w-5 text-blue-600" />
                  <Input
                    className="h-12 pl-12 rounded-xl border-slate-200 text-[14px] font-semibold text-[#0F172A] focus-visible:ring-2 focus-visible:ring-blue-500/20"
                    type="number"
                    min="0"
                    step="1"
                    value={posForm.inventoryLowStockDisplayThreshold}
                    onChange={(event) => setPosForm((current) => ({ ...current, inventoryLowStockDisplayThreshold: event.target.value }))}
                    disabled={locked || loading}
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end">
                <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between shadow-sm shadow-slate-100/50">
                  <div className="min-w-0 pr-4">
                    <span className="block text-[13px] font-bold text-slate-800">Live Queue</span>
                    <span className="block text-[11px] text-slate-400 font-medium mt-0.5">
                      Current online queue items waiting on the terminal.
                    </span>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-600 text-white font-extrabold shadow-sm shadow-blue-500/20 text-sm">
                    {incomingOrders.length}
                  </div>
                </div>
              </div>

              {/* Row 4: POS visible to customers toggle card beside online order sound device toggle */}
              <div className="rounded-xl border border-slate-100 bg-white p-4 flex items-center justify-between shadow-sm shadow-slate-100/50">
                <div className="min-w-0 pr-4">
                  <span className="block text-[13px] font-bold text-slate-800">POS visible to customers</span>
                  <span className="block text-[11px] text-slate-400 font-medium mt-0.5">
                    Shared tenant POS availability flag used across surfaces.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={posForm.posOpenStatus === true}
                  onClick={() => setPosForm((current) => ({ ...current, posOpenStatus: !current.posOpenStatus }))}
                  disabled={locked || loading}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    posForm.posOpenStatus === true ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      posForm.posOpenStatus === true ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 flex items-center justify-between shadow-sm shadow-slate-100/50">
                <div className="min-w-0 pr-4">
                  <span className="block text-[13px] font-bold text-slate-800">Online order sound</span>
                  <span className="block text-[11px] text-slate-400 font-medium mt-0.5">
                    Local device setting for this terminal. Mute or enable the APK chime for new online orders.
                  </span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={onlineOrderSoundEnabled === true}
                  onClick={() => setOnlineOrderSoundEnabled((current) => !current)}
                  disabled={locked || loading}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500/20 ${
                    onlineOrderSoundEnabled === true ? 'bg-blue-600' : 'bg-slate-200'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      onlineOrderSoundEnabled === true ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-200/40">
            {/* Terminal Registry Header */}
            <div className="flex flex-col sm:flex-row items-start justify-between gap-4 border-b border-slate-100 pb-5">
              <div className="flex items-center gap-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                  <Monitor className="h-6 w-6" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-[15px] font-bold text-slate-800">Terminal Registry</h3>
                  <p className="mt-1 text-[12px] leading-5 text-slate-400 font-medium">
                    Managed POS counters used for shift-open and checkout location control.
                  </p>
                </div>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button
                  type="button"
                  className="h-11 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 px-5 text-[13px] font-extrabold text-white shadow-md shadow-blue-500/10 flex items-center gap-2 transition-all duration-200"
                  onClick={handleTerminalRegistrySave}
                  disabled={locked || loading || savingTab === 'terminal_registry'}
                >
                  {savingTab === 'terminal_registry' ? 'Saving...' : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>Save</span>
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 rounded-xl border-slate-200 px-4 text-[13px] font-extrabold text-slate-700 hover:border-blue-300 hover:text-[#1A4E8D] flex items-center gap-2"
                  onClick={addTerminalRegistryEntry}
                  disabled={locked || loading}
                >
                  <Plus className="h-4 w-4" />
                  Add Terminal
                </Button>
              </div>
            </div>

            {/* Terminal Registry Mode section */}
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
              <div className="grid gap-4 md:grid-cols-[minmax(0,220px)_1fr] md:items-start">
                <div className="grid gap-2">
                  <Label className="text-[12px] font-bold text-slate-700">Terminal Registry Mode</Label>
                  <div className="relative flex items-center">
                    <select
                      className="h-12 w-full rounded-xl border border-slate-200 bg-white pl-4 pr-10 text-[14px] font-semibold text-[#0F172A] outline-none appearance-none focus:border-blue-500"
                      value={posForm.terminalRegistryMode || 'warn'}
                      onChange={(event) => setPosForm((current) => ({ ...current, terminalRegistryMode: event.target.value }))}
                      disabled={locked || loading}
                    >
                      <option value="warn">Warn (allow manual IDs)</option>
                      <option value="enforce">Enforce (registry only)</option>
                    </select>
                    <ChevronDown className="absolute right-4 h-4 w-4 text-slate-400 pointer-events-none" />
                  </div>
                </div>
                <div className="flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50/50 px-4 py-3 text-[12px] text-slate-600">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-blue-500" />
                  <span>
                    {(posForm.terminalRegistryMode || 'warn') === 'enforce'
                      ? 'Enforce mode blocks unlock, open-shift, and checkout when the terminal ID is not in the active registry.'
                      : 'Warn mode still allows manual or fallback terminal IDs, but shows policy warnings.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Strict Shift Location Binding */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-slate-800">Strict Shift Location Binding</span>
                <span className="block text-[11px] text-slate-400 font-medium mt-0.5">When enabled, shift open, checkout, and switch require location-bound terminal policy readiness.</span>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1A4E8D] shrink-0"
                checked={posForm.terminalLocationBindingEnforced === true}
                onChange={(event) => setPosForm((current) => ({ ...current, terminalLocationBindingEnforced: event.target.checked }))}
                disabled={locked || loading}
              />
            </div>

            {/* Voucher Redemption at POS (#604) -- tenant-wide master switch, default off. Currently
                gates nothing at runtime: POS voucher redemption itself is not built yet, so this
                ships the setting and its server-side guard pre-gated, ahead of that feature. */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 flex items-center gap-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Percent className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="block text-[13px] font-bold text-slate-800">Voucher Redemption at POS</span>
                <span className="block text-[11px] text-slate-400 font-medium mt-0.5">When enabled, cashiers can redeem voucher codes at checkout. Off by default -- turn on once you&apos;re ready to accept voucher codes at the counter.</span>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1A4E8D] shrink-0"
                checked={posForm.voucherPosRedemptionEnabled === true}
                onChange={(event) => setPosForm((current) => ({ ...current, voucherPosRedemptionEnabled: event.target.checked }))}
                disabled={locked || loading}
              />
            </div>

            {/* Location Binding Readiness */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <span className="block text-[13px] font-bold text-slate-800">Location Binding Readiness</span>
                  <span className={`text-[11px] font-semibold ${readiness?.ready_for_strict_mode ? 'text-emerald-600' : 'text-amber-600'}`}>
                    {readiness?.ready_for_strict_mode ? 'Ready' : 'Needs Review'}
                  </span>
                </div>
              </div>
              <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3 md:grid-cols-3">
                <div className="flex items-center gap-2 text-[12px] text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-slate-400 shrink-0" />
                  <span>Migration: <span className="font-semibold text-slate-800">{readiness?.migration_tag || '-'}</span></span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                  <span>Unresolved: <span className="font-semibold text-slate-800">{Number(readiness?.unresolved_count || 0)}</span></span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-slate-600">
                  <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
                  <span>Low confidence: <span className="font-semibold text-slate-800">{Number(readiness?.low_confidence_count || 0)}</span></span>
                </div>
              </div>
            </div>
            {terminalUser?.is_master_admin === true ? (
              <div className="mt-4 grid gap-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_auto] md:items-start">
                  <div className="grid gap-1.5">
                    <Label className="text-[12px] font-black text-[#0F172A]">Settings Access PIN</Label>
                    <Input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      data-1p-ignore="true"
                      data-lpignore="true"
                      data-bwignore="true"
                      style={{ WebkitTextSecurity: 'disc' }}
                      className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
                      value={posForm.settingsAccessPin}
                      onChange={(event) => setPosForm((current) => ({
                        ...current,
                        settingsAccessPin: event.target.value,
                        clearSettingsAccessPin: false
                      }))}
                      placeholder={posForm.settingsAccessPinEnabled ? 'Leave blank to keep current PIN' : 'Create 4 to 12 digit PIN'}
                      disabled={locked || loading}
                    />
                    <p className={`text-[11px] ${posForm.clearSettingsAccessPin === true ? 'font-semibold text-rose-600' : 'text-[#64748B]'}`}>
                      {posForm.clearSettingsAccessPin === true
                        ? 'Current Settings PIN will be cleared on save.'
                        : (posForm.settingsAccessPinEnabled
                          ? 'Non-master-admin users must enter this PIN before opening Settings.'
                          : 'Optional. Add a PIN to protect Settings for non-master-admin users.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 md:justify-end">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ${
                      posForm.settingsAccessPinEnabled
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      {posForm.settingsAccessPinEnabled ? 'PIN Enabled' : 'PIN Not Set'}
                    </span>
                    {posForm.settingsAccessPinEnabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 rounded-lg border-rose-200 px-4 text-[12px] font-extrabold text-rose-600 hover:bg-rose-50"
                        onClick={() => setPosForm((current) => ({
                          ...current,
                          settingsAccessPin: '',
                          clearSettingsAccessPin: true,
                          settingsAccessPinEnabled: false
                        }))}
                        disabled={locked || loading}
                      >
                        Clear PIN
                      </Button>
                    ) : null}
                  </div>
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-black text-[#0F172A]">POS Discount Authorization</p>
                      <p className="mt-1 text-[11px] text-[#64748B]">Enable trusted cashiers or staff here, then configure the write-only PIN they use to authorize discounts. Every discount still requires the PIN at checkout.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg px-3 text-[12px] font-extrabold"
                      onClick={() => loadDiscountApprovers()}
                      disabled={locked || loading || discountApproversLoading}
                    >
                      {discountApproversLoading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {discountApprovers.map((user) => {
                      const role = String(user?.role || '').trim().toLowerCase();
                      const isBuiltInAuthorizer = user?.is_master_admin === true || ['admin', 'manager'].includes(role);
                      const hasDiscountAuthorization = isBuiltInAuthorizer
                        || resolveUserPermissionList(user).includes('pos:discount_authorize');
                      const isSavingAuthorization = Number(discountAuthorizationSavingUserId) === Number(user?.user_id);
                      const canConfigurePin = hasDiscountAuthorization && user?.is_active !== false;
                      return (
                        <div key={`discount-approver-${user.user_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{user.username || user.email}</p>
                            <p className="text-[11px] capitalize text-[#64748B]">{user.role} · {hasDiscountAuthorization ? (user.pos_approval_pin_configured ? 'PIN configured' : 'PIN not set') : 'Authorization off'}</p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            {isBuiltInAuthorizer ? (
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-[#1A4E8D]">Built-in access</span>
                            ) : (
                              <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#334155]">
                                <span>Can authorize discounts</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-label={`Can authorize discounts for ${user.username || user.email || `user ${user.user_id}`}`}
                                  aria-checked={hasDiscountAuthorization}
                                  onClick={() => updateDiscountAuthorization(user, !hasDiscountAuthorization)}
                                  disabled={locked || loading || isSavingAuthorization}
                                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${hasDiscountAuthorization ? 'border-teal-600 bg-teal-600' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasDiscountAuthorization ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            )}
                            {canConfigurePin ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg px-3 text-[12px] font-extrabold text-teal-700"
                                onClick={() => {
                                  setApprovalPinUser(user);
                                  setApprovalPin('');
                                }}
                                disabled={locked || loading || isSavingAuthorization}
                              >
                                <KeyRound className="mr-1.5 h-4 w-4" />
                                {user.pos_approval_pin_configured ? 'Reset PIN' : 'Set PIN'}
                              </Button>
                            ) : (
                              <span className="text-[11px] font-bold text-amber-700">Enable access first</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {!discountApproversLoading && discountApprovers.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-[#64748B]">No active employee accounts are available. Add or activate an employee first.</p>
                    ) : null}
                  </div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-black text-[#0F172A]">Day Close Access</p>
                      <p className="mt-1 text-[11px] text-[#64748B]">Grant Z-reading access here. Each cashier creates their private PIN from DGFY Business.</p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-9 rounded-lg px-3 text-[12px] font-extrabold"
                      onClick={() => loadDayCloseOperators()}
                      disabled={locked || loading || dayCloseOperatorsLoading}
                    >
                      {dayCloseOperatorsLoading ? 'Refreshing...' : 'Refresh'}
                    </Button>
                  </div>
                  <div className="mt-3 grid gap-2">
                    {dayCloseOperators.map((user) => {
                      const isMasterAdmin = user?.is_master_admin === true;
                      const hasDayCloseAccess = isMasterAdmin || resolveUserPermissionList(user).includes('pos:close_day');
                      const isSavingAccess = Number(dayCloseAccessSavingUserId) === Number(user?.user_id);
                      return (
                        <div key={`day-close-operator-${user.user_id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5">
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{user.username || user.email}</p>
                            <p className="truncate text-[11px] text-[#64748B]">{user.email || 'No account email'}</p>
                            <p className="text-[11px] capitalize text-[#64748B]">
                              {user.role} · {hasDayCloseAccess
                                ? (user.pos_day_close_pin_configured ? 'PIN configured' : 'PIN setup pending')
                                : 'Z-reading access off'}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-3">
                            {isMasterAdmin ? (
                              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-[#1A4E8D]">Built-in access</span>
                            ) : (
                              <div className="flex items-center gap-2 text-[11px] font-extrabold text-[#334155]">
                                <span>Can generate Z-reading</span>
                                <button
                                  type="button"
                                  role="switch"
                                  aria-label={`Can generate Z-reading for ${user.username || user.email || `user ${user.user_id}`}`}
                                  aria-checked={hasDayCloseAccess}
                                  onClick={() => updateDayCloseAccess(user, !hasDayCloseAccess)}
                                  disabled={locked || loading || isSavingAccess}
                                  className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${hasDayCloseAccess ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                                >
                                  <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasDayCloseAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                              </div>
                            )}
                            {hasDayCloseAccess && user.pos_day_close_pin_configured ? (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-9 rounded-lg px-3 text-[12px] font-extrabold text-blue-700"
                                onClick={() => {
                                  setDayClosePinUser(user);
                                }}
                                disabled={locked || loading || isSavingAccess}
                              >
                                <KeyRound className="mr-1.5 h-4 w-4" />
                                Reset PIN
                              </Button>
                            ) : hasDayCloseAccess ? (
                              <span className="text-[11px] font-bold text-amber-700">Cashier setup pending</span>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                    {!dayCloseOperatorsLoading && dayCloseOperators.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-[#64748B]">No active cashier accounts are available. Add or activate a cashier first.</p>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            {canManageCashiers ? (
              <div
                className="rounded-lg border border-slate-200 bg-slate-50 p-3"
                data-testid="pos-cashier-void-authorization"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[12px] font-black text-[#0F172A]">Cashier Void and Cash Authorization</p>
                    <p className="mt-1 text-[11px] leading-5 text-[#64748B]">
                      Manage void and physical cash authority separately. Cashiers need their own open shift for either action; admin voids keep the existing no-shift bypass, but cash refunds never bypass shift accountability.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 rounded-lg px-3 text-[12px] font-extrabold"
                    onClick={() => loadCashierAccounts()}
                    disabled={locked || loading || cashiersLoading}
                  >
                    {cashiersLoading ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>
                <div className="mt-3 grid gap-2">
                  {activeCashierUsers.map((cashier) => {
                    const cashierPermissions = resolveUserPermissionList(cashier);
                    const hasVoidAccess = cashierPermissions.includes('pos:void');
                    const hasDrawerAccess = cashierPermissions.includes('pos:cash_drawer_adjust');
                    const isSavingVoidAccess = Number(cashierVoidAccessSavingUserId) === Number(cashier?.user_id);
                    const cashierLabel = cashier.username || cashier.email || `cashier ${cashier.user_id}`;
                    return (
                      <div
                        key={`cashier-void-access-${cashier.user_id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-extrabold text-[#0F172A]">{cashierLabel}</p>
                          <p className="truncate text-[11px] text-[#64748B]">
                            {cashier.email || 'No account email'} · Void {hasVoidAccess ? 'on' : 'off'} · Cash {hasDrawerAccess ? 'on' : 'off'}
                          </p>
                        </div>
                        <div className="grid gap-2 text-[11px] font-extrabold text-[#334155]">
                          <div className="flex items-center justify-end gap-2">
                            <span>Can void POS transactions</span>
                            <button
                              type="button"
                              role="switch"
                              data-testid={`pos-cashier-void-toggle-${cashier.user_id}`}
                              aria-label={`Can void POS transactions for ${cashierLabel}`}
                              aria-checked={hasVoidAccess}
                              onClick={() => updateCashierVoidAccess(cashier, !hasVoidAccess)}
                              disabled={locked || loading || isSavingVoidAccess}
                              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${hasVoidAccess ? 'border-rose-600 bg-rose-600' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasVoidAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            <span>Can refund cash / adjust drawer</span>
                            <button
                              type="button"
                              role="switch"
                              data-testid={`pos-cashier-drawer-toggle-${cashier.user_id}`}
                              aria-label={`Can refund cash and adjust drawer for ${cashierLabel}`}
                              aria-checked={hasDrawerAccess}
                              onClick={() => updateCashierDrawerAccess(cashier, !hasDrawerAccess)}
                              disabled={locked || loading || isSavingVoidAccess}
                              className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${hasDrawerAccess ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-slate-200'} disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${hasDrawerAccess ? 'translate-x-6' : 'translate-x-1'}`} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {!cashiersLoaded ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-[#64748B]">
                      Loading active cashier accounts...
                    </p>
                  ) : null}
                  {cashiersLoaded && !cashiersLoading && activeCashierUsers.length === 0 ? (
                    <p className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-3 text-[12px] text-[#64748B]">
                      No active cashier accounts are available. Invite or activate a cashier first.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="mt-4 grid gap-3">
              {(Array.isArray(posForm.terminalRegistry) ? posForm.terminalRegistry : []).map((terminal, index) => (
                <div key={`terminal-registry-${index}`} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-[0_16px_36px_rgba(148,163,184,0.12)]">
                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start">
                    <div className="min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-blue-100 bg-gradient-to-br from-[#EEF4FF] to-white text-[#2563EB] shadow-sm shadow-blue-100/70">
                            <Settings2 className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#64748B]">Terminal</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <h3 className="text-[18px] font-black leading-none tracking-tight text-[#0F172A]">
                                {terminal.terminal_id || `TERMINAL-${index + 1}`}
                              </h3>
                              <span className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-extrabold ${
                                terminal.is_active !== false
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border-slate-200 bg-slate-50 text-slate-500'
                              }`}>
                                {terminal.is_active !== false ? 'Active' : 'Inactive'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-transparent text-slate-400 transition hover:border-slate-200 hover:bg-slate-50 hover:text-slate-600"
                          disabled
                          aria-label="Terminal options"
                        >
                          <span className="text-[18px] leading-none">...</span>
                        </button>
                      </div>

                      <div className="mt-4 border-t border-slate-200/90 pt-4">
                        <div className="grid gap-3 md:grid-cols-2">
                          <div className="grid gap-1.5 md:col-span-2">
                            <Label className="flex items-center gap-2 text-[12px] font-black text-[#5B6B86]">
                              <Settings2 className="h-3.5 w-3.5 text-blue-500" />
                              Terminal ID
                            </Label>
                            <Input
                              className="h-11 rounded-xl border-slate-200 px-3.5 text-[14px] font-semibold text-[#0F172A] shadow-none"
                              value={terminal.terminal_id || ''}
                              onChange={(event) => handleTerminalRegistryChange(index, 'terminal_id', event.target.value)}
                              placeholder="COUNTER-01"
                              disabled={locked || loading}
                            />
                            <p className="text-[11px] text-[#64748B]">
                              Must stay unique. This ID is what the POS uses to keep the terminal visible after reload.
                            </p>
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="flex items-center gap-2 text-[12px] font-black text-[#5B6B86]">
                              <Tags className="h-3.5 w-3.5 text-violet-500" />
                              Label
                            </Label>
                            <Input
                              className="h-11 rounded-xl border-slate-200 px-3.5 text-[14px] font-semibold text-[#0F172A] shadow-none"
                              value={terminal.label || ''}
                              onChange={(event) => handleTerminalRegistryChange(index, 'label', event.target.value)}
                              disabled={locked || loading}
                            />
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="flex items-center gap-2 text-[12px] font-black text-[#5B6B86]">
                              <MapPin className="h-3.5 w-3.5 text-blue-500" />
                              Location
                            </Label>
                            <select
                              className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-[14px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                              value={terminal.location_id || ''}
                              onChange={(event) => handleTerminalRegistryChange(index, 'location_id', event.target.value)}
                              disabled={locked || loading}
                            >
                              <option value="">Unassigned</option>
                              {locations.map((location) => (
                                <option key={`terminal-location-${location.location_id}`} value={location.location_id}>
                                  {location.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="grid gap-1.5 md:col-span-2">
                            <Label className="flex items-center gap-2 text-[12px] font-black text-[#5B6B86]">
                              <KeyRound className="h-3.5 w-3.5 text-blue-500" />
                              Terminal Readiness
                            </Label>
                            <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] text-[#475569]">
                              {terminal.location_id
                                ? 'Ready for authorized DGFY users with access to this location.'
                                : 'Assign a store location before this terminal can be used.'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm shadow-slate-200/60">
                      <p className="text-[12px] font-black uppercase tracking-[0.14em] text-[#64748B]">Status & Actions</p>
                      <div className="mt-4 space-y-3">
                        <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3 shadow-sm shadow-slate-100/80">
                          <div className="flex items-center gap-3">
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                            <span className="text-[13px] font-black text-[#0F172A]">Active terminal</span>
                          </div>
                          <span className="relative inline-flex items-center">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={terminal.is_active !== false}
                              onChange={(event) => handleTerminalRegistryChange(index, 'is_active', event.target.checked)}
                              disabled={locked || loading}
                            />
                            <span className="flex h-8 w-[56px] items-center rounded-full border border-slate-200 bg-slate-200 px-1 transition peer-checked:bg-[#2563EB] peer-disabled:opacity-60">
                              <span className="grid h-6 w-6 translate-x-0 place-items-center rounded-full bg-white text-[#2563EB] shadow-sm transition peer-checked:translate-x-[22px]">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            </span>
                          </span>
                        </label>
                        <label className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-3 shadow-sm shadow-slate-100/80 ${
                          terminal.is_active === false ? 'border-slate-200 bg-slate-50' : 'border-slate-200 bg-white'
                        }`}>
                          <div className="flex items-center gap-3">
                            <Star className={`h-3.5 w-3.5 ${terminal.is_active === false ? 'text-slate-300' : 'text-amber-400'}`} fill="currentColor" />
                            <span className={`text-[13px] font-black ${terminal.is_active === false ? 'text-slate-400' : 'text-[#0F172A]'}`}>Default terminal</span>
                          </div>
                          <span className="relative inline-flex items-center">
                            <input
                              type="checkbox"
                              className="peer sr-only"
                              checked={terminal.is_default === true}
                              onChange={(event) => handleTerminalRegistryChange(index, 'is_default', event.target.checked)}
                              disabled={locked || loading || terminal.is_active === false}
                            />
                            <span className="flex h-8 w-[56px] items-center rounded-full border border-slate-200 bg-slate-200 px-1 transition peer-checked:bg-[#2563EB] peer-disabled:opacity-60">
                              <span className="grid h-6 w-6 translate-x-0 place-items-center rounded-full bg-white text-[#2563EB] shadow-sm transition peer-checked:translate-x-[22px]">
                                <Check className="h-3.5 w-3.5" />
                              </span>
                            </span>
                          </span>
                        </label>
                      </div>
                      <div className="mt-4 border-t border-slate-200 pt-4">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-11 w-full rounded-xl border-rose-300 text-[13px] font-extrabold text-rose-600 hover:bg-rose-50"
                          onClick={() => removeTerminalRegistryEntry(index)}
                          disabled={locked || loading}
                          aria-label={`Remove terminal ${terminal.terminal_id || index + 1}`}
                        >
                          <Trash2 className="mr-2 h-3.5 w-3.5" />
                          Delete Terminal
                        </Button>
                      </div>
                    </div>
                  </div>
                  {canManageCashiers ? (
                    <div className="mt-4 border-t border-slate-200 pt-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13px] font-black text-[#0F172A]">Cashiers</p>
                            <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[10px] font-extrabold text-[#1A4E8D]">
                              {cashiersLoading ? 'Loading...' : `${getCashiersForLocation(terminal.location_id).length} assigned`}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-5 text-[#64748B]">
                            Cashiers are invited through DGFY and receive explicit access to one or more business locations.
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-9 rounded-lg border-blue-200 px-4 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-blue-50"
                          onClick={() => setCashierInvitationOpen(true)}
                          disabled={locked || loading || !toPositiveInt(terminal.location_id)}
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Invite DGFY Cashier
                        </Button>
                      </div>

                      {getCashiersForLocation(terminal.location_id).length > 0 ? (
                        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                          {getCashiersForLocation(terminal.location_id).map((cashier) => (
                            <div key={cashier.user_id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                              <p className="truncate text-[12px] font-black text-emerald-900">{cashier.username || cashier.email}</p>
                              <p className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700">{cashier.email}</p>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-[11px] font-semibold text-slate-500">
                          {toPositiveInt(terminal.location_id)
                            ? 'No cashier is assigned to this terminal store yet.'
                            : 'Assign a store to this terminal before adding a cashier.'}
                        </p>
                      )}

                    </div>
                  ) : null}
                </div>
              ))}
              {(Array.isArray(posForm.terminalRegistry) ? posForm.terminalRegistry : []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[12px] text-[#64748B]">
                  {(posForm.terminalRegistryMode || 'warn') === 'enforce'
                    ? 'No terminals configured yet. Add at least one active terminal before enabling enforce mode.'
                    : 'No terminals configured yet. In warn mode, terminal users can still enter an ID manually.'}
                </div>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">POS Discount Presets</p>
                <p className="mt-1 text-[12px] text-[#475569]">Example: Employee Discount at 20%. Cashiers can select these during checkout.</p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addDiscountProfile} disabled={locked || loading}>
                <Plus className="mr-1 h-4 w-4" />
                Add Discount
              </Button>
            </div>
            <div className="mt-4 grid gap-3">
              {(Array.isArray(posForm.discountProfiles) ? posForm.discountProfiles : []).map((profile, index) => (
                <div key={`discount-profile-${index}`} className="grid gap-3 rounded-lg border border-slate-200 p-3 md:grid-cols-12 md:items-end">
                  <div className="grid gap-1 md:col-span-6">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Discount Name</Label>
                    <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={profile.name || ''} onChange={(event) => handleDiscountProfileChange(index, 'name', event.target.value)} disabled={locked || loading} />
                  </div>
                  <div className="grid gap-1 md:col-span-3">
                    <Label className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#64748B]">Percent</Label>
                    <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" type="number" min="0" max="100" step="0.01" value={profile.percentage} onChange={(event) => handleDiscountProfileChange(index, 'percentage', event.target.value)} disabled={locked || loading} />
                  </div>
                  <label className="flex items-center gap-2 md:col-span-2">
                    <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={profile.active !== false} onChange={(event) => handleDiscountProfileChange(index, 'active', event.target.checked)} disabled={locked || loading} />
                    <span className="text-[12px] font-bold text-[#0F172A]">Active</span>
                  </label>
                  <div className="md:col-span-1 md:flex md:justify-end">
                    <Button type="button" variant="outline" size="icon" onClick={() => removeDiscountProfile(index)} disabled={locked || loading} aria-label={`Remove discount profile ${index + 1}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              {(Array.isArray(posForm.discountProfiles) ? posForm.discountProfiles : []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 px-3 py-3 text-[12px] text-[#64748B]">
                  No discount presets configured yet.
                </div>
              ) : null}
              <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3">
                <div className="min-w-0">
                  <Label htmlFor="pos-employee-discount-self-approval" className="text-[12px] font-black text-amber-950">
                    Allow employee discount self-approval
                  </Label>
                  <p className="mt-1 text-[11px] font-semibold leading-relaxed text-amber-800">
                    When enabled, the cashier receiving an Employee discount may authorize it with their own configured POS approval PIN. Every self-approval is recorded in the transaction audit. Other discount types still require their normal authorization.
                  </p>
                </div>
                <Switch
                  id="pos-employee-discount-self-approval"
                  checked={posForm.employeeDiscountSelfApprovalEnabled === true}
                  onCheckedChange={(checked) => setPosForm((current) => ({
                    ...current,
                    employeeDiscountSelfApprovalEnabled: Boolean(checked)
                  }))}
                  disabled={locked || loading}
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <p className="text-[13px] font-black text-[#0F172A]">Best Seller Autotagging Settings</p>
            <div className="mt-3 space-y-3">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#64748B]">Tag the top 3 items by completed paid quantity from the previous 30 days.</p>
                </div>
                <Switch
                  id="pos-best-seller-auto-tagging"
                  checked={posForm.bestSellerAutoTaggingEnabled === true}
                  onCheckedChange={(checked) => setPosForm((current) => ({
                    ...current,
                    bestSellerAutoTaggingEnabled: Boolean(checked)
                  }))}
                  disabled={locked || loading}
                />
              </div>

              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-[#64748B]">Tag the most-bought item by completed paid quantity from the previous day.</p>
                </div>
                <Switch
                  id="pos-best-seller-daily-auto-tagging"
                  checked={posForm.dailyTopBestSellerEnabled === true}
                  onCheckedChange={(checked) => setPosForm((current) => ({
                    ...current,
                    dailyTopBestSellerEnabled: Boolean(checked)
                  }))}
                  disabled={locked || loading}
                />
              </div>
            </div>
          </div>
      </div>
    </div>
  );

  const renderEmployeesPane = () => (
    <div className="grid gap-3">
      {canManageEmployees ? (
        <EmployeeManagementPanel
          disabled={locked || loading}
          onEmployeesChanged={() => setEmployeeDirectoryRevision((revision) => revision + 1)}
        />
      ) : null}
      {canManageDeliveryPersonnel ? (
        <DeliveryPersonnelManagementPanel
          disabled={locked || loading}
          onDeliveryPersonnelChanged={onDeliveryPersonnelChanged}
        />
      ) : null}
      {canManageEmployeeCredit ? (
        <EmployeeCreditManagementPanel
          disabled={locked || loading}
          refreshKey={employeeDirectoryRevision}
        />
      ) : null}
    </div>
  );

  const renderStorefrontPane = () => (
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storeIsVisible === true} onChange={(event) => setStorefrontForm((current) => ({ ...current, storeIsVisible: event.target.checked }))} disabled={locked || loading} />
            <div>
              <p className="text-[12px] font-black text-[#0F172A]">Storefront visible</p>
              <p className="text-[11px] text-[#64748B]">Controls public storefront visibility from shared tenant settings.</p>
            </div>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 accent-[#1A4E8D]"
              checked={storefrontForm.storeHasNoLocation === true}
              onChange={(event) => {
                const nextHasNoLocation = event.target.checked === true;
                setStorefrontForm((current) => ({ ...current, storeHasNoLocation: nextHasNoLocation }));
                if (!nextHasNoLocation && !hasActivePrimaryStorefrontLocation) {
                  setLocationForm((current) => (
                    current.is_active === false
                      ? current
                      : { ...current, is_primary_storefront: true }
                  ));
                }
              }}
              disabled={locked || loading}
            />
            <div>
              <p className="text-[12px] font-black text-[#0F172A]">Searchable without map pin</p>
              <p className="text-[11px] text-[#64748B]">Preserves the same no-location storefront behavior used in IMS.</p>
            </div>
          </label>
        </div>
        {storefrontLocationRequired && !hasActivePrimaryStorefrontLocation ? (
          <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-3 text-[12px] text-rose-700">
            Public Storefront currently requires one active primary storefront location. Add a location below and mark it as <span className="font-bold">Primary</span>, or enable <span className="font-bold">Searchable without map pin</span>.
          </div>
        ) : null}
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[12px] font-black text-[#0F172A]">Storefront ID and item QR links</p>
              {storefrontForm.storeTenantSlug ? (
                <>
                  <p className="mt-1 text-[11px] text-[#64748B]">
                    This stable ID is used by Storefront item links and generated POS QR codes.
                  </p>
                  <code className="mt-2 block break-all rounded-lg border border-slate-200 bg-white px-3 py-2 text-[12px] font-bold text-[#1A4E8D]">
                    {storefrontForm.storeTenantSlug}
                  </code>
                </>
              ) : (
                <p className="mt-1 text-[11px] text-amber-700">
                  No Storefront ID is saved yet. Generate one to enable customer-facing item QR codes.
                </p>
              )}
            </div>
            {storefrontForm.storeTenantSlug ? (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void handleCopyStorefrontUrl()}
                  disabled={!storefrontPublicUrl}
                >
                  <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Copy URL
                </Button>
                <Button
                  type="button"
                  onClick={() => window.open(storefrontPublicUrl, '_blank', 'noopener,noreferrer')}
                  disabled={!storefrontPublicUrl}
                >
                  Open Storefront
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                className="shrink-0"
                onClick={() => void handleGenerateStorefrontSlug()}
                disabled={locked || loading || Boolean(savingTab)}
              >
                {savingTab === 'storefront_slug' ? 'Generating...' : 'Generate Storefront ID'}
              </Button>
            )}
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/60 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-blue-100 bg-blue-50 text-blue-600">
              <Users className="h-6 w-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <Label htmlFor="pos-customer-access-mode" className="text-lg font-black tracking-tight text-[#0F172A]">Customer Access Mode</Label>
              <p className="mt-1 text-[13px] text-[#64748B]">Select a mode to apply changes automatically.</p>
            </div>
          </div>

          <select
            id="pos-customer-access-mode"
            className="sr-only"
            value={requestedCustomerAccessMode}
            onChange={(event) => void handleCustomerAccessModeChange(event.target.value)}
            disabled={locked || loading || savingTab === 'storefront_access_mode'}
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

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" role="group" aria-label="Customer Access Mode options">
            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => {
              const ModeIcon = option.icon;
              const isSelected = requestedCustomerAccessMode === option.value;
              const isUnavailable = CUSTOMER_ACCESS_MODE_RANK[option.value] > CUSTOMER_ACCESS_MODE_RANK[platformMaxCustomerAccessMode];
              const isDisabled = locked || loading || savingTab === 'storefront_access_mode' || isUnavailable;
              return (
                <button
                  key={option.value}
                  type="button"
                  // Mobile (<sm): compact 2-col grid - image spans both rows on the left,
                  // label/description auto-flow into the right column via CSS grid's default
                  // row-then-column placement (no extra wrapper needed).
                  // sm: and up: original vertical/centered card layout, unchanged.
                  className={`relative grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-1 rounded-2xl border px-4 py-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:flex sm:min-h-64 sm:flex-col sm:items-center sm:gap-0 sm:px-5 sm:py-7 sm:text-center ${isSelected ? 'border-2 border-blue-600 bg-blue-50/50' : 'border-slate-200 bg-white hover:border-blue-200 hover:bg-slate-50'} ${isDisabled ? 'cursor-not-allowed opacity-50' : ''}`}
                  onClick={() => setStorefrontForm((current) => ({ ...current, customerAccessMode: option.value }))}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  aria-label={`${option.label}: ${option.description}`}
                >
                  {isSelected ? (
                    <span className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-blue-600 text-white" aria-hidden="true">
                      <Check className="h-5 w-5 stroke-[3]" />
                    </span>
                  ) : null}
                  <span className={`row-span-2 grid h-20 w-20 shrink-0 place-items-center self-center rounded-full ${option.iconClassName}`} aria-hidden="true">
                    <ModeIcon className="h-10 w-10 stroke-[1.8]" />
                  </span>
                  <span className={`min-w-0 text-[17px] font-black sm:mt-5 ${isSelected ? 'text-blue-600' : 'text-[#0F172A]'}`}>{option.label}</span>
                  <span className="min-w-0 text-[13px] leading-6 text-[#475569] sm:mt-3">{option.description}</span>
                  {isSelected ? (
                    <span className="col-span-2 mt-3 inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 sm:mt-auto">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                      {savingTab === 'storefront_access_mode'
                        ? 'Saving automatically'
                        : (effectiveCustomerAccessMode === option.value ? 'Applied automatically' : `Requested; effective ${effectiveCustomerAccessMode}`)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Storefront Media</p>
        <p className="mt-1 text-[12px] text-[#475569]">Shared cover photo and profile icon for discovery cards and storefront header.</p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          {/* Mobile-only: profile icon wrapper moved OUTSIDE the cover's overflow-hidden box.
              Previously the circular avatar was nested inside the cover container, so its
              bottom half (via the -bottom-8 overlap offset) was clipped by that container's
              overflow-hidden instead of only being rounded by it. Cover photo rendering itself
              (image + rounded-xl clipping) is untouched. */}
          <div className="relative sm:hidden">
            <div className="h-32 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {storefrontAssets.cover ? (
                <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.cover) }} alt="Storefront cover preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-500">No cover photo uploaded</div>
              )}
            </div>
            <div className="absolute -bottom-8 left-4 h-16 w-16 overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow">
              {storefrontAssets.profile ? (
                <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.profile) }} alt="Storefront profile preview" className="h-full w-full object-contain" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500">No icon</div>
              )}
            </div>
          </div>
          <div className="relative hidden sm:block">
            <div className="h-32 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:h-40">
              {storefrontAssets.cover ? (
                <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.cover) }} alt="Storefront cover preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-500">No cover photo uploaded</div>
              )}
            </div>
            <div className="absolute -bottom-8 left-4 h-16 w-16 overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow md:h-20 md:w-20">
              {storefrontAssets.profile ? (
                <ResponsiveImage sources={{ src: resolveAssetUrl(storefrontAssets.profile) }} alt="Storefront profile preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500 md:text-xs">No icon</div>
              )}
            </div>
          </div>
          <div className="grid gap-3 pt-8 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Cover photo</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="storefront-cover-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={locked || assetUploadingType === 'cover' || assetDeletingType === 'cover'}
                  onChange={(event) => { const file = event.target.files?.[0] || null; handleUploadAsset('cover', file); event.target.value = ''; }}
                />
                <label
                  htmlFor="storefront-cover-upload"
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-extrabold text-[#334155] transition-colors hover:bg-slate-50${locked || assetUploadingType === 'cover' || assetDeletingType === 'cover' ? ' pointer-events-none opacity-50' : ''}`}
                >
                  <ImagePlus className="h-4 w-4" />
                  Upload
                </label>
                <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl text-[13px] font-extrabold" disabled={locked || !storefrontAssets.cover || assetUploadingType === 'cover' || assetDeletingType === 'cover'} onClick={() => handleDeleteAsset('cover')}>Remove</Button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Profile icon</p>
              <div className="mt-2 flex items-center gap-2">
                <input
                  id="storefront-profile-upload"
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={locked || assetUploadingType === 'profile' || assetDeletingType === 'profile'}
                  onChange={(event) => { const file = event.target.files?.[0] || null; handleUploadAsset('profile', file); event.target.value = ''; }}
                />
                <label
                  htmlFor="storefront-profile-upload"
                  className={`flex flex-1 cursor-pointer items-center justify-center gap-2 h-11 rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-extrabold text-[#334155] transition-colors hover:bg-slate-50${locked || assetUploadingType === 'profile' || assetDeletingType === 'profile' ? ' pointer-events-none opacity-50' : ''}`}
                >
                  <ImagePlus className="h-4 w-4" />
                  Upload
                </label>
                <Button type="button" variant="outline" className="flex-1 h-11 rounded-xl text-[13px] font-extrabold" disabled={locked || !storefrontAssets.profile || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onClick={() => handleDeleteAsset('profile')}>Remove</Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Storefront Content</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Tagline</Label>
            <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontTagline} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontTagline: event.target.value }))} disabled={locked || loading} />
          </div>
          <div className="grid gap-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Phone</Label>
            <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontPhone} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPhone: event.target.value }))} disabled={locked || loading} />
          </div>
          <div className="grid gap-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Email</Label>
            <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={storefrontForm.storefrontEmail} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontEmail: event.target.value }))} disabled={locked || loading} />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-slate-200 p-3">
          <StorefrontBusinessHoursScheduler value={storefrontForm.storefrontHours} onChange={(nextHours) => setStorefrontForm((current) => ({ ...current, storefrontHours: nextHours }))} />
        </div>
        <div className="mt-4 grid gap-2">
          <Label className="text-[12px] font-black text-[#0F172A]">About</Label>
          <textarea className="min-h-[96px] rounded-lg border border-slate-200 px-3 py-2 text-sm" value={storefrontForm.storefrontAbout} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontAbout: event.target.value }))} disabled={locked || loading} />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-[12px] font-black text-[#0F172A]">Harmonized UI</span>
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontUiV2Enabled === true} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontUiV2Enabled: event.target.checked }))} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-[12px] font-black text-[#0F172A]">Show Follow Button</span>
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontFollowEnabled === true} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontFollowEnabled: event.target.checked }))} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-[12px] font-black text-[#0F172A]">Show Share Button</span>
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontShareEnabled === true} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontShareEnabled: event.target.checked }))} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-[12px] font-black text-[#0F172A]">Allow Guest Checkout</span>
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontGuestCheckoutEnabled !== false} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontGuestCheckoutEnabled: event.target.checked }))} />
          </label>
          <label className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
            <span className="text-[12px] font-black text-[#0F172A]">Accept Cash on Delivery/Pickup</span>
            <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontCashPaymentEnabled !== false} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontCashPaymentEnabled: event.target.checked }))} />
          </label>
        </div>

        <div className="mt-5 space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Store Categories</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addStorefrontListRow('storefrontCategories', '')}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {(Array.isArray(storefrontForm.storefrontCategories) ? storefrontForm.storefrontCategories : ['']).map((entry, index) => (
              <div key={`sf-category-${index}`} className="flex gap-2">
                <Input value={entry} onChange={(event) => handleStorefrontListChange('storefrontCategories', index, event.target.value)} placeholder="BBQ" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontListRow('storefrontCategories', index, '')}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Why Choose Us</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addStorefrontListRow('storefrontWhyChooseUs', '')}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {(Array.isArray(storefrontForm.storefrontWhyChooseUs) ? storefrontForm.storefrontWhyChooseUs : ['']).map((entry, index) => (
              <div key={`sf-why-${index}`} className="flex gap-2">
                <Input value={entry} onChange={(event) => handleStorefrontListChange('storefrontWhyChooseUs', index, event.target.value)} placeholder="Freshly grilled daily" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontListRow('storefrontWhyChooseUs', index, '')}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Messenger Link</Label>
              <Input value={storefrontForm.storefrontSocialMessenger} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontSocialMessenger: event.target.value }))} placeholder="https://m.me/..." />
            </div>
            <div className="space-y-2">
              <Label>Facebook Link</Label>
              <Input value={storefrontForm.storefrontSocialFacebook} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontSocialFacebook: event.target.value }))} placeholder="https://facebook.com/..." />
            </div>
            <div className="space-y-2">
              <Label>Instagram Link</Label>
              <Input value={storefrontForm.storefrontSocialInstagram} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontSocialInstagram: event.target.value }))} placeholder="https://instagram.com/..." />
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Gallery Images</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addStorefrontObjectRow('storefrontGalleryImages', { url: '', path: '', caption: '', alt: '', sort_order: 0 })}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {(Array.isArray(storefrontForm.storefrontGalleryImages) ? storefrontForm.storefrontGalleryImages : []).map((row, index) => (
              <div key={`sf-gallery-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[180px_1fr_1fr_120px_auto]">
                <div className="flex items-center gap-2">
                  <input
                    id={`sf-gallery-upload-${index}`}
                    type="file"
                    accept="image/*"
                    aria-label={`Upload gallery image ${index + 1}`}
                    className="sr-only"
                    disabled={locked || assetUploadingType === `gallery-${index}`}
                    onChange={(event) => { const file = event.target.files?.[0] || null; handleGalleryAssetUpload(index, file); event.target.value = ''; }}
                  />
                  <label
                    htmlFor={`sf-gallery-upload-${index}`}
                    className={`flex h-11 flex-1 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[13px] font-extrabold text-[#334155] transition-colors hover:bg-slate-50${locked || assetUploadingType === `gallery-${index}` ? ' pointer-events-none opacity-50' : ''}`}
                  >
                    <ImagePlus className="h-4 w-4" />
                    Upload image
                  </label>
                </div>
                <Input value={row.caption || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'caption', event.target.value)} placeholder="Caption" />
                <Input value={row.alt || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'alt', event.target.value)} placeholder="Alt text" />
                <Input value={row.sort_order ?? ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'sort_order', event.target.value)} placeholder="Sort" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontObjectRow('storefrontGalleryImages', index, { url: '', path: '', caption: '', alt: '', sort_order: 0 })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Delivery Partners</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addStorefrontObjectRow('storefrontDeliveryPartners', { partner: 'grab', label: '', url: '' })}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {(Array.isArray(storefrontForm.storefrontDeliveryPartners) ? storefrontForm.storefrontDeliveryPartners : []).map((row, index) => (
              <div key={`sf-delivery-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[160px_1fr_1fr_auto]">
                <select className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white" value={row.partner || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontDeliveryPartners', index, 'partner', event.target.value)}>
                  <option value="grab">grab</option>
                  <option value="foodpanda">foodpanda</option>
                  <option value="lalamove">lalamove</option>
                  <option value="custom">custom</option>
                </select>
                <Input value={row.label || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontDeliveryPartners', index, 'label', event.target.value)} placeholder="Display label" />
                <Input value={row.url || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontDeliveryPartners', index, 'url', event.target.value)} placeholder="https://partner.example.com" />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontObjectRow('storefrontDeliveryPartners', index, { partner: 'grab', label: '', url: '' })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Review Highlights</Label>
              <Button type="button" variant="outline" size="sm" onClick={() => addStorefrontObjectRow('storefrontReviewHighlights', { reviewer_name: '', rating: '', comment: '' })}><Plus className="mr-1 h-4 w-4" />Add</Button>
            </div>
            {(Array.isArray(storefrontForm.storefrontReviewHighlights) ? storefrontForm.storefrontReviewHighlights : []).map((row, index) => (
              <div key={`sf-review-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_120px_2fr_auto]">
                <Input value={row.reviewer_name || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontReviewHighlights', index, 'reviewer_name', event.target.value)} placeholder="Reviewer name" />
                <Input value={row.rating || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontReviewHighlights', index, 'rating', event.target.value)} placeholder="4.8" />
                <Input value={row.comment || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontReviewHighlights', index, 'comment', event.target.value)} placeholder="Great food and service." />
                <Button type="button" variant="ghost" size="icon" onClick={() => removeStorefrontObjectRow('storefrontReviewHighlights', index, { reviewer_name: '', rating: '', comment: '' })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
          <div className="space-y-3 rounded-lg border border-slate-200 p-4">
            <Label>Review Summary</Label>
            <div className="grid min-w-0 max-w-full gap-3 [&>*]:min-w-0 md:grid-cols-2">
              <Input value={storefrontForm.storefrontReviewSummaryScore} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryScore: event.target.value }))} placeholder="Average score (e.g. 4.8)" />
              <Input value={storefrontForm.storefrontReviewSummaryTotalCount} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryTotalCount: event.target.value }))} placeholder="Total reviews" />
            </div>
            <div className="grid gap-2 md:grid-cols-5">
              <Input value={storefrontForm.storefrontReviewSummaryStar5} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryStar5: event.target.value }))} placeholder="5★ count" />
              <Input value={storefrontForm.storefrontReviewSummaryStar4} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryStar4: event.target.value }))} placeholder="4★ count" />
              <Input value={storefrontForm.storefrontReviewSummaryStar3} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryStar3: event.target.value }))} placeholder="3★ count" />
              <Input value={storefrontForm.storefrontReviewSummaryStar2} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryStar2: event.target.value }))} placeholder="2★ count" />
              <Input value={storefrontForm.storefrontReviewSummaryStar1} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontReviewSummaryStar1: event.target.value }))} placeholder="1★ count" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" className="h-10 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white hover:bg-[#143F73]" disabled={locked || loading || savingTab === 'storefront'} onClick={handleStorefrontSave}>
            {savingTab === 'storefront' ? 'Saving...' : 'Save Storefront'}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-sm">
        {/* Header Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 shadow-sm border border-blue-100">
              <MapPin className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold tracking-tight text-[#0F172A]">
                  Storefront Locations{storefrontLocationRequired ? <RequiredMark /> : null}
                </h2>
              </div>
              <p className="text-xs sm:text-sm font-medium text-slate-500 mt-0.5">
                {storefrontLocationRequired
                  ? 'A public storefront with map publication needs one active primary storefront location before Storefront settings can be saved.'
                  : 'Manage your public storefront locations, delivery coverage, and operational settings.'}
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => loadStorefrontLocations()}
            disabled={locationsLoading || locationSaving}
            className="h-10 rounded-xl border-slate-200 px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
          >
            <RefreshCcw className={`mr-2 h-3.5 w-3.5 ${locationsLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            {locationsLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {/* Master-Detail 2-Column Responsive Layout */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Locations List Sidebar (lg:col-span-4) */}
          <div className="lg:col-span-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-4">
            {/* Sidebar Header */}
            <div className="flex items-center justify-between gap-2 pb-1">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#0F172A]">Locations</h3>
                <span className="inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                  {storefrontLocations.length}
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={resetLocationForm}
                disabled={locationSaving}
                className="h-8 w-8 p-0 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center justify-center"
                title="Add new location"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* Location Cards List */}
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-1">
              {storefrontLocations.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center text-xs text-slate-500">
                  No storefront locations configured.
                </div>
              ) : (
                storefrontLocations.map((location) => {
                  const activeEditingId = locationForm?.location_id || locationForm?.id;
                  const isSelected = activeEditingId === location.location_id;
                  return (
                    <div
                      key={`pos-storefront-location-${location.location_id}`}
                      onClick={() => handleEditLocation(location)}
                      className={`group relative rounded-xl p-3.5 transition-all cursor-pointer border ${
                        isSelected
                          ? 'border-2 border-blue-600 bg-blue-50/20 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      {/* Top Title & Badges Row */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`h-3 w-3 rounded-full border flex items-center justify-center shrink-0 ${isSelected ? 'border-blue-600 bg-blue-600' : 'border-slate-300 bg-white'}`}>
                            {isSelected && <span className="h-1 w-1 rounded-full bg-white" />}
                          </span>
                          <p className="text-sm font-bold text-[#0F172A] truncate group-hover:text-blue-600 transition-colors">
                            {location.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${location.is_active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
                            {location.is_active ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${location.is_open ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-amber-50 text-amber-700 border border-amber-200'}`}>
                            {location.is_open ? 'Open' : 'Closed'}
                          </span>
                          {location.is_primary_storefront === true ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              Primary
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleSetPrimaryLocation(location);
                              }}
                              disabled={locationSaving || location.is_active !== true}
                              className="px-2 py-0.5 text-[10px] font-bold rounded-full border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-50 transition-colors"
                            >
                              Set Primary
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Address Line */}
                      <div className="mt-2 flex items-start gap-1.5 text-xs text-slate-500">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
                        <span className="truncate">{location.address_line || 'No address specified'}</span>
                      </div>

                      {/* Metadata Details Row */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] font-medium text-slate-500">
                        <span className="flex items-center gap-1">
                          <Compass className="h-3 w-3 text-slate-400" />
                          {location.delivery_radius_km} km
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3 text-slate-400" />
                          {location.current_wait_time_minutes} min
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {location.latitude}, {location.longitude}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Sidebar Footer */}
            <div className="pt-2 border-t border-slate-100 text-center text-xs text-slate-400 font-medium">
              Showing {storefrontLocations.length} of {storefrontLocations.length} locations
            </div>
          </div>

          {/* Right Column: Main Form & Settings Area (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-5">
            {/* 2x2 Section Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Card 1: Basic Details */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Store className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-[#0F172A]">Basic Details</h4>
                </div>
                <div className="space-y-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Location Name<RequiredMark /></Label>
                    <Input
                      value={locationForm.name}
                      onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder="Main Branch"
                      className="h-10 rounded-xl border-slate-200 text-xs"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Address<RequiredMark /></Label>
                    <Input
                      value={locationForm.address_line}
                      onChange={(event) => setLocationForm((current) => ({ ...current, address_line: event.target.value }))}
                      placeholder="Street, City, Province"
                      className="h-10 rounded-xl border-slate-200 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Card 2: Coordinates */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-[#0F172A]">Coordinates</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Latitude<RequiredMark /></Label>
                    <Input
                      value={locationForm.latitude}
                      onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))}
                      placeholder="10.69690400"
                      className="h-10 rounded-xl border-slate-200 text-xs font-mono"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Longitude<RequiredMark /></Label>
                    <Input
                      value={locationForm.longitude}
                      onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))}
                      placeholder="122.56127000"
                      className="h-10 rounded-xl border-slate-200 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex items-start gap-2 text-xs text-blue-800 font-medium">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span><strong>Pinned coordinates:</strong> These coordinates are used for delivery coverage and ETA calculations.</span>
                </div>
              </div>

              {/* Card 3: Map & Coverage */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <MapPinned className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    <h4 className="text-sm font-bold text-[#0F172A]">Map & Coverage</h4>
                  </div>
                </div>

                {/* Map Component Container (Map component untouched!) */}
                <div className="rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                  <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white px-3 py-12 text-center text-xs text-slate-500">Loading map picker...</div>}>
                    <MapPinPicker
                      latitude={locationForm.latitude}
                      longitude={locationForm.longitude}
                      deliveryRadiusKm={locationForm.delivery_radius_km}
                      onChange={handleLocationPinChange}
                    />
                  </Suspense>
                </div>

                <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3 flex items-start gap-2 text-xs text-blue-800 font-medium">
                  <Info className="h-4 w-4 text-blue-600 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>Delivery coverage preview: {locationForm.delivery_radius_km || 5.00} km radius around the pinned location.</span>
                </div>
              </div>

              {/* Card 4: Operational Settings */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <Settings2 className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  <h4 className="text-sm font-bold text-[#0F172A]">Operational Settings</h4>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Delivery Radius (km)<RequiredMark /></Label>
                    <Input
                      value={locationForm.delivery_radius_km}
                      onChange={(event) => setLocationForm((current) => ({ ...current, delivery_radius_km: event.target.value }))}
                      placeholder="5"
                      className="h-10 rounded-xl border-slate-200 text-xs"
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs font-bold text-[#0F172A]">Wait Time (min)<RequiredMark /></Label>
                    <Input
                      value={locationForm.current_wait_time_minutes}
                      onChange={(event) => setLocationForm((current) => ({ ...current, current_wait_time_minutes: event.target.value }))}
                      placeholder="15"
                      className="h-10 rounded-xl border-slate-200 text-xs"
                    />
                  </div>
                </div>

                {/* Switches / Checkboxes with Subtext */}
                <div className="space-y-3 pt-2">
                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.is_open === true}
                      onChange={(event) => setLocationForm((current) => ({ ...current, is_open: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Open</p>
                      <p className="text-[11px] text-slate-500">Location is open for orders</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.is_primary_storefront === true}
                      onChange={(event) => setLocationForm((current) => ({ ...current, is_primary_storefront: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Primary</p>
                      <p className="text-[11px] text-slate-500">Primary storefront for map publication</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.allow_out_of_stock_sales === true}
                      onChange={(event) => setLocationForm((current) => ({ ...current, allow_out_of_stock_sales: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Allow OOS Sales</p>
                      <p className="text-[11px] text-slate-500">Allow out-of-stock item sales</p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.supports_delivery === true}
                      disabled={lastFulfillmentMethodLocked && locationForm.supports_delivery === true}
                      onChange={(event) => setLocationForm((current) => ({ ...current, supports_delivery: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Supports Delivery</p>
                      <p className="text-[11px] text-slate-500">Enable delivery orders for this location</p>
                      {lastFulfillmentMethodLocked && locationForm.supports_delivery === true && (
                        <p className="mt-1 text-[11px] text-amber-700">{LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE}</p>
                      )}
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 hover:bg-slate-50/70 transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.supports_pickup === true}
                      disabled={lastFulfillmentMethodLocked && locationForm.supports_pickup === true}
                      onChange={(event) => setLocationForm((current) => ({ ...current, supports_pickup: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Supports Pickup</p>
                      <p className="text-[11px] text-slate-500">Enable pickup orders for this location</p>
                      {lastFulfillmentMethodLocked && locationForm.supports_pickup === true && (
                        <p className="mt-1 text-[11px] text-amber-700">{LAST_FULFILLMENT_METHOD_LOCKED_MESSAGE}</p>
                      )}
                    </div>
                  </label>

                  {/* #1246/#1218: buyer-facing scheduling/lead-time settings. Editing gated on
                      canEditSettings (settings:edit / is_master_admin) -- same permission the
                      backend's PUT /tenant-locations/:id already enforces -- disabled rather than
                      hidden for non-privileged roles, matching PosCashierAttendanceSettingsCard's
                      own canEdit precedent. */}
                  <label className={`flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 transition-colors ${canEditSettings ? 'hover:bg-slate-50/70 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.scheduling_enabled === true}
                      disabled={!canEditSettings}
                      onChange={(event) => setLocationForm((current) => ({ ...current, scheduling_enabled: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Allow Scheduled Orders</p>
                      <p className="text-[11px] text-slate-500">Let buyers choose a delivery or pickup date and time</p>
                    </div>
                  </label>

                  <label className={`flex items-start gap-3 p-2.5 rounded-xl border border-slate-100 transition-colors ${canEditSettings ? 'hover:bg-slate-50/70 cursor-pointer' : 'opacity-60 cursor-not-allowed'}`}>
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 accent-blue-600 mt-0.5"
                      checked={locationForm.immediate_fulfillment_enabled === true}
                      disabled={!canEditSettings}
                      onChange={(event) => setLocationForm((current) => ({ ...current, immediate_fulfillment_enabled: event.target.checked }))}
                    />
                    <div>
                      <p className="text-xs font-bold text-[#0F172A]">Allow Immediate Fulfillment</p>
                      <p className="text-[11px] text-slate-500">Show the NOW option and an immediate-fulfillment promise at checkout</p>
                    </div>
                  </label>

                  {locationForm.immediate_fulfillment_enabled === false && (
                    <div className="grid gap-1.5 p-2.5 rounded-xl border border-slate-100">
                      <Label className="text-xs font-bold text-[#0F172A]">Fulfillment Lead Time (days)</Label>
                      <p className="text-[11px] text-slate-500">
                        Shown to buyers in place of the NOW promise. Required while immediate fulfillment is off.
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          min="0"
                          max="365"
                          placeholder="Minimum days"
                          value={locationForm.fulfillment_lead_time_min_days}
                          disabled={!canEditSettings}
                          onChange={(event) => setLocationForm((current) => ({ ...current, fulfillment_lead_time_min_days: event.target.value }))}
                          className="h-10 rounded-xl border-slate-200 text-xs"
                        />
                        <Input
                          type="number"
                          min="0"
                          max="365"
                          placeholder="Maximum days"
                          value={locationForm.fulfillment_lead_time_max_days}
                          disabled={!canEditSettings}
                          onChange={(event) => setLocationForm((current) => ({ ...current, fulfillment_lead_time_max_days: event.target.value }))}
                          className="h-10 rounded-xl border-slate-200 text-xs"
                        />
                      </div>
                      {leadTimeRequiredMissing && (
                        <p className="text-[11px] text-amber-700">
                          A minimum and maximum lead time are required while immediate fulfillment is off. Buyers need
                          something concrete to expect.
                        </p>
                      )}
                      {leadTimeRangeInverted && (
                        <p className="text-[11px] text-amber-700">Maximum days must be greater than or equal to minimum days.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom Action Bar Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-bold text-[#0F172A]">Action Bar</p>
                <p className="text-xs text-slate-500">Add a new location or clear the form to start over.</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetLocationForm}
                  disabled={locationSaving}
                  className="h-10 px-4 rounded-xl border-slate-200 text-xs font-semibold text-slate-700"
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  onClick={handleSaveLocation}
                  disabled={locationSaving}
                  className="h-10 px-6 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm"
                >
                  {locationSaving ? 'Saving...' : (locationForm?.location_id ? 'Update Location' : 'Add Location')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderPane = () => {
    if (loading) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
          Loading shared tenant settings...
        </div>
      );
    }
    if (loadError) {
      return (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p>{loadError}</p>
          <Button type="button" variant="outline" className="mt-3" onClick={hydrateSettingsWorkspace}>
            Retry
          </Button>
        </div>
      );
    }
    if (renderedTab === 'profile') return renderProfilePane();
    if (renderedTab === 'storefront') return renderStorefrontPane();
    if (renderedTab === 'payments' && canViewDownpayment) {
      return (
        <DownpaymentSettingsPanel
          terminalUser={terminalUser}
          locked={locked}
          sectionId={sectionId}
        />
      );
    }
    if (renderedTab === 'delivery_pricing' && canEditSettings) {
      return (
        <PosDeliveryPricingSettingsCard
          terminalUser={terminalUser}
          locked={locked}
          sectionId={sectionId}
        />
      );
    }
    if (renderedTab === 'employees' && (canManageEmployees || canManageEmployeeCredit)) {
      return renderEmployeesPane();
    }
    return renderPosSetupPane();
  };

  return (
    <div id={sectionId} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
        <div
          className="hidden gap-2 sm:grid"
          style={{ gridTemplateColumns: `repeat(${SETTINGS_TABS.length}, minmax(0, 1fr))` }}
        >
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-4 py-3 text-[14px] font-extrabold transition ${
                  active
                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
                    : 'border-slate-200 bg-slate-50 text-[#0F172A] hover:border-blue-200 hover:bg-white'
                }`}
              >
                <Icon className="h-4.5 w-4.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2 sm:hidden">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={`mobile-${tab.id}`}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex min-h-14 min-w-0 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-extrabold transition ${
                  active
                    ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
                    : 'border-slate-200 bg-slate-50 text-[#0F172A] hover:border-blue-200 hover:bg-white'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="text-center leading-tight">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div style={paneInlineStyle}>
        {renderPane()}
      </div>
      <Dialog open={validationModalState.open} onOpenChange={(open) => { if (!open) closeValidationModal(); }}>
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl rounded-2xl border border-rose-200 bg-white p-0 shadow-2xl shadow-slate-950/20">
          <DialogHeader className="border-b border-rose-100 bg-rose-50/70 px-5 py-4">
            <DialogTitle className="text-lg font-black text-rose-900">{validationModalState.title || 'Validation Error'}</DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-rose-800">
              {validationModalState.description || 'Review the blocking fields below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4">
            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-rose-700">Blocking Fields</p>
              <div className="mt-3 space-y-3">
                {(Array.isArray(validationModalState.errors) ? validationModalState.errors : []).map((entry, index) => (
                  <div key={`settings-validation-${index}`} className="rounded-lg border border-rose-100 bg-white px-3 py-3">
                    <p className="text-[12px] font-black text-slate-900">{entry.field ? getReadableFieldName(entry.field) : `Issue ${index + 1}`}</p>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{entry.message || 'Unknown validation error.'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-slate-200 px-5 py-4">
            <Button type="button" className="bg-[#1A4E8D] text-white hover:bg-[#143F73]" onClick={closeValidationModal}>
              Review Fields
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(pendingLocationAction)}
        onOpenChange={(open) => { if (!open) setPendingLocationAction(null); }}
        title={pendingLocationAction?.type === 'delete'
          ? 'Delete Storefront Location Pin'
          : (pendingLocationAction?.type === 'reactivate' ? 'Reactivate Location' : 'Deactivate Location')}
        description={pendingLocationAction?.type === 'delete'
          ? 'This permanently removes the inactive storefront location pin. The action is blocked when operational history still references the location.'
          : (pendingLocationAction?.type === 'reactivate'
            ? 'This location will become available again for storefront and operational use.'
            : 'This location will be removed from active storefront and operational choices while historical records remain intact.')}
        confirmLabel={pendingLocationAction?.type === 'delete'
          ? 'Delete Pin'
          : (pendingLocationAction?.type === 'reactivate' ? 'Reactivate' : 'Deactivate')}
        variant={pendingLocationAction?.type === 'reactivate' ? 'default' : 'destructive'}
        onConfirm={() => {
          if (pendingLocationAction?.type === 'delete') {
            return handleDeleteLocation(pendingLocationAction.locationId, { confirmed: true });
          }
          if (pendingLocationAction?.type === 'reactivate') {
            return handleReactivateLocation(pendingLocationAction.locationId, { confirmed: true });
          }
          return handleDeactivateLocation(pendingLocationAction?.locationId, { confirmed: true });
        }}
      />
      <UserInvitationModal
        open={cashierInvitationOpen}
        onOpenChange={setCashierInvitationOpen}
        onSuccess={() => loadCashierAccounts({ silent: true })}
        fixedRole="cashier"
        title="Invite DGFY Cashier"
        submitLabel="Send Cashier Invitation"
        locationOptions={locations}
      />
      <Dialog open={Boolean(approvalPinUser)} onOpenChange={(open) => !open && closeApprovalPinDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-teal-600" />
              POS Discount Approval PIN
            </DialogTitle>
            <DialogDescription>
              This PIN is used to approve POS discounts. It cannot be viewed after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">{approvalPinUser?.username || approvalPinUser?.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {approvalPinUser?.pos_approval_pin_configured
                  ? 'A PIN is configured. Enter a new PIN to replace it.'
                  : 'Configure a PIN this approver will enter for POS discounts.'}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-800">New approval PIN</Label>
              <Input
                value={approvalPin}
                onChange={(event) => setApprovalPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                style={{ WebkitTextSecurity: 'disc' }}
                placeholder="4 to 12 digits"
                className="mt-1"
                disabled={savingApprovalPin}
              />
            </div>
          </div>
          <DialogFooter className="mt-4 flex-row justify-between gap-2 border-t pt-4 sm:justify-between">
            <div>
              {approvalPinUser?.pos_approval_pin_configured ? (
                <Button type="button" variant="outline" onClick={() => saveApprovalPin({ clear: true })} disabled={savingApprovalPin} className="text-rose-600">
                  Clear PIN
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeApprovalPinDialog} disabled={savingApprovalPin}>Cancel</Button>
              <Button type="button" onClick={() => saveApprovalPin()} disabled={savingApprovalPin} className="bg-teal-600 hover:bg-teal-700">
                {savingApprovalPin ? 'Saving...' : 'Save PIN'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(dayClosePinUser)} onOpenChange={(open) => !open && closeDayClosePinDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-blue-600" />
              Reset POS Day Close PIN
            </DialogTitle>
            <DialogDescription>
              Reset this cashier&apos;s PIN when they forgot it. The cashier must create a new personal PIN from DGFY Business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold">{dayClosePinUser?.username || dayClosePinUser?.email}</p>
              <p className="mt-1 text-xs text-slate-500">
                {dayClosePinUser?.email || 'No account email'}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-4 flex-row justify-between gap-2 border-t pt-4 sm:justify-between">
            <div />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeDayClosePinDialog} disabled={savingDayClosePin}>Cancel</Button>
              <Button type="button" onClick={resetDayClosePin} disabled={savingDayClosePin} className="bg-blue-600 hover:bg-blue-700">
                {savingDayClosePin ? 'Resetting...' : 'Reset PIN'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TerminalOperationsWorkspace({
  viewMode,
  workflowMode = '',
  isMsmeMode = false,
  terminalUser,
  refreshTerminalUser = async () => {},
  refreshTerminalMeta = async () => {},
  onPosSetupSaved = async () => {},
  onStorefrontSetupSaved = async () => {},
  locked,
  terminalMeta,
  shiftState,
  todayDashboard,
  reportRefreshKey = 0,
  employeeCreditReportRefreshKey = 0,
  isOnline = true,
  offlineSnapshotScope = {},
  onQueueOfflineItemDraft = async () => '',
  activeTerminalId = '',
  terminalRegistry = [],
  canViewPos,
  canCreateItems = false,
  canManageServiceCatalog = false,
  canViewFnbModifiers = false,
  canManageFnbModifiers = false,
  serviceOperationsPermissions = {},
  canEditItems = false,
  canDeleteItems = false,
  canManageCategories = false,
  canManageVouchers = false,
  canManagePricelists = false,
  onSelectViewMode = () => {},
  itemsStockFilterPreset = '',
  onItemsStockFilterPresetApplied = () => {},
  canTransactPos,
  canOpenShift = false,
  canCloseShift,
  canAdminBypassShiftPrompt = false,
  canSwitchPosLocation = false,
  canAdjustCashDrawer,
  canCloseDay,
  dayCloseReadinessState = { loading: false, readiness: null, errorMessage: '' },
  refreshDayCloseReadiness = async () => null,
  openShiftForm,
  setOpenShiftForm,
  cashEventForm,
  setCashEventForm,
  closeShiftForm,
  setCloseShiftForm,
  shiftActionLoading,
  handleOpenShift,
  handleSwitchShiftLocation = () => {},
  handleRecordCashEvent,
  handleCloseShift,
  handleCloseDay = () => {},
  handleViewShiftSummary = () => {},
  cashierHistoryState = { loading: false, records: [], pagination: null, errorMessage: '' },
  refreshCashierHistory = async () => {},
  handleViewCashierHistoryShift = () => {},
  refreshOperationalContext,
  locationsState = { loading: false, locations: [] },
  operatingLocationId = null,
  setOperatingLocationId = () => {},
  queueLocationScopeId = null,
  incomingOrdersState = { loading: false, orders: [] },
  orderHistoryState = { loading: false, orders: [], pagination: null },
  adminLocationMonitorState = { loading: false, orders: [], terminalShifts: [], errorMessage: '' },
  adminTerminalSwitching = false,
  onSelectAdminTerminal = async () => false,
  refreshAdminLocationMonitor = async () => {},
  canRecoverStaleShifts = false,
  handleForceCloseStaleShift = async () => false,
  incomingOrderActionState = {},
  handleIncomingOrderStatusChange = () => {},
  handleDeliveryJobStatusChange = () => {},
  handleAssignDeliveryPersonnel = () => {},
  deliveryPersonnelState = { loading: false, personnel: [], errorMessage: '' },
  onDeliveryPersonnelChanged = () => {},
  // Phase 226 (#1273): threaded through rather than fetched independently by
  // DeliveryRunsWorkspacePanel, so it reuses TerminalPage.jsx's existing single-flight
  // deliveryPersonnelFetchStartedRef and the shared state handleDeliveryPersonnelChanged already
  // keeps live after an admin registry edit (Phase 205 RF-3) -- a second fetch would fork it.
  ensureDeliveryPersonnelLoaded = () => {},
  handleOpenCashCollection = () => {},
  // Phase 148 (#825): mirrors handleOpenCashCollection's own plumbing through this
  // wrapper -- TerminalPage.jsx's handler doesn't reach IncomingQueueWorkspace directly, it
  // passes through TerminalPageLayout.jsx and this component first.
  handleOpenBalanceSettlement = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  refreshIncomingOrders = () => {},
  refreshOrderHistory = () => {},
  onlineOrderSoundEnabled = true,
  setOnlineOrderSoundEnabled = () => {},
  queueSummary = {},
  replayingQueuedTerminalOperations = false,
  handleReplayQueuedTerminalOperations = () => {},
  handleRetryQueuedOperation = () => {},
  handleResolveQueuedOperation = () => {},
  sectionIds = {}
}) {
  const restrictedMsmeModes = new Set(['location_scope', 'cash_drawer', 'terminal_setup']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;
  const isIncomingQueueView = effectiveViewMode === 'incoming_queue';
  const canImportItems = IS_DGFY_POS_SURFACE && (
    terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('items:import')
  );

  const content = useMemo(() => {
    switch (effectiveViewMode) {
    case 'incoming_queue':
      return (
        <IncomingQueueWorkspace
          canViewPos={canViewPos}
          canTransactPos={canTransactPos}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          orderHistoryState={orderHistoryState}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleDeliveryJobStatusChange={handleDeliveryJobStatusChange}
          handleAssignDeliveryPersonnel={handleAssignDeliveryPersonnel}
          deliveryPersonnelState={deliveryPersonnelState}
          ensureDeliveryPersonnelLoaded={ensureDeliveryPersonnelLoaded}
          handleOpenCashCollection={handleOpenCashCollection}
          handleOpenBalanceSettlement={handleOpenBalanceSettlement}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          refreshOrderHistory={refreshOrderHistory}
          locationsState={locationsState}
          queueLocationScopeId={queueLocationScopeId}
          locked={locked}
          isOnline={isOnline}
          onQueueOfflineItemDraft={onQueueOfflineItemDraft}
          sectionId={sectionIds.incomingOrders}
          workflowMode={workflowMode}
        />
      );
    case 'location_scope':
    case 'settings_profile':
    case 'settings_pos':
    case 'settings_storefront':
    case 'terminal_setup':
      return (
        <SettingsWorkspace
          terminalUser={terminalUser}
          terminalMeta={terminalMeta}
          locationsState={locationsState}
          queueLocationScopeId={queueLocationScopeId}
          incomingOrdersState={incomingOrdersState}
          locked={locked}
          sectionId={sectionIds.terminalSetup}
          initialTab={
            effectiveViewMode === 'settings_profile'
              ? 'profile'
              : (effectiveViewMode === 'settings_storefront' ? 'storefront' : 'pos_setup')
          }
          onRefreshTerminalUser={refreshTerminalUser}
          onRefreshTerminalMeta={refreshTerminalMeta}
          onPosSetupSaved={onPosSetupSaved}
          onStorefrontSetupSaved={onStorefrontSetupSaved}
          onlineOrderSoundEnabled={onlineOrderSoundEnabled}
          setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
          onDeliveryPersonnelChanged={onDeliveryPersonnelChanged}
        />
      );
    case 'shift_controls':
    case 'close_shift':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          operatorUserId={resolvePosUserId(terminalUser)}
          activeTerminalId={activeTerminalId}
          terminalRegistry={terminalRegistry}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          setOperatingLocationId={setOperatingLocationId}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          handleOpenShift={handleOpenShift}
          shiftActionLoading={shiftActionLoading}
          canOpenShift={canOpenShift}
          canCloseShift={canCloseShift}
          canCloseDay={canCloseDay}
          dayCloseReadinessState={dayCloseReadinessState}
          refreshDayCloseReadiness={refreshDayCloseReadiness}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          handleCloseDay={handleCloseDay}
          handleViewShiftSummary={handleViewShiftSummary}
          cashierHistoryState={cashierHistoryState}
          refreshCashierHistory={refreshCashierHistory}
          handleViewCashierHistoryShift={handleViewCashierHistoryShift}
          locked={locked}
          refreshOperationalContext={refreshOperationalContext}
          canAdjustCashDrawer={canAdjustCashDrawer}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          handleRecordCashEvent={handleRecordCashEvent}
          adminLocationMonitorState={adminLocationMonitorState}
          adminTerminalSwitching={adminTerminalSwitching}
          onSelectAdminTerminal={onSelectAdminTerminal}
          refreshAdminLocationMonitor={refreshAdminLocationMonitor}
          canRecoverStaleShifts={canRecoverStaleShifts}
          handleForceCloseStaleShift={handleForceCloseStaleShift}
          isOnline={isOnline}
          sectionId={sectionIds.activeShift}
          initialTab={viewMode === 'close_shift' ? 'close_shift' : 'shift_location'}
        />
      );
    case 'cash_drawer':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          operatorUserId={resolvePosUserId(terminalUser)}
          activeTerminalId={activeTerminalId}
          terminalRegistry={terminalRegistry}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          setOperatingLocationId={setOperatingLocationId}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          handleOpenShift={handleOpenShift}
          shiftActionLoading={shiftActionLoading}
          canOpenShift={canOpenShift}
          canCloseShift={canCloseShift}
          canCloseDay={canCloseDay}
          dayCloseReadinessState={dayCloseReadinessState}
          refreshDayCloseReadiness={refreshDayCloseReadiness}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          handleCloseDay={handleCloseDay}
          handleViewShiftSummary={handleViewShiftSummary}
          cashierHistoryState={cashierHistoryState}
          refreshCashierHistory={refreshCashierHistory}
          handleViewCashierHistoryShift={handleViewCashierHistoryShift}
          locked={locked}
          refreshOperationalContext={refreshOperationalContext}
          canAdjustCashDrawer={canAdjustCashDrawer}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          handleRecordCashEvent={handleRecordCashEvent}
          adminLocationMonitorState={adminLocationMonitorState}
          adminTerminalSwitching={adminTerminalSwitching}
          onSelectAdminTerminal={onSelectAdminTerminal}
          refreshAdminLocationMonitor={refreshAdminLocationMonitor}
          canRecoverStaleShifts={canRecoverStaleShifts}
          handleForceCloseStaleShift={handleForceCloseStaleShift}
          isOnline={isOnline}
          sectionId={sectionIds.activeShift}
          initialTab="cash_drawer"
        />
      );
    case 'reports':
      return (
        <PosReportsAnalyticsWorkspace
          todayDashboard={todayDashboard}
          terminalMeta={terminalMeta}
          activeTerminalId={activeTerminalId}
          operatingLocationId={operatingLocationId}
          reportRefreshKey={reportRefreshKey}
          employeeCreditReportRefreshKey={employeeCreditReportRefreshKey}
          isOnline={isOnline}
          offlineSnapshotScope={offlineSnapshotScope}
          sectionId={sectionIds.reports}
        />
      );
    case 'settings_affiliates':
      return (
        <AffiliatesWorkspacePanel
          terminalUser={terminalUser}
          locked={locked}
          isOnline={isOnline}
          sectionId={sectionIds.affiliates}
        />
      );
    // #732: promoted out of the Settings tab strip. Reaching either of these top-level modes at
    // all already implies view access (canViewVouchers gates the sidebar NavButton and the
    // view-mode allowlist in TerminalPage.jsx, mirroring routes/pricelists.js's own
    // VOUCHERS.VIEW/VOUCHERS.MANAGE/SYSTEM.VIEW_SETTINGS/SYSTEM.EDIT_SETTINGS dual-gate) -- the
    // canManage* props below only gate create/edit/lifecycle actions inside each panel itself,
    // same as before the promotion.
    //
    // #1493: these are two different permissions now, not one shared prop. canManageVouchers is
    // `vouchers:manage` alone (Admin + the `*_accounting` presets), matching routes/vouchers.js;
    // canManagePricelists keeps the legacy `vouchers:manage || settings:edit` pair, matching
    // routes/pricelists.js, which #1493 deliberately left alone. Do not collapse them back into
    // one prop -- that would silently take pricelist management away from every manager.
    case 'settings_vouchers':
      return (
        <VoucherManagementPanel
          disabled={locked}
          canManage={canManageVouchers}
          sectionId={sectionIds.vouchers}
          onNavigateToPricelists={() => onSelectViewMode('settings_pricelists')}
        />
      );
    case 'settings_pricelists':
      return (
        <PricelistManagementPanel
          disabled={locked}
          canManage={canManagePricelists}
          sectionId={sectionIds.pricelists}
        />
      );
    case 'items':
      return (
        <ItemsCatalogWorkspace
          canViewPos={canViewPos}
          canCreateItems={canCreateItems}
          canImportItems={canImportItems}
          canEditItems={canEditItems}
          canDeleteItems={canDeleteItems}
          canManageCategories={canManageCategories}
          canManageServiceCatalog={canManageServiceCatalog}
          canManageServiceOptions={canManageServiceCatalog}
          canViewFnbModifiers={canViewFnbModifiers}
          canManageFnbModifiers={canManageFnbModifiers}
          locations={locationsState?.locations || []}
          serviceOperationsPermissions={serviceOperationsPermissions}
          shiftState={shiftState}
          activeTerminalId={activeTerminalId}
          stockFilterPreset={itemsStockFilterPreset}
          onStockFilterPresetApplied={onItemsStockFilterPresetApplied}
          workflowMode={workflowMode}
          locked={locked}
          isOnline={isOnline}
          onQueueOfflineItemDraft={onQueueOfflineItemDraft}
          operatingLocationId={operatingLocationId}
          storefrontSlug={terminalMeta?.storefrontSlug || ''}
          sectionId={sectionIds.items}
        />
      );
    case 'services':
      return (
        <div id={sectionIds.services}>
          <PosServicesOperationsWorkspace
            permissions={serviceOperationsPermissions}
            isOnline={isOnline}
          />
        </div>
      );
    default:
      return (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Unknown operations view selected.
        </p>
      );
    }
  }, [
    canAdjustCashDrawer,
    canAdminBypassShiftPrompt,
    canOpenShift,
    canCloseShift,
    canCloseDay,
    dayCloseReadinessState,
    canCreateItems,
    canImportItems,
    canDeleteItems,
    canEditItems,
    canManageCategories,
    canManageVouchers,
    canManagePricelists,
    onSelectViewMode,
    canManageServiceCatalog,
    canManageFnbModifiers,
    canViewFnbModifiers,
    serviceOperationsPermissions,
    canRecoverStaleShifts,
    adminLocationMonitorState,
    adminTerminalSwitching,
    itemsStockFilterPreset,
    workflowMode,
    canSwitchPosLocation,
    canTransactPos,
    canViewPos,
    handleDeliveryJobStatusChange,
    handleAssignDeliveryPersonnel,
    deliveryPersonnelState,
    // handleOpenCashCollection is already a dep further down this array (next to
    // handleOpenIncomingOrderReceipt) -- only handleOpenBalanceSettlement is new here.
    handleOpenBalanceSettlement,
    cashEventForm,
    closeShiftForm,
    handleCloseShift,
    handleCloseDay,
    handleViewShiftSummary,
    cashierHistoryState,
    refreshCashierHistory,
    handleViewCashierHistoryShift,
    handleIncomingOrderStatusChange,
    handleOpenCashCollection,
    handleOpenIncomingOrderReceipt,
    handleForceCloseStaleShift,
    incomingReceiptOpeningId,
    handleOpenShift,
    handleSwitchShiftLocation,
    handleRecordCashEvent,
    incomingOrderActionState,
    incomingOrdersState,
    orderHistoryState,
    isOnline,
    locationsState,
    locked,
    queueSummary,
    replayingQueuedTerminalOperations,
    handleReplayQueuedTerminalOperations,
    handleRetryQueuedOperation,
    handleResolveQueuedOperation,
    onItemsStockFilterPresetApplied,
    onPosSetupSaved,
    onSelectAdminTerminal,
    onStorefrontSetupSaved,
    onlineOrderSoundEnabled,
    operatingLocationId,
    openShiftForm,
    queueLocationScopeId,
    refreshIncomingOrders,
    refreshOrderHistory,
    refreshAdminLocationMonitor,
    refreshOperationalContext,
    refreshDayCloseReadiness,
    reportRefreshKey,
    employeeCreditReportRefreshKey,
    isOnline,
    offlineSnapshotScope,
    onQueueOfflineItemDraft,
    sectionIds.activeShift,
    sectionIds.affiliates,
    sectionIds.cashDrawer,
    sectionIds.closeShift,
    sectionIds.incomingOrders,
    sectionIds.items,
    sectionIds.locationScope,
    sectionIds.pricelists,
    sectionIds.reports,
    sectionIds.salesToday,
    sectionIds.services,
    sectionIds.terminalSetup,
    sectionIds.vouchers,
    activeTerminalId,
    refreshTerminalMeta,
    refreshTerminalUser,
    setOperatingLocationId,
    setCashEventForm,
    setCloseShiftForm,
    setOpenShiftForm,
    setOnlineOrderSoundEnabled,
    shiftActionLoading,
    shiftState,
    terminalMeta,
    terminalRegistry,
    terminalUser,
    todayDashboard,
    effectiveViewMode,
    viewMode
  ]);

  return (
    <WorkspaceShell
      icon={modeMeta.icon}
      title={modeMeta.title}
      subtitle={modeMeta.subtitle}
      terminalUser={terminalUser}
      locked={locked}
      className={effectiveViewMode === 'items' ? 'px-5 pb-5 pt-2' : 'p-5'}
    >
      <div key={effectiveViewMode} className="catalog-slide-enter">
        {content}
      </div>
      {locked && !isIncomingQueueView && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Terminal is locked. Unlock to run protected operational actions.
        </div>
      )}
    </WorkspaceShell>
  );
}
