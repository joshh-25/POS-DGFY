import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, KeyRound, Save, Settings2, Store, Truck, Undo2, UserRound, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import {
  deleteStorefrontAsset,
  generateStorefrontSlug,
  getCompanyInfo,
  getAllSettings,
  updateSettingByKey,
  updateSettings,
  uploadStorefrontAsset
} from '@/services/settingsService.js';
import {
  getAllUsers,
  removeUserFromCompany,
  updatePosApprovalPin,
  updatePosDayClosePin,
  updateProfile,
  updateUserPermissions
} from '@/services/userService.js';
import * as tenantLocationService from '@/services/tenantLocationService.js';
import { normalizeTerminalCashierIds, normalizeTerminalRegistry } from '@/src/features/pos/utils/terminalIdentity.js';
import {
  normalizeStorefrontBusinessHours,
  serializeStorefrontBusinessHours
} from '@/src/features/settings/storefrontBusinessHours.js';
import { evaluateFulfillmentLeadTime } from '@/src/features/settings/fulfillmentLeadTime.js';
import { normalizeCoverPhotoTransform } from '@sieitzz/shared-constants/coverPhotoTransform';
import UserInvitationModal from '@/components/users/UserInvitationModal.jsx';
import { fetchPosSetupCashiers } from '../services/posService.js';
import DownpaymentSettingsPanel from '../components/DownpaymentSettingsPanel.jsx';
import PosDeliveryPricingSettingsCard from '../components/PosDeliveryPricingSettingsCard.jsx';
import PosEmployeesSettingsPane from './PosEmployeesSettingsPane.jsx';
import PosProfileSettingsPane from './PosProfileSettingsPane.jsx';
import PosSettingsTabNavigation from './PosSettingsTabNavigation.jsx';
import usePosSetupSettingsController from './usePosSetupSettingsController.js';
import useStorefrontSettingsController from './useStorefrontSettingsController.js';
import PosSetupSettingsPane from './PosSetupSettingsPane.jsx';
import PosStorefrontSettingsPane, { StorefrontContentSaveBar } from './PosStorefrontSettingsPane.jsx';
import { mapCustomerAccessRuntimeSettings, normalizeCustomerAccessMode, CUSTOMER_ACCESS_MODE_RANK, STOREFRONT_LOCATION_LABELS } from './storefrontSettingsConstants.js';
import { sanitizeDiscountProfile, toPositiveInt } from './posSettingsModels.js';
import {
  cloneStorefrontContentBaseline,
  getStorefrontContentSnapshot,
  mergeStorefrontContentBaseline,
  selectStorefrontContentFields
} from './storefrontContentSnapshot.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';


const SETTINGS_FIELD_LABELS = {
  name: STOREFRONT_LOCATION_LABELS.branchName,
  address_line: STOREFRONT_LOCATION_LABELS.address,
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
  'storefront_locations.primary_location': 'Primary location'
};
const STORE_CONTENT_NAV_CONFIRM_OVERLAY_CLASS = 'bg-black/30 backdrop-blur-none';

const getPosFormSnapshot = (form = {}) => ({
  registeredName: String(form.registeredName || '').trim(),
  businessName: String(form.businessName || '').trim(),
  businessStyle: String(form.businessStyle || '').trim(),
  taxpayerType: String(form.taxpayerType || '').trim(),
  tinBranch: String(form.tinBranch || '').trim(),
  businessAddress: String(form.businessAddress || '').trim(),
  ptuNumber: String(form.ptuNumber || '').trim(),
  minNumber: String(form.minNumber || '').trim(),
  accreditationNumber: String(form.accreditationNumber || '').trim(),
  fiscalBuyerDetailsRequired: form.fiscalBuyerDetailsRequired === true,
  receiptFooterMessage: String(form.receiptFooterMessage || '').trim(),
  terminalRegistry: normalizeTerminalRegistry(form.terminalRegistry).map((entry) => ({
    terminal_id: entry.terminal_id,
    label: entry.label,
    location_id: entry.location_id,
    is_active: entry.is_active !== false,
    is_default: entry.is_default === true,
    pairing_version: entry.pairing_version,
    ...(Array.isArray(entry?.cashier_user_ids)
      ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
      : {})
  })),
  terminalRegistryMode: String(form.terminalRegistryMode || 'warn').trim().toLowerCase(),
  terminalLocationBindingEnforced: form.terminalLocationBindingEnforced === true,
  voucherPosRedemptionEnabled: form.voucherPosRedemptionEnabled === true,
  settingsAccessPinEnabled: form.settingsAccessPinEnabled === true,
  discountProfiles: (Array.isArray(form.discountProfiles) ? form.discountProfiles : []).map(sanitizeDiscountProfile),
  employeeDiscountSelfApprovalEnabled: form.employeeDiscountSelfApprovalEnabled === true,
  pettyCashSymbol: String(form.pettyCashSymbol || 'PHP').trim() || 'PHP',
  pettyCashAmount: Number(form.pettyCashAmount || 0),
  posOpenStatus: form.posOpenStatus === true,
  posWaitTimeMinutes: Number(form.posWaitTimeMinutes || 0),
  inventoryLowStockDisplayThreshold: Number(form.inventoryLowStockDisplayThreshold || 5),
  bestSellerAutoTaggingEnabled: form.bestSellerAutoTaggingEnabled === true,
  dailyTopBestSellerEnabled: form.dailyTopBestSellerEnabled === true
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
      const label = String(entry.label || '').trim().slice(0, 60);
      const url = String(entry.url || '').trim().slice(0, 255);
      if (!label && !url) return null;
      return {
        partner,
        label,
        url
      };
    })
    .filter(Boolean)
    .slice(0, 8);
  return normalized;
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

