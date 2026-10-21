import SettingsWorkspace from '../settings/PosSettingsWorkspace.jsx';
import PosDropdownSelect from './PosDropdownSelect.jsx';
import ItemsCatalogWorkspace from './PosItemsCatalogWorkspace.jsx';
import ItemsWorkspace from './PosItemsWorkspace.jsx';
import AdminBranchOrdersMonitor from './AdminBranchOrdersMonitor.jsx';
import AdminBranchShiftMonitor from './AdminBranchShiftMonitor.jsx';
import AdminOpenShiftOverview from './AdminOpenShiftOverview.jsx';
import ShiftSessionSummary from './ShiftSessionSummary.jsx';
import MerchantTenderReconciliationPanel from './MerchantTenderReconciliationPanel.jsx';
import { BranchDayClosePanel, CashierShiftClosePanel } from './ShiftSessionCloseoutPanels.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';
import PosShiftRefreshButton from './PosShiftRefreshButton.jsx';
import { formatCashierHistoryDateTime } from '../utils/cashierHistoryFormatters.js';
import {
  POS_SHIFT_PRIMARY_BUTTON_CLASS,
  POS_SHIFT_SECONDARY_BUTTON_CLASS
} from './posShiftButtonStyles.js';
import CashDrawerClosedState from './CashDrawerClosedState.jsx';
import CashDrawerEventForm from './CashDrawerEventForm.jsx';
import PosLineTabNavigation from './PosLineTabNavigation.jsx';
import PosSubtabNavigation from './PosSubtabNavigation.jsx';
import PosPageFrame from './PosPageFrame.jsx';
import {
  POS_MOBILE_STICKY_TAB_ROW_CLASS,
  POS_PAGE_CONTENT_STACK_CLASS
} from './PosPageSpacing.js';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lazyWithChunkRetry } from '../../../utils/chunkLoadRecovery.js';

import { AlertCircle, AlertTriangle, Banknote, BarChart3, CalendarDays, CircleDollarSign, ClipboardList, Eye, History, LogIn, Monitor, MapPinned, Percent, Receipt, RefreshCcw, Settings2, ShieldCheck, Store, UserRound, Tags, Ticket, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { isShiftOwnedByUserId, resolvePosUserId } from '../utils/shiftOwnership.js';
import { sanitizeTerminalId } from '../utils/terminalIdentity.js';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';




import { loadIncomingQueueWorkspace } from './terminalWorkspaceChunks.js';
import WorkspaceShell from './TerminalWorkspaceShell.jsx';
const IncomingQueueWorkspace = lazyWithChunkRetry(loadIncomingQueueWorkspace);
const PosServicesOperationsWorkspace = lazyWithChunkRetry(() => import('./PosServicesOperationsWorkspace.jsx'));
const PosReportsAnalyticsWorkspace = lazyWithChunkRetry(() => import('./PosReportsAnalyticsWorkspace.jsx'));
import CashierHistoryPanel from './CashierHistoryPanel.jsx';

import AffiliatesWorkspacePanel from './AffiliatesWorkspacePanel.jsx';
const VoucherManagementPanel = lazyWithChunkRetry(() => import('./VoucherManagementPanel.jsx'));
const PricelistManagementPanel = lazyWithChunkRetry(() => import('./PricelistManagementPanel.jsx'));

import { isIminWrapperRuntime } from '@/src/utils/iminRuntimeFeedback.js';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const SETTINGS_VIEW_MODES = new Set([
  'location_scope',
  'settings_profile',
  'settings_pos',
  'settings_storefront',
  'settings_affiliates',
  'terminal_setup'
]);
const SHIFT_WORKSPACE_MODES = new Set(['shift_controls', 'close_shift', 'cash_drawer']);
const SHIFT_TAB_ORDER = ['shift_location', 'close_shift', 'cash_drawer', 'cashier_history'];

const resolveShiftTabIndex = (tabId) => {
  const index = SHIFT_TAB_ORDER.indexOf(tabId);
  return index >= 0 ? index : 0;
};

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
    title: 'Terminal Setup',
    subtitle: 'Manage terminal registry, branch binding, queue scope, and local device preferences.'
  },
};

const money = (value) => Number(value || 0).toFixed(2);






const isValidOpeningCashAmount = (value) => {
  const rawValue = String(value ?? '').trim();
  const numericValue = Number(rawValue);
  return rawValue !== '' && Number.isFinite(numericValue) && numericValue >= 0;
};

const parseIsoDateTime = (value) => {
  if (!value) return '-';
  const formattedDateTime = formatCashierHistoryDateTime(value);
  return formattedDateTime === 'Not recorded' ? '-' : formattedDateTime;
};

