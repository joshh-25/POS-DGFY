import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Barcode,
  ImagePlus,
  MapPin,
  Pencil,
  MapPinned,
  Package,
  Plus,
  Receipt,
  RefreshCcw,
  Search,
  Settings2,
  ShieldCheck,
  Star,
  Store,
  UserRound,
  Tags,
  Trash2,
  TrendingUp,
  Truck,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ai/ConfirmActionDialog';
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
import { useCreateItem, useDeleteItem, useUpdateItem } from '@/hooks/useItems.js';
import {
  createFolder,
  generateItemBarcode,
  getFolders,
  getItems,
  listItemBarcodes,
  updateFolder
} from '@/services/itemService.js';
import { updatePosCatalogOverride, uploadPosCatalogImage } from '@/services/posCatalogService.js';
import { updateStorefrontCatalogOverride, uploadStorefrontCatalogImage } from '@/services/storefrontCatalogService.js';
import { deleteStorefrontAsset, getCompanyInfo, getAllSettings, updateSettings, uploadStorefrontAsset } from '@/services/settingsService.js';
import { getUserLocationGrants, resetLocalCashierPassword, updateProfile, updateUserLocationGrants } from '@/services/userService.js';
import * as tenantLocationService from '@/services/tenantLocationService.js';
import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { createSuggestedTerminalId, normalizeTerminalRegistry, sanitizeTerminalId } from '@/src/features/pos/utils/terminalIdentity.js';
import { resolveModeItemTaxonomy } from '@/src/features/settings/modeItemTaxonomy.js';
import StorefrontBusinessHoursScheduler from '@/src/features/settings/StorefrontBusinessHoursScheduler.jsx';
import { normalizeStorefrontBusinessHours, serializeStorefrontBusinessHours } from '@/src/features/settings/storefrontBusinessHours.js';
import resolveAssetUrl from '@/src/utils/assetUrl.js';
import UserInvitationModal from '@/Components/users/UserInvitationModal.jsx';
import { IncomingQueueWorkspace, WorkspaceShell } from './TerminalOperationsPanels.jsx';
import {
  fetchPosSetupCashiers,
  fetchPosCatalog,
  fetchPosTransactions,
  fetchTerminalTodayDashboard
} from '../services/posService.js';
import PosReportsAnalyticsWorkspace from './PosReportsAnalyticsWorkspace.jsx';
import { toast } from 'sonner';

const MapPinPicker = lazy(() => import('@/src/components/maps/MapPinPicker.jsx'));

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
  items: {
    icon: ClipboardList,
    title: 'Items',
    subtitle: 'Review SKUpervisor items and update the item name, price, and cost from POS.'
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
  storefront_ui_v2_enabled: 'Storefront UI V2',
  storefront_categories: 'Storefront Categories',
  storefront_gallery_images: 'Storefront Gallery Images',
  storefront_delivery_partners: 'Storefront Delivery Partners',
  storefront_follow_enabled: 'Show Follow Button',
  storefront_share_enabled: 'Show Share Button',
  'storefront_locations.primary_location': 'Primary Storefront Location'
};