export default function PosSettingsWorkspace({
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
  onStorefrontContentStateChange = () => {},
  onDeliveryPersonnelChanged = () => {},
  onNavigateToOrders = () => {},
  workspacePaneRef = null
  // #732: canManageVouchers used to gate the Vouchers/Pricelists panes rendered inside this
  // tab strip -- both moved to their own top-level view modes, this prop is no longer consumed
  // here.
}) {
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const incomingOrders = Array.isArray(incomingOrdersState?.orders) ? incomingOrdersState.orders : [];
  const canManageCashiers = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('users:manage');
  const canRemoveCashiers = terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('users:delete');
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
  const [storefrontSubtab, setStorefrontSubtab] = useState('setup');
  const [storefrontSelectedLocationId, setStorefrontSelectedLocationId] = useState(null);
  const [paneInlineStyle, setPaneInlineStyle] = useState({
    opacity: 1,
    transition: 'transform 150ms ease, opacity 150ms ease'
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [savingTab, setSavingTab] = useState('');
  const [storefrontBooleanState, setStorefrontBooleanState] = useState({});
  const [posFormBaseline, setPosFormBaseline] = useState(null);
  const [storefrontContentBaseline, setStorefrontContentBaseline] = useState(null);
  const [posSetupDiscarding, setPosSetupDiscarding] = useState(false);
  const [pendingTopLevelTab, setPendingTopLevelTab] = useState(null);
  const [pendingStorefrontNavigation, setPendingStorefrontNavigation] = useState(null);
  const [companyInfo, setCompanyInfo] = useState(null);
  const [cashierUsers, setCashierUsers] = useState([]);
  const [cashiersLoading, setCashiersLoading] = useState(false);
  const [cashiersLoaded, setCashiersLoaded] = useState(false);
  const [cashierVoidAccessSavingUserId, setCashierVoidAccessSavingUserId] = useState(null);
  const [cashierInvitationOpen, setCashierInvitationOpen] = useState(false);
  const [cashierRemoveUser, setCashierRemoveUser] = useState(null);
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
  const storefrontAssetUploadOverridesRef = useRef({});
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: '',
    phoneNumber: ''
  });
  const [storefrontLocations, setStorefrontLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [locationSaving, setLocationSaving] = useState(false);
  const [pendingLocationAction, setPendingLocationAction] = useState(null);
  const [validationModalState, setValidationModalState] = useState({
    open: false,
    title: '',
    description: '',
    errors: []
  });
  const {
    posForm,
    setPosForm,
    hydrateFromSettings: hydratePosSetupFromSettings,
    handleDiscountProfileChange,
    addDiscountProfile,
    removeDiscountProfile,
    handleTerminalRegistryChange,
    addTerminalRegistryEntry,
    removeTerminalRegistryEntry,
    buildTerminalRegistryPayload
  } = usePosSetupSettingsController();
  const {
    storefrontForm,
    setStorefrontForm,
    storefrontAssets,
    setStorefrontAssets,
    editingLocationId,
    locationForm,
    setLocationForm,
    storefrontPublicUrl,
    hasActivePrimaryStorefrontLocation,
    storefrontLocationRequired,
    lastFulfillmentMethodLocked,
    leadTimeRequiredMissing,
    leadTimeRangeInverted,
    hydrateFromSettings: hydrateStorefrontFromSettings,
    handleStorefrontListChange,
    addStorefrontListRow,
    removeStorefrontListRow,
    handleStorefrontObjectRowChange,
    resetLocationForm,
    handleEditLocation,
    handleLocationPinChange
  } = useStorefrontSettingsController({ storefrontLocations });
  const storefrontFormRef = useRef(storefrontForm);
  const storefrontAssetsRef = useRef(storefrontAssets);
  const storefrontContentBaselineRef = useRef(null);
  storefrontFormRef.current = storefrontForm;
  storefrontAssetsRef.current = storefrontAssets;
  const posFormSnapshot = useMemo(() => getPosFormSnapshot(posForm), [posForm]);
  const posSetupDirty = useMemo(() => (
    posFormBaseline != null
      && JSON.stringify(posFormSnapshot) !== JSON.stringify(posFormBaseline)
  ), [posFormBaseline, posFormSnapshot]);
  const commitStorefrontContentBaseline = useCallback(({
    form = storefrontFormRef.current,
    assets = storefrontAssetsRef.current,
    group = 'content'
  } = {}) => {
    const nextBaseline = mergeStorefrontContentBaseline(
      storefrontContentBaselineRef.current,
      { form, assets },
      group
    );
    storefrontContentBaselineRef.current = nextBaseline;
    setStorefrontContentBaseline(nextBaseline);
    return nextBaseline;
  }, []);
  const storefrontContentSnapshot = useMemo(
    () => getStorefrontContentSnapshot({ form: storefrontForm, assets: storefrontAssets }),
    [storefrontAssets, storefrontForm]
  );
  const storefrontContentBaselineSnapshot = useMemo(
    () => (storefrontContentBaseline ? getStorefrontContentSnapshot(storefrontContentBaseline) : ''),
    [storefrontContentBaseline]
  );
  const storefrontContentDirty = storefrontContentBaseline != null
    && storefrontContentSnapshot !== storefrontContentBaselineSnapshot;
  const discardStorefrontContentChanges = useCallback(() => {
    const baseline = storefrontContentBaselineRef.current;
    if (!baseline) return false;
    const restored = cloneStorefrontContentBaseline(baseline);
    setStorefrontForm((current) => ({ ...current, ...restored.form }));
    setStorefrontAssets((current) => ({ ...current, ...restored.assets }));
    storefrontAssetUploadOverridesRef.current = {};
    return true;
  }, [setStorefrontAssets, setStorefrontForm]);
  const [assetUploadingType, setAssetUploadingType] = useState('');
  const [assetDeletingType, setAssetDeletingType] = useState('');
  const animationTimersRef = useRef([]);
  const previousInitialTabRef = useRef(initialTab);
  const readiness = terminalMeta?.locationBindingReadiness || null;
  const requestedCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessMode);
  const effectiveCustomerAccessMode = normalizeCustomerAccessMode(storefrontForm.customerAccessEffectiveMode || requestedCustomerAccessMode);
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
    ...(canManageEmployees || canManageDeliveryPersonnel || canManageEmployeeCredit
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
        opacity: 1,
        transition: 'none'
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

  const handleRemoveCashier = useCallback(async () => {
    const userId = Number(cashierRemoveUser?.user_id);
    const role = String(cashierRemoveUser?.role || '').trim().toLowerCase();
    if (!canRemoveCashiers || !Number.isInteger(userId) || userId <= 0 || role !== 'cashier' || cashierRemoveUser?.is_master_admin === true) {
      return false;
    }

    const cashierLabel = cashierRemoveUser.username || cashierRemoveUser.email || `cashier ${userId}`;
    try {
      await removeUserFromCompany(userId);
      setCashierUsers((current) => current.filter((entry) => Number(entry?.user_id) !== userId));
      toast.success(`${cashierLabel} was removed from cashier access.`);
      try {
        await onRefreshTerminalUser?.({ suppressGlobalErrors: true });
      } catch (syncError) {
        console.warn('Cashier removal succeeded but terminal user refresh failed:', syncError);
      }
      return true;
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to remove cashier access.';
      toast.error(message);
      return { success: false, message };
    }
  }, [cashierRemoveUser, canRemoveCashiers, onRefreshTerminalUser]);

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

  const hydrateSettingsWorkspace = useCallback(async ({
    silent = false,
    preserveAssetUrls = null,
    preserveStorefrontContentForm = null,
    resetStorefrontContentBaseline = false
  } = {}) => {
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
      setCompanyInfo(companyPayload);
      const hydratedPosForm = hydratePosSetupFromSettings(settingsPayload, terminalMeta);
      setPosFormBaseline(getPosFormSnapshot(hydratedPosForm));
      const hydratedStorefrontForm = {
        storeTenantSlug: String(settingsPayload?.store_tenant_slug?.value || '').trim().toLowerCase(),
        storeIsVisible: settingsPayload?.store_is_visible?.value !== false,
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
        storefrontUiV2Enabled: settingsPayload?.storefront_ui_v2_enabled?.value !== false,
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
        storefrontFollowEnabled: settingsPayload?.storefront_follow_enabled?.value !== false,
        storefrontShareEnabled: settingsPayload?.storefront_share_enabled?.value !== false,
        // #622: fail-open default -- an unset row (every tenant provisioned before this shipped)
        // must hydrate to checked/on, matching the backend's own DEFAULT_GUEST_CHECKOUT_ENABLED.
        storefrontGuestCheckoutEnabled: settingsPayload?.storefront_guest_checkout_enabled?.value !== false,
        // #626 (Phase 203): same fail-open shape, matching DEFAULT_CASH_PAYMENT_ENABLED.
        storefrontCashPaymentEnabled: settingsPayload?.storefront_cash_payment_enabled?.value !== false
      };
      const nextStorefrontForm = preserveStorefrontContentForm
        ? {
          ...hydratedStorefrontForm,
          ...selectStorefrontContentFields(preserveStorefrontContentForm)
        }
        : hydratedStorefrontForm;
      hydrateStorefrontFromSettings(nextStorefrontForm);
      const hydratedAssets = {
        cover: String(settingsPayload?.storefront_cover_image_url?.value || ''),
        profile: String(settingsPayload?.storefront_profile_image_url?.value || ''),
        coverTransform: normalizeCoverPhotoTransform(settingsPayload?.storefront_cover_image_transform?.value)
      };
      const nextStorefrontAssets = {
        cover: String(preserveAssetUrls?.cover ?? hydratedAssets.cover),
        profile: String(preserveAssetUrls?.profile ?? hydratedAssets.profile),
        coverTransform: normalizeCoverPhotoTransform(preserveAssetUrls?.coverTransform ?? hydratedAssets.coverTransform)
      };
      setStorefrontAssets(nextStorefrontAssets);
      if (resetStorefrontContentBaseline || storefrontContentBaselineRef.current == null) {
        commitStorefrontContentBaseline({
          form: nextStorefrontForm,
          assets: nextStorefrontAssets,
          group: 'content'
        });
      }
      return true;
    } catch (error) {
      if (!silent) {
        setLoadError(error?.response?.data?.message || 'Failed to load shared settings.');
      }
      return false;
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [commitStorefrontContentBaseline, hydratePosSetupFromSettings, hydrateStorefrontFromSettings, setStorefrontAssets, terminalMeta?.pettyCashAmount, terminalMeta?.pettyCashSymbol, terminalUser?.is_master_admin]);

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

  const transitionToTab = useCallback((nextTab) => {
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

        const settleTimer = window.setTimeout(() => {
          // Keep the pane transform-free at rest so viewport-fixed descendants,
          // such as the mobile Edit Branch action bar, remain viewport anchored.
          setPaneInlineStyle({ opacity: 1, transition: 'none' });
        }, 150);
        animationTimersRef.current.push(settleTimer);
      }, 16);

      animationTimersRef.current.push(enterTimer);
    }, 150);

    animationTimersRef.current.push(swapTimer);
  }, [activeTab, clearAnimationTimers]);

  const handleStorefrontContentNavigationRequest = useCallback((nextSubtab) => {
    if (!nextSubtab || nextSubtab === storefrontSubtab) return;
    setPendingStorefrontNavigation({ type: 'subtab', nextSubtab });
  }, [storefrontSubtab]);

  const handleTabChange = useCallback((nextTab) => {
    if (!nextTab || nextTab === activeTab) return;
    if (activeTab === 'storefront' && storefrontContentDirty) {
      setPendingStorefrontNavigation({ type: 'top-level', nextTab });
      return;
    }
    if (activeTab === 'pos_setup' && posSetupDirty) {
      setPendingTopLevelTab(nextTab);
      return;
    }
    transitionToTab(nextTab);
  }, [activeTab, posSetupDirty, storefrontContentDirty, transitionToTab]);

  useEffect(() => {
    if (!posSetupDirty && !storefrontContentDirty) return undefined;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [posSetupDirty, storefrontContentDirty]);

  useEffect(() => {
    if (!storefrontContentDirty) setPendingStorefrontNavigation(null);
  }, [storefrontContentDirty]);

  useEffect(() => {
    onStorefrontContentStateChange?.({
      dirty: storefrontContentDirty,
      discard: discardStorefrontContentChanges
    });
    return () => onStorefrontContentStateChange?.({ dirty: false, discard: null });
  }, [discardStorefrontContentChanges, onStorefrontContentStateChange, storefrontContentDirty]);

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
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update profile settings.');
      return false;
    } finally {
      setSavingTab('');
    }
  }, [onRefreshTerminalUser, profileForm.email, profileForm.phoneNumber, profileForm.username]);

  const handleTerminalRegistrySave = useCallback(async (terminalRegistryOverride, options = {}) => {
    const successMessage = String(options?.successMessage || 'Terminal settings updated.').trim();
    const fallbackErrorMessage = String(options?.errorMessage || 'Failed to update terminal settings.').trim();
    setSavingTab('terminal_registry');
    try {
      const { posTerminalRegistry, normalizedRegistryState, posTerminalRegistryMode } = buildTerminalRegistryPayload(terminalRegistryOverride);

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

      const nextPosForm = {
        ...posForm,
        terminalRegistry: savedRegistry.map((entry) => ({
          ...entry,
          pairing_version: String(entry?.pairing_version || '').trim(),
          ...(Array.isArray(entry?.cashier_user_ids)
            ? { cashier_user_ids: normalizeTerminalCashierIds(entry.cashier_user_ids) }
            : {}),
          rotate_pairing: false
        })),
        terminalRegistryMode: posTerminalRegistryMode
      };
      setPosForm(nextPosForm);
      const nextPosSnapshot = getPosFormSnapshot(nextPosForm);
      setPosFormBaseline((current) => ({
        ...(current || getPosFormSnapshot(posForm)),
        terminalRegistry: nextPosSnapshot.terminalRegistry,
        terminalRegistryMode: nextPosSnapshot.terminalRegistryMode,
        terminalLocationBindingEnforced: nextPosSnapshot.terminalLocationBindingEnforced
      }));

      await Promise.all([
        onRefreshTerminalMeta?.(),
        onRefreshTerminalUser?.({ suppressGlobalErrors: true })
      ]);
      toast.success(successMessage || 'Terminal settings updated.');
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || fallbackErrorMessage);
      return false;
    } finally {
      setSavingTab('');
    }
  }, [buildTerminalRegistryPayload, onRefreshTerminalMeta, onRefreshTerminalUser, posForm]);

  const handleTerminalAdvancedSettingsSave = useCallback(async (nextSettings = {}) => {
    const nextMode = ['warn', 'enforce'].includes(String(nextSettings?.terminalRegistryMode || '').trim().toLowerCase())
      ? String(nextSettings.terminalRegistryMode).trim().toLowerCase()
      : 'warn';
    const nextBinding = nextSettings?.terminalLocationBindingEnforced === true;
    const nextVoucherAccess = nextSettings?.voucherPosRedemptionEnabled === true;
    setSavingTab('terminal_advanced_settings');
    try {
      await updateSettings({
        pos_terminal_registry_mode: nextMode,
        pos_terminal_location_binding_enforced: nextBinding,
        voucher_pos_redemption_enabled: nextVoucherAccess
      });
      const nextPosForm = {
        ...posForm,
        terminalRegistryMode: nextMode,
        terminalLocationBindingEnforced: nextBinding,
        voucherPosRedemptionEnabled: nextVoucherAccess
      };
      setPosForm(nextPosForm);
      const nextPosSnapshot = getPosFormSnapshot(nextPosForm);
      setPosFormBaseline((current) => ({
        ...(current || getPosFormSnapshot(posForm)),
        terminalRegistryMode: nextPosSnapshot.terminalRegistryMode,
        terminalLocationBindingEnforced: nextPosSnapshot.terminalLocationBindingEnforced,
        voucherPosRedemptionEnabled: nextPosSnapshot.voucherPosRedemptionEnabled
      }));
      await Promise.all([
        onRefreshTerminalMeta?.(),
        onRefreshTerminalUser?.({ suppressGlobalErrors: true })
      ]);
      toast.success('Advanced terminal settings saved.');
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to save advanced terminal settings.');
      return false;
    } finally {
      setSavingTab('');
    }
  }, [onRefreshTerminalMeta, onRefreshTerminalUser, posForm]);

  const handlePosSave = useCallback(async (nextPosForm = null, { silent = false } = {}) => {
    const effectivePosForm = nextPosForm && typeof nextPosForm === 'object' ? nextPosForm : posForm;
    setSavingTab('pos_setup');
    try {
      const posDiscountProfiles = (Array.isArray(effectivePosForm.discountProfiles) ? effectivePosForm.discountProfiles : [])
        .map(sanitizeDiscountProfile)
        .filter((profile) => profile.name.length > 0);

      const normalizedDiscountNames = new Set();
      for (const profile of posDiscountProfiles) {
        const normalizedName = profile.name.toLowerCase();
        if (normalizedDiscountNames.has(normalizedName)) {
          toast.error(`Duplicate POS discount name: ${profile.name}`);
          return false;
        }
        normalizedDiscountNames.add(normalizedName);
      }

      const { posTerminalRegistry, posTerminalRegistryMode } = buildTerminalRegistryPayload();

      await updateSettings({
        pos_registered_name: String(effectivePosForm.registeredName || '').trim(),
        pos_business_name: String(effectivePosForm.businessName || '').trim(),
        pos_business_style: String(effectivePosForm.businessStyle || '').trim(),
        pos_taxpayer_type: String(effectivePosForm.taxpayerType || '').trim(),
        pos_tin_branch: String(effectivePosForm.tinBranch || '').trim(),
        pos_address: String(effectivePosForm.businessAddress || '').trim(),
        pos_ptu_number: String(effectivePosForm.ptuNumber || '').trim(),
        pos_min_number: String(effectivePosForm.minNumber || '').trim(),
        pos_accreditation_number: String(effectivePosForm.accreditationNumber || '').trim(),
        pos_fiscal_buyer_details_required: effectivePosForm.fiscalBuyerDetailsRequired === true,
        pos_receipt_footer_message: String(effectivePosForm.receiptFooterMessage || '').trim(),
        pos_discount_profiles: posDiscountProfiles,
        pos_employee_discount_self_approval_enabled: effectivePosForm.employeeDiscountSelfApprovalEnabled === true,
        pos_terminal_registry: posTerminalRegistry,
        pos_terminal_registry_mode: posTerminalRegistryMode,
        pos_terminal_location_binding_enforced: effectivePosForm.terminalLocationBindingEnforced === true,
        voucher_pos_redemption_enabled: effectivePosForm.voucherPosRedemptionEnabled === true,
        pos_settings_access_pin: String(effectivePosForm.settingsAccessPin || '').trim(),
        clear_pos_settings_access_pin: effectivePosForm.clearSettingsAccessPin === true,
        pos_petty_cash_symbol: String(effectivePosForm.pettyCashSymbol || 'PHP').trim() || 'PHP',
        pos_petty_cash_amount: Number(effectivePosForm.pettyCashAmount || 0),
        pos_open_status: effectivePosForm.posOpenStatus === true,
        pos_wait_time_minutes: Number(effectivePosForm.posWaitTimeMinutes || 0),
        inventory_low_stock_display_threshold: Number(effectivePosForm.inventoryLowStockDisplayThreshold || 5),
        pos_best_seller_settings: {
          enabled: effectivePosForm.bestSellerAutoTaggingEnabled === true,
          lookback_days: 30,
          top_limit: 3,
          daily_top_enabled: effectivePosForm.dailyTopBestSellerEnabled === true
        }
      });
      setPosFormBaseline(getPosFormSnapshot(effectivePosForm));
      await Promise.all([
        hydrateSettingsWorkspace({ silent }),
        onRefreshTerminalMeta?.(),
        onRefreshTerminalUser?.({ suppressGlobalErrors: true })
      ]);
      await onPosSetupSaved?.();
      toast.success('POS setup synced to shared settings.');
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to save POS setup.');
      return false;
    } finally {
      setSavingTab('');
    }
  }, [buildTerminalRegistryPayload, hydrateSettingsWorkspace, onPosSetupSaved, onRefreshTerminalMeta, onRefreshTerminalUser, posForm]);

  const handlePosSetupDiscard = useCallback(async () => {
    if (!posSetupDirty || savingTab || posSetupDiscarding) return false;
    setPosSetupDiscarding(true);
    try {
      const discarded = await hydrateSettingsWorkspace({ silent: true });
      if (!discarded) {
        toast.error('Failed to discard POS setup changes. Please try again.');
      }
      return discarded;
    } finally {
      setPosSetupDiscarding(false);
    }
  }, [hydrateSettingsWorkspace, posSetupDiscarding, posSetupDirty, savingTab]);

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
        return false;
      }
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
      await hydrateSettingsWorkspace({
        silent: true,
        preserveAssetUrls: storefrontAssetUploadOverridesRef.current,
        preserveStorefrontContentForm: storefrontForm,
        resetStorefrontContentBaseline: true
      });
      await onStorefrontSetupSaved?.();
      storefrontAssetUploadOverridesRef.current = {};
      toast.success('Storefront settings synced to shared settings.');
      return true;
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
      return false;
    } finally {
      setSavingTab('');
    }
  }, [hasActivePrimaryStorefrontLocation, hydrateSettingsWorkspace, onStorefrontSetupSaved, openValidationModal, storefrontForm, storefrontLocationRequired]);

  const handleStorefrontGroupSave = useCallback(async (group, formOverride = null) => {
    const groupKey = String(group || '').trim().toLowerCase();
    if (!groupKey || groupKey === 'image') {
      return true;
    }

    const form = formOverride || storefrontForm;

    const groupPayloads = {
      basic: {
        storefront_tagline: String(form.storefrontTagline || '').trim(),
        storefront_phone: String(form.storefrontPhone || '').trim(),
        storefront_email: String(form.storefrontEmail || '').trim(),
        storefront_about: String(form.storefrontAbout || '').trim(),
        storefront_hours: serializeStorefrontBusinessHours(form.storefrontHours)
      },
      categories: {
        storefront_categories: normalizeStringList(form.storefrontCategories, 12, 60)
      },
      why: {
        storefront_why_choose_us: normalizeStringList(form.storefrontWhyChooseUs, 6, 120)
      },
      social: {
        storefront_social_links: {
          messenger: String(form.storefrontSocialMessenger || '').trim(),
          facebook: String(form.storefrontSocialFacebook || '').trim(),
          instagram: String(form.storefrontSocialInstagram || '').trim()
        }
      },
      gallery: {
        storefront_gallery_images: serializeStorefrontGallerySettings(form.storefrontGalleryImages)
      },
      delivery: {
        storefront_delivery_partners: normalizeStorefrontDeliveryPartnersSettings(form.storefrontDeliveryPartners)
      },
      content: {
        storefront_tagline: String(form.storefrontTagline || '').trim(),
        storefront_phone: String(form.storefrontPhone || '').trim(),
        storefront_email: String(form.storefrontEmail || '').trim(),
        storefront_about: String(form.storefrontAbout || '').trim(),
        storefront_hours: serializeStorefrontBusinessHours(form.storefrontHours),
        storefront_categories: normalizeStringList(form.storefrontCategories, 12, 60),
        storefront_why_choose_us: normalizeStringList(form.storefrontWhyChooseUs, 6, 120),
        storefront_social_links: {
          messenger: String(form.storefrontSocialMessenger || '').trim(),
          facebook: String(form.storefrontSocialFacebook || '').trim(),
          instagram: String(form.storefrontSocialInstagram || '').trim()
        },
        storefront_gallery_images: serializeStorefrontGallerySettings(form.storefrontGalleryImages),
        storefront_delivery_partners: normalizeStorefrontDeliveryPartnersSettings(form.storefrontDeliveryPartners)
      }
    };
    const payload = groupPayloads[groupKey];
    if (!payload) return false;

    setSavingTab(`storefront_${groupKey}`);
    try {
      await updateSettings(payload);
      await hydrateSettingsWorkspace({
        silent: true,
        preserveAssetUrls: storefrontAssetUploadOverridesRef.current,
        preserveStorefrontContentForm: form
      });
      // Keep the edited group's values immediately visible when a settings read is
      // briefly served from a replica that has not caught up with the write yet.
      const localPatch = groupKey === 'basic'
        ? {
          storefrontTagline: String(form.storefrontTagline || '').trim(),
          storefrontPhone: String(form.storefrontPhone || '').trim(),
          storefrontEmail: String(form.storefrontEmail || '').trim(),
          storefrontAbout: String(form.storefrontAbout || '').trim(),
          storefrontHours: form.storefrontHours
        }
        : groupKey === 'categories'
          ? { storefrontCategories: normalizeStringList(form.storefrontCategories, 12, 60) }
          : groupKey === 'why'
            ? { storefrontWhyChooseUs: normalizeStringList(form.storefrontWhyChooseUs, 6, 120) }
            : groupKey === 'social'
              ? {
                storefrontSocialMessenger: String(form.storefrontSocialMessenger || '').trim(),
                storefrontSocialFacebook: String(form.storefrontSocialFacebook || '').trim(),
                storefrontSocialInstagram: String(form.storefrontSocialInstagram || '').trim()
              }
              : groupKey === 'gallery'
                ? { storefrontGalleryImages: serializeStorefrontGallerySettings(form.storefrontGalleryImages) }
              : groupKey === 'delivery'
                  ? { storefrontDeliveryPartners: normalizeStorefrontDeliveryPartnersSettings(form.storefrontDeliveryPartners) }
                  : groupKey === 'content'
                    ? {
                      storefrontTagline: String(form.storefrontTagline || '').trim(),
                      storefrontPhone: String(form.storefrontPhone || '').trim(),
                      storefrontEmail: String(form.storefrontEmail || '').trim(),
                      storefrontAbout: String(form.storefrontAbout || '').trim(),
                      storefrontHours: form.storefrontHours,
                      storefrontCategories: normalizeStringList(form.storefrontCategories, 12, 60),
                      storefrontWhyChooseUs: normalizeStringList(form.storefrontWhyChooseUs, 6, 120),
                      storefrontSocialMessenger: String(form.storefrontSocialMessenger || '').trim(),
                      storefrontSocialFacebook: String(form.storefrontSocialFacebook || '').trim(),
                      storefrontSocialInstagram: String(form.storefrontSocialInstagram || '').trim(),
                      storefrontGalleryImages: serializeStorefrontGallerySettings(form.storefrontGalleryImages),
                      storefrontDeliveryPartners: normalizeStorefrontDeliveryPartnersSettings(form.storefrontDeliveryPartners)
                    }
                    : {};
      const savedForm = { ...form, ...localPatch };
      setStorefrontForm((current) => ({ ...current, ...localPatch }));
      commitStorefrontContentBaseline({
        form: savedForm,
        assets: storefrontAssetsRef.current,
        group: groupKey
      });
      await onStorefrontSetupSaved?.();
      toast.success(`${groupKey[0].toUpperCase()}${groupKey.slice(1)} settings saved.`);
      return true;
    } catch (error) {
      const validationErrors = collectValidationErrors(error, `Failed to save ${groupKey} settings.`);
      const validationDescription = formatValidationErrorDescription(validationErrors);
      openValidationModal({
        title: formatValidationModalTitle(`${groupKey[0].toUpperCase()}${groupKey.slice(1)} Save`),
        description: 'Review the blocking fields below, then try saving again.',
        errors: validationErrors
      });
      toast.error(
        formatFirstValidationError(error, `Failed to save ${groupKey} settings.`),
        validationDescription ? { description: validationDescription } : undefined
      );
      return false;
    } finally {
      setSavingTab('');
    }
  }, [commitStorefrontContentBaseline, hydrateSettingsWorkspace, onStorefrontSetupSaved, openValidationModal, setStorefrontForm, storefrontForm]);

  const handleStorefrontContentSave = useCallback(
    () => handleStorefrontGroupSave('content'),
    [handleStorefrontGroupSave]
  );

  const handleStorefrontBooleanChange = useCallback(async ({ settingKey, field, label, value, previousValue }) => {
    if (!canEditSettings || locked || !settingKey || !field) return;
    setStorefrontBooleanState((current) => ({ ...current, [settingKey]: 'saving' }));
    try {
      await updateSettingByKey(settingKey, value === true);
      await hydrateSettingsWorkspace({ silent: true });
      // Keep the optimistic switch state after the refresh as well. The settings
      // endpoint may briefly return its previous value while replicas/caches settle;
      // the successful single-setting write is authoritative for this interaction.
      setStorefrontForm((current) => ({ ...current, [field]: value === true }));
      setStorefrontBooleanState((current) => ({ ...current, [settingKey]: 'saved' }));
      toast.success(`${label || 'Storefront setting'} updated.`);
      window.setTimeout(() => {
        setStorefrontBooleanState((current) => (current[settingKey] === 'saved' ? { ...current, [settingKey]: '' } : current));
      }, 1800);
    } catch (error) {
      setStorefrontForm((current) => ({ ...current, [field]: previousValue === true }));
      setStorefrontBooleanState((current) => ({ ...current, [settingKey]: 'error' }));
      toast.error(error?.response?.data?.message || `Failed to update ${(label || 'Storefront setting').toLowerCase()}.`);
      window.setTimeout(() => {
        setStorefrontBooleanState((current) => (current[settingKey] === 'error' ? { ...current, [settingKey]: '' } : current));
      }, 2600);
    }
  }, [canEditSettings, hydrateSettingsWorkspace, locked, setStorefrontForm]);

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
      localErrors.push({ field: 'name', message: `${STOREFRONT_LOCATION_LABELS.branchName} is required.` });
    }
    if (!payload.address_line) {
      localErrors.push({ field: 'address_line', message: `${STOREFRONT_LOCATION_LABELS.address} is required.` });
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
        title: formatValidationModalTitle(editingLocationId ? STOREFRONT_LOCATION_LABELS.editBranch : STOREFRONT_LOCATION_LABELS.addBranch),
        description: 'Fill in the required location fields before saving.',
        errors: localErrors
      });
      toast.error(localErrors[0].message);
      return false;
    }
    setLocationSaving(true);
    try {
      if (editingLocationId) {
        await tenantLocationService.updateTenantLocation(editingLocationId, payload);
        toast.success('Branch updated.');
      } else {
        await tenantLocationService.createTenantLocation(payload);
        toast.success('Branch added.');
      }
      await loadStorefrontLocations({ silent: true });
      resetLocationForm();
      return true;
    } catch (error) {
      const validationErrors = collectValidationErrors(error, 'Failed to save storefront location.');
      const validationDescription = formatValidationErrorDescription(validationErrors);
      openValidationModal({
        title: formatValidationModalTitle(editingLocationId ? STOREFRONT_LOCATION_LABELS.editBranch : STOREFRONT_LOCATION_LABELS.addBranch),
        description: 'Review the location errors below, then try again.',
        errors: validationErrors
      });
      toast.error(
        error?.response?.data?.message || 'Failed to save storefront location.',
        validationDescription ? { description: validationDescription } : undefined
      );
      return false;
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

  const handleUploadAsset = useCallback(async (assetType, file, coverTransform = null) => {
    const normalizedCoverTransform = assetType === 'cover' && coverTransform != null
      ? normalizeCoverPhotoTransform(coverTransform)
      : null;
    if (!file && !normalizedCoverTransform) return false;
    setAssetUploadingType(assetType);
    try {
      let uploadedUrl = '';
      if (file) {
        // Apply the URL returned by the upload immediately. Rehydrating settings
        // is still important for the rest of the workspace, but it can briefly
        // return the previous value while the shared settings/discovery caches
        // settle. Keeping the upload response in local state makes the editor
        // preview update in the same save cycle as the adjusted cover image.
        const uploaded = await uploadStorefrontAsset(assetType, file);
        uploadedUrl = String(uploaded?.image_url || uploaded?.url || '').trim();
      }
      if (uploadedUrl && (assetType === 'cover' || assetType === 'profile')) {
        storefrontAssetUploadOverridesRef.current[assetType] = uploadedUrl;
        setStorefrontAssets((current) => ({
          ...current,
          [assetType]: uploadedUrl
        }));
      }
      if (normalizedCoverTransform) {
        await updateSettings({ storefront_cover_image_transform: normalizedCoverTransform });
        storefrontAssetUploadOverridesRef.current.coverTransform = normalizedCoverTransform;
        setStorefrontAssets((current) => ({
          ...current,
          coverTransform: normalizedCoverTransform
        }));
      }
      // Keep the active group editor mounted while the follow-up read settles;
      // a media upload should not briefly replace the page with the workspace
      // loading state and discard the group's Save/Cancel controls.
      await hydrateSettingsWorkspace({
        silent: true,
        preserveAssetUrls: storefrontAssetUploadOverridesRef.current,
        preserveStorefrontContentForm: storefrontFormRef.current
      });
      // Preserve the just-uploaded asset if the follow-up settings read is
      // served from a stale replica/cache. The next explicit refresh will
      // reconcile it with the persisted setting.
      const nextAssets = {
        ...storefrontAssetsRef.current,
        ...(uploadedUrl && (assetType === 'cover' || assetType === 'profile')
          ? { [assetType]: uploadedUrl }
          : {}),
        ...(normalizedCoverTransform ? { coverTransform: normalizedCoverTransform } : {})
      };
      setStorefrontAssets(nextAssets);
      commitStorefrontContentBaseline({ assets: nextAssets, group: 'image' });
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} updated.`);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to upload storefront asset.');
      return false;
    } finally {
      setAssetUploadingType('');
    }
  }, [commitStorefrontContentBaseline, hydrateSettingsWorkspace, setStorefrontAssets]);

  const handleGalleryAssetUpload = useCallback(async (index, file, { onProgress } = {}) => {
    if (!file) return { success: false, error: 'Choose an image file.' };
    const uploadKey = `gallery-${index}`;
    setAssetUploadingType(uploadKey);
    try {
      const uploaded = await uploadStorefrontAsset('gallery', file, {
        onUploadProgress: (event) => {
          const total = Number(event?.total || 0);
          const loaded = Number(event?.loaded || 0);
          onProgress?.(total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : null);
        }
      });
      if (Number.isInteger(index)) {
        handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'path', String(uploaded?.path || ''));
        handleStorefrontObjectRowChange('storefrontGalleryImages', index, 'url', String(uploaded?.image_url || uploaded?.url || ''));
      }
      toast.success('Gallery image uploaded. Save Storefront Settings to publish it.');
      return { success: true, uploaded };
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to upload gallery image.';
      toast.error(message);
      return { success: false, error: message };
    } finally {
      setAssetUploadingType(null);
    }
  }, [handleStorefrontObjectRowChange]);

  const handleDeleteAsset = useCallback(async (assetType) => {
    const currentAssets = storefrontAssetsRef.current;
    const nextAssets = assetType === 'cover'
      ? {
        ...currentAssets,
        cover: '',
        coverTransform: normalizeCoverPhotoTransform(null)
      }
      : { ...currentAssets, profile: '' };
    setAssetDeletingType(assetType);
    try {
      await deleteStorefrontAsset(assetType);
      delete storefrontAssetUploadOverridesRef.current[assetType];
      if (assetType === 'cover') delete storefrontAssetUploadOverridesRef.current.coverTransform;
      await hydrateSettingsWorkspace({
        silent: true,
        preserveAssetUrls: nextAssets,
        preserveStorefrontContentForm: storefrontFormRef.current
      });
      setStorefrontAssets(nextAssets);
      commitStorefrontContentBaseline({ assets: nextAssets, group: 'image' });
      toast.success(`${assetType === 'cover' ? 'Cover photo' : 'Profile icon'} removed.`);
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to delete storefront asset.');
      return false;
    } finally {
      setAssetDeletingType('');
    }
  }, [commitStorefrontContentBaseline, hydrateSettingsWorkspace, setStorefrontAssets]);

  const posSetupPaneProps = {
    terminalUser, locked, canEditSettings, loading, savingTab, handlePosSave, onCancel: hydrateSettingsWorkspace, posForm, setPosForm, posSetupDirty, locations, incomingOrders,
    queueLocationScopeId,
    onlineOrderSoundEnabled, setOnlineOrderSoundEnabled, handleTerminalRegistrySave, handleTerminalAdvancedSettingsSave, canManageCashiers, cashiersLoading,
    getCashiersForLocation, setCashierInvitationOpen, canRemoveCashiers, setCashierRemoveUser, cashiersLoaded, activeCashierUsers,
    cashierVoidAccessSavingUserId, updateCashierVoidAccess, updateCashierDrawerAccess, loadCashierAccounts,
    canManageDiscountApprovalPins, discountApprovers, discountApproversLoading, loadDiscountApprovers,
    updateDiscountAuthorization, discountAuthorizationSavingUserId, setApprovalPinUser, setApprovalPin, canManageDayClosePins,
    dayCloseOperators, dayCloseOperatorsLoading, loadDayCloseOperators, updateDayCloseAccess, dayCloseAccessSavingUserId, setDayClosePinUser,
    handleDiscountProfileChange, addDiscountProfile, removeDiscountProfile, handleTerminalRegistryChange,
    addTerminalRegistryEntry, removeTerminalRegistryEntry, readiness, onNavigateToOrders
  };

  const storefrontPaneProps = {
    storefrontForm, setStorefrontForm, storefrontAssets, storefrontPublicUrl, storefrontLocationRequired,
    storefrontTenantId: String(terminalUser?.company?.id || '').trim(),
    editingLocationId,
    activeSubtab: storefrontSubtab, onActiveSubtabChange: setStorefrontSubtab,
    selectedLocationId: storefrontSelectedLocationId, onSelectedLocationChange: setStorefrontSelectedLocationId,
    hasActivePrimaryStorefrontLocation, requestedCustomerAccessMode, effectiveCustomerAccessMode, platformMaxCustomerAccessMode,
    customerAccessRollbackActive, customerAccessLimitation, locked, loading, savingTab, canEditSettings,
    handleStorefrontSave, handleStorefrontGroupSave, handleCopyStorefrontUrl, handleGenerateStorefrontSlug, handleCustomerAccessModeChange,
    handleUploadAsset, handleDeleteAsset, handleGalleryAssetUpload, assetUploadingType, assetDeletingType,
    handleStorefrontListChange, addStorefrontListRow, removeStorefrontListRow, handleStorefrontObjectRowChange,
    storefrontLocations, locationsLoading, locationSaving, locationForm, setLocationForm,
    loadStorefrontLocations, resetLocationForm, handleEditLocation, handleSetPrimaryLocation, handleDeactivateLocation,
    handleReactivateLocation, handleDeleteLocation, handleLocationPinChange, leadTimeRequiredMissing, leadTimeRangeInverted,
    lastFulfillmentMethodLocked, handleSaveLocation, handleStorefrontBooleanChange, storefrontBooleanState,
    storefrontContentDirty, onStorefrontContentNavigationRequest: handleStorefrontContentNavigationRequest,
    expansionScrollParentRef: workspacePaneRef
  };

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
    if (renderedTab === 'profile') {
      return (
        <PosProfileSettingsPane
          terminalUser={terminalUser}
          companyInfo={companyInfo}
          profileForm={profileForm}
          setProfileForm={setProfileForm}
          locked={locked}
          loading={loading}
          savingTab={savingTab}
          onSave={handleProfileSave}
        />
      );
    }
    if (renderedTab === 'storefront') return <PosStorefrontSettingsPane {...storefrontPaneProps} />;
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
    if (renderedTab === 'employees' && (canManageEmployees || canManageDeliveryPersonnel || canManageEmployeeCredit)) {
      return (
        <PosEmployeesSettingsPane
          canManageEmployees={canManageEmployees}
          canManageDeliveryPersonnel={canManageDeliveryPersonnel}
          canManageEmployeeCredit={canManageEmployeeCredit}
          locked={locked}
          loading={loading}
          employeeDirectoryRevision={employeeDirectoryRevision}
          onEmployeesChanged={() => setEmployeeDirectoryRevision((revision) => revision + 1)}
          onDeliveryPersonnelChanged={onDeliveryPersonnelChanged}
        />
      );
    }
    return <PosSetupSettingsPane {...posSetupPaneProps} />;
  };

  return (
    <div id={sectionId} data-pos-settings-workspace="true" className="min-w-0 max-w-full overflow-x-hidden space-y-4 px-0 sm:space-y-6 sm:px-3">
      <PosSettingsTabNavigation
        tabs={SETTINGS_TABS}
        activeTab={activeTab}
        onTabChange={handleTabChange}
      />
      <div
        id="pos-settings-panel"
        role="tabpanel"
        aria-labelledby={`pos-settings-tab-${renderedTab}`}
        tabIndex={-1}
        className="min-w-0 pt-2 sm:pt-0"
        style={paneInlineStyle}
      >
        {renderPane()}
      </div>
      {renderedTab === 'storefront' && storefrontSubtab === 'content' && storefrontContentDirty ? (
        <StorefrontContentSaveBar
          canEdit={canEditSettings && !locked && !loading}
          savingTab={savingTab}
          onCancel={discardStorefrontContentChanges}
          onSave={handleStorefrontContentSave}
        />
      ) : null}
      {renderedTab === 'pos_setup' && posSetupDirty && savingTab !== 'pos_setup' ? (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-blue-200 bg-white px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] shadow-[0_-8px_24px_rgba(15,23,42,0.12)] sm:px-4"
        >
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold text-[#0F172A]">Unsaved POS setup changes</p>
              <p className="mt-0.5 text-[11px] leading-4 text-[#536B8C]">Save your updates before leaving this settings page.</p>
            </div>
            <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 gap-1.5 rounded-lg border-blue-200 bg-white px-3 text-[12px] font-extrabold text-[#1A4E8D] hover:bg-blue-100 sm:min-h-9 sm:flex-none"
                onClick={() => void handlePosSetupDiscard()}
                disabled={savingTab === 'pos_setup' || posSetupDiscarding}
              >
                <Undo2 className="h-4 w-4" aria-hidden="true" />
                Cancel
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1 gap-1.5 rounded-lg bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73] sm:min-h-9 sm:flex-none"
                onClick={() => void handlePosSave()}
                disabled={savingTab === 'pos_setup' || posSetupDiscarding}
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {savingTab === 'pos_setup' ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      <Dialog open={validationModalState.open} onOpenChange={(open) => { if (!open) closeValidationModal(); }} overlayClassName="bg-black/30 backdrop-blur-none">
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-2xl rounded-2xl border border-rose-200 bg-white p-0 shadow-2xl shadow-slate-950/20">
          <DialogHeader className="border-b border-rose-100 bg-rose-50/70 px-5 py-4">
            <DialogTitle className="text-lg font-extrabold text-rose-900">{validationModalState.title || 'Validation Error'}</DialogTitle>
            <DialogDescription className="mt-1 text-sm leading-6 text-rose-800">
              {validationModalState.description || 'Review the blocking fields below.'}
            </DialogDescription>
          </DialogHeader>
          <div className="px-5 py-4">
            <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-4">
              <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-rose-700">Blocking Fields</p>
              <div className="mt-3 space-y-3">
                {(Array.isArray(validationModalState.errors) ? validationModalState.errors : []).map((entry, index) => (
                  <div key={`settings-validation-${index}`} className="rounded-lg border border-rose-100 bg-white px-3 py-3">
                    <p className="text-[12px] font-extrabold text-slate-900">{entry.field ? getReadableFieldName(entry.field) : `Issue ${index + 1}`}</p>
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
        overlayClassName="bg-black/30 backdrop-blur-none"
        confirmClassName="min-h-9 min-w-0 flex-1 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73] focus-visible:ring-[#1A4E8D] sm:flex-none sm:text-[14px]"
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
      <ConfirmActionDialog
        open={Boolean(pendingTopLevelTab)}
        onOpenChange={(open) => { if (!open) setPendingTopLevelTab(null); }}
        title="Unsaved POS setup changes"
        description="Save your POS setup changes before leaving this page, or continue without saving."
        confirmLabel="Leave without saving"
        cancelLabel="Stay"
        variant="destructive"
        overlayClassName="bg-black/30 backdrop-blur-none"
        onConfirm={() => {
          const nextTab = pendingTopLevelTab;
          setPendingTopLevelTab(null);
          transitionToTab(nextTab);
        }}
      />
      <ConfirmActionDialog
        open={Boolean(pendingStorefrontNavigation)}
        onOpenChange={(open) => { if (!open) setPendingStorefrontNavigation(null); }}
        title="Unsaved Store Content changes"
        description="Save your Store Content changes before leaving, or continue without saving."
        confirmLabel="Leave without saving"
        cancelLabel="Stay"
        variant="destructive"
        overlayClassName={STORE_CONTENT_NAV_CONFIRM_OVERLAY_CLASS}
        onConfirm={() => {
          const pending = pendingStorefrontNavigation;
          const discarded = discardStorefrontContentChanges();
          if (discarded === false) return false;
          setPendingStorefrontNavigation(null);
          if (pending?.type === 'subtab') {
            setStorefrontSubtab(pending.nextSubtab);
          } else {
            transitionToTab(pending?.nextTab);
          }
          return true;
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
        overlayClassName="bg-black/30 backdrop-blur-none"
      />
      <ConfirmActionDialog
        open={Boolean(cashierRemoveUser)}
        onOpenChange={(open) => { if (!open) setCashierRemoveUser(null); }}
        title="Remove cashier access"
        description={cashierRemoveUser
          ? `Remove ${cashierRemoveUser.username || cashierRemoveUser.email || 'this cashier'} from this company? Their account will lose access here, while historical sales and shift records remain intact. Any open POS shift or attendance session must be closed before removal.`
          : ''}
        confirmLabel="Remove cashier"
        variant="destructive"
        onConfirm={handleRemoveCashier}
      />
      <Dialog open={Boolean(approvalPinUser)} onOpenChange={(open) => !open && closeApprovalPinDialog()} overlayClassName="bg-black/30 backdrop-blur-none">
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-[16px] font-extrabold text-[#0F172A]">
              <KeyRound className="h-5 w-5 text-[#1A4E8D]" />
              POS Discount Approval PIN
            </DialogTitle>
            <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
              This PIN is used to approve POS discounts. It cannot be viewed after saving.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700 sm:text-[14px]">
              <p className="font-semibold">{approvalPinUser?.username || approvalPinUser?.email}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {approvalPinUser?.pos_approval_pin_configured
                  ? 'A PIN is configured. Enter a new PIN to replace it.'
                  : 'Configure a PIN this approver will enter for POS discounts.'}
              </p>
            </div>
            <div>
              <Label htmlFor="pos-approval-pin" className="text-[12px] font-semibold text-slate-800">New approval PIN</Label>
              <Input
                id="pos-approval-pin"
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
                className="mt-1 text-[16px] sm:text-[14px]"
                disabled={savingApprovalPin}
              />
            </div>
          </div>
          <DialogFooter className="mt-0 flex-row justify-between gap-2 border-t border-slate-100 px-5 py-4 sm:justify-between sm:px-6">
            <div>
              {approvalPinUser?.pos_approval_pin_configured ? (
                <Button type="button" variant="outline" onClick={() => saveApprovalPin({ clear: true })} disabled={savingApprovalPin} className="text-rose-600">
                  Clear PIN
                </Button>
              ) : null}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeApprovalPinDialog} disabled={savingApprovalPin}>Cancel</Button>
              <Button type="button" onClick={() => saveApprovalPin()} disabled={savingApprovalPin} className="bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                {savingApprovalPin ? 'Saving...' : 'Save PIN'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(dayClosePinUser)} onOpenChange={(open) => !open && closeDayClosePinDialog()} overlayClassName="bg-black/30 backdrop-blur-none">
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl shadow-slate-950/20 sm:w-full">
          <DialogHeader className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
            <DialogTitle className="flex items-center gap-2 text-[16px] font-extrabold text-[#0F172A]">
              <KeyRound className="h-5 w-5 text-[#1A4E8D]" />
              Reset POS Day Close PIN
            </DialogTitle>
            <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
              Reset this cashier&apos;s PIN when they forgot it. The cashier must create a new personal PIN from DGFY Business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-5 sm:px-6">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-[13px] text-slate-700 sm:text-[14px]">
              <p className="font-semibold">{dayClosePinUser?.username || dayClosePinUser?.email}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {dayClosePinUser?.email || 'No account email'}
              </p>
            </div>
          </div>
          <DialogFooter className="mt-0 flex-row justify-between gap-2 border-t border-slate-100 px-5 py-4 sm:justify-between sm:px-6">
            <div />
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeDayClosePinDialog} disabled={savingDayClosePin}>Cancel</Button>
              <Button type="button" onClick={resetDayClosePin} disabled={savingDayClosePin} className="bg-[#1A4E8D] text-white hover:bg-[#143F73]">
                {savingDayClosePin ? 'Resetting...' : 'Reset PIN'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