function ShiftControlsWorkspace({
  shiftState,
  terminalMeta,
  terminalUser,
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
  canViewAdminLocationMonitor = false,
  viewingLocationId = null,
  setViewingLocationId = () => {},
  closeShiftForm,
  setCloseShiftForm,
  handleCloseShift,
  handleCloseDay = () => {},
  handleViewShiftSummary = () => {},
  handleViewXReading = () => {},
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
  branchDirectoryState = { loading: false, locations: [], scope: '', errorMessage: '' },
  branchViewLocationId = null,
  branchViewTransitionLoading = false,
  canViewBranchLocations = false,
  onViewBranch = async () => false,
  onExitBranchView = async () => {},
  refreshBranchDirectory = async () => null,
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
  const activeLocations = useMemo(
    () => locations.filter((location) => location?.is_active !== false),
    [locations]
  );
  const shiftLocationId = Number(shiftState?.shift?.location_id || 0) || null;
  const activeShift = shiftState?.shift || null;
  const [switchReason, setSwitchReason] = useState('');
  const [switchTargetLocationId, setSwitchTargetLocationId] = useState(
    shiftLocationId ? String(shiftLocationId) : ''
  );
  const [switchTargetTerminalId, setSwitchTargetTerminalId] = useState('');
  const [switchClosingCashAmount, setSwitchClosingCashAmount] = useState('');
  const [switchOpeningFloatAmount, setSwitchOpeningFloatAmount] = useState('');
  const [switchConflict, setSwitchConflict] = useState(null);
  const [requestedAdminTerminalId, setRequestedAdminTerminalId] = useState('');
  const [pendingAdminTerminalId, setPendingAdminTerminalId] = useState('');
  const [staleRecoveryShift, setStaleRecoveryShift] = useState(null);
  const [staleRecoveryForm, setStaleRecoveryForm] = useState({
    closingCashAmount: '',
    reason: ''
  });
  const [adminShiftLocationTab, setAdminShiftLocationTab] = useState('terminals');
  const [activeTab, setActiveTab] = useState(initialTab);
  const [renderedTab, setRenderedTab] = useState(initialTab);
  const [paneInlineStyle, setPaneInlineStyle] = useState({
    transform: 'translateX(0)',
    opacity: 1,
    transition: 'transform 150ms ease, opacity 150ms ease'
  });
  const animationTimersRef = useRef([]);
  const previousInitialTabRef = useRef(initialTab);
  const isIminRuntime = isIminWrapperRuntime();
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
  const switchLocationTerminals = useMemo(
    () => activeTerminals.filter(
      (entry) => Number(entry?.location_id || 0) === Number(switchTargetLocationId || 0)
    ),
    [activeTerminals, switchTargetLocationId]
  );
  const terminalMonitorLocationId = Number(viewingLocationId || operatingLocationId || 0) || null;
  const terminalMonitorStateMatchesLocation = terminalMonitorLocationId > 0
    && Number(adminLocationMonitorState?.locationId || 0) === terminalMonitorLocationId;
  const terminalAvailabilityErrorMessage = terminalMonitorStateMatchesLocation
    ? String(adminLocationMonitorState?.errorMessage || '')
    : '';
  const terminalAvailabilityReady = terminalMonitorStateMatchesLocation
    && !adminLocationMonitorState?.loading
    && !terminalAvailabilityErrorMessage;
  const terminalAvailabilityLabel = terminalAvailabilityReady
    ? 'Available'
    : terminalAvailabilityErrorMessage
      ? 'Availability unavailable'
      : 'Checking availability…';
  const openTerminalShiftById = useMemo(() => {
    if (!terminalAvailabilityReady) return new Map();
    const shifts = Array.isArray(adminLocationMonitorState?.terminalShifts)
      ? adminLocationMonitorState.terminalShifts
      : [];
    return new Map(shifts.map((shift) => [sanitizeTerminalId(shift?.terminal_id), shift]));
  }, [adminLocationMonitorState, terminalAvailabilityReady]);
  const currentTerminalId = sanitizeTerminalId(activeTerminalId);
  const currentTerminalMatches = locationTerminals.some(
    (entry) => sanitizeTerminalId(entry?.terminal_id) === currentTerminalId
  );
  const requestedTerminalMatches = locationTerminals.some(
    (entry) => sanitizeTerminalId(entry?.terminal_id) === sanitizeTerminalId(requestedAdminTerminalId)
  );
  const selectedAdminTerminalId = requestedTerminalMatches
    ? requestedAdminTerminalId
    : (currentTerminalMatches ? currentTerminalId : '');
  const activeTerminalRegistryEntry = activeTerminals.find(
    (entry) => (
      sanitizeTerminalId(entry?.terminal_id) === currentTerminalId
      && Number(entry?.location_id || 0) === Number(operatingLocationId || 0)
    )
  );
  const operatingLocation = activeLocations.find(
    (location) => Number(location?.location_id || 0) === Number(operatingLocationId || 0)
  );
  const operatingLocationLabel = operatingLocation?.name
    || (operatingLocationId ? `Branch #${operatingLocationId}` : 'Not selected');
  const currentRegisterTerminalId = sanitizeTerminalId(activeShift?.terminal_id || activeTerminalId);
  const currentRegisterTerminal = activeTerminals.find(
    (entry) => sanitizeTerminalId(entry?.terminal_id) === currentRegisterTerminalId
  );
  const currentRegisterTerminalLabel = currentRegisterTerminal?.label
    || currentRegisterTerminalId
    || 'Not selected';
  const signedInCashierLabel = terminalUser?.display_name
    || terminalUser?.name
    || terminalUser?.username
    || terminalUser?.email
    || 'Current cashier';
  const activeTerminalMatchesOperatingLocation = !canAdminBypassShiftPrompt || Boolean(
    activeTerminalRegistryEntry
  );
  const selectedTerminalShift = openTerminalShiftById.get(String(selectedAdminTerminalId || '').trim()) || null;
  const selectedTerminalShiftOwnedByCurrentUser = isShiftOwnedByUserId(
    selectedTerminalShift,
    operatorUserId
  );
  const branchMonitorLocationId = terminalMonitorLocationId;
  const branchMonitorLocationName = locations.find(
    (location) => Number(location?.location_id || 0) === branchMonitorLocationId
  )?.name || (branchMonitorLocationId ? `Branch #${branchMonitorLocationId}` : 'Selected branch');
  const branchMonitorOrders = Array.isArray(adminLocationMonitorState?.orders)
    && Number(adminLocationMonitorState?.locationId || 0) === branchMonitorLocationId
    ? adminLocationMonitorState.orders
    : [];
  const branchMonitorStateMatchesLocation = terminalMonitorStateMatchesLocation;
  const branchMonitorLoading = !branchMonitorStateMatchesLocation || Boolean(adminLocationMonitorState?.loading);
  const branchMonitorErrorMessage = branchMonitorStateMatchesLocation
    ? String(adminLocationMonitorState?.errorMessage || '')
    : '';
  const branchTerminalShifts = Array.isArray(adminLocationMonitorState?.terminalShifts)
    && Number(adminLocationMonitorState?.locationId || 0) === branchMonitorLocationId
    ? adminLocationMonitorState.terminalShifts
    : [];
  const branchOrdersTabCount = Number(adminLocationMonitorState?.locationId || 0) > 0
    && Number(adminLocationMonitorState?.locationId || 0) === branchMonitorLocationId
    && !adminLocationMonitorState?.loading
    && !adminLocationMonitorState?.errorMessage
    ? branchMonitorOrders.length
    : null;
  const isBranchReadOnlyView = Boolean(branchViewLocationId);
  const switchTargetLocation = activeLocations.find(
    (location) => Number(location?.location_id || 0) === Number(switchTargetLocationId || 0)
  );
  const switchTargetTerminal = switchLocationTerminals.find(
    (entry) => String(entry?.terminal_id || '').trim() === String(switchTargetTerminalId || '').trim()
  );
  const SHIFT_TABS = [
    { id: 'shift_location', label: 'Shift Location', icon: MapPinned },
    { id: 'close_shift', label: 'Shift Session', icon: ShieldCheck },
    { id: 'cash_drawer', label: 'Cash Drawer', icon: Banknote },
    { id: 'cashier_history', label: 'Cashier History', icon: History }
  ];
  const ADMIN_SHIFT_LOCATION_TABS = [
    {
      id: 'terminals',
      label: 'Branch Terminals',
      mobileLabel: 'Terminals',
      icon: Monitor,
      testId: 'pos-admin-shift-location-terminals-tab'
    },
    {
      id: 'shift_monitor',
      label: 'Shift Monitor',
      mobileLabel: 'Monitor',
      icon: History,
      testId: 'pos-admin-shift-location-shifts-tab'
    },
    {
      id: 'orders',
      label: branchOrdersTabCount === null ? 'Branch Orders' : `Branch Orders (${branchOrdersTabCount})`,
      mobileLabel: branchOrdersTabCount === null ? 'Orders' : `Orders (${branchOrdersTabCount})`,
      icon: ClipboardList,
      testId: 'pos-admin-shift-location-orders-tab'
    }
  ];
  const visibleShiftTabs = isBranchReadOnlyView
    ? SHIFT_TABS.filter((tab) => tab.id === 'shift_location')
    : SHIFT_TABS;
  const shiftTabIdPrefix = `${sectionId || 'pos-shift-controls'}-tab`;
  const shiftPanelId = `${sectionId || 'pos-shift-controls'}-panel`;
  const selectedShiftTabId = visibleShiftTabs.some((tab) => tab.id === activeTab)
    ? activeTab
    : (visibleShiftTabs[0]?.id || activeTab);
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
    setSwitchTargetLocationId(shiftLocationId ? String(shiftLocationId) : '');
    setSwitchTargetTerminalId('');
    setSwitchClosingCashAmount('');
    setSwitchOpeningFloatAmount('');
    setSwitchConflict(null);
    setSwitchReason('');
  }, [shiftLocationId, activeShift?.pos_terminal_shift_id]);

  const handleTabChange = useCallback((nextTab) => {
    if (isBranchReadOnlyView && nextTab !== 'shift_location') return;
    if (!nextTab || nextTab === activeTab) return;
    clearAnimationTimers();

    if (isIminRuntime) {
      setActiveTab(nextTab);
      setRenderedTab(nextTab);
      setPaneInlineStyle({
        transform: 'translateX(0)',
        opacity: 1,
        transition: 'none'
      });
      return;
    }

    const movingForward = resolveShiftTabIndex(nextTab) > resolveShiftTabIndex(activeTab);
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
  }, [activeTab, clearAnimationTimers, isBranchReadOnlyView, isIminRuntime]);

  const summaryRows = activeShift ? [
    {
      icon: ClipboardList,
      label: 'Shift ID',
      value: `#${activeShift.pos_terminal_shift_id}`,
      group: 'details'
    },
    {
      icon: UserRound,
      label: 'Cashier',
      value: shiftCashierLabel,
      group: 'details'
    },
    {
      icon: CalendarDays,
      label: 'Business date',
      value: activeShift.business_date || '-',
      group: 'details'
    },
    {
      icon: AlertCircle,
      label: 'Opened at',
      value: parseIsoDateTime(activeShift.opened_at),
      group: 'details',
      mobileSpan: 'full'
    },
    {
      icon: MapPinned,
      label: 'Branch',
      value: shiftLocationLabel,
      group: 'details'
    },
    {
      icon: Monitor,
      label: 'Register',
      value: activeShift.terminal_id || activeTerminalId || 'Unassigned',
      group: 'details'
    },
    {
      icon: CircleDollarSign,
      label: 'Opening float',
      value: `${terminalMeta.pettyCashSymbol} ${money(activeShift.opening_float_amount)}`,
      group: 'financial'
    },
    {
      icon: Receipt,
      label: 'Shift cash sales',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.cash_sales_amount)}`,
      group: 'financial'
    },
    {
      icon: Receipt,
      label: 'Total gross sales',
      value: shiftState.salesSummary?.subtotal_amount == null
        ? '—'
        : `${terminalMeta.pettyCashSymbol} ${money(shiftState.salesSummary.subtotal_amount)}`,
      group: 'financial'
    },
    {
      icon: Banknote,
      label: 'Expected in drawer',
      value: `${terminalMeta.pettyCashSymbol} ${money(shiftState.cashSummary?.expected_cash_amount)}`,
      group: 'financial',
      highlight: true
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

  const renderAdminBranchContext = (section = 'terminals', refreshAction = null) => {
    if (!canAdminBypassShiftPrompt) return null;

    return (
      <>
        {section === 'open_shift' ? (
          <>
        <section
          aria-labelledby="pos-admin-open-shift-terminal-heading"
          data-testid="pos-admin-open-shift-terminal"
          className="min-w-0 space-y-3"
        >
          <div className="space-y-1">
            <h2 id="pos-admin-open-shift-terminal-heading" className="text-base font-extrabold tracking-tight text-[#0F172A]">
              Select a terminal
            </h2>
            {canViewBranchLocations ? (
              <p className="text-xs leading-4 text-[#475569]">
                Check availability in Branch Terminals, then confirm the terminal here.
              </p>
            ) : null}
          </div>
          {!canViewBranchLocations ? (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="admin-operating-location" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                  Register Branch
                </Label>
                <PosDropdownSelect
                  id="admin-operating-location"
                  ariaLabel="Register Branch"
                  value={operatingLocationId || ''}
                  onChange={(nextValue) => {
                    const selectedLocationId = nextValue ? Number(nextValue) : null;
                    setRequestedAdminTerminalId('');
                    setPendingAdminTerminalId('');
                    setOperatingLocationId(selectedLocationId);
                  }}
                  options={activeLocations.map((location) => ({
                    value: location.location_id,
                    label: location.name
                  }))}
                  listboxLabel="Register Branch options"
                />
                <p className="text-[11px] leading-4 text-[#475569]">
                  Monitor only. Selecting a terminal won’t open or grant access to another cashier’s shift.
                </p>
              </div>
            </>
          ) : null}

          {canViewAdminLocationMonitor && !canViewBranchLocations ? (
            <div className="space-y-1.5">
              <Label htmlFor="admin-viewing-location" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
                Viewing Branch
              </Label>
              <PosDropdownSelect
                id="admin-viewing-location"
                ariaLabel="Viewing Branch"
                value={viewingLocationId || operatingLocationId || ''}
                onChange={(nextValue) => setViewingLocationId(nextValue ? Number(nextValue) : null)}
                options={activeLocations.map((location) => ({
                  value: location.location_id,
                  label: location.name
                }))}
                listboxLabel="Viewing Branch options"
              />
              <p className="text-[11px] leading-4 text-[#475569]">
                View orders and shifts only; the register branch stays unchanged.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="admin-operating-terminal" className="block text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
              Branch Terminal
            </Label>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <PosDropdownSelect
                id="admin-operating-terminal"
                ariaLabel="Branch Terminal"
                value={selectedAdminTerminalId}
                onChange={setRequestedAdminTerminalId}
                disabled={adminTerminalSwitching || !isOnline || locationTerminals.length === 0 || !terminalAvailabilityReady}
                placeholder="Select an available terminal"
                listboxLabel="Branch Terminal options"
                options={locationTerminals.map((entry) => {
                  const terminalId = sanitizeTerminalId(entry?.terminal_id);
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
                    : terminalAvailabilityLabel;
                  return {
                    value: terminalId,
                    label: `${entry?.label ? `${entry.label} (${terminalId})` : terminalId} - ${occupancyLabel}`,
                    disabled: !terminalAvailabilityReady || (Boolean(occupiedShift) && !ownedByCurrentUser)
                  };
                })}
              />
              <Button
                type="button"
                variant="outline"
                className={`min-h-11 w-full rounded-lg px-4 text-[13px] font-extrabold sm:w-auto ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                disabled={
                  adminTerminalSwitching
                  || !isOnline
                  || !selectedAdminTerminalId
                  || !terminalAvailabilityReady
                  || (Boolean(selectedTerminalShift) && !selectedTerminalShiftOwnedByCurrentUser)
                  || (
                    activeTerminalMatchesOperatingLocation
                    && String(selectedAdminTerminalId) === String(activeTerminalId || '').trim()
                  )
                }
                onClick={() => setPendingAdminTerminalId(selectedAdminTerminalId)}
              >
                <Monitor className="mr-2 h-4 w-4" aria-hidden="true" />
                {adminTerminalSwitching ? 'Selecting Terminal...' : 'Use Selected Terminal'}
              </Button>
            </div>
          </div>

          {locationTerminals.length === 0 ? (
            <p className="text-[11px] text-amber-700">
              No active terminal here. Add one in POS Setup.
            </p>
          ) : null}
          {!activeTerminalMatchesOperatingLocation ? (
            <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
              Select and confirm a terminal in this branch before opening a shift.
            </p>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" aria-hidden="true" />
              Current terminal: {String(activeTerminalId || '').trim() || 'Not selected'}
            </p>
          )}
          {canAdminBypassShiftPrompt && !terminalAvailabilityReady ? (
            <p
              className={`rounded-md border px-2.5 py-2 text-[11px] leading-4 ${terminalAvailabilityErrorMessage
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-800'}`}
              role={terminalAvailabilityErrorMessage ? 'alert' : 'status'}
            >
              {terminalAvailabilityErrorMessage
                ? 'Terminal availability could not be verified. Refresh branch terminal data before opening a shift.'
                : 'Checking terminal availability. Opening a shift will be enabled after the branch monitor confirms the terminal state.'}
            </p>
          ) : null}
        </section>
          </>
        ) : null}

        {section === 'shift_monitor' ? (
          <AdminBranchShiftMonitor
            shifts={branchTerminalShifts}
            loading={adminLocationMonitorState?.loading}
            errorMessage={adminLocationMonitorState?.errorMessage}
            canRecoverStaleShifts={canRecoverStaleShifts}
            isOnline={isOnline}
            recoveryLoading={shiftActionLoading?.staleRecovery}
            onRecoverShift={openStaleRecoveryDialog}
            formatDateTime={parseIsoDateTime}
            refreshAction={refreshAction}
          />
        ) : null}

        {section === 'orders' ? (
          <AdminBranchOrdersMonitor
            orders={branchMonitorOrders}
            branchName={branchMonitorLocationName}
            loading={adminLocationMonitorState?.loading}
            errorMessage={adminLocationMonitorState?.errorMessage}
            formatDateTime={parseIsoDateTime}
            refreshAction={refreshAction}
          />
        ) : null}
      </>
    );
  };

  const renderBranchDirectory = ({ compact = false } = {}) => {
    if (!canViewBranchLocations) return null;

    const branchLocations = Array.isArray(branchDirectoryState?.locations)
      ? branchDirectoryState.locations
      : [];
    const branchViewMonitorRefreshing = Boolean(
      branchViewLocationId
      && Number(adminLocationMonitorState?.locationId || 0) === Number(branchViewLocationId)
      && adminLocationMonitorState?.loading
    );
    const isRefreshing = Boolean(branchDirectoryState?.loading || branchViewMonitorRefreshing);
    const branchViewOrders = branchViewLocationId
      ? branchMonitorOrders.slice(0, 6)
      : [];

    return (
      <section
        data-testid="pos-branch-directory"
        className={compact ? 'mt-4' : (branchViewLocationId ? 'space-y-3' : 'mt-4 rounded-xl border border-blue-100 bg-blue-50/30 p-3')}
      >
        {!compact ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-start gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]">
                <MapPinned className="h-4.5 w-4.5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-black text-[#0F172A]">Locations</p>
                <p className="mt-1 text-[11px] leading-4 text-[#475569]">
                  Authorized branches · View-only.
                </p>
              </div>
            </div>
            <PosShiftRefreshButton
              label="Refresh branch locations"
              onClick={() => {
                void refreshBranchDirectory?.();
                if (branchViewLocationId) void refreshAdminLocationMonitor?.({ silent: false });
              }}
              disabled={isRefreshing || !isOnline}
              loading={isRefreshing}
            />
          </div>
        ) : null}

        {branchDirectoryState?.errorMessage ? (
          <PosShiftStateNotice variant="error" message={branchDirectoryState.errorMessage} compact className="mt-3" />
        ) : branchDirectoryState?.loading && branchLocations.length === 0 ? (
          <PosShiftStateNotice variant="loading" message="Loading branches…" compact className="mt-3" />
        ) : branchLocations.length === 0 ? (
          <PosShiftStateNotice variant="empty" message="No authorized branches available." compact className="mt-3" />
        ) : (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {branchLocations.map((location) => {
              const locationId = Number(location?.location_id || 0);
              const terminals = Array.isArray(location?.terminals) ? location.terminals : [];
              const occupiedTerminals = terminals.filter(
                (terminal) => terminal?.status === 'occupied' || terminal?.status === 'stale'
              );
              const hasActiveShift = occupiedTerminals.length > 0;
              const allTerminalsOccupied = terminals.length > 0 && occupiedTerminals.length === terminals.length;
              const firstAvailableTerminal = terminals.find((terminal) => terminal?.can_open === true);
              const activeTerminalKey = sanitizeTerminalId(activeTerminalId);
              const firstAvailableTerminalKey = sanitizeTerminalId(firstAvailableTerminal?.terminal_id);
              const canUseCurrentTerminal = Boolean(
                firstAvailableTerminalKey
                && activeTerminalKey
                && firstAvailableTerminalKey === activeTerminalKey
                && Number(activeTerminalRegistryEntry?.location_id || 0) === locationId
              );
              const isViewing = Number(branchViewLocationId || 0) === locationId;
              return (
                <article
                  key={`pos-branch-directory-${locationId}`}
                  className={`rounded-xl border p-3 sm:p-3.5 ${allTerminalsOccupied ? 'border-slate-300 bg-slate-100/90' : 'border-slate-200 bg-white'} ${isViewing ? 'border-blue-300 shadow-sm shadow-blue-100/70' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[12px] font-black text-[#0F172A]">{location.name}</p>
                      <p className="mt-1 text-[11px] text-slate-600">
                        {location.open_shift_count || 0} active shift{Number(location.open_shift_count || 0) === 1 ? '' : 's'}
                        {' · '}{location.is_open === false ? 'Closed' : 'Open'}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${
                      isViewing
                        ? 'border-blue-200 bg-blue-700 text-white'
                        : allTerminalsOccupied
                          ? 'border-slate-300 bg-slate-200 text-slate-700'
                          : hasActiveShift
                            ? 'border-amber-200 bg-amber-50 text-amber-800'
                            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    }`}>
                      {isViewing
                        ? 'Viewing'
                        : allTerminalsOccupied
                          ? 'In use'
                          : hasActiveShift
                            ? 'Partially in use'
                            : 'Available'}
                    </span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {terminals.length === 0 ? (
                      <p className="rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800">
                        No active terminal here.
                      </p>
                    ) : terminals.map((terminal) => {
                      const shiftOwner = terminal?.shift?.cashier?.display_name || 'No shift owner';
                      const terminalIsOccupied = terminal?.status === 'occupied' || terminal?.status === 'stale';
                      const currentOperator = terminal?.current_operator?.display_name
                        || terminal?.current_operator?.username
                        || '';
                      const activeCashier = currentOperator
                        || (terminalIsOccupied
                          ? (terminal?.current_operator_status === 'unavailable' ? 'Status unavailable' : 'Not signed in')
                          : '');
                      const terminalStatus = terminal.status === 'stale'
                        ? 'Stale'
                        : (terminal.status === 'occupied' ? 'In use' : 'Available');
                      return (
                        <div
                          key={`${locationId}-${terminal.terminal_id}`}
                          className={`flex items-start justify-between gap-3 rounded-lg border px-3 py-2.5 ${terminalIsOccupied ? 'border-slate-300 bg-slate-200/80' : 'border-emerald-100 bg-emerald-50/40'}`}
                        >
                          <div className="flex min-w-0 items-start gap-2.5">
                            <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-white/80 text-[#1A4E8D]" aria-hidden="true">
                              <Monitor className="h-3.5 w-3.5" />
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-[11px] font-black text-[#0F172A]">
                                {terminal.label || terminal.terminal_id}
                              </p>
                              <p className="mt-0.5 truncate text-[10px] text-slate-600">
                                {terminalIsOccupied ? `Shift cashier: ${shiftOwner}` : 'No active shift'}
                              </p>
                              {activeCashier ? (
                                <p className={`mt-0.5 truncate text-[10px] ${terminal?.current_operator_status === 'unavailable' ? 'text-amber-700' : 'text-slate-600'}`}>
                                  Active cashier: {activeCashier}
                                </p>
                              ) : null}
                              {terminal.reason_code ? (
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  {String(terminal.reason_code).replace(/^POS_/, '').replace(/_/g, ' ').toLowerCase()}
                                </p>
                              ) : null}
                            </div>
                          </div>
                          <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-extrabold ${
                            terminal.status === 'stale'
                              ? 'bg-rose-100 text-rose-800'
                              : (terminal.status === 'occupied'
                                ? 'bg-amber-100 text-amber-900'
                                : 'bg-emerald-100 text-emerald-800')
                          }`}>
                            {terminalStatus}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-col gap-2">
                    {isViewing ? (
                      <span
                        className={`inline-flex min-h-10 w-full items-center justify-center rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                        aria-current="location"
                        data-testid={`pos-view-branch-${locationId}`}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Viewing this branch
                      </span>
                    ) : (
                      <Button
                        type="button"
                        variant="outline"
                        className={`h-10 w-full justify-center rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                        onClick={() => onViewBranch?.({ locationId })}
                        disabled={!location.can_view || !isOnline}
                        data-testid={`pos-view-branch-${locationId}`}
                      >
                        <Eye className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        View Branch
                      </Button>
                    )}
                    {location.can_open && canOpenShift && firstAvailableTerminal && canUseCurrentTerminal && !activeShift ? (
                      <Button
                        type="button"
                        className={`h-10 w-full justify-center rounded-lg px-3 text-xs font-extrabold ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
                        onClick={async () => {
                          if (branchViewLocationId) await onExitBranchView?.({ returnMode: 'shift_controls' });
                          setOperatingLocationId(locationId);
                          setViewingLocationId(null);
                          setRequestedAdminTerminalId(String(firstAvailableTerminal.terminal_id || '').trim());
                          handleTabChange('close_shift');
                        }}
                        data-testid={`pos-prepare-open-shift-${locationId}`}
                      >
                        <Monitor className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                        Open Shift
                      </Button>
                    ) : location.can_open && canOpenShift && firstAvailableTerminal && !activeShift ? (
                      <p className="w-full rounded-lg border border-blue-100 bg-blue-50 px-2.5 py-2 text-[10px] leading-4 text-blue-800">
                        Select terminal {firstAvailableTerminal.label || firstAvailableTerminal.terminal_id} in Terminal Setup before opening this branch.
                      </p>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {branchViewLocationId ? (
          <section
            className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4"
            aria-busy={branchMonitorLoading || undefined}
            aria-labelledby="pos-branch-view-orders-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-50 text-[#1A4E8D]" aria-hidden="true">
                  <ClipboardList className="h-4 w-4" />
                </span>
                <h3 id="pos-branch-view-orders-heading" className="text-xs font-black text-slate-800">Active online orders</h3>
              </div>
              {!branchMonitorLoading && !branchMonitorErrorMessage ? (
                <span className="shrink-0 text-xs font-semibold text-slate-500">
                  {branchMonitorOrders.length} active
                </span>
              ) : null}
            </div>
            {!branchMonitorErrorMessage && branchMonitorLoading && branchMonitorOrders.length > 0 ? (
              <PosShiftStateNotice variant="loading" message="Refreshing orders…" compact className="mt-3" />
            ) : null}
            {branchMonitorErrorMessage ? (
              <PosShiftStateNotice
                variant="error"
                title={branchMonitorOrders.length > 0 ? 'Refresh failed — showing last results' : ''}
                message={branchMonitorErrorMessage}
                actionLabel="Try again"
                onAction={() => void refreshAdminLocationMonitor?.({ silent: false })}
                actionDisabled={!isOnline || locked}
                compact
                className="mt-3"
              />
            ) : branchMonitorLoading && branchMonitorOrders.length === 0 ? (
              <PosShiftStateNotice variant="loading" message="Loading orders…" compact className="mt-3" />
            ) : branchMonitorOrders.length === 0 ? (
              <PosShiftStateNotice variant="empty" message="No active online orders." compact className="mt-3" />
            ) : (
              <div className="mt-3 space-y-2">
                {branchViewOrders.map((order) => (
                  <div key={`branch-view-order-${order.pos_transaction_id}`} className="flex min-w-0 items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2.5 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D]" aria-hidden="true">
                        <UserRound className="h-4 w-4" />
                      </span>
                      <span className="truncate text-xs font-bold text-slate-800">{order.customer_name || 'Guest Buyer'}</span>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-200/70 px-2.5 py-1 text-[10px] font-bold capitalize text-slate-700">
                      {String(order.fulfillment_status || 'placed').replace(/_/g, ' ')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : null}
      </section>
    );
  };

  const renderCurrentRegisterCard = () => {
    if (canViewBranchLocations || canAdminBypassShiftPrompt) return null;

    return (
      <section
        className="rounded-xl border border-blue-100 bg-blue-50/40 p-3 shadow-sm shadow-blue-100/60"
        data-testid="pos-current-register-card"
        aria-labelledby="pos-current-register-card-heading"
      >
        <div className="flex items-start gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-[#1A4E8D]">
            <MapPinned className="h-4.5 w-4.5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="pos-current-register-card-heading" className="text-[13px] font-black text-[#0F172A]">
              Current register
            </h2>
            <p className="mt-1 text-[11px] leading-4 text-[#475569]">
              This cashier can operate only in the assigned branch and terminal.
            </p>
          </div>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Branch</p>
            <p className="mt-1 truncate text-[12px] font-black text-[#0F172A]">{activeShift ? shiftLocationLabel : operatingLocationLabel}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Terminal</p>
            <p className="mt-1 truncate text-[12px] font-black text-[#0F172A]">{currentRegisterTerminalLabel}</p>
          </div>
          <div className="rounded-lg border border-blue-100 bg-white/80 px-3 py-2.5">
            <p className="text-[10px] font-extrabold uppercase tracking-wide text-slate-500">Cashier</p>
            <p className="mt-1 truncate text-[12px] font-black text-[#0F172A]">{signedInCashierLabel}</p>
          </div>
        </div>

        <div className={`mt-2 rounded-lg px-3 py-2 text-[11px] font-extrabold ${activeShift ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
          {activeShift ? 'Open shift' : 'No active shift'}
        </div>
      </section>
    );
  };

  const renderOpeningShiftControls = () => (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="shift-opening-float-amount" className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
          Opening Float ({terminalMeta.pettyCashSymbol})
        </Label>
        <div className="relative">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm font-bold text-slate-400" aria-hidden="true">
            {terminalMeta.pettyCashSymbol}
          </span>
          <Input
            id="shift-opening-float-amount"
            className="h-11 rounded-lg border-slate-200 bg-[#F1F2FF] pl-14 text-[15px] font-extrabold tabular-nums text-[#0F172A] placeholder:text-slate-500 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
            type="number"
            min="0"
            step="0.01"
            required
            value={openShiftForm.openingFloatAmount}
            onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingFloatAmount: event.target.value }))}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="shift-opening-note" className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600">
          Opening Note (Optional)
        </Label>
        <Input
          id="shift-opening-note"
          className="h-11 rounded-lg border-slate-200 bg-[#F1F2FF] text-[13px] font-medium text-[#0F172A] placeholder:text-slate-500 focus-visible:border-[#1A4E8D] focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/20"
          value={openShiftForm.openingNote}
          onChange={(event) => setOpenShiftForm((prev) => ({ ...prev, openingNote: event.target.value }))}
          placeholder="Opening shift cash note"
        />
      </div>
      <Button
        type="button"
        className={`h-11 w-full rounded-lg px-5 text-[13px] font-extrabold sm:w-auto ${POS_SHIFT_PRIMARY_BUTTON_CLASS}`}
        onClick={handleOpenShift}
        disabled={
          shiftActionLoading.open
          || locked
          || !canRenderAdminShiftOpen
          || !isOnline
          || !activeTerminalMatchesOperatingLocation
          || (canAdminBypassShiftPrompt && !terminalAvailabilityReady)
          || (Boolean(selectedTerminalShift) && !selectedTerminalShiftOwnedByCurrentUser)
        }
        aria-busy={shiftActionLoading.open || undefined}
      >
        <LogIn className="mr-2 h-4 w-4" aria-hidden="true" />
        {shiftActionLoading.open ? 'Opening Shift...' : 'Open Shift'}
      </Button>
      {!canRenderAdminShiftOpen && canAdminBypassShiftPrompt ? (
        <p className="text-[11px] text-slate-500">Admin view only. POS transact permission is required to open a shift.</p>
      ) : !canRenderAdminShiftOpen ? (
        <p className="text-[11px] text-slate-500">You need POS transact permission to open shifts.</p>
      ) : null}
      {canAdminBypassShiftPrompt && !activeTerminalMatchesOperatingLocation ? (
        <p className="text-[11px] text-amber-700">Confirm a terminal in this branch to open a shift.</p>
      ) : null}
      {!isOnline ? <p className="text-[11px] text-amber-700">Reconnect before opening a shift.</p> : null}
    </div>
  );

  const renderOpeningShiftPanel = ({ canOpen = true, blockingMessage = null, testId } = {}) => (
    <section
      aria-labelledby="pos-open-shift-form-heading"
      data-testid={testId || 'pos-open-shift-form'}
      className="min-w-0 border-t border-slate-200 pt-5"
    >
      <h3 id="pos-open-shift-form-heading" className="sr-only">Start Shift</h3>
      {canOpen ? renderOpeningShiftControls() : (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-5 text-amber-900">
          {blockingMessage}
        </p>
      )}
    </section>
  );

  const refreshAdminShiftLocationData = (tab = adminShiftLocationTab) => {
    if (tab === 'terminals') {
      void refreshBranchDirectory?.();
      if (!locked) void refreshOperationalContext?.();
      return;
    }
    void refreshAdminLocationMonitor?.();
  };

  const renderAdminShiftLocationTabs = (branchTerminalsContent) => {
    const isTerminalsTab = adminShiftLocationTab === 'terminals';
    const refreshLoading = isTerminalsTab
      ? Boolean(branchDirectoryState?.loading || (!locked && shiftState?.loading))
      : Boolean(adminLocationMonitorState?.loading);
    const refreshAction = (
      <PosShiftRefreshButton
        label={isTerminalsTab ? 'Refresh terminal and shift data' : 'Refresh branch activity'}
        dataTestId="pos-admin-shift-location-refresh"
        onClick={() => refreshAdminShiftLocationData(adminShiftLocationTab)}
        disabled={!isOnline}
        loading={refreshLoading}
      />
    );
    const activeContent = adminShiftLocationTab === 'terminals'
      ? branchTerminalsContent
      : adminShiftLocationTab === 'orders'
        ? renderAdminBranchContext('orders', refreshAction)
        : renderAdminBranchContext('shift_monitor', refreshAction);
    return (
      <div className={`${POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6`}>
        <div className="flex min-w-0 flex-col gap-2">
          <div className="min-w-0">
            <PosSubtabNavigation
              tabs={ADMIN_SHIFT_LOCATION_TABS}
              activeTab={adminShiftLocationTab}
              onTabChange={setAdminShiftLocationTab}
              ariaLabel="Admin shift location sections"
              idPrefix="pos-admin-shift-location"
              panelId="pos-admin-shift-location-panel"
              desktopColumns={3}
              mobileGridColumns={3}
              compactMobile
            />
          </div>
          {isTerminalsTab && !canViewBranchLocations ? (
            <div className="flex justify-end">
              {refreshAction}
            </div>
          ) : null}
        </div>
        <section
          id="pos-admin-shift-location-panel"
          role="tabpanel"
          aria-labelledby={`pos-admin-shift-location-${adminShiftLocationTab}`}
          tabIndex={0}
          data-testid="pos-admin-shift-location-tabpanel"
          className="min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]"
        >
          {activeContent}
        </section>
      </div>
    );
  };

  const renderShiftLocationPane = () => {
    if (branchViewLocationId) {
      if (branchViewTransitionLoading) {
        return (
          <div
            className="min-w-0 rounded-xl bg-[#F7F7FF] p-3 sm:p-4"
            data-testid="pos-branch-view-loading"
            role="status"
            aria-live="polite"
            aria-busy="true"
          >
            <div className="flex items-center gap-2.5 text-sm font-extrabold text-[#1A4E8D]">
              <RefreshCcw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
              Loading branch view…
            </div>
            <div aria-hidden="true" className="mt-4 grid gap-3 md:grid-cols-2">
              {[0, 1].map((placeholder) => (
                <div key={`branch-view-skeleton-${placeholder}`} className="rounded-xl border border-slate-200 bg-white p-3.5">
                  <div className="h-4 w-2/5 animate-pulse rounded bg-slate-200 motion-reduce:animate-none" />
                  <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
                  <div className="mt-4 h-12 animate-pulse rounded-lg bg-[#F1F2FF] motion-reduce:animate-none" />
                  <div className="mt-3 h-10 animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
                </div>
              ))}
            </div>
            <div aria-hidden="true" className="mt-3 h-14 animate-pulse rounded-xl bg-white motion-reduce:animate-none" />
          </div>
        );
      }

      return (
        <div className="min-w-0">
          {renderBranchDirectory()}
        </div>
      );
    }
    if (!activeShift) {
      const closedShiftNotice = shiftState?.loading ? (
        <PosShiftStateNotice variant="loading" message="Checking current shift status..." compact />
      ) : shiftState?.errorMessage ? (
        <PosShiftStateNotice
          variant="error"
          title="Shift status is unavailable"
          message={shiftState.errorMessage}
          actionLabel="Try again"
          onAction={() => void refreshOperationalContext()}
          actionDisabled={locked || !isOnline}
          compact
        />
      ) : (
        <PosShiftStateNotice
          variant="warning"
          message="No shift open. Open one to use the POS."
          compact
        />
      );

      if (canAdminBypassShiftPrompt) {
        const operatingBranchLabel = activeLocations.find(
          (location) => Number(location?.location_id || 0) === Number(operatingLocationId || 0)
        )?.name || 'Unassigned';

        return (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">{closedShiftNotice}</div>
              <Button
                type="button"
                variant="outline"
                className={`h-10 shrink-0 rounded-lg px-4 text-[13px] font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                onClick={() => handleTabChange('close_shift')}
              >
                Go to Shift Session
              </Button>
            </div>
            {renderAdminShiftLocationTabs(
              canViewBranchLocations ? (
                <AdminOpenShiftOverview
                  activeShift={null}
                  initialLocationId={operatingLocationId}
                  showOpenShiftSummary={false}
                  branchLabel={operatingBranchLabel}
                  branchDirectoryState={branchDirectoryState}
                  canViewBranchLocations={canViewBranchLocations}
                  isOnline={isOnline}
                  refreshLoading={shiftState?.loading}
                  onRefreshShiftData={refreshOperationalContext}
                  onRefreshBranchTerminals={() => refreshAdminShiftLocationData('terminals')}
                  onViewBranch={onViewBranch}
                  formatDateTime={parseIsoDateTime}
                />
              ) : (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                  Branch monitoring isn’t available for this account.
                </p>
              )
            )}
          </div>
        );
      }

      return (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">{closedShiftNotice}</div>
            <Button
              type="button"
              variant="outline"
              className={`h-10 shrink-0 rounded-lg px-4 text-[13px] font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
              onClick={() => handleTabChange('close_shift')}
            >
              Go to Shift Session
            </Button>
          </div>
          {renderCurrentRegisterCard()}
        </div>
      );
    }

    const showAdminOpenShiftOverview = canAdminBypassShiftPrompt;

    const activeShiftLocationContent = (
      <>
        {showAdminOpenShiftOverview ? (
          <AdminOpenShiftOverview
            activeShift={activeShift}
            showOpenShiftSummary={false}
            branchLabel={shiftLocationLabel}
            branchDirectoryState={branchDirectoryState}
            canViewBranchLocations={canViewBranchLocations}
            isOnline={isOnline}
            locked={locked}
            shiftActionLoading={shiftActionLoading}
            refreshLoading={shiftState?.loading}
            onViewShiftSummary={handleViewShiftSummary}
            onRefreshShiftData={refreshOperationalContext}
            onRefreshBranchTerminals={() => refreshAdminShiftLocationData('terminals')}
            onViewBranch={onViewBranch}
            formatDateTime={parseIsoDateTime}
          />
        ) : null}
        <div className={`rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70 ${showAdminOpenShiftOverview ? 'mt-6' : ''}`}>
          <div className={showAdminOpenShiftOverview ? 'min-w-0' : 'flex items-start gap-3'}>
            {!showAdminOpenShiftOverview ? (
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-50 text-[#2563EB]">
                <MapPinned className="h-4.5 w-4.5" />
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              {showAdminOpenShiftOverview ? (
                <div>
                  <h2 className="text-base font-black text-[#0F172A]">Shift Management</h2>
                </div>
              ) : (
                <>
                  {renderCurrentRegisterCard()}
                  <p className="text-[13px] font-black text-[#0F172A]">Shift Location</p>
                  <p className="mt-1 text-[12px] leading-5 text-[#475569]">
                    Used for catalog, checkout, and dashboard.
                  </p>
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                    <p className="text-[11px] font-bold uppercase tracking-wide text-[#64748B]">Current Shift Location</p>
                    <p className="mt-1 text-[13px] font-extrabold text-[#0F172A]">{shiftLocationLabel}</p>
                  </div>
                </>
              )}

              <div className="mt-4 border-t border-slate-200 pt-4">
              <p className="text-[12px] font-black text-[#0F172A]">Change Shift Location</p>
              <p className="mt-1 text-[12px] leading-5 text-[#475569]">
                Count and close this drawer, then open a shift at the new terminal.
              </p>
              {canSwitchPosLocation ? (
                <>
                  <Label htmlFor="pos-switch-target-location" className="mt-3 block text-[12px] font-black text-[#0F172A]">New Shift Location</Label>
                  <PosDropdownSelect
                    id="pos-switch-target-location"
                    ariaLabel="New Shift Location"
                    className="mt-2"
                    value={switchTargetLocationId}
                    disabled={locked || !isOnline || shiftState.loading || shiftActionLoading.switchLocation}
                    onChange={(nextValue) => {
                      setSwitchTargetLocationId(nextValue || '');
                      setSwitchTargetTerminalId('');
                      setSwitchOpeningFloatAmount('');
                      setSwitchConflict(null);
                    }}
                    placeholder="Select a target location"
                    listboxLabel="New Shift Location options"
                    options={activeLocations.map((location) => ({
                      value: location.location_id,
                      label: location.name
                    }))}
                  />
                  <Label htmlFor="pos-switch-target-terminal" className="mt-3 block text-[12px] font-black text-[#0F172A]">Destination Terminal</Label>
                  <PosDropdownSelect
                    id="pos-switch-target-terminal"
                    ariaLabel="Destination Terminal"
                    className="mt-2"
                    value={switchTargetTerminalId}
                    disabled={locked || !isOnline || shiftState.loading || shiftActionLoading.switchLocation || !switchTargetLocationId}
                    onChange={(nextValue) => {
                      setSwitchTargetTerminalId(nextValue);
                      setSwitchConflict(null);
                    }}
                    placeholder="Select an active destination terminal"
                    listboxLabel="Destination Terminal options"
                    options={switchLocationTerminals.map((entry) => {
                      const terminalId = String(entry?.terminal_id || '').trim();
                      return {
                        value: terminalId,
                        label: entry?.label ? `${entry.label} (${terminalId})` : terminalId
                      };
                    })}
                  />
                  {switchTargetLocationId && switchLocationTerminals.length === 0 ? (
                    <p className="mt-2 text-[11px] text-amber-700">
                      No active terminal is registered at this location.
                    </p>
                  ) : null}
                  <Label htmlFor="pos-switch-closing-cash" className="mt-3 block text-[12px] font-black text-[#0F172A]">Counted Closing Cash ({terminalMeta.pettyCashSymbol})</Label>
                  <Input
                    id="pos-switch-closing-cash"
                    aria-label="Counted Closing Cash"
                    type="text"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="mt-2 h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                    value={switchClosingCashAmount}
                    disabled={locked || !isOnline || shiftState.loading || shiftActionLoading.switchLocation}
                    onChange={(event) => setSwitchClosingCashAmount(event.target.value)}
                    placeholder="0.00"
                  />
                  <Label htmlFor="pos-switch-opening-float" className="mt-3 block text-[12px] font-black text-[#0F172A]">Destination Opening Float ({terminalMeta.pettyCashSymbol})</Label>
                  <Input
                    id="pos-switch-opening-float"
                    aria-label="Destination Opening Float"
                    type="text"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    className="mt-2 h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                    value={switchOpeningFloatAmount}
                    disabled={locked || !isOnline || shiftState.loading || shiftActionLoading.switchLocation}
                    onChange={(event) => setSwitchOpeningFloatAmount(event.target.value)}
                    placeholder="0.00"
                  />
                  <Input
                    className="mt-3 h-11 rounded-lg border-slate-200 text-[13px] font-medium text-[#0F172A] placeholder:text-[#64748B] focus-visible:border-[#2563EB] focus-visible:ring-2 focus-visible:ring-[#DBEAFE]"
                    value={switchReason}
                    onChange={(event) => setSwitchReason(event.target.value)}
                    placeholder="Reason for shift location change"
                    disabled={locked || !isOnline || shiftState.loading || shiftActionLoading.switchLocation}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className={`mt-3 h-10 rounded-lg px-4 text-[13px] font-extrabold ${POS_SHIFT_SECONDARY_BUTTON_CLASS}`}
                    disabled={
                      locked
                      || !isOnline
                      || shiftState.loading
                      || shiftActionLoading.switchLocation
                      || !switchTargetLocationId
                      || Number(switchTargetLocationId) === Number(shiftLocationId)
                      || !switchTargetTerminalId
                      || String(switchClosingCashAmount).trim() === ''
                      || String(switchOpeningFloatAmount).trim() === ''
                      || String(switchReason || '').trim().length < 8
                    }
                    onClick={async () => {
                      const result = await handleSwitchShiftLocation?.({
                        targetLocationId: Number(switchTargetLocationId),
                        terminalId: switchTargetTerminalId,
                        closingCashAmount: switchClosingCashAmount,
                        openingFloatAmount: switchOpeningFloatAmount,
                        closingNote: '',
                        openingNote: '',
                        reason: switchReason
                      });
                      setSwitchConflict(result?.ok === false ? (result.conflict || null) : null);
                    }}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    {shiftActionLoading.switchLocation ? 'Switching...' : 'Change Shift Location'}
                  </Button>
                  {switchConflict ? (
                    <div
                      data-testid="pos-shift-location-conflict"
                      className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[11px] leading-5 text-amber-900"
                    >
                      <p className="font-black">Shift location switch was not completed.</p>
                      <p className="mt-1">{switchConflict.message || 'The requested destination is not available.'}</p>
                      <p className="mt-2">Current register: {shiftLocationLabel}</p>
                      <p>
                        Requested: {switchTargetTerminal?.label || switchConflict.targetTerminalId || 'Destination terminal'} · {switchTargetLocation?.name || 'Destination branch'}
                      </p>
                      <p className="mt-2 font-semibold">No takeover, cash transfer, or automatic close was performed.</p>
                      <PosShiftRefreshButton
                        label="Refresh shift and terminal availability"
                        className="mt-3"
                        onClick={async () => {
                          await refreshOperationalContext?.();
                          await refreshAdminLocationMonitor?.();
                        }}
                        disabled={shiftActionLoading.switchLocation || !isOnline}
                      />
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="mt-3 text-[11px] text-slate-500">
                  You do not have permission to change the active shift location.
                </p>
              )}
            </div>

          </div>
        </div>
        </div>
      </>
    );

    if (!showAdminOpenShiftOverview) return activeShiftLocationContent;
    return renderAdminShiftLocationTabs(activeShiftLocationContent);
  };

  const renderShiftSessionPane = () => {
    if (!activeShift && shiftState?.loading) {
      return (
        <section className="space-y-3 px-4 py-4 sm:px-5 sm:py-5" aria-labelledby="pos-shift-session-state-heading">
          <h2 id="pos-shift-session-state-heading" className="text-sm font-black tracking-tight text-[#0F172A]">Shift Session</h2>
          <PosShiftStateNotice variant="loading" message="Checking current shift…" />
        </section>
      );
    }

    if (!activeShift && shiftState?.errorMessage) {
      return (
        <section className="space-y-3 px-4 py-4 sm:px-5 sm:py-5" aria-labelledby="pos-shift-session-state-heading">
          <h2 id="pos-shift-session-state-heading" className="text-sm font-black tracking-tight text-[#0F172A]">Shift Session</h2>
          <PosShiftStateNotice
            variant="error"
            title="Shift status could not be loaded"
            message={shiftState.errorMessage}
            actionLabel="Try again"
            onAction={() => void refreshOperationalContext()}
            actionDisabled={locked || !isOnline}
          />
        </section>
      );
    }

    if (!activeShift) {
      const adminCanOpenShiftInCurrentContext = canRenderAdminShiftOpen
        && !locked
        && isOnline
        && activeTerminalMatchesOperatingLocation;
      const adminTerminalNeedsConfirmation = canRenderAdminShiftOpen
        && !locked
        && isOnline
        && !activeTerminalMatchesOperatingLocation;
      const adminOpenShiftBlockingMessage = !canRenderAdminShiftOpen
        ? 'Admin view only. POS transact permission is required to open a shift.'
        : locked
          ? 'Unlock the terminal before opening a shift.'
          : !isOnline
            ? 'Reconnect before opening a shift.'
            : 'Select and confirm a terminal in this branch before opening a shift.';

      return (
        <section
          data-testid="pos-shift-session-empty"
          aria-label="Shift session"
          className="min-w-0 space-y-4"
        >
          <PosShiftStateNotice
            variant="warning"
            message="No shift open. Open one to use the POS."
            compact
          />
          {canAdminBypassShiftPrompt ? renderAdminBranchContext('open_shift') : null}
          {canAdminBypassShiftPrompt ? (
            adminCanOpenShiftInCurrentContext
              ? renderOpeningShiftPanel({ testId: 'pos-admin-open-shift-panel' })
              : adminTerminalNeedsConfirmation
                ? null
                : <PosShiftStateNotice variant="warning" message={adminOpenShiftBlockingMessage} compact className="mt-3" />
          ) : renderOpeningShiftPanel()}
          <BranchDayClosePanel
            layout="flat"
            activeShift={activeShift}
            canCloseDay={canCloseDay}
            shiftActionLoading={shiftActionLoading}
            locked={locked}
            isOnline={isOnline}
            activeTerminalMatchesOperatingLocation={activeTerminalMatchesOperatingLocation}
            shiftState={shiftState}
            dayCloseReadinessState={dayCloseReadinessState}
            refreshDayCloseReadiness={refreshDayCloseReadiness}
            handleCloseDay={handleCloseDay}
          />
        </section>
      );
    }

    return (
      <div className="space-y-3.5">
        <ShiftSessionSummary
          summaryRows={summaryRows}
          onViewSummary={handleViewShiftSummary}
          onViewXReading={handleViewXReading}
          onRefresh={refreshOperationalContext}
          summaryLoading={shiftActionLoading.summary}
          refreshLoading={shiftState?.loading}
          refreshErrorMessage={shiftState?.errorMessage}
          closeLoading={shiftActionLoading.close}
          locked={locked}
          isOnline={isOnline}
        />
        {canCloseDay ? (
          <MerchantTenderReconciliationPanel
            shiftId={activeShift.pos_terminal_shift_id}
            salesSummary={shiftState.salesSummary}
            disabled={locked || !isOnline}
          />
        ) : null}
        <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-3">
          <CashierShiftClosePanel
            currencySymbol={terminalMeta.pettyCashSymbol}
            expectedCashAmount={money(shiftState.cashSummary?.expected_cash_amount)}
            closeShiftForm={closeShiftForm}
            setCloseShiftForm={setCloseShiftForm}
            canCloseShift={canCloseShift}
            shiftActionLoading={shiftActionLoading}
            locked={locked}
            handleCloseShift={handleCloseShift}
          />
          <BranchDayClosePanel
            activeShift={activeShift}
            canCloseDay={canCloseDay}
            shiftActionLoading={shiftActionLoading}
            locked={locked}
            isOnline={isOnline}
            activeTerminalMatchesOperatingLocation={activeTerminalMatchesOperatingLocation}
            shiftState={shiftState}
            dayCloseReadinessState={dayCloseReadinessState}
            refreshDayCloseReadiness={refreshDayCloseReadiness}
            handleCloseDay={handleCloseDay}
          />
        </div>
      </div>
    );
  };

  const renderCashDrawerPane = () => {
    if (!activeShift) {
      return (
        <CashDrawerClosedState
          terminalId={activeTerminalId}
          locationId={operatingLocationId}
          state={cashierHistoryState}
          onRefresh={refreshCashierHistory}
          onOpenShiftSession={() => handleTabChange('close_shift')}
          shiftStatusLoading={shiftState?.loading}
          locked={locked}
          isOnline={isOnline}
          currency={terminalMeta.pettyCashSymbol}
        />
      );
    }

    return (
      <CashDrawerEventForm
        currencySymbol={terminalMeta.pettyCashSymbol}
        canAdjustCashDrawer={canAdjustCashDrawer}
        cashEventForm={cashEventForm}
        setCashEventForm={setCashEventForm}
        saving={shiftActionLoading.cashEvent}
        locked={locked}
        onRecord={handleRecordCashEvent}
        onOpenCashierHistory={() => handleTabChange('cashier_history')}
      />
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
    if (isBranchReadOnlyView) return renderShiftLocationPane();
    if (renderedTab === 'close_shift') return renderShiftSessionPane();
    if (renderedTab === 'cash_drawer') return renderCashDrawerPane();
    if (renderedTab === 'cashier_history') return renderCashierHistoryPane();
    return renderShiftLocationPane();
  };

  return (
    <>
    <PosPageFrame
      id={sectionId}
      page="shift"
      className="max-[767px]:overflow-x-clip"
    >
      <div className={`${POS_PAGE_CONTENT_STACK_CLASS} sm:gap-6`}>
        <h2 className="sr-only">Shift Controls</h2>
        <div
          data-testid="pos-shift-sticky-tabs"
          className={`min-w-0 ${POS_MOBILE_STICKY_TAB_ROW_CLASS}`}
        >
          <PosLineTabNavigation
            tabs={visibleShiftTabs}
            activeTab={selectedShiftTabId}
            onTabChange={handleTabChange}
            ariaLabel="Shift sections"
            hideScrollbar
            mobileGridColumns={2}
            idPrefix={shiftTabIdPrefix}
            panelId={shiftPanelId}
          />
        </div>

        <div
          id={shiftPanelId}
          role="tabpanel"
          aria-labelledby={`${shiftTabIdPrefix}-${selectedShiftTabId}`}
          tabIndex={0}
          className={shiftState.loading ? undefined : 'overflow-x-clip overflow-y-visible'}
        >
          {shiftState.loading ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" role="status" aria-live="polite" aria-busy="true">Loading shift context...</p>
          ) : (
            <div style={paneInlineStyle}>{renderActivePane()}</div>
          )}
        </div>
      </div>
    </PosPageFrame>
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













// Reuse the POS item-create workflow from back-office catalog surfaces without
// duplicating its validation, image upload, barcode, category, and post-create
// synchronization behavior. The workspace stays mounted so its portal-based
// modal can render into document.body while the catalog page owns the trigger.
export function PosItemCreateWorkflow({
  open = false,
  onOpenChange = () => {},
  onCreated = () => {},
  ...itemsWorkspaceProps
}) {
  return (
    <ItemsWorkspace
      {...itemsWorkspaceProps}
      createModalOpen={open}
      onCreateModalOpenChange={onOpenChange}
      onItemCreated={onCreated}
      modalOnly
    />
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
  settingsRefreshKey = 0,
  employeeCreditReportRefreshKey = 0,
  isOnline = true,
  offlineSnapshotScope = {},
  onQueueOfflineItemDraft = async () => '',
  activeTerminalId = '',
  terminalIdOptions = [],
  terminalRegistry = [],
  registryEnforced = false,
  activeShiftId = null,
  hardwareDriverLabel = '',
  hardwareStatus = null,
  hardwareLoading = false,
  isPrinterAvailable = false,
  printersDetected = 0,
  onTestPrinter = async () => false,
  onSelectTerminal = async () => false,
  canViewPos,
  catalogOnlyAccess = false,
  effectiveCapabilities = [],
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
  canViewAdminLocationMonitor = false,
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
  handleViewXReading = () => {},
  cashierHistoryState = { loading: false, records: [], pagination: null, errorMessage: '' },
  refreshCashierHistory = async () => {},
  handleViewCashierHistoryShift = () => {},
  refreshOperationalContext,
  locationsState = { loading: false, locations: [] },
  itemsLocationScopeLoading = false,
  operatingLocationId = null,
  setOperatingLocationId = () => {},
  viewingLocationId = null,
  setViewingLocationId = () => {},
  queueLocationScopeId = null,
  incomingOrdersState = { loading: false, orders: [] },
  orderHistoryState = { loading: false, orders: [], pagination: null },
  adminLocationMonitorState = { loading: false, orders: [], terminalShifts: [], errorMessage: '' },
  branchDirectoryState = { loading: false, locations: [], scope: '', errorMessage: '' },
  branchViewLocationId = null,
  branchViewTransitionLoading = false,
  canViewBranchLocations = false,
  onViewBranch = async () => false,
  onExitBranchView = async () => {},
  refreshBranchDirectory = async () => null,
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
  onlineOrderSoundId = 'new_order',
  downloadedOrderAlertSoundIds = [],
  orderAlertSoundDownloadId = '',
  previewingOrderAlertSoundId = '',
  onSelectOrderAlertSound = () => {},
  onDownloadOrderAlertSound = async () => false,
  onImportOrderAlertSound = async () => false,
  orderAlertSoundImporting = false,
  onPreviewOrderAlertSound = async () => false,
  incomingOrderPopupEnabled = true,
  setIncomingOrderPopupEnabled = () => {},
  customerDisplayEnabled = true,
  customerDisplayCanOpen = false,
  customerDisplayStatus = 'closed',
  customerDisplayStatusLabel = 'Not connected',
  onCustomerDisplayEnabledChange = () => {},
  onOpenCustomerDisplay = () => null,
  onEndCustomerDisplay = () => {},
  queueSummary = {},
  replayingQueuedTerminalOperations = false,
  handleReplayQueuedTerminalOperations = () => {},
  handleRetryQueuedOperation = () => {},
  handleResolveQueuedOperation = () => {},
  sectionIds = {},
  workspacePaneRef = null
}) {
  const restrictedMsmeModes = new Set(['location_scope', 'cash_drawer']);
  const effectiveViewMode = (isMsmeMode && restrictedMsmeModes.has(viewMode))
    ? 'shift_controls'
    : viewMode;
  const modeMeta = MODE_META[effectiveViewMode] || MODE_META.shift_controls;
  const isIncomingQueueView = effectiveViewMode === 'incoming_queue';
  const isSettingsView = SETTINGS_VIEW_MODES.has(effectiveViewMode);
  const usesOwnPageFrame = isSettingsView
    || effectiveViewMode === 'reports'
    || SHIFT_WORKSPACE_MODES.has(effectiveViewMode);
  const isVoucherManagementView = effectiveViewMode === 'settings_vouchers';
  const isPricelistManagementView = effectiveViewMode === 'settings_pricelists';
  const isAffiliateManagementView = effectiveViewMode === 'settings_affiliates';
  const isFullBleedCatalogView = effectiveViewMode === 'items'
    || isAffiliateManagementView
    || isVoucherManagementView
    || isPricelistManagementView;
  const workspaceShellClassName = usesOwnPageFrame
    ? isAffiliateManagementView
      ? 'flex min-h-0 flex-1 flex-col px-5 pb-0 pt-2 pos-affiliates-workspace-shell'
      : 'p-0'
    : isFullBleedCatalogView
      ? `flex min-h-0 flex-1 flex-col px-5 pb-0 pt-2${effectiveViewMode === 'items' ? ' pos-items-workspace-shell' : ' pos-catalog-workspace-shell'}`
      : 'p-5';
  const showTerminalOnlyControls = effectiveViewMode === 'terminal_setup';
  const showTerminalOnlyControlsPane = showTerminalOnlyControls;
  const canImportItems = IS_DGFY_POS_SURFACE && (
    terminalUser?.is_master_admin === true
    || resolveUserPermissionList(terminalUser).includes('items:import')
  );
  const isBranchReadOnlyView = Boolean(branchViewLocationId);
  const workspaceLocationId = isBranchReadOnlyView
    ? (branchViewLocationId || viewingLocationId || operatingLocationId)
    : operatingLocationId;
  const handleNavigateToOrders = useCallback(() => {
    if (typeof window === 'undefined') {
      onSelectViewMode('incoming_queue');
      return;
    }
    window.location.assign('/?view=incoming_queue');
  }, [onSelectViewMode]);

  const content = useMemo(() => {
    const settingsWorkspaceProps = {
      terminalUser,
      terminalMeta,
      locationsState,
      queueLocationScopeId,
      incomingOrdersState,
      locked,
      sectionId: sectionIds.terminalSetup,
      onRefreshTerminalUser: refreshTerminalUser,
      onRefreshTerminalMeta: refreshTerminalMeta,
      onPosSetupSaved,
      onStorefrontSetupSaved,
      onStorefrontContentStateChange,
      settingsRefreshKey,
      onlineOrderSoundEnabled,
      setOnlineOrderSoundEnabled,
      onlineOrderSoundId,
      downloadedOrderAlertSoundIds,
      orderAlertSoundDownloadId,
      previewingOrderAlertSoundId,
      onSelectOrderAlertSound,
      onDownloadOrderAlertSound,
      onImportOrderAlertSound,
      orderAlertSoundImporting,
      onPreviewOrderAlertSound,
      incomingOrderPopupEnabled,
      setIncomingOrderPopupEnabled,
      customerDisplayEnabled,
      customerDisplayCanOpen,
      customerDisplayStatus,
      customerDisplayStatusLabel,
      onCustomerDisplayEnabledChange,
      onOpenCustomerDisplay,
      onEndCustomerDisplay,
      terminalIdOptions,
      activeTerminalId,
      registryEnforced,
      activeShiftId,
      hardwareDriverLabel,
      hardwareStatus,
      hardwareLoading,
      isPrinterAvailable,
      printersDetected,
      onTestPrinter,
      onSelectTerminal,
      onDeliveryPersonnelChanged,
      onNavigateToOrders: handleNavigateToOrders,
      workspacePaneRef
    };

    switch (effectiveViewMode) {
    case 'incoming_queue':
      return (
        <Suspense fallback={null}>
          <IncomingQueueWorkspace
          canViewPos={canViewPos}
          canTransactPos={isBranchReadOnlyView ? false : canTransactPos}
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
          viewingLocationId={viewingLocationId}
          branchViewLocationId={branchViewLocationId}
          canViewAdminLocationMonitor={canViewAdminLocationMonitor}
          adminLocationMonitorState={adminLocationMonitorState}
          refreshAdminLocationMonitor={refreshAdminLocationMonitor}
          locked={locked}
          isOnline={isOnline}
          onQueueOfflineItemDraft={onQueueOfflineItemDraft}
          sectionId={sectionIds.incomingOrders}
          workflowMode={workflowMode}
        />
        </Suspense>
      );
    case 'location_scope':
    case 'settings_profile':
    case 'settings_pos':
    case 'settings_storefront':
      return (
        <SettingsWorkspace
          {...settingsWorkspaceProps}
          initialTab={
            effectiveViewMode === 'settings_profile'
              ? 'profile'
              : (effectiveViewMode === 'settings_storefront' ? 'storefront' : 'pos_setup')
          }
        />
      );
    case 'terminal_setup':
      return (
        <SettingsWorkspace
          {...settingsWorkspaceProps}
          initialTab="pos_setup"
          allowedTabIds={['pos_setup']}
          editorSection="terminal_setup"
          showTerminalOnlyControls={showTerminalOnlyControlsPane}
        />
      );
    case 'shift_controls':
    case 'close_shift':
      return (
        <ShiftControlsWorkspace
          shiftState={shiftState}
          terminalMeta={terminalMeta}
          terminalUser={terminalUser}
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
          canViewAdminLocationMonitor={canViewAdminLocationMonitor}
          viewingLocationId={viewingLocationId}
          setViewingLocationId={setViewingLocationId}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          handleCloseDay={handleCloseDay}
          handleViewShiftSummary={handleViewShiftSummary}
          handleViewXReading={handleViewXReading}
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
          branchDirectoryState={branchDirectoryState}
          branchViewLocationId={branchViewLocationId}
          branchViewTransitionLoading={branchViewTransitionLoading}
          canViewBranchLocations={canViewBranchLocations}
          onViewBranch={onViewBranch}
          onExitBranchView={onExitBranchView}
          refreshBranchDirectory={refreshBranchDirectory}
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
          terminalUser={terminalUser}
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
          canViewAdminLocationMonitor={canViewAdminLocationMonitor}
          viewingLocationId={viewingLocationId}
          setViewingLocationId={setViewingLocationId}
          closeShiftForm={closeShiftForm}
          setCloseShiftForm={setCloseShiftForm}
          handleCloseShift={handleCloseShift}
          handleCloseDay={handleCloseDay}
          handleViewShiftSummary={handleViewShiftSummary}
          handleViewXReading={handleViewXReading}
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
          branchDirectoryState={branchDirectoryState}
          branchViewLocationId={branchViewLocationId}
          branchViewTransitionLoading={branchViewTransitionLoading}
          canViewBranchLocations={canViewBranchLocations}
          onViewBranch={onViewBranch}
          onExitBranchView={onExitBranchView}
          refreshBranchDirectory={refreshBranchDirectory}
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
        <Suspense fallback={null}>
          <PosReportsAnalyticsWorkspace
            todayDashboard={todayDashboard}
            terminalMeta={terminalMeta}
            activeTerminalId={activeTerminalId}
            operatingLocationId={workspaceLocationId}
            reportRefreshKey={reportRefreshKey}
            employeeCreditReportRefreshKey={employeeCreditReportRefreshKey}
            isOnline={isOnline}
            offlineSnapshotScope={offlineSnapshotScope}
            sectionId={sectionIds.reports}
          />
        </Suspense>
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
        <Suspense fallback={null}>
          <VoucherManagementPanel
            disabled={locked}
            canManage={canManageVouchers}
            sectionId={sectionIds.vouchers}
            onNavigateToPricelists={() => onSelectViewMode('settings_pricelists')}
          />
        </Suspense>
      );
    case 'settings_pricelists':
      return (
        <Suspense fallback={null}>
          <PricelistManagementPanel
            disabled={locked}
            canManage={canManagePricelists}
            sectionId={sectionIds.pricelists}
          />
        </Suspense>
      );
    case 'items':
      return (
        <ItemsCatalogWorkspace
          itemsWorkspaceComponent={ItemsWorkspace}
          canViewPos={canViewPos}
          catalogOnlyAccess={catalogOnlyAccess}
          effectiveCapabilities={effectiveCapabilities}
          canCreateItems={isBranchReadOnlyView ? false : canCreateItems}
          canImportItems={isBranchReadOnlyView ? false : canImportItems}
          canEditItems={isBranchReadOnlyView ? false : canEditItems}
          canDeleteItems={isBranchReadOnlyView ? false : canDeleteItems}
          canManageCategories={isBranchReadOnlyView ? false : canManageCategories}
          canManageServiceCatalog={isBranchReadOnlyView ? false : canManageServiceCatalog}
          canManageServiceOptions={isBranchReadOnlyView ? false : canManageServiceCatalog}
          canViewFnbModifiers={canViewFnbModifiers}
          canManageFnbModifiers={isBranchReadOnlyView ? false : canManageFnbModifiers}
          locations={locationsState?.locations || []}
          locationsLoading={(locationsState?.loading === true) || itemsLocationScopeLoading}
          serviceOperationsPermissions={serviceOperationsPermissions}
          shiftState={shiftState}
          activeTerminalId={activeTerminalId}
          stockFilterPreset={itemsStockFilterPreset}
          onStockFilterPresetApplied={onItemsStockFilterPresetApplied}
          refreshTerminalUser={refreshTerminalUser}
          workflowMode={workflowMode}
          locked={locked}
          isOnline={isOnline}
          onQueueOfflineItemDraft={onQueueOfflineItemDraft}
          operatingLocationId={workspaceLocationId}
          storefrontSlug={terminalMeta?.storefrontSlug || ''}
          sectionId={sectionIds.items}
        />
      );
    case 'services':
      return (
        <div id={sectionIds.services}>
          <Suspense fallback={null}>
            <PosServicesOperationsWorkspace
              permissions={serviceOperationsPermissions}
              isOnline={isOnline}
            />
          </Suspense>
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
    canViewAdminLocationMonitor,
    branchDirectoryState,
    branchViewLocationId,
    branchViewTransitionLoading,
    isBranchReadOnlyView,
    workspaceLocationId,
    canViewBranchLocations,
    onViewBranch,
    onExitBranchView,
    refreshBranchDirectory,
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
    ensureDeliveryPersonnelLoaded,
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
    effectiveCapabilities,
    canSwitchPosLocation,
    canTransactPos,
    canViewPos,
    catalogOnlyAccess,
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
    itemsLocationScopeLoading,
    onDeliveryPersonnelChanged,
    onPosSetupSaved,
    onSelectAdminTerminal,
    onStorefrontSetupSaved,
    onStorefrontContentStateChange,
    onlineOrderSoundEnabled,
    onlineOrderSoundId,
    downloadedOrderAlertSoundIds,
    orderAlertSoundDownloadId,
    previewingOrderAlertSoundId,
    onSelectOrderAlertSound,
    onDownloadOrderAlertSound,
    onImportOrderAlertSound,
    orderAlertSoundImporting,
    onPreviewOrderAlertSound,
    incomingOrderPopupEnabled,
    customerDisplayEnabled,
    customerDisplayCanOpen,
    customerDisplayStatus,
    customerDisplayStatusLabel,
    onCustomerDisplayEnabledChange,
    onOpenCustomerDisplay,
    onEndCustomerDisplay,
    operatingLocationId,
    viewingLocationId,
    openShiftForm,
    queueLocationScopeId,
    refreshIncomingOrders,
    refreshOrderHistory,
    refreshAdminLocationMonitor,
    refreshOperationalContext,
    refreshDayCloseReadiness,
    reportRefreshKey,
    settingsRefreshKey,
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
    showTerminalOnlyControlsPane,
    activeTerminalId,
    terminalIdOptions,
    refreshTerminalMeta,
    refreshTerminalUser,
    registryEnforced,
    activeShiftId,
    hardwareDriverLabel,
    hardwareStatus,
    hardwareLoading,
    isPrinterAvailable,
    printersDetected,
    onTestPrinter,
    onSelectTerminal,
    setOperatingLocationId,
    setViewingLocationId,
    setCashEventForm,
    setCloseShiftForm,
    setOpenShiftForm,
    setOnlineOrderSoundEnabled,
    setIncomingOrderPopupEnabled,
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
      bare={usesOwnPageFrame}
      borderless={isFullBleedCatalogView}
      className={workspaceShellClassName}
    >
      <div
        key={effectiveViewMode}
        className={isFullBleedCatalogView
          ? 'flex min-h-0 min-w-0 flex-1 flex-col catalog-slide-enter'
          : 'catalog-slide-enter'}
      >
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
