import SettingsWorkspace from '../settings/PosSettingsWorkspace.jsx';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { createPortal } from 'react-dom';
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  Check,
  ChevronDown,
  CircleDollarSign,
  ClipboardList,
  Barcode,
  History,
  ImagePlus,
  Info,
  Monitor,
  Pencil,
  MapPinned,
  Package,
  Percent,
  Plus,
  Receipt,
  RefreshCcw,
  Save,
  ScanLine,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  Store,
  UserRound,
  Tags,
  Ticket,
  Trash2,
  Truck,
  Upload,
  UtensilsCrossed,
  X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import StorefrontItemQrCard from '@/components/items/StorefrontItemQrCard.jsx';
import CSVImportModal from '@/components/items/CSVImportModal.jsx';
import { resolveStorefrontItemUrl } from '@/src/features/dgfyRouteHelpers.js';
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
  updateStorefrontCatalogOverride,
  importExternalStorefrontCatalogImage,
  queueStorefrontCatalogImage,
  queueStorefrontCatalogImages,
  getStorefrontCatalogImageUploadStatus,
  updateStorefrontCatalogGallery,
  deleteStorefrontCatalogImage,
  generateStorefrontCatalogImage
} from '@/services/storefrontCatalogService.js';
import SelectedItemImageCarousel from '@/components/items/SelectedItemImageCarousel';

import { suggestNextSku } from '@/src/features/inventory/utils/skuSuggestion.js';
import { resolveEditItemSaveError } from '../utils/editItemSaveErrors.js';

import { resolveModeItemTaxonomy } from '@/src/features/settings/modeItemTaxonomy.js';
import { normalizeWorkflowMode } from '@/src/features/settings/workflowMode.js';

import resolveAssetUrl from '@/src/utils/assetUrl.js';
import { ResponsiveImage } from '@/src/components/media/ResponsiveImage.jsx';
import { resolvePosCatalogImageSources } from '../utils/posCheckoutTerminalUtils.js';

import PdfMenuImportModal from '@/components/items/PdfMenuImportModal.jsx';
import MenuImportBatchModal from '@/components/items/MenuImportBatchModal.jsx';
import { isPdfMenuImportEnabled } from '@/hooks/usePdfMenuImport.js';
import { isMenuImportBatchEnabled } from '@/services/menuImportService.js';
import { IncomingQueueWorkspace, WorkspaceShell } from './TerminalOperationsPanels.jsx';
import PosServicesOperationsWorkspace from './PosServicesOperationsWorkspace.jsx';
import PosFnbModifiersWorkspace from './PosFnbModifiersWorkspace.jsx';
import {
  fetchPosCatalogPage,
  fetchMerchantTenderReconciliation,
  reviewMerchantTenderReconciliation
} from '../services/posService.js';
import PosReportsAnalyticsWorkspace from './PosReportsAnalyticsWorkspace.jsx';
import CashierHistoryPanel from './CashierHistoryPanel.jsx';

import AffiliatesWorkspacePanel from './AffiliatesWorkspacePanel.jsx';
import VoucherManagementPanel from './VoucherManagementPanel.jsx';
import PricelistManagementPanel from './PricelistManagementPanel.jsx';

import PosServiceOptionsWorkspace from './PosServiceOptionsWorkspace.jsx';
import PosServiceCatalogCreateModal from './PosServiceCatalogCreateModal.jsx';
import PosServiceCatalogEditModal from './PosServiceCatalogEditModal.jsx';
import { isServiceCatalogItem } from '../utils/posCatalogAvailability.js';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';

const POS_ITEMS_PAGE_SIZE = 15;
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const SETTINGS_VIEW_MODES = new Set([
  'location_scope',
  'settings_profile',
  'settings_pos',
  'settings_storefront',
  'terminal_setup'
]);

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

const money = (value) => Number(value || 0).toFixed(2);

const STOREFRONT_ITEM_IMAGE_MAX_COUNT = 5;