const money = (value) => Number(value || 0).toFixed(2);
const TERMINAL_ID_PATTERN = /^[A-Za-z0-9._-]{2,100}$/;
const TERMINAL_REGISTRY_MODE_OPTIONS = ['warn', 'enforce'];
const CUSTOMER_ACCESS_MODE_OPTIONS = [
  { value: 'ghost', label: 'Ghost', description: 'Profile and contact only; catalog, cart, checkout, and booking are hidden.' },
  { value: 'catalog', label: 'Catalog Only', description: 'Customers can browse catalog, prices, and inventory labels only.' },
  { value: 'inquiry', label: 'Inquiry', description: 'Customers can browse and contact you through existing channels.' },
  { value: 'transaction', label: 'Transaction', description: 'Customers can quote, checkout, and book services online.' }
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
  supports_dine_in: true
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
function ShiftControlsWorkspace({
  shiftState,
  terminalMeta,
  locationsState,
  operatingLocationId,
  setOperatingLocationId,
  canSwitchPosLocation,
  handleSwitchShiftLocation,
  openShiftForm,
  setOpenShiftForm,
  handleOpenShift,
  shiftActionLoading,
  canTransactPos,
  canCloseDay,
  canAdminBypassShiftPrompt = false,
  closeShiftForm,
  setCloseShiftForm,
  handleCloseShift,
  locked,
  refreshOperationalContext,
  canAdjustCashDrawer,
  cashEventForm,
  setCashEventForm,
  handleRecordCashEvent,
  sectionId,
  initialTab = 'shift_location',
  companyName = '',
  activeTerminalId = '',
  terminalUser = null
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const [switchReason, setSwitchReason] = useState('');
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
  const cashierDisplayName = activeShift?.cashier?.username
    || activeShift?.cashier?.email
    || terminalUser?.username
    || terminalUser?.email
    || 'Current cashier';
  const canRenderAdminShiftOpen = canAdminBypassShiftPrompt || canTransactPos;
  const SHIFT_TABS = [
    { id: 'shift_location', label: 'Shift Location', icon: MapPinned },
    { id: 'close_shift', label: 'Close Shift', icon: ShieldCheck },
    { id: 'cash_drawer', label: 'Cash Drawer', icon: Banknote }
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
      label: 'Cashier:',
      value: cashierDisplayName,
      valueClassName: 'text-[18px] font-black text-[#2563EB]'
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
      label: 'Opening Float:',
      value: `${terminalMeta.pettyCashSymbol} ${money(activeShift.opening_float_amount)}`,
      valueClassName: 'text-[13px] font-extrabold text-[#0F172A]'
    },
    {
      icon: Banknote,
      label: 'Expected Cash:',
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

  const renderShiftLocationPane = () => {
    if (!activeShift) {
      return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
          <div className="mb-3 flex flex-wrap gap-2 text-[11px] font-bold text-slate-600">
            <span className="rounded-full bg-slate-100 px-3 py-1">Company: {companyName || 'Current company'}</span>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-700">Terminal: {activeTerminalId || 'Not selected'}</span>
          </div>
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700">
            Shift Closed. Please open your shift before using the POS.
          </p>
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
              disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen || !canSubmitOpenShift}
            >
              {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
            </Button>
            {!canRenderAdminShiftOpen && <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>}
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
            <Label className="mt-3 block text-[12px] font-black text-[#0F172A]">Current Shift Location</Label>
            <select
              className="mt-2 h-11 w-full rounded-lg border border-blue-300 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none transition focus:border-[#2563EB] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
              value={operatingLocationId || ''}
              onChange={(event) => {
                const nextValue = event.target.value ? Number(event.target.value) : null;
                setOperatingLocationId(nextValue);
              }}
            >
              {locations.map((location) => (
                <option key={`shift-operating-location-${location.location_id}`} value={location.location_id}>
                  {location.name}
                </option>
              ))}
            </select>

            <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 md:hidden">
              <div className="flex flex-col gap-0.5">
                <p className="text-[12px] font-medium text-[#5B6B86]">{summaryRows[0]?.label}</p>
                <p className={`${summaryRows[0]?.valueClassName} break-words leading-6`}>{summaryRows[0]?.value}</p>
              </div>
              <div className="flex flex-wrap gap-4">
                <div className="flex flex-col gap-0.5">
                  <p className="text-[12px] font-medium text-[#5B6B86]">{summaryRows[1]?.label}</p>
                  <p className={`${summaryRows[1]?.valueClassName} break-words leading-6`}>{summaryRows[1]?.value}</p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-[12px] font-medium text-[#5B6B86]">{summaryRows[2]?.label}</p>
                  <p className={`${summaryRows[2]?.valueClassName} break-words leading-6`}>{summaryRows[2]?.value}</p>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {summaryRows.slice(3, 6).map((row) => (
                  <div key={`shift-summary-mobile-${row.label}`} className="flex flex-col gap-0.5">
                    <span className="text-[12px] font-medium text-[#5B6B86]">{row.label}</span>
                    <span className={`${row.valueClassName} break-words leading-6`}>{row.value}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[12px] font-medium text-[#5B6B86]">{summaryRows[6]?.label}</span>
                <span className={`${summaryRows[6]?.valueClassName} break-words leading-6`}>{summaryRows[6]?.value}</span>
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
                      <div key={`shift-summary-right-${row.label}`} className={`flex items-center gap-3 py-3 ${index < 2 ? 'border-b border-slate-100' : ''}`}>
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
              disabled={shiftActionLoading.open || locked || !canRenderAdminShiftOpen || !canSubmitOpenShift}
            >
              {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
            </Button>
            {!canRenderAdminShiftOpen && <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Close Shift</p>
        {!canCloseDay ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
            You need close-day permission to close shifts.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="text-xs text-slate-600">
              Expected Cash: <span className="font-semibold text-slate-900">{terminalMeta.pettyCashSymbol} {money(shiftState.cashSummary?.expected_cash_amount)}</span>
            </p>
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
        )}
      </div>
    );
  };

  const renderCashDrawerPane = () => {
    if (!activeShift) {
      return (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-700 shadow-sm shadow-amber-100/70">
          Open a shift first before recording cash drawer events.
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
          </div>
        )}
      </div>
    );
  };

  const renderActivePane = () => {
    if (renderedTab === 'close_shift') return renderCloseShiftPane();
    if (renderedTab === 'cash_drawer') return renderCashDrawerPane();
    return renderShiftLocationPane();
  };

  return (
    <div id={sectionId} className="space-y-4">
      <h2 className="sr-only">Shift Controls</h2>
      <div className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm shadow-slate-200/70">
        <div className="hidden gap-2 sm:grid md:grid-cols-3">
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
            const isShiftLocation = tab.id === 'shift_location';
            return (
              <button
                key={`mobile-${tab.id}`}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex min-h-14 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-black transition ${isShiftLocation ? 'min-w-0 flex-1' : 'shrink-0'} ${
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
  );
}

const POS_FOOD_CATEGORY_LABELS = Object.freeze([
  'Add Ons',
  'Appetizers',
  'Burgers And Sandwiches',
  'Espresso Based Beverages',
  'Frappe',
  'Fruit Shakes',
  'Mains',
  'Mocktails',
  'Non Espresso Based Beverages',
  'Pasta',
  'Rice Bowls',
  'Rice Meals',
  'Space Bar Exclusive',
  'Waffle'
]);

const DEFAULT_POS_FOOD_CATEGORY = 'Mains';

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

const createEmptyPosItemForm = () => ({
  name: '',
  default_sale_price: '',
  cost_per_unit: '',
  current_stock: '0',
  pos_always_available: false,
  description: '',
  sku_code: '',
  pos_category: DEFAULT_POS_FOOD_CATEGORY
});

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

function ItemsWorkspace({
  canViewPos,
  canCreateItems = false,
  canEditItems = false,
  canDeleteItems = false,
  stockFilterPreset = '',
  onStockFilterPresetApplied = () => {},
  workflowMode = '',
  locked,
  operatingLocationId = null,
  sectionId
}) {
  const [items, setItems] = useState([]);
  const [primaryBarcodes, setPrimaryBarcodes] = useState({});
  const [loading, setLoading] = useState(true);
  const [barcodeLookupLoading, setBarcodeLookupLoading] = useState(false);
  const [error, setError] = useState('');
  const { createItem, loading: creatingItem } = useCreateItem();
  const { updateItem, loading: savingItem } = useUpdateItem();
  const { deleteItem, loading: deletingItem } = useDeleteItem();
  const [editingItemId, setEditingItemId] = useState(null);
  const [persistingEditAssets, setPersistingEditAssets] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    current_stock: '0',
    default_sale_price: '',
    cost_per_unit: '',
    pos_always_available: false,
    description: '',
    pos_category: DEFAULT_POS_FOOD_CATEGORY
  });
  const [editImageFile, setEditImageFile] = useState(null);
  const [editImagePreviewUrl, setEditImagePreviewUrl] = useState('');
  const [savedMessage, setSavedMessage] = useState({ name: '', barcode: '', action: 'updated' });
  const [deletedItemName, setDeletedItemName] = useState('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [isMobileSearchActive, setIsMobileSearchActive] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(createEmptyPosItemForm());
  const [posFolders, setPosFolders] = useState([]);
  const [skuSeedItems, setSkuSeedItems] = useState([]);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState('');
  const [pendingCreateRecovery, setPendingCreateRecovery] = useState(null);
  const [postCreateSaving, setPostCreateSaving] = useState(false);
  const posItemPreset = useMemo(() => resolveSellablePosItemPreset(workflowMode), [workflowMode]);

  useEffect(() => {
    const normalizedPreset = String(stockFilterPreset || '').trim();
    if (!normalizedPreset) return;
    setStockFilter(normalizedPreset);
    onStockFilterPresetApplied();
  }, [onStockFilterPresetApplied, stockFilterPreset]);

  const loadPrimaryBarcodes = useCallback(async (catalogItems = []) => {
    const normalizedItems = Array.isArray(catalogItems)
      ? catalogItems.filter((item) => Number(item?.item_id) > 0)
      : [];

    if (normalizedItems.length === 0) {
      setPrimaryBarcodes({});
      return;
    }

    setBarcodeLookupLoading(true);
    try {
      const entries = await Promise.allSettled(normalizedItems.map(async (item) => {
        const payload = await listItemBarcodes(item.item_id);
        const rows = Array.isArray(payload?.barcodes) ? payload.barcodes : [];
        const primary = rows.find((row) => row?.is_primary === true && row?.is_active !== false)
          || rows.find((row) => row?.is_active !== false)
          || null;
        return [String(item.item_id), primary];
      }));

      const nextBarcodes = {};
      entries.forEach((entry) => {
        if (entry.status !== 'fulfilled') return;
        const [itemId, barcode] = entry.value;
        nextBarcodes[itemId] = barcode;
      });
      setPrimaryBarcodes(nextBarcodes);
    } finally {
      setBarcodeLookupLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!canViewPos) {
      setItems([]);
      setPrimaryBarcodes({});
      setError('');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchPosCatalog({ limit: 200 });
      const catalogItems = Array.isArray(data) ? data : [];
      setItems(catalogItems);
      await loadPrimaryBarcodes(catalogItems);
    } catch (loadError) {
      setItems([]);
      setPrimaryBarcodes({});
      setError(loadError?.response?.data?.message || 'Failed to load POS-visible IMS items.');
    } finally {
      setLoading(false);
    }
  }, [canViewPos, loadPrimaryBarcodes]);

  const normalizePosFolders = useCallback((rows = []) => (
    (Array.isArray(rows) ? rows : [])
      .map((folder) => ({
        ...folder,
        folder_id: Number(folder?.folder_id),
        name: String(folder?.name || '').trim(),
        show_in_pos_filter: folder?.show_in_pos_filter !== false
      }))
      .filter((folder) => Number.isInteger(folder.folder_id) && folder.folder_id > 0 && folder.name)
  ), []);

  const loadPosFolders = useCallback(async ({ seedFoodCategories = false } = {}) => {
    if (!canViewPos) {
      setPosFolders([]);
      return [];
    }

    try {
      let folders = normalizePosFolders(await getFolders());

      if (seedFoodCategories && canCreateItems) {
        const byName = new Map(folders.map((folder) => [normalizeFolderNameKey(folder.name), folder]));
        let changed = false;

        for (const label of POS_FOOD_CATEGORY_LABELS) {
          const key = normalizeFolderNameKey(label);
          const existing = byName.get(key);
          if (existing) {
            if (existing.show_in_pos_filter === false) {
              await updateFolder(existing.folder_id, { show_in_pos_filter: true });
              changed = true;
            }
            continue;
          }

          await createFolder({
            name: label,
            description: 'POS food category'
          });
          changed = true;
        }

        if (changed) {
          folders = normalizePosFolders(await getFolders());
        }
      }

      setPosFolders(folders);
      return folders;
    } catch (folderError) {
      setPosFolders([]);
      if (seedFoodCategories) {
        toast.error(folderError?.response?.data?.message || folderError?.message || 'Failed to prepare POS food categories.');
      }
      return [];
    }
  }, [canCreateItems, canViewPos, normalizePosFolders]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadPosFolders({ seedFoodCategories: canCreateItems });
  }, [canCreateItems, loadPosFolders]);

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

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [selectedImageFile]);

  useEffect(() => {
    if (!editImageFile) {
      setEditImagePreviewUrl('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(editImageFile);
    setEditImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [editImageFile]);

  const sortedItems = useMemo(
    () => [...(Array.isArray(items) ? items : [])].sort((left, right) => String(left?.name || '').localeCompare(String(right?.name || ''))),
    [items]
  );

  const foodCategoryOptions = useMemo(() => {
    const byName = new Map();
    POS_FOOD_CATEGORY_LABELS.forEach((label) => {
      const name = String(label || '').trim();
      byName.set(normalizeFolderNameKey(name), createFoodCategoryOption({ name }));
    });
    posFolders
      .filter((folder) => folder?.show_in_pos_filter !== false)
      .forEach((folder) => {
        byName.set(normalizeFolderNameKey(folder.name), createFoodCategoryOption(folder));
      });
    sortedItems.forEach((item) => {
      const folderName = String(item?.folder?.name || item?.product_folder || '').trim();
      if (!folderName) return;
      byName.set(normalizeFolderNameKey(folderName), createFoodCategoryOption({
        folder_id: item?.folder_id,
        name: folderName
      }));
    });
    return Array.from(byName.values()).filter((option) => option.name);
  }, [posFolders, sortedItems]);

  const categoryOptions = useMemo(() => ['all', ...foodCategoryOptions.map((option) => option.value)], [foodCategoryOptions]);

  const categoryOptionLabels = useMemo(() => {
    const labels = new Map([['all', 'All categories']]);
    foodCategoryOptions.forEach((option) => labels.set(option.value, option.label));
    return labels;
  }, [foodCategoryOptions]);

  const resolveFoodCategorySelection = useCallback((selection = '') => {
    const normalizedSelection = String(selection || '').trim();
    const selectionName = normalizedSelection.startsWith('name:')
      ? normalizedSelection.slice('name:'.length)
      : normalizedSelection;
    const selectedOption = foodCategoryOptions.find((option) => option.value === normalizedSelection)
      || foodCategoryOptions.find((option) => normalizeFolderNameKey(option.name) === normalizeFolderNameKey(selectionName))
      || createFoodCategoryOption({ name: selectionName || DEFAULT_POS_FOOD_CATEGORY });
    return selectedOption;
  }, [foodCategoryOptions]);

  const ensureFoodCategoryFolder = useCallback(async (selection = '') => {
    const selectedOption = resolveFoodCategorySelection(selection);
    if (selectedOption.folder_id) return selectedOption;

    const label = String(selectedOption.name || DEFAULT_POS_FOOD_CATEGORY).trim();
    const key = normalizeFolderNameKey(label);
    const existing = posFolders.find((folder) => normalizeFolderNameKey(folder.name) === key);
    if (existing) {
      return createFoodCategoryOption(existing);
    }

    if (!canCreateItems) {
      return selectedOption;
    }

    const created = await createFolder({
      name: label,
      description: 'POS food category'
    });
    await loadPosFolders();
    return createFoodCategoryOption({
      folder_id: created?.folder_id,
      name: created?.name || label
    });
  }, [canCreateItems, loadPosFolders, posFolders, resolveFoodCategorySelection]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = String(searchQuery || '').trim().toLowerCase();
    return sortedItems.filter((item) => {
      const folderId = Number(item?.folder_id);
      const folderName = String(item?.folder?.name || item?.product_folder || '').trim();
      const barcode = primaryBarcodes[String(item?.item_id)]?.code || '';
      const stockQuantity = Number(item?.current_stock || 0);
      const isAlwaysAvailable = item?.pos_always_available === true;
      const threshold = Number(item?.min_threshold);
      const lowStockThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
      const matchesStock = (() => {
        switch (stockFilter) {
          case 'in_stock':
            return isAlwaysAvailable || stockQuantity > lowStockThreshold;
          case 'low_stock':
            return stockQuantity > 0 && stockQuantity <= lowStockThreshold;
          case 'almost_out':
            return stockQuantity > 0 && stockQuantity <= lowStockThreshold;
          case 'out_of_stock':
            return !isAlwaysAvailable && stockQuantity <= 0;
          default:
            return true;
        }
      })();
      const matchesCategory = categoryFilter === 'all'
        || (categoryFilter.startsWith('folder:')
          ? Number(categoryFilter.replace('folder:', '')) === folderId
          : normalizeFolderNameKey(folderName) === normalizeFolderNameKey(categoryFilter.replace('name:', '')));
      const haystack = [
        item?.name,
        item?.sku_code,
        folderName,
        barcode
      ]
        .map((value) => String(value || '').toLowerCase())
        .join(' ');
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      return matchesCategory && matchesStock && matchesQuery;
    });
  }, [categoryFilter, primaryBarcodes, searchQuery, sortedItems, stockFilter]);

  const activeEditItem = useMemo(
    () => sortedItems.find((item) => Number(item?.item_id) === Number(editingItemId)) || null,
    [editingItemId, sortedItems]
  );

  const openEdit = (item) => {
    setEditingItemId(item?.item_id || null);
    setEditImageFile(null);
    setEditForm({
      name: String(item?.name || ''),
      current_stock: String(item?.current_stock ?? '0'),
      default_sale_price: String(item?.default_sale_price ?? ''),
      cost_per_unit: String(item?.cost_per_unit ?? ''),
      pos_always_available: item?.pos_always_available === true,
      description: String(item?.description || ''),
      pos_category: String(item?.folder?.name || item?.product_folder || DEFAULT_POS_FOOD_CATEGORY)
    });
  };

  const closeEdit = ({ force = false } = {}) => {
    if (!force && (savingItem || persistingEditAssets)) return;
    setEditingItemId(null);
    setPersistingEditAssets(false);
    setEditImageFile(null);
    setEditForm({
      name: '',
      current_stock: '0',
      default_sale_price: '',
      cost_per_unit: '',
      pos_always_available: false,
      description: '',
      pos_category: DEFAULT_POS_FOOD_CATEGORY
    });
  };

  const openCreate = () => {
    setCreateForm(createEmptyPosItemForm());
    setSelectedImageFile(null);
    setPendingCreateRecovery(null);
    setShowCreateModal(true);
  };

  const closeCreate = ({ force = false } = {}) => {
    if ((creatingItem || postCreateSaving) && !force) return;
    setShowCreateModal(false);
    setCreateForm(createEmptyPosItemForm());
    setSelectedImageFile(null);
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

    const name = String(editForm.name || '').trim();
    const description = String(editForm.description || '').trim();
    const category = 'product';
    const stock = Number(String(editForm.current_stock || '0').trim());
    const price = parseMoneyValue(editForm.default_sale_price);
    const cost = parseMoneyValue(editForm.cost_per_unit);

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

    try {
      setPersistingEditAssets(true);
      const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
      const foodCategory = await ensureFoodCategoryFolder(editForm.pos_category);
      await updateItem(activeEditItem.item_id, {
        name,
        category,
        description,
        product_folder: foodCategory.name,
        folder_id: foodCategory.folder_id || null,
        current_stock: resolvedStock,
        location_id: Number.isInteger(Number(operatingLocationId)) && Number(operatingLocationId) > 0
          ? Number(operatingLocationId)
          : null,
        product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
        mode_item_preset: category === 'product' ? posItemPreset.key : undefined,
        unit_of_measure: category === 'product' ? (posItemPreset.default_unit || 'pcs') : undefined,
        fifo_enabled: category === 'product' ? posItemPreset.fifo_enabled !== false : undefined,
        max_capacity: Math.max(resolvedStock, 1),
        min_threshold: Math.min(5, Math.max(resolvedStock, 0)),
        default_sale_price: price,
        cost_per_unit: cost
      });
      await updatePosCatalogOverride(activeEditItem.item_id, {
        pos_always_available: editForm.pos_always_available === true
      });
      if (editImageFile) {
        await Promise.all([
          uploadPosCatalogImage(activeEditItem.item_id, editImageFile),
          uploadStorefrontCatalogImage(activeEditItem.item_id, editImageFile)
        ]);
      }
      closeEdit({ force: true });
      await loadItems();
      setSavedMessage({ name, barcode: primaryBarcodes[String(activeEditItem.item_id)]?.code || '', action: 'updated' });
    } catch (updateError) {
      toast.error(updateError?.response?.data?.message || 'Failed to update item.');
    } finally {
      setPersistingEditAssets(false);
    }
  };

  const runPostCreateStages = async ({ itemId, itemName, imageFile, posAlwaysAvailable }) => {
    const failedStages = [];
    let barcodeCode = '';

    const runStage = async (key, label, action) => {
      try {
        return await action();
      } catch (error) {
        failedStages.push({
          key,
          label,
          message: getStageErrorMessage(error),
          readinessBlocked: error?.is_pos_readiness_blocked === true
        });
        return null;
      }
    };

    if (imageFile) {
      await runStage('pos_image', 'POS image upload', () => uploadPosCatalogImage(itemId, imageFile));
      await runStage('storefront_image', 'Storefront image upload', () => uploadStorefrontCatalogImage(itemId, imageFile));
    }

    const generatedBarcode = await runStage('barcode', 'barcode generation', () => generateItemBarcode(itemId, {
      scope: 'pos',
      packaging_level: 'unit'
    }));
    barcodeCode = String(generatedBarcode?.code || generatedBarcode?.barcode?.code || '').trim();

    await runStage('storefront_visibility', 'Storefront visibility', () => updateStorefrontCatalogOverride(itemId, { storefront_visible: true }));
    await runStage('always_available', 'Always Available', () => updatePosCatalogOverride(itemId, {
      pos_always_available: posAlwaysAvailable === true
    }));
    await runStage('pos_visibility', 'POS visibility', () => updatePosCatalogOverride(itemId, {
      pos_visible: true
    }));

    if (failedStages.length > 0) {
      setPendingCreateRecovery({
        itemId,
        name: itemName,
        imageFile,
        posAlwaysAvailable,
        failedStages
      });
      const labels = failedStages.map((stage) => stage.label).join(', ');
      throw new Error(`Item #${itemId} was created, but these post-create steps still need retry: ${labels}.`);
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
    const foodCategory = resolveFoodCategorySelection(createForm.pos_category);

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

    const resolvedStock = category === 'product' || category === 'supplies' ? stock : 0;
    const payload = {
      sku_code: skuCode,
      name,
      category,
      product_type: category === 'product' ? (posItemPreset.product_type || 'finished_goods') : null,
      mode_item_preset: category === 'product' ? posItemPreset.key : undefined,
      product_folder: foodCategory.name,
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
      status: 'active'
    };

    const finalizeCreatedItem = async ({ barcode = '', warningMessage = '', action = 'created' } = {}) => {
      closeCreate({ force: true });
      await loadItems();
      setSavedMessage({ name, barcode, action });
      if (warningMessage) {
        toast.warning(warningMessage);
      }
    };

    try {
      setPostCreateSaving(true);
      if (pendingCreateRecovery?.itemId) {
        const recoveryName = pendingCreateRecovery.name || name;
        const result = await runPostCreateStages({
          itemId: pendingCreateRecovery.itemId,
          itemName: recoveryName,
          imageFile: pendingCreateRecovery.imageFile || selectedImageFile,
          posAlwaysAvailable: pendingCreateRecovery.posAlwaysAvailable
        });
        await finalizeCreatedItem({
          barcode: result.barcodeCode,
          action: 'created',
          warningMessage: `Post-create setup completed for item #${pendingCreateRecovery.itemId}.`
        });
        toast.success('POS item setup resumed successfully.');
        return;
      }

      const resolvedFoodCategory = await ensureFoodCategoryFolder(createForm.pos_category);
      payload.product_folder = resolvedFoodCategory.name;
      if (resolvedFoodCategory.folder_id) {
        payload.folder_id = resolvedFoodCategory.folder_id;
      }

      const createdItem = await createItem(payload);
      const itemId = Number(createdItem?.item_id || createdItem?.id || 0);
      if (!Number.isInteger(itemId) || itemId <= 0) {
        throw new Error('Item was created but no valid item ID was returned.');
      }

      if (resolvedFoodCategory.folder_id && Number(createdItem?.folder_id || 0) !== resolvedFoodCategory.folder_id) {
        await updateItem(itemId, {
          product_folder: resolvedFoodCategory.name,
          folder_id: resolvedFoodCategory.folder_id
        });
      }

      const result = await runPostCreateStages({
        itemId,
        itemName: name,
        imageFile: selectedImageFile,
        posAlwaysAvailable: createForm.pos_always_available === true
      });

      await finalizeCreatedItem({ barcode: result.barcodeCode });
      toast.success('POS item created.');
    } catch (createError) {
      if (pendingCreateRecovery?.itemId || /post-create steps still need retry/i.test(String(createError?.message || ''))) {
        await loadItems().catch(() => {});
        toast.warning(createError.message);
      } else {
        toast.error(createError?.response?.data?.message || createError?.message || 'Failed to create item.');
      }
    } finally {
      setPostCreateSaving(false);
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
    <div id={sectionId} className="space-y-4">
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
        </div>
      </div>

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
          <p className="mt-3 text-base font-black text-[#0F172A]">No POS items found</p>
          <p className="mt-1 text-sm text-[#64748B]">
            Only IMS items with POS visibility enabled appear here.
          </p>
          {canCreateItems && (
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
          {filteredItems.map((item) => {
            const barcode = primaryBarcodes[String(item.item_id)]?.code || '';
            const imageUrl = item?.pos_image_url || item?.storefront_image_url || '';
            const stockQuantity = Number(item?.current_stock || 0);
            const isAlwaysAvailable = item?.pos_always_available === true;
            const profit = Number(item?.default_sale_price || 0) - Number(item?.cost_per_unit || 0);
            const profitMargin = Number(item?.default_sale_price || 0) > 0
              ? (profit / Number(item.default_sale_price)) * 100
              : 0;
            const threshold = Number(item?.min_threshold);
            const lowStockThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : 5;
            const almostOutOfStock = !isAlwaysAvailable && stockQuantity > 0 && stockQuantity <= lowStockThreshold;
            const stockStatusLabel = isAlwaysAvailable
              ? 'Always Available'
              : stockQuantity <= 0 ? 'Out of Stock' : almostOutOfStock ? 'Almost Out of Stock' : 'In Stock';
            const stockStatusClassName = isAlwaysAvailable
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
                    <div className="flex h-[4rem] w-[4rem] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner sm:h-[4.5rem] sm:w-[4.5rem]">
                      {imageUrl ? (
                        <img src={imageUrl} alt={item?.name || 'Item image'} className="h-full w-full object-cover" />
                      ) : (
                        <ImagePlus className="h-5 w-5 text-slate-300" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-h-full flex-col">
                        <div className="min-h-[2.875rem]">
                          <div className="min-w-0 max-w-[15rem]">
                            <p className="truncate text-base font-black leading-5 tracking-tight text-[#0F172A]">{item.name || 'Unnamed item'}</p>
                            <p className="mt-0.5 truncate text-[11px] font-medium leading-4 text-[#64748B]">Inventory item synced from IMS</p>
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
                                {barcodeLookupLoading && !barcode && (
                                  <span className="w-fit rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                                    Loading
                                  </span>
                                )}
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
                            <p className="mt-0.5 text-xs font-bold capitalize text-[#0F172A]">{item.category || 'Uncategorized'}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-2">
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Stock</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-bold text-[#0F172A]">{stockQuantity}</p>
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${stockStatusClassName}`}>
                                <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
                                {stockStatusLabel}
                              </span>
                            </div>
                          </div>
                          <div className="min-w-0">
                            <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-[#64748B]">Profit</p>
                            <p className="mt-0.5 text-xs font-bold text-[#0F172A]">
                              PHP {money(profit)} <span className="text-[#2563EB]">({Number.isFinite(profitMargin) ? profitMargin.toFixed(1) : '0.0'}%)</span>
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
                                  <p className="text-[10px] font-bold uppercase tracking-[0.06em] text-emerald-700">PHP</p>
                                  <p className="text-[0.95rem] font-black tracking-tight text-emerald-700">{money(item.cost_per_unit)}</p>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2 sm:items-stretch">
                        {canEditItems && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => openEdit(item)}
                            disabled={locked || savingItem || deletingItem || creatingItem}
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
        </div>
      )}

      {showCreateModal && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-create-modal-title"
          onClick={closeCreate}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="overflow-y-auto p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="pos-items-create-modal-title" className="text-lg font-black text-[#0F172A]">Add POS Item</p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    This creates a POS item and enables storefront visibility on the same record.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeCreate}
                  disabled={creatingItem || postCreateSaving}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#334155] hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                    {selectedImagePreviewUrl ? (
                      <img src={selectedImagePreviewUrl} alt="Selected preview" className="h-full w-full object-cover" />
                    ) : (
                      <div className="px-6 text-center">
                        <ImagePlus className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-semibold text-[#334155]">Add product image</p>
                        <p className="mt-1 text-xs text-[#64748B]">The same image will be used for POS and storefront visibility.</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="pos-item-image" className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Item image</Label>
                    <Input
                      id="pos-item-image"
                      type="file"
                      accept="image/*"
                      className="mt-2 h-11 cursor-pointer"
                      disabled={creatingItem || postCreateSaving}
                      onChange={(event) => setSelectedImageFile(event.target.files?.[0] || null)}
                    />
                  </div>
                </div>

                <div className="grid gap-4">
                  {pendingCreateRecovery?.itemId ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      <p className="font-bold">Item #{pendingCreateRecovery.itemId} was created. Resume setup retries only unfinished post-create stages and will not create a duplicate item.</p>
                      {Array.isArray(pendingCreateRecovery.failedStages) && pendingCreateRecovery.failedStages.length > 0 ? (
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {pendingCreateRecovery.failedStages.map((stage) => (
                            <li key={stage.key}>{stage.label}: {stage.message}</li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className="text-[13px] font-semibold text-[#334155]">Item name</span>
                      <Input
                        value={createForm.name}
                        onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                        className="mt-2 h-11"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Classic Milk Tea"
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-[13px] font-semibold text-[#334155]">Food category</span>
                      <select
                        value={createForm.pos_category}
                        onChange={(event) => setCreateForm((current) => ({ ...current, pos_category: event.target.value }))}
                        className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
                        disabled={creatingItem || postCreateSaving}
                      >
                        {foodCategoryOptions.map((option) => (
                          <option key={option.value} value={option.name}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[13px] font-semibold text-[#334155]">Stock quantity</span>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={createForm.current_stock}
                        onChange={(event) => setCreateForm((current) => ({ ...current, current_stock: event.target.value }))}
                        className="mt-2 h-11"
                        disabled={creatingItem || postCreateSaving}
                      />
                    </label>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={createForm.pos_always_available}
                      onClick={() => setCreateForm((current) => ({
                        ...current,
                        pos_always_available: !current.pos_always_available
                      }))}
                      disabled={creatingItem || postCreateSaving}
                      className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <span>
                        <span className="block text-[13px] font-semibold text-[#334155]">Always Available</span>
                        <span className="block text-[11px] text-[#64748B]">Allow POS sales at zero stock.</span>
                      </span>
                      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${createForm.pos_always_available ? 'bg-[#1A4E8D]' : 'bg-slate-300'}`}>
                        <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${createForm.pos_always_available ? 'translate-x-6' : 'translate-x-1'}`} />
                      </span>
                    </button>
                    <label className="block">
                      <span className="text-[13px] font-semibold text-[#334155]">Selling price</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.default_sale_price}
                        onChange={(event) => setCreateForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                        className="mt-2 h-11"
                        disabled={creatingItem || postCreateSaving}
                      />
                    </label>
                    <label className="block">
                      <span className="text-[13px] font-semibold text-[#334155]">Cost price</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={createForm.cost_per_unit}
                        onChange={(event) => setCreateForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                        className="mt-2 h-11"
                        disabled={creatingItem || postCreateSaving}
                      />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-[13px] font-semibold text-[#334155]">SKU (POS rule)</span>
                      <Input
                        value={createForm.sku_code}
                        className="mt-2 h-11 bg-slate-50 font-mono"
                        disabled
                        readOnly
                      />
                    </label>
                    <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 sm:col-span-2">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Barcode</p>
                      <p className="mt-1 text-sm font-semibold text-[#0F172A]">
                        POS will generate the barcode from the saved item ID when you click Save Item.
                      </p>
                    </div>
                    <label className="block sm:col-span-2">
                      <span className="text-[13px] font-semibold text-[#334155]">Description / notes</span>
                      <textarea
                        value={createForm.description}
                        onChange={(event) => setCreateForm((current) => ({ ...current, description: event.target.value }))}
                        className="mt-2 min-h-28 w-full rounded-lg border border-slate-200 px-3 py-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
                        disabled={creatingItem || postCreateSaving}
                        placeholder="Optional notes for the POS item record"
                      />
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeCreate} disabled={creatingItem || postCreateSaving} className="h-11 rounded-lg">
                  Cancel
                </Button>
                <Button type="button" onClick={handleCreateItem} disabled={creatingItem || postCreateSaving || locked} className="h-11 rounded-lg bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                  {creatingItem || postCreateSaving ? 'Saving...' : (pendingCreateRecovery?.itemId ? 'Resume Item Setup' : 'Save Item')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {activeEditItem && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-edit-modal-title"
          onClick={closeEdit}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="overflow-y-auto p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p id="pos-items-edit-modal-title" className="text-lg font-black text-[#0F172A]">Edit Item</p>
                  <p className="mt-1 text-sm text-[#64748B]">Update the shared POS item details and image used by POS and storefront.</p>
                </div>
                <button
                  type="button"
                  onClick={closeEdit}
                  disabled={savingItem || persistingEditAssets}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-[#334155] hover:bg-slate-50"
                >
                  Close
                </button>
              </div>
              <div className="mt-5 grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)]">
                <div className="space-y-3">
                  <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-slate-300 bg-slate-50">
                    {editImagePreviewUrl ? (
                      <img src={editImagePreviewUrl} alt="Selected preview" className="h-full w-full object-cover" />
                    ) : activeEditItem?.pos_image_url || activeEditItem?.storefront_image_url ? (
                      <img
                        src={activeEditItem?.pos_image_url || activeEditItem?.storefront_image_url}
                        alt={activeEditItem?.name || 'Item image'}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="px-6 text-center">
                        <ImagePlus className="mx-auto h-8 w-8 text-slate-300" />
                        <p className="mt-3 text-sm font-semibold text-[#334155]">Add item image</p>
                        <p className="mt-1 text-xs text-[#64748B]">The same image will update the POS and storefront record.</p>
                      </div>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="pos-item-edit-image" className="text-xs font-semibold uppercase tracking-wide text-[#64748B]">Item image</Label>
                    <Input
                      id="pos-item-edit-image"
                      type="file"
                      accept="image/*"
                      className="mt-2 h-11 cursor-pointer"
                      disabled={savingItem || persistingEditAssets}
                      onChange={(event) => setEditImageFile(event.target.files?.[0] || null)}
                    />
                  </div>
                </div>
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                    <span className="text-[13px] font-semibold text-[#334155]">Item Name</span>
                    <Input
                      value={editForm.name}
                      onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                      className="mt-2 h-11"
                      disabled={savingItem || persistingEditAssets}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[13px] font-semibold text-[#334155]">Food Category</span>
                    <select
                      value={editForm.pos_category}
                      onChange={(event) => setEditForm((current) => ({ ...current, pos_category: event.target.value }))}
                      className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
                      disabled={savingItem || persistingEditAssets}
                    >
                      {foodCategoryOptions.map((option) => (
                        <option key={option.value} value={option.name}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-semibold text-[#334155]">Stock Quantity</span>
                    <Input
                      type="number"
                      min="0"
                      step="1"
                      value={editForm.current_stock}
                      onChange={(event) => setEditForm((current) => ({ ...current, current_stock: event.target.value }))}
                      className="mt-2 h-11"
                      disabled={savingItem || persistingEditAssets}
                    />
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={editForm.pos_always_available}
                    onClick={() => setEditForm((current) => ({
                      ...current,
                      pos_always_available: !current.pos_always_available
                    }))}
                    disabled={savingItem || persistingEditAssets}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <span>
                      <span className="block text-[13px] font-semibold text-[#334155]">Always Available</span>
                      <span className="block text-[11px] text-[#64748B]">Allow POS sales at zero stock.</span>
                    </span>
                    <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${editForm.pos_always_available ? 'bg-[#1A4E8D]' : 'bg-slate-300'}`}>
                      <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform ${editForm.pos_always_available ? 'translate-x-6' : 'translate-x-1'}`} />
                    </span>
                  </button>
                  <label className="block">
                    <span className="text-[13px] font-semibold text-[#334155]">Price</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.default_sale_price}
                      onChange={(event) => setEditForm((current) => ({ ...current, default_sale_price: event.target.value }))}
                      className="mt-2 h-11"
                      disabled={savingItem || persistingEditAssets}
                    />
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-semibold text-[#334155]">Cost</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editForm.cost_per_unit}
                      onChange={(event) => setEditForm((current) => ({ ...current, cost_per_unit: event.target.value }))}
                      className="mt-2 h-11"
                      disabled={savingItem || persistingEditAssets}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className="text-[13px] font-semibold text-[#334155]">Description / Notes</span>
                    <textarea
                      value={editForm.description}
                      onChange={(event) => setEditForm((current) => ({ ...current, description: event.target.value }))}
                      className="mt-2 min-h-[104px] w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-[#0F172A] shadow-sm outline-none focus:border-[#2563EB]"
                      disabled={savingItem || persistingEditAssets}
                      placeholder="Optional notes visible in POS"
                    />
                  </label>
                </div>
              </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" onClick={closeEdit} disabled={savingItem || persistingEditAssets} className="h-11 rounded-lg">
                  Cancel
                </Button>
                <Button type="button" onClick={handleSave} disabled={savingItem || persistingEditAssets} className="h-11 rounded-lg bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                  {savingItem || persistingEditAssets ? 'Saving...' : 'Save Item'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {savedMessage.name && typeof document !== 'undefined' && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-saved-modal-title"
          onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
        >
          <div
            className="flex h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-2xl shadow-slate-950/25 sm:h-auto sm:max-h-[calc(100dvh-3rem)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p id="pos-items-saved-modal-title" className="text-lg font-black text-[#0F172A]">
                    Item {savedMessage.action === 'created' ? 'created' : 'saved'}
                  </p>
                  <p className="mt-1 text-sm text-[#64748B]">
                    <span className="font-bold text-[#0F172A]">{savedMessage.name}</span> was {savedMessage.action === 'created' ? 'created in IMS and added to POS.' : 'updated in POS and IMS.'}
                  </p>
                  {savedMessage.barcode ? (
                    <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[#64748B]">
                      Barcode: <span className="font-mono text-[#0F172A]">{savedMessage.barcode}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-5 flex justify-end">
                <Button
                  type="button"
                  onClick={() => setSavedMessage({ name: '', barcode: '', action: 'updated' })}
                  className="h-11 rounded-lg bg-[#1A4E8D] px-5 text-white hover:bg-[#143F73]"
                >
                  OK
                </Button>
              </div>
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

function SettingsWorkspace({
  terminalUser,
  terminalMeta,
  companyName = '',
  locationsState,
  operatingLocationId = null,
  queueLocationScopeId,
  setQueueLocationScopeId,
  incomingOrdersState,
  refreshIncomingOrders,
  locked,
  sectionId,
  initialTab = 'pos_setup',
  onRefreshTerminalUser = async () => {},
  onRefreshTerminalMeta = async () => {},
  onPosSetupSaved = async () => {},
  onStorefrontSetupSaved = async () => {}
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const lockedTerminalLocationId = useMemo(() => {
    const activeLocationId = toPositiveInt(operatingLocationId);
    if (activeLocationId) return activeLocationId;
    return locations.length === 1 ? toPositiveInt(locations[0]?.location_id) : null;
  }, [locations, operatingLocationId]);
  const lockedTerminalLocation = useMemo(
    () => locations.find((location) => Number(location.location_id) === Number(lockedTerminalLocationId)) || null,
    [locations, lockedTerminalLocationId]
  );
  const canManageCashiers = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('users:manage');
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
  const [cashierInvitationOpen, setCashierInvitationOpen] = useState(false);
  const [cashierAccessDialog, setCashierAccessDialog] = useState({
    open: false,
    cashier: null,
    locationIds: [],
    terminalId: '',
    newPassword: '',
    confirmPassword: '',
    loading: false,
    saving: false
  });
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
    settingsAccessPinEnabled: false,
    settingsAccessPin: '',
    clearSettingsAccessPin: false,
    discountProfiles: [],
    posReceiptMetadataPendingReview: null,
    pettyCashSymbol: 'PHP',
    pettyCashAmount: 0,
    activeDiscountCount: 0,
    posOpenStatus: true,
    posWaitTimeMinutes: 15,
    inventoryLowStockDisplayThreshold: 5
  });
  const [storefrontForm, setStorefrontForm] = useState({
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
    storefrontPromoTitle: '',
    storefrontPromoSubtitle: '',
    storefrontPromoBadge: '',
    storefrontPromoValidityText: '',
    storefrontPromoActive: false,
    storefrontFollowEnabled: false,
    storefrontShareEnabled: false
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
  const hasActivePrimaryStorefrontLocation = storefrontLocations.some((location) => location?.is_active === true && location?.is_primary_storefront === true);
  const storefrontLocationRequired = storefrontForm.storeIsVisible === true && storefrontForm.storeHasNoLocation !== true;
  const requestedCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMode);
  const effectiveCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessEffectiveMode || requestedCustomerAccessMode);
  const maxCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMaxMode || 'transaction', 'transaction');
  const platformMaxCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessPlatformMaxMode || 'transaction', 'transaction');
  const customerAccessRollbackActive = storefrontForm.customerAccessFlagStatus === 'rollback';
  const customerAccessLimitation = CUSTOMER_ACCESS_MODE_RANK[requestedCustomerAccessMode] > CUSTOMER_ACCESS_MODE_RANK[maxCustomerAccessMode]
    ? (storefrontForm.customerAccessLimitationReason || `Requested mode is currently capped at ${maxCustomerAccessMode}.`)
    : (storefrontForm.customerAccessLimitationReason || 'Requested mode is currently available.');
  const lockedTerminalChoices = useMemo(() => {
    const entries = Array.isArray(posForm.terminalRegistry) ? posForm.terminalRegistry : [];
    return entries
      .map((entry) => ({
        ...entry,
        terminal_id: sanitizeTerminalId(entry?.terminal_id),
        location_id: toPositiveInt(entry?.location_id)
      }))
      .filter((entry) => (
        entry.terminal_id
        && entry.is_active !== false
        && (!lockedTerminalLocationId || entry.location_id === lockedTerminalLocationId)
      ));
  }, [lockedTerminalLocationId, posForm.terminalRegistry]);
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
    { id: 'storefront', label: 'Storefront', icon: Store }
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
    }
  }, [canManageCashiers]);
  const openCashierAccessEditor = useCallback(async (cashier) => {
    const cashierId = toPositiveInt(cashier?.user_id);
    if (!cashierId) {
      toast.error('Cashier user ID is missing.');
      return;
    }
    const defaultTerminalId = lockedTerminalChoices[0]?.terminal_id || '';
    const fixedLocationIds = lockedTerminalLocationId ? [lockedTerminalLocationId] : [];
    setCashierAccessDialog({
      open: true,
      cashier,
      locationIds: fixedLocationIds,
      terminalId: defaultTerminalId,
      newPassword: '',
      confirmPassword: '',
      loading: true,
      saving: false
    });
    try {
      const grants = await getUserLocationGrants(cashierId, { include_inactive: true });
      setCashierAccessDialog((current) => ({
        ...current,
        locationIds: fixedLocationIds.length > 0
          ? fixedLocationIds
          : (Array.isArray(grants?.granted_location_ids)
            ? grants.granted_location_ids.map(toPositiveInt).filter(Boolean)
            : []),
        loading: false
      }));
    } catch (error) {
      setCashierAccessDialog((current) => ({ ...current, loading: false }));
      toast.error(error?.response?.data?.message || 'Failed to load cashier branch access.');
    }
  }, [lockedTerminalChoices, lockedTerminalLocationId]);
  const saveCashierAccessEditor = useCallback(async () => {
    const cashierId = toPositiveInt(cashierAccessDialog.cashier?.user_id);
    if (!cashierId) {
      toast.error('Cashier user ID is missing.');
      return;
    }
    const fixedLocationIds = lockedTerminalLocationId ? [lockedTerminalLocationId] : cashierAccessDialog.locationIds;
    const newPassword = String(cashierAccessDialog.newPassword || '');
    const confirmPassword = String(cashierAccessDialog.confirmPassword || '');
    if (newPassword || confirmPassword) {
      if (newPassword.length < 8) {
        toast.error('Cashier password must be at least 8 characters.');
        return;
      }
      if (newPassword !== confirmPassword) {
        toast.error('Cashier password confirmation does not match.');
        return;
      }
    }
    setCashierAccessDialog((current) => ({ ...current, saving: true }));
    try {
      await updateUserLocationGrants(cashierId, fixedLocationIds);
      if (newPassword) {
        await resetLocalCashierPassword(cashierId, newPassword);
      }
      toast.success(newPassword ? 'Cashier access and password updated.' : 'Cashier access updated.');
      setCashierAccessDialog({ open: false, cashier: null, locationIds: [], terminalId: '', newPassword: '', confirmPassword: '', loading: false, saving: false });
      await loadCashierAccounts({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update cashier access.');
      setCashierAccessDialog((current) => ({ ...current, saving: false }));
    }
  }, [
    cashierAccessDialog.cashier?.user_id,
    cashierAccessDialog.confirmPassword,
    cashierAccessDialog.locationIds,
    cashierAccessDialog.newPassword,
    loadCashierAccounts,
    lockedTerminalLocationId
  ]);
  const removeCashierFromLocation = useCallback(async (cashier, locationId) => {
    const cashierId = toPositiveInt(cashier?.user_id);
    const normalizedLocationId = toPositiveInt(locationId);
    if (!cashierId || !normalizedLocationId) {
      toast.error('Cashier or branch context is missing.');
      return;
    }
    const currentLocationIds = Array.isArray(cashier?.location_ids)
      ? cashier.location_ids.map(toPositiveInt).filter(Boolean)
      : [];
    const nextLocationIds = currentLocationIds.filter((entry) => entry !== normalizedLocationId);
    try {
      await updateUserLocationGrants(cashierId, nextLocationIds);
      toast.success('Cashier removed from this branch.');
      await loadCashierAccounts({ silent: true });
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to remove cashier from this branch.');
    }
  }, [loadCashierAccounts]);

  const hydrateSettingsWorkspace = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [settingsPayload, companyPayload] = await Promise.all([
        getAllSettings({ force: true }),
        terminalUser?.is_master_admin === true ? getCompanyInfo().catch(() => null) : Promise.resolve(null)
      ]);
      const storefrontSocialLinks = parseJsonObjectSetting(settingsPayload?.storefront_social_links?.value);
      const storefrontPromo = parseJsonObjectSetting(settingsPayload?.storefront_promo?.value);
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
        settingsAccessPinEnabled: settingsPayload?.pos_settings_access_pin_enabled?.value === true,
        settingsAccessPin: '',
        clearSettingsAccessPin: false,
        discountProfiles: normalizeDiscountProfiles(discountProfiles),
        posReceiptMetadataPendingReview: settingsPayload?.pos_receipt_metadata_pending_changes?.value?.status === 'pending_review'
          ? settingsPayload.pos_receipt_metadata_pending_changes.value
          : null,
        pettyCashSymbol: String(settingsPayload?.pos_petty_cash_symbol?.value || terminalMeta?.pettyCashSymbol || 'PHP'),
        pettyCashAmount: Number(settingsPayload?.pos_petty_cash_amount?.value ?? terminalMeta?.pettyCashAmount ?? 0) || 0,
        activeDiscountCount,
        posOpenStatus: settingsPayload?.pos_open_status?.value ?? true,
        posWaitTimeMinutes: Number(settingsPayload?.pos_wait_time_minutes?.value ?? 15) || 15,
        inventoryLowStockDisplayThreshold: Number(settingsPayload?.inventory_low_stock_display_threshold?.value ?? 5) || 5
      });
      setStorefrontForm({
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
        storefrontPromoTitle: String(storefrontPromo.title || ''),
        storefrontPromoSubtitle: String(storefrontPromo.subtitle || ''),
        storefrontPromoBadge: String(storefrontPromo.badge || ''),
        storefrontPromoValidityText: String(storefrontPromo.validity_text || ''),
        storefrontPromoActive: storefrontPromo.active === true,
        storefrontFollowEnabled: settingsPayload?.storefront_follow_enabled?.value === true,
        storefrontShareEnabled: settingsPayload?.storefront_share_enabled?.value === true
      });
      setStorefrontAssets({
        cover: String(settingsPayload?.storefront_cover_image_url?.value || ''),
        profile: String(settingsPayload?.storefront_profile_image_url?.value || '')
      });
    } catch (error) {
      setLoadError(error?.response?.data?.message || 'Failed to load shared settings.');
    } finally {
      setLoading(false);
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
          location_id: toPositiveInt(entry?.location_id) || lockedTerminalLocationId,
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      const existing = entries[index] || {
        terminal_id: createSuggestedTerminalId(entries),
        label: '',
        location_id: lockedTerminalLocationId,
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
  }, [lockedTerminalLocationId]);

  const addTerminalRegistryEntry = useCallback(() => {
    setPosForm((current) => {
      const entries = Array.isArray(current.terminalRegistry)
        ? current.terminalRegistry.map((entry) => ({
          terminal_id: sanitizeTerminalId(entry?.terminal_id),
          label: String(entry?.label || '').trim(),
          location_id: toPositiveInt(entry?.location_id) || lockedTerminalLocationId,
          is_active: entry?.is_active !== false,
          is_default: entry?.is_default === true,
          pairing_version: String(entry?.pairing_version || '').trim(),
          rotate_pairing: entry?.rotate_pairing === true
        }))
        : [];
      entries.push({
        terminal_id: createSuggestedTerminalId(entries),
        label: '',
        location_id: lockedTerminalLocationId,
        is_active: true,
        is_default: entries.length === 0,
        pairing_version: '',
        rotate_pairing: false
      });
      return { ...current, terminalRegistry: entries };
    });
  }, [lockedTerminalLocationId]);

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
        location_id: lockedTerminalLocationId || toPositiveInt(entry?.location_id),
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
  }, [lockedTerminalLocationId, posForm.terminalRegistry, posForm.terminalRegistryMode]);

  const persistTerminalRegistry = useCallback(async () => {
    const { posTerminalRegistry, normalizedRegistryState, posTerminalRegistryMode } = buildTerminalRegistryPayload();

    const updatedSettings = await updateSettings({
      pos_terminal_registry: posTerminalRegistry,
      pos_terminal_registry_mode: posTerminalRegistryMode,
      pos_terminal_location_binding_enforced: posForm.terminalLocationBindingEnforced === true,
      ...(terminalUser?.is_master_admin === true ? {
        pos_settings_access_pin: String(posForm.settingsAccessPin || '').trim(),
        clear_pos_settings_access_pin: posForm.clearSettingsAccessPin === true
      } : {})
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
      hydrateSettingsWorkspace(),
      onRefreshTerminalMeta?.(),
      onRefreshTerminalUser?.({ suppressGlobalErrors: true })
    ]);
    return savedRegistry;
  }, [
    buildTerminalRegistryPayload,
    hydrateSettingsWorkspace,
    onRefreshTerminalMeta,
    onRefreshTerminalUser,
    posForm.clearSettingsAccessPin,
    posForm.settingsAccessPin,
    posForm.terminalLocationBindingEnforced,
    terminalUser?.is_master_admin
  ]);

  const handleTerminalRegistrySave = useCallback(async () => {
    setSavingTab('terminal_registry');
    try {
      await persistTerminalRegistry();
      toast.success('Terminal registry and access PIN settings saved.');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save terminal registry.');
    } finally {
      setSavingTab('');
    }
  }, [persistTerminalRegistry]);

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
        pos_terminal_registry: posTerminalRegistry,
        pos_terminal_registry_mode: posTerminalRegistryMode,
        pos_terminal_location_binding_enforced: posForm.terminalLocationBindingEnforced === true,
        pos_settings_access_pin: String(posForm.settingsAccessPin || '').trim(),
        clear_pos_settings_access_pin: posForm.clearSettingsAccessPin === true,
        pos_petty_cash_symbol: String(posForm.pettyCashSymbol || 'PHP').trim() || 'PHP',
        pos_petty_cash_amount: Number(posForm.pettyCashAmount || 0),
        pos_open_status: posForm.posOpenStatus === true,
        pos_wait_time_minutes: Number(posForm.posWaitTimeMinutes || 0),
        inventory_low_stock_display_threshold: Number(posForm.inventoryLowStockDisplayThreshold || 5)
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
        storefront_promo: {
          title: String(storefrontForm.storefrontPromoTitle || '').trim(),
          subtitle: String(storefrontForm.storefrontPromoSubtitle || '').trim(),
          badge: String(storefrontForm.storefrontPromoBadge || '').trim(),
          validity_text: String(storefrontForm.storefrontPromoValidityText || '').trim(),
          active: storefrontForm.storefrontPromoActive === true
        },
        storefront_follow_enabled: storefrontForm.storefrontFollowEnabled === true,
        storefront_share_enabled: storefrontForm.storefrontShareEnabled === true
      });
      await hydrateSettingsWorkspace();
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
      supports_dine_in: location.supports_dine_in !== false
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
      supports_dine_in: locationForm.supports_dine_in !== false
    };
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
    <div className="grid gap-3">
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2563EB]">
            <UserRound className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-black text-[#0F172A]">Shared Account Profile</p>
            <p className="mt-1 text-[12px] leading-5 text-[#475569]">
              These values come from the same tenant account used by IMS and POS.
            </p>
          </div>
          {terminalUser?.is_master_admin === true && companyInfo?.company_token ? (
            <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-[#64748B]">Company Token</p>
              <p className="mt-1 break-all text-[12px] font-bold text-[#0F172A]">{companyInfo.company_token}</p>
            </div>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Username</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
              value={profileForm.username}
              onChange={(event) => setProfileForm((current) => ({ ...current, username: event.target.value }))}
              disabled={locked || loading}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Email</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
              value={profileForm.email}
              onChange={(event) => setProfileForm((current) => ({ ...current, email: event.target.value }))}
              disabled={locked || loading}
            />
          </div>
          <div className="grid gap-2 md:col-span-2">
            <Label className="text-[12px] font-black text-[#0F172A]">Phone Number</Label>
            <Input
              className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]"
              value={profileForm.phoneNumber}
              onChange={(event) => setProfileForm((current) => ({ ...current, phoneNumber: event.target.value }))}
              disabled={locked || loading}
            />
            <p className="text-[11px] text-slate-500">Phone number stays shared across the same tenant account used by IMS and POS.</p>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="button"
            className="h-10 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white hover:bg-[#143F73]"
            disabled={locked || loading || savingTab === 'profile'}
            onClick={handleProfileSave}
          >
            {savingTab === 'profile' ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </div>
      {terminalUser?.is_master_admin === true && companyInfo ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#64748B]">Company Name</p>
            <p className="mt-2 text-[15px] font-black text-[#0F172A]">{companyInfo.company_name || '-'}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#64748B]">Company Token</p>
            <p className="mt-2 break-all text-[13px] font-bold text-[#0F172A]">{companyInfo.company_token || '-'}</p>
          </div>
        </div>
      ) : null}
    </div>
  );

  const renderPosSetupPane = () => (
    <div className="grid gap-3">
      <div className="grid gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">Receipt & POS Metadata</p>
                <p className="mt-1 text-[12px] leading-5 text-[#475569]">Shared receipt identity, terminal policy, cashier defaults, and checkout presets used by both POS and IMS.</p>
              </div>
              <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:items-end">
                <Button type="button" className="h-10 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white hover:bg-[#143F73]" disabled={locked || loading || savingTab === 'pos_setup'} onClick={handlePosSave}>
                  {savingTab === 'pos_setup' ? 'Saving...' : 'Save POS Setup'}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Registered Name</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.registeredName} onChange={(event) => setPosForm((current) => ({ ...current, registeredName: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Business Name</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.businessName} onChange={(event) => setPosForm((current) => ({ ...current, businessName: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Business Style</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.businessStyle} onChange={(event) => setPosForm((current) => ({ ...current, businessStyle: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Taxpayer Type</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.taxpayerType} onChange={(event) => setPosForm((current) => ({ ...current, taxpayerType: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">TIN / Branch</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.tinBranch} onChange={(event) => setPosForm((current) => ({ ...current, tinBranch: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Business Address</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.businessAddress} onChange={(event) => setPosForm((current) => ({ ...current, businessAddress: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">PTU Number</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.ptuNumber} onChange={(event) => setPosForm((current) => ({ ...current, ptuNumber: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">MIN Number</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.minNumber} onChange={(event) => setPosForm((current) => ({ ...current, minNumber: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Accreditation Number</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.accreditationNumber} onChange={(event) => setPosForm((current) => ({ ...current, accreditationNumber: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Receipt Footer Message</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" value={posForm.receiptFooterMessage} onChange={(event) => setPosForm((current) => ({ ...current, receiptFooterMessage: event.target.value }))} disabled={locked || loading} />
              </div>
            </div>
            <label className="mt-4 flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
              <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={posForm.fiscalBuyerDetailsRequired === true} onChange={(event) => setPosForm((current) => ({ ...current, fiscalBuyerDetailsRequired: event.target.checked }))} disabled={locked || loading} />
              <div>
                <p className="text-[12px] font-black text-[#0F172A]">Require buyer fiscal details on fiscal invoices</p>
                <p className="text-[11px] text-[#64748B]">Matches the shared fiscal invoice requirement used across receipt rendering.</p>
              </div>
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <p className="text-[13px] font-black text-[#0F172A]">Cashier closeout defaults</p>
            <p className="mt-1 text-[12px] text-[#475569]">Used by shifts, queue operations, stock alerts, and daily reconciliation without changing receipt identity.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Queue Location Scope</Label>
                <select className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]" value={queueLocationScopeId || ''} onChange={(event) => setQueueLocationScopeId(event.target.value ? Number(event.target.value) : null)} disabled={locked}>
                  <option value="" disabled>Select queue location</option>
                  {locations.map((location) => (
                    <option key={`settings-location-${location.location_id}`} value={location.location_id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Petty Cash Currency Symbol</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" maxLength={12} value={posForm.pettyCashSymbol} onChange={(event) => setPosForm((current) => ({ ...current, pettyCashSymbol: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Petty Cash Amount</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" type="number" min="0" step="0.01" value={posForm.pettyCashAmount} onChange={(event) => setPosForm((current) => ({ ...current, pettyCashAmount: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Default Wait Time (minutes)</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" type="number" min="0" step="1" value={posForm.posWaitTimeMinutes} onChange={(event) => setPosForm((current) => ({ ...current, posWaitTimeMinutes: event.target.value }))} disabled={locked || loading} />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Low Stock Alert Threshold</Label>
                <Input className="h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A]" type="number" min="0" step="1" value={posForm.inventoryLowStockDisplayThreshold} onChange={(event) => setPosForm((current) => ({ ...current, inventoryLowStockDisplayThreshold: event.target.value }))} disabled={locked || loading} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={posForm.posOpenStatus === true} onChange={(event) => setPosForm((current) => ({ ...current, posOpenStatus: event.target.checked }))} disabled={locked || loading} />
                <div>
                  <p className="text-[12px] font-black text-[#0F172A]">POS visible to customers</p>
                  <p className="text-[11px] text-[#64748B]">Shared tenant POS availability flag used across surfaces.</p>
                </div>
              </label>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                <p className="text-[12px] font-black text-[#0F172A]">Live Queue</p>
                <p className="mt-1 text-[11px] text-[#64748B]">Current online queue items waiting on the terminal.</p>
                <p className="mt-2 text-[16px] font-black text-[#0F172A]">{incomingOrders.length}</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[13px] font-black text-[#0F172A]">Terminal Registry</p>
                <p className="mt-1 text-[12px] text-[#475569]">Managed POS counters available for authenticated cashier shifts. A store location may have multiple active terminals.</p>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                <Button
                  type="button"
                  className="h-9 rounded-lg bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white hover:bg-[#143F73]"
                  onClick={handleTerminalRegistrySave}
                  disabled={locked || loading || savingTab === 'terminal_registry'}
                >
                  {savingTab === 'terminal_registry' ? 'Saving...' : 'Save'}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addTerminalRegistryEntry} disabled={locked || loading}>
                  <Plus className="mr-1 h-4 w-4" />
                  Add Terminal
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 md:grid-cols-[minmax(0,220px)_1fr]">
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Terminal Registry Mode</Label>
                <select className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-semibold text-[#0F172A] outline-none focus:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]" value={posForm.terminalRegistryMode || 'warn'} onChange={(event) => setPosForm((current) => ({ ...current, terminalRegistryMode: event.target.value }))} disabled={locked || loading}>
                  <option value="warn">Warn (allow manual IDs)</option>
                  <option value="enforce">Enforce (registry only)</option>
                </select>
              </div>
              <label className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3">
                <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={posForm.terminalLocationBindingEnforced === true} onChange={(event) => setPosForm((current) => ({ ...current, terminalLocationBindingEnforced: event.target.checked }))} disabled={locked || loading} />
                <div>
                  <p className="text-[12px] font-black text-[#0F172A]">Strict Shift Location Binding</p>
                  <p className="text-[11px] text-[#64748B]">When enabled, shift open, checkout, and switch require location-bound terminal policy readiness.</p>
                </div>
              </label>
            </div>
            {terminalUser?.is_master_admin === true ? (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,280px)_auto] md:items-start">
                  <div className="grid gap-1.5">
                    <Label className="text-[12px] font-black text-[#0F172A]">Settings Access PIN</Label>
                    <Input
                      type="password"
                      inputMode="numeric"
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
                              Locked Branch / Location
                            </Label>
                            <div className="flex min-h-11 items-center rounded-xl border border-blue-100 bg-blue-50 px-3.5 text-[14px] font-semibold text-[#0F172A]">
                              {lockedTerminalLocation?.name || companyName || 'Current branch'}
                            </div>
                            <p className="text-[11px] text-[#64748B]">
                              Terminal location is locked here. Manage additional branches from business location setup.
                            </p>
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
                            <div key={cashier.user_id} className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-black text-emerald-900">{cashier.username || cashier.email}</p>
                                  <p className="mt-0.5 truncate text-[10px] font-semibold text-emerald-700">{cashier.email}</p>
                                </div>
                                <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-extrabold text-emerald-700">
                                  Cashier
                                </span>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2">
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-lg border-emerald-200 bg-white px-2 text-[11px] font-extrabold text-emerald-800 hover:bg-emerald-100"
                                  onClick={() => openCashierAccessEditor(cashier)}
                                  disabled={locked || loading}
                                >
                                  <Pencil className="mr-1 h-3 w-3" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  className="h-8 rounded-lg border-rose-200 bg-white px-2 text-[11px] font-extrabold text-rose-600 hover:bg-rose-50"
                                  onClick={() => removeCashierFromLocation(cashier, terminal.location_id)}
                                  disabled={locked || loading}
                                >
                                  <Trash2 className="mr-1 h-3 w-3" />
                                  Remove
                                </Button>
                              </div>
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
            </div>
          </div>
      </div>
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
        <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-[12px] font-black text-[#0F172A]">Customer Access Mode</Label>
              <select
                className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm text-[#0F172A] bg-white"
                value={requestedCustomerAccessMode}
                onChange={(event) => setStorefrontForm((current) => ({ ...current, customerAccessMode: normalizeCustomerAccessMode(event.target.value) }))}
                disabled={locked || loading}
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
              <p className="text-[11px] text-[#64748B]">
                Effective mode: <span className="font-bold text-[#0F172A]">{effectiveCustomerAccessMode}</span>. Max allowed now: <span className="font-bold text-[#0F172A]">{maxCustomerAccessMode}</span>.
              </p>
              <p className="text-[11px] text-[#64748B]">
                Platform max: <span className="font-bold text-[#0F172A]">{platformMaxCustomerAccessMode}</span>. Registration stage: <span className="font-bold text-[#0F172A]">{storefrontForm.customerAccessRegistrationStage}</span>.
              </p>
              <p className="text-[11px] text-[#64748B]">{customerAccessLimitation}</p>
            </div>
            <div className={`rounded-lg border p-3 text-[12px] ${customerAccessRollbackActive ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
              <div className="flex items-center gap-2 font-bold">
                {customerAccessRollbackActive ? <AlertTriangle className="h-4 w-4" aria-hidden="true" /> : <CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
                <span>{customerAccessRollbackActive ? 'Customer access runtime is in rollback mode.' : 'Customer access runtime is enabled.'}</span>
              </div>
              <p className="mt-2">
                Choose <span className="font-bold">Transaction</span> here if this storefront should accept online checkout. Store hours only control open/closed status, not checkout permission.
              </p>
            </div>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {CUSTOMER_ACCESS_MODE_OPTIONS.map((option) => (
              <div key={option.value} className="rounded-lg border border-slate-200 p-3">
                <p className="text-[12px] font-black text-[#0F172A]">{option.label}</p>
                <p className="mt-1 text-[11px] text-[#64748B]">{option.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <p className="text-[13px] font-black text-[#0F172A]">Storefront Media</p>
        <p className="mt-1 text-[12px] text-[#475569]">Shared cover photo and profile icon for discovery cards and storefront header.</p>
        <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="relative h-32 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 md:h-40">
            {storefrontAssets.cover ? (
              <img src={resolveAssetUrl(storefrontAssets.cover)} alt="Storefront cover preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-xs font-medium text-slate-500">No cover photo uploaded</div>
            )}
            <div className="absolute -bottom-8 left-4 h-16 w-16 overflow-hidden rounded-full border-4 border-white bg-slate-100 shadow md:h-20 md:w-20">
              {storefrontAssets.profile ? (
                <img src={resolveAssetUrl(storefrontAssets.profile)} alt="Storefront profile preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-slate-500 md:text-xs">No icon</div>
              )}
            </div>
          </div>
          <div className="grid gap-3 pt-8 md:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Cover photo</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input type="file" accept="image/*" disabled={locked || assetUploadingType === 'cover' || assetDeletingType === 'cover'} onChange={(event) => { const file = event.target.files?.[0] || null; handleUploadAsset('cover', file); event.target.value = ''; }} />
                <Button type="button" variant="outline" disabled={locked || !storefrontAssets.cover || assetUploadingType === 'cover' || assetDeletingType === 'cover'} onClick={() => handleDeleteAsset('cover')}>Remove</Button>
              </div>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-sm font-semibold text-slate-900">Profile icon</p>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                <Input type="file" accept="image/*" disabled={locked || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onChange={(event) => { const file = event.target.files?.[0] || null; handleUploadAsset('profile', file); event.target.value = ''; }} />
                <Button type="button" variant="outline" disabled={locked || !storefrontAssets.profile || assetUploadingType === 'profile' || assetDeletingType === 'profile'} onClick={() => handleDeleteAsset('profile')}>Remove</Button>
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
              <div key={`sf-gallery-${index}`} className="grid gap-2 rounded-lg border border-slate-200 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_120px_auto]">
                <Input value={row.path || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'path', event.target.value)} placeholder="storefront-assets/tenant/gallery-1.jpg" />
                <Input value={row.url || ''} onChange={(event) => handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'url', event.target.value)} placeholder="https://cdn.example.com/gallery-1.jpg" />
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
            <div className="grid gap-3 md:grid-cols-2">
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
          <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-center justify-between">
              <Label>Promo Card</Label>
              <input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={storefrontForm.storefrontPromoActive === true} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPromoActive: event.target.checked }))} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={storefrontForm.storefrontPromoTitle} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPromoTitle: event.target.value }))} placeholder="10% OFF" />
              <Input value={storefrontForm.storefrontPromoBadge} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPromoBadge: event.target.value }))} placeholder="Today's Promo" />
              <Input value={storefrontForm.storefrontPromoSubtitle} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPromoSubtitle: event.target.value }))} placeholder="All BBQ items, min order ₱100" className="md:col-span-2" />
              <Input value={storefrontForm.storefrontPromoValidityText} onChange={(event) => setStorefrontForm((current) => ({ ...current, storefrontPromoValidityText: event.target.value }))} placeholder="Valid today only" className="md:col-span-2" />
            </div>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="button" className="h-10 rounded-lg bg-[#1A4E8D] px-5 text-[13px] font-extrabold text-white hover:bg-[#143F73]" disabled={locked || loading || savingTab === 'storefront'} onClick={handleStorefrontSave}>
            {savingTab === 'storefront' ? 'Saving...' : 'Save Storefront'}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] font-black text-[#0F172A]">Storefront Locations{storefrontLocationRequired ? <RequiredMark /> : null}</p>
          <Button type="button" variant="outline" onClick={() => loadStorefrontLocations()} disabled={locationsLoading || locationSaving}>
            {locationsLoading ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>
        <p className="mt-1 text-[12px] text-[#475569]">
          {storefrontLocationRequired
            ? 'A public storefront with map publication needs one active primary storefront location before Storefront settings can be saved.'
            : 'Add and manage storefront map pins here. These locations stay optional while searchable-without-map-pin is enabled.'}
        </p>
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-900">{editingLocationId ? 'Edit Location' : 'Add Location'}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Location Name<RequiredMark /></Label>
                <Input value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} placeholder="Main Branch" />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Address<RequiredMark /></Label>
                <Input value={locationForm.address_line} onChange={(event) => setLocationForm((current) => ({ ...current, address_line: event.target.value }))} placeholder="Street, City, Province" />
              </div>
              <div className="grid gap-2 md:col-span-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Map Pin (MapLibre)<RequiredMark /></Label>
                <Suspense fallback={<div className="rounded-lg border border-slate-200 bg-white px-3 py-6 text-sm text-slate-500">Loading map picker...</div>}>
                  <MapPinPicker
                    latitude={locationForm.latitude}
                    longitude={locationForm.longitude}
                    deliveryRadiusKm={locationForm.delivery_radius_km}
                    onChange={handleLocationPinChange}
                  />
                </Suspense>
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Latitude<RequiredMark /></Label>
                <Input value={locationForm.latitude} onChange={(event) => setLocationForm((current) => ({ ...current, latitude: event.target.value }))} placeholder="Latitude" />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Longitude<RequiredMark /></Label>
                <Input value={locationForm.longitude} onChange={(event) => setLocationForm((current) => ({ ...current, longitude: event.target.value }))} placeholder="Longitude" />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Delivery Radius (km)</Label>
                <Input value={locationForm.delivery_radius_km} onChange={(event) => setLocationForm((current) => ({ ...current, delivery_radius_km: event.target.value }))} placeholder="Delivery radius (km)" />
              </div>
              <div className="grid gap-2">
                <Label className="text-[12px] font-black text-[#0F172A]">Wait Time (min)</Label>
                <Input value={locationForm.current_wait_time_minutes} onChange={(event) => setLocationForm((current) => ({ ...current, current_wait_time_minutes: event.target.value }))} placeholder="Wait time (min)" />
              </div>
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-3">
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={locationForm.is_open === true} onChange={(event) => setLocationForm((current) => ({ ...current, is_open: event.target.checked }))} />Open</label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={locationForm.is_primary_storefront === true} onChange={(event) => setLocationForm((current) => ({ ...current, is_primary_storefront: event.target.checked }))} />Primary</label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-700"><input type="checkbox" className="h-4 w-4 accent-[#1A4E8D]" checked={locationForm.allow_out_of_stock_sales === true} onChange={(event) => setLocationForm((current) => ({ ...current, allow_out_of_stock_sales: event.target.checked }))} />Allow OOS Sales</label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" onClick={handleSaveLocation} disabled={locationSaving}>{locationSaving ? 'Saving...' : (editingLocationId ? 'Update Location' : 'Add Location')}</Button>
              <Button type="button" variant="outline" onClick={resetLocationForm} disabled={locationSaving}>Clear</Button>
            </div>
          </div>
          <div className="space-y-3">
            {storefrontLocations.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">No storefront locations configured.</div>
            ) : storefrontLocations.map((location) => (
              <div key={`pos-storefront-location-${location.location_id}`} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{location.name}</p>
                    <p className="text-xs text-slate-500">{location.address_line}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${location.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{location.is_active ? 'Active' : 'Inactive'}</span>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${location.is_open ? 'bg-teal-100 text-teal-700' : 'bg-amber-100 text-amber-700'}`}>{location.is_open ? 'Open' : 'Closed'}</span>
                    {location.is_primary_storefront === true ? <span className="rounded-full bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">Primary</span> : null}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600 md:grid-cols-4">
                  <p>Lat: {location.latitude}</p>
                  <p>Lng: {location.longitude}</p>
                  <p>Radius: {location.delivery_radius_km} km</p>
                  <p>Wait: {location.current_wait_time_minutes} min</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => handleEditLocation(location)}>Edit</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => handleSetPrimaryLocation(location)} disabled={locationSaving || location.is_active !== true || location.is_primary_storefront === true}>{location.is_primary_storefront === true ? 'Primary' : 'Set Primary'}</Button>
                  {location.is_active ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => handleDeactivateLocation(location.location_id)} disabled={locationSaving}>Deactivate</Button>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleReactivateLocation(location.location_id)} disabled={locationSaving}>Reactivate</Button>
                      <Button type="button" size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50" onClick={() => handleDeleteLocation(location.location_id)} disabled={locationSaving}>Delete Pin</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
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
    return renderPosSetupPane();
  };

  return (
    <div id={sectionId} className="space-y-3">
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-200/70">
        <div className="hidden gap-2 sm:grid md:grid-cols-3">
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

        <div className="flex items-center gap-2 sm:hidden">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={`mobile-${tab.id}`}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`flex min-h-14 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-xs font-extrabold transition ${
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
      />
      <Dialog
        open={cashierAccessDialog.open}
        onOpenChange={(open) => {
          if (!open) {
            setCashierAccessDialog({ open: false, cashier: null, locationIds: [], terminalId: '', newPassword: '', confirmPassword: '', loading: false, saving: false });
          }
        }}
      >
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Cashier</DialogTitle>
            <DialogDescription>
              Update this cashier for the locked branch and optional POS password reset.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[12px] font-black text-[#0F172A]">
                {cashierAccessDialog.cashier?.username || cashierAccessDialog.cashier?.email || 'Cashier'}
              </p>
              <p className="mt-0.5 text-[11px] font-semibold text-[#64748B]">
                {cashierAccessDialog.cashier?.email || 'No email available'}
              </p>
            </div>
            {cashierAccessDialog.loading ? (
              <p className="rounded-xl border border-slate-200 px-3 py-3 text-[12px] text-[#64748B]">
                Loading cashier access...
              </p>
            ) : (
              <div className="grid gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <Label className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Default Branch / Location</Label>
                  <p className="mt-1 text-[13px] font-black text-[#0F172A]">
                    {lockedTerminalLocation?.name || companyName || 'Current branch'}
                  </p>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Terminal</Label>
                  <select
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-[#0F172A]"
                    value={cashierAccessDialog.terminalId || lockedTerminalChoices[0]?.terminal_id || ''}
                    onChange={(event) => setCashierAccessDialog((current) => ({ ...current, terminalId: sanitizeTerminalId(event.target.value) }))}
                    disabled={cashierAccessDialog.saving || lockedTerminalChoices.length === 0}
                  >
                    {lockedTerminalChoices.length > 0 ? (
                      lockedTerminalChoices.map((terminal) => (
                        <option key={`cashier-terminal-choice-${terminal.terminal_id}`} value={terminal.terminal_id}>
                          {terminal.label ? `${terminal.label} (${terminal.terminal_id})` : terminal.terminal_id}
                        </option>
                      ))
                    ) : (
                      <option value="">No active terminal in this branch</option>
                    )}
                  </select>
                </div>
                <div className="grid gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3">
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">New POS Password</Label>
                    <Input
                      type="password"
                      value={cashierAccessDialog.newPassword || ''}
                      onChange={(event) => setCashierAccessDialog((current) => ({ ...current, newPassword: event.target.value }))}
                      placeholder="Leave blank to keep current password"
                      disabled={cashierAccessDialog.saving}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748B]">Confirm POS Password</Label>
                    <Input
                      type="password"
                      value={cashierAccessDialog.confirmPassword || ''}
                      onChange={(event) => setCashierAccessDialog((current) => ({ ...current, confirmPassword: event.target.value }))}
                      placeholder="Confirm only when changing password"
                      disabled={cashierAccessDialog.saving}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setCashierAccessDialog({ open: false, cashier: null, locationIds: [], terminalId: '', newPassword: '', confirmPassword: '', loading: false, saving: false })}
              disabled={cashierAccessDialog.saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-[#1A4E8D] text-white hover:bg-[#143F73]"
              onClick={saveCashierAccessEditor}
              disabled={cashierAccessDialog.loading || cashierAccessDialog.saving}
            >
              {cashierAccessDialog.saving ? 'Saving...' : 'Save Cashier'}
            </Button>
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
  companyName = '',
  shiftState,
  todayDashboard,
  reportRefreshKey = 0,
  activeTerminalId = '',
  canViewPos,
  canCreateItems = false,
  canEditItems = false,
  canDeleteItems = false,
  itemsStockFilterPreset = '',
  onItemsStockFilterPresetApplied = () => {},
  canTransactPos,
  canAdminBypassShiftPrompt = false,
  canSwitchPosLocation = false,
  canAdjustCashDrawer,
  canCloseDay,
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
  refreshOperationalContext,
  locationsState = { loading: false, locations: [] },
  operatingLocationId = null,
  setOperatingLocationId = () => {},
  queueLocationScopeId = null,
  setQueueLocationScopeId = () => {},
  incomingOrdersState = { loading: false, orders: [] },
  incomingOrderActionState = {},
  handleIncomingOrderStatusChange = () => {},
  handleOpenIncomingOrderReceipt = () => {},
  incomingReceiptOpeningId = null,
  handleOpenIncomingOrderHistory = () => {},
  incomingHistoryOpeningId = null,
  refreshIncomingOrders = () => {},
  queuedTerminalOperations = [],
  queueStatusFilter = 'all',
  setQueueStatusFilter = () => {},
  queueSummary = {},
  replayingQueuedTerminalOperations = false,
  handleReplayQueuedTerminalOperations = () => {},
  handleRetryQueuedOperation = () => {},
  handleResolveQueuedOperation = () => {},
  isOnline = true,
  sectionIds = {}
}) {
  const restrictedMsmeModes = new Set(['incoming_queue', 'location_scope', 'settings_profile', 'settings_pos', 'settings_storefront', 'cash_drawer', 'reports', 'terminal_setup']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;
  const isIncomingQueueView = effectiveViewMode === 'incoming_queue';

  const content = useMemo(() => {
    switch (effectiveViewMode) {
    case 'incoming_queue':
      return (
        <IncomingQueueWorkspace
          canViewPos={canViewPos}
          canTransactPos={canTransactPos}
          shiftState={shiftState}
          incomingOrdersState={incomingOrdersState}
          incomingOrderActionState={incomingOrderActionState}
          handleIncomingOrderStatusChange={handleIncomingOrderStatusChange}
          handleOpenIncomingOrderReceipt={handleOpenIncomingOrderReceipt}
          incomingReceiptOpeningId={incomingReceiptOpeningId}
          handleOpenIncomingOrderHistory={handleOpenIncomingOrderHistory}
          incomingHistoryOpeningId={incomingHistoryOpeningId}
          refreshIncomingOrders={refreshIncomingOrders}
          locationsState={locationsState}
          queueLocationScopeId={queueLocationScopeId}
          locked={locked}
          sectionId={sectionIds.incomingOrders}
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
          companyName={companyName}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          queueLocationScopeId={queueLocationScopeId}
          setQueueLocationScopeId={setQueueLocationScopeId}
          incomingOrdersState={incomingOrdersState}
          refreshIncomingOrders={refreshIncomingOrders}
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
        />
      );
    case 'shift_controls':
    case 'close_shift':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          setOperatingLocationId={setOperatingLocationId}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          handleOpenShift={handleOpenShift}
          shiftActionLoading={shiftActionLoading}
          canTransactPos={canTransactPos}
          canCloseDay={canCloseDay}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          locked={locked}
          refreshOperationalContext={refreshOperationalContext}
          canAdjustCashDrawer={canAdjustCashDrawer}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          handleRecordCashEvent={handleRecordCashEvent}
          sectionId={sectionIds.activeShift}
          initialTab={viewMode === 'close_shift' ? 'close_shift' : 'shift_location'}
          companyName={companyName}
          activeTerminalId={activeTerminalId}
          terminalUser={terminalUser}
        />
      );
    case 'cash_drawer':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          locationsState={locationsState}
          operatingLocationId={operatingLocationId}
          setOperatingLocationId={setOperatingLocationId}
          canSwitchPosLocation={canSwitchPosLocation}
          handleSwitchShiftLocation={handleSwitchShiftLocation}
          openShiftForm={openShiftForm}
          setOpenShiftForm={setOpenShiftForm}
          handleOpenShift={handleOpenShift}
          shiftActionLoading={shiftActionLoading}
          canTransactPos={canTransactPos}
          canCloseDay={canCloseDay}
          canAdminBypassShiftPrompt={canAdminBypassShiftPrompt}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          locked={locked}
          refreshOperationalContext={refreshOperationalContext}
          canAdjustCashDrawer={canAdjustCashDrawer}
          cashEventForm={cashEventForm}
          setCashEventForm={setCashEventForm}
          handleRecordCashEvent={handleRecordCashEvent}
          sectionId={sectionIds.activeShift}
          initialTab="cash_drawer"
          companyName={companyName}
          activeTerminalId={activeTerminalId}
          terminalUser={terminalUser}
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
          sectionId={sectionIds.reports}
        />
      );
    case 'items':
      return (
        <ItemsWorkspace
          canViewPos={canViewPos}
          canCreateItems={canCreateItems}
          canEditItems={canEditItems}
          canDeleteItems={canDeleteItems}
          stockFilterPreset={itemsStockFilterPreset}
          onStockFilterPresetApplied={onItemsStockFilterPresetApplied}
          workflowMode={workflowMode}
          locked={locked}
          operatingLocationId={operatingLocationId}
          sectionId={sectionIds.items}
        />
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
    canCloseDay,
    canCreateItems,
    canDeleteItems,
    canEditItems,
    itemsStockFilterPreset,
    workflowMode,
    canSwitchPosLocation,
    canTransactPos,
    canViewPos,
    cashEventForm,
    closeShiftForm,
    handleCloseShift,
    handleIncomingOrderStatusChange,
    handleOpenIncomingOrderReceipt,
    incomingReceiptOpeningId,
    handleOpenIncomingOrderHistory,
    incomingHistoryOpeningId,
    handleOpenShift,
    handleSwitchShiftLocation,
    handleRecordCashEvent,
    incomingOrderActionState,
    incomingOrdersState,
    isOnline,
    locationsState,
    locked,
    queuedTerminalOperations,
    queueStatusFilter,
    queueSummary,
    replayingQueuedTerminalOperations,
    handleReplayQueuedTerminalOperations,
    handleRetryQueuedOperation,
    handleResolveQueuedOperation,
    onItemsStockFilterPresetApplied,
    onPosSetupSaved,
    onStorefrontSetupSaved,
    setQueueStatusFilter,
    operatingLocationId,
    openShiftForm,
    queueLocationScopeId,
    refreshIncomingOrders,
    refreshOperationalContext,
    reportRefreshKey,
    sectionIds.activeShift,
    sectionIds.cashDrawer,
    sectionIds.closeShift,
    sectionIds.incomingOrders,
    sectionIds.items,
    sectionIds.locationScope,
    sectionIds.reports,
    sectionIds.salesToday,
    sectionIds.terminalSetup,
    activeTerminalId,
    refreshTerminalMeta,
    refreshTerminalUser,
    setOperatingLocationId,
    setQueueLocationScopeId,
    setCashEventForm,
    setCloseShiftForm,
    setOpenShiftForm,
    shiftActionLoading,
    shiftState,
    terminalMeta,
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
      {content}
      {locked && !isIncomingQueueView && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Terminal is locked. Unlock to run protected operational actions.
        </div>
      )}
    </WorkspaceShell>
  );
}