// RF-2 (PR #1656 review, #1410): the create-item modal disables its own close button while
// postCreateSaving is true, so a stuck background upload job locks the operator out of the
// modal for the full poll duration -- unlike handleGenerateEditImage's edit-modal path, which
// stays dismissible throughout its own poll. Reusing useItemImageGenerationPoll's full
// ITEM_IMAGE_POLL_TIMEOUT_MS (90s) here would mean a genuinely stuck job locks the modal that
// long; bound it to a much shorter ceiling instead -- the common/fast case still resolves in a
// couple of seconds well under this, and a timeout here degrades to today's pre-fix behavior
// (soft warning, pos.catalog.changed SSE backstop), not a hard failure.
const CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS = 15 * 1000;

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
  // Same generic poll-until-terminal-status hook as above, just pointed at the
  // catalog-image-upload-status endpoint instead of the AI-generation one --
  // used by runPostCreateStages below to wait out the async image upload
  // worker (catalogImageUploadWorker.js) before the post-create item refetch.
  // A shorter timeout than the hook's 90s default (see
  // CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS above) -- this poll runs while
  // the create-item modal is locked, unlike the AI-generation path this hook
  // was originally built for.
  const { pollItemImageGeneration: pollCatalogImageUploadStatus } = useItemImageGenerationPoll(getStorefrontCatalogImageUploadStatus, CREATE_ITEM_IMAGE_UPLOAD_POLL_TIMEOUT_MS);
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
      const queued = filesToUpload.length === 1
        ? await queueStorefrontCatalogImage(itemId, filesToUpload[0])
        : await queueStorefrontCatalogImages(itemId, filesToUpload);
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
    posBestSellerMode = 'auto'
  }) => {

    const failedStages = [];
    let barcodeCode = String(requestedBarcodeCode || '').trim();

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

    if (Array.isArray(imageFiles) && imageFiles.length > 0) {
      const queuedImageUpload = await runStage(
        'storefront_images',
        imageFiles.length === 1 ? 'Item image upload' : 'Item image gallery upload',
        () => (imageFiles.length === 1
          ? queueStorefrontCatalogImage(itemId, imageFiles[0])
          : queueStorefrontCatalogImages(itemId, imageFiles))
      );

      // The queue call above only confirms the upload was accepted (HTTP 202,
      // {job_id, queued: true}) -- the backend worker
      // (catalogImageUploadWorker.js) still resizes/attaches the image in the
      // background afterwards. Without waiting here, finalizeCreatedItem's
      // loadItems() below fires immediately after this function returns and
      // commonly beats the worker, so the new item renders with no image
      // until a manual refresh or a pos.catalog.changed SSE event happens to
      // land. Mirrors handleGenerateEditImage's own
      // `await pollItemImageGeneration(itemId)` above, just against the
      // upload-status endpoint instead of the generation-status one -- same
      // hook, different readStatus.
      if (queuedImageUpload) {
        const uploadStatus = await pollCatalogImageUploadStatus(itemId);
        if (uploadStatus.status === 'failed') {
          toast.warning(`Item #${itemId} was created, but its image failed to process${uploadStatus.error_message ? `: ${uploadStatus.error_message}` : '.'} Try re-uploading it from Edit Item.`);
        } else if (uploadStatus.status === 'timeout') {
          toast.warning(`Item #${itemId} was created — its image is still processing and will appear shortly.`);
        }
        // 'completed': loadItems() below will already return the image, no
        // toast needed. 'cancelled': the workspace unmounted mid-poll.
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
      pos_visible: true
    }));

    if (failedStages.length > 0) {
      setPendingCreateRecovery({
        itemId,
        name: itemName,
        imageFiles,
        externalProductCode,
        requestedBarcodeCode: barcodeCode,
        posAlwaysAvailable,
        posBestSellerMode,
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
        const result = await runPostCreateStages({
          itemId: pendingCreateRecovery.itemId,
          itemName: recoveryName,
          imageFiles: pendingCreateRecovery.imageFiles || selectedImageFiles,
          externalProductCode: pendingCreateRecovery.externalProductCode || '',
          requestedBarcodeCode: pendingCreateRecovery.requestedBarcodeCode || '',
          posAlwaysAvailable: pendingCreateRecovery.posAlwaysAvailable,
          posBestSellerMode: pendingCreateRecovery.posBestSellerMode,
        });
        await finalizeCreatedItem({
          barcode: result.barcodeCode,
          action: 'created',
          warningMessage: `Post-create setup completed for item #${pendingCreateRecovery.itemId}.`
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
                    <div className="relative flex h-[4rem] w-[4rem] shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-slate-100 bg-gradient-to-br from-slate-50 to-slate-100 shadow-inner sm:h-[4.5rem] sm:w-[4.5rem]">
                      <ImagePlus className="h-5 w-5 text-slate-300" />
                      {imageSources.src ? (
                        <ResponsiveImage
                          sources={imageSources}
                          alt={item?.name || 'Item image'}
                          sizes="72px"
                          width={288}
                          height={288}
                          className="absolute h-full w-full object-cover"
                          fallbackSrcs={[imageSources.configuredLargeSrc].filter(Boolean)}
                        />
                      ) : null}
                    </div>
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

      {showCreateModal && typeof document !== 'undefined' && createPortal((
        <div
          className="pos-mobile-no-focus-zoom fixed inset-0 z-[9999] flex items-start justify-center overflow-hidden bg-slate-950/60 backdrop-blur-sm px-3 py-3 sm:items-center sm:px-4 sm:py-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pos-items-create-modal-title"
          onClick={closeCreate}
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
                    className={`flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/10 p-5 text-center transition-colors hover:bg-blue-50/20 ${(creatingItem || postCreateSaving) ? 'cursor-not-allowed opacity-50' : ''}`}
                  >
                    <Upload className="mx-auto h-10 w-10 text-blue-500" aria-hidden="true" />
                    <p className="mt-3 text-xs sm:text-sm font-semibold text-[#0F172A]">Add item images</p>
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
                            className={`flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-blue-200 bg-blue-50/10 p-4 text-center transition-colors hover:bg-blue-50/20 ${(savingItem || persistingEditAssets || editImageUploadJob || pendingEditImageRefresh) ? 'cursor-not-allowed opacity-50' : ''}`}
                          >
                            <Upload className="mx-auto h-9 w-9 text-blue-500" aria-hidden="true" />
                            <p className="mt-2.5 text-xs sm:text-sm font-semibold text-[#0F172A]">Add item images</p>
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
                            files={selectedEditImageFiles}
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

function CategoryManagementWorkspace() {
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [editor, setEditor] = useState(null);
  const [form, setForm] = useState({ name: '', description: '' });
  const [pendingAction, setPendingAction] = useState(null);

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
            is_active: folder?.is_active !== false
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
      .sort((left, right) => {
        if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
  }, [folders, query]);

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
          <div className="divide-y divide-slate-100">
            {filteredFolders.map((folder) => (
              <div key={folder.folder_id} className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
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
              </div>
            ))}
          </div>
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

export default function TerminalOperationsWorkspace({
  viewMode,
  workflowMode = '',
  isMsmeMode = false,
  terminalUser,
  refreshTerminalUser = async () => {},
  refreshTerminalMeta = async () => {},
  onPosSetupSaved = async () => {},
  onStorefrontSetupSaved = async () => {},
  onStorefrontContentStateChange = () => {},
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
  sectionIds = {},
  workspacePaneRef = null
}) {
  const restrictedMsmeModes = new Set(['location_scope', 'cash_drawer', 'terminal_setup']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;
  const isIncomingQueueView = effectiveViewMode === 'incoming_queue';
  const isSettingsView = SETTINGS_VIEW_MODES.has(effectiveViewMode);
  const canImportItems = IS_DGFY_POS_SURFACE && (
    terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('items:import')
  );
  const handleNavigateToOrders = useCallback(() => {
    if (typeof window === 'undefined') {
      onSelectViewMode('incoming_queue');
      return;
    }
    window.location.assign('/?view=incoming_queue');
  }, [onSelectViewMode]);

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
          onStorefrontContentStateChange={onStorefrontContentStateChange}
           onlineOrderSoundEnabled={onlineOrderSoundEnabled}
           setOnlineOrderSoundEnabled={setOnlineOrderSoundEnabled}
            onDeliveryPersonnelChanged={onDeliveryPersonnelChanged}
            onNavigateToOrders={handleNavigateToOrders}
            workspacePaneRef={workspacePaneRef}
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
    handleNavigateToOrders,
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
    onStorefrontContentStateChange,
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
    workspacePaneRef,
    viewMode
  ]);

  return (
    <WorkspaceShell
      icon={modeMeta.icon}
      title={modeMeta.title}
      subtitle={modeMeta.subtitle}
      terminalUser={terminalUser}
      locked={locked}
      bare={isSettingsView}
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
