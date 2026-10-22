import React from 'react';
import {
  BarChart3,
  CalendarCheck,
  ClipboardCheck,
  ClipboardList,
  History,
  ListChecks,
  LogIn,
  Lock,
  Percent,
  Settings,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Tags,
  Ticket,
  Truck,
  Utensils,
  UserRound
} from 'lucide-react';
import { Button } from '../../../../Components/ui/button.jsx';
import { resolveAppAssetUrl } from '../../../utils/assetUrl.js';
import { resolvePosIncomingOrders } from '../utils/incomingOrderCount.js';
import { getPosNavigationDefinition } from '../config/posNavigationDefinitions.js';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const DGFY_POS_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');
const posNavLabel = (id, fallback) => {
  const definition = getPosNavigationDefinition(id);
  return definition?.navLabels?.[id] || definition?.label || fallback;
};

const NavButton = ({
  active = false,
  label,
  onClick,
  onPrefetch,
  icon: Icon,
  disabled = false,
  caption = '',
  testId = '',
  navId = '',
  collapsed = false
}) => (
  <button
    type="button"
    onClick={onClick}
    onPointerDown={onPrefetch}
    onPointerEnter={onPrefetch}
    onFocus={onPrefetch}
    disabled={disabled}
    title={collapsed ? label : undefined}
    aria-label={collapsed ? label : undefined}
    data-testid={testId || undefined}
    data-pos-nav-id={navId || undefined}
    className={`flex min-w-0 w-full transition ${collapsed
      ? 'h-11 items-center justify-center rounded-xl border px-0'
      : 'items-start gap-2.5 rounded-lg border px-2.5 py-2.5 text-left'} ${
      active
        ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
        : 'border-slate-200 bg-white text-[#0F172A] hover:border-blue-200 hover:bg-slate-50'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  >
    <Icon className={`${collapsed ? 'h-5 w-5' : 'mt-0.5 h-[18px] w-[18px]'} shrink-0 ${active ? 'text-white' : 'text-[#1A4E8D]'}`} />
    {!collapsed && <div className="min-w-0">
      <span className="block break-words whitespace-normal text-[12px] font-extrabold leading-4">{label}</span>
      {caption ? <p className={`mt-1 break-words whitespace-normal line-clamp-2 text-[10.5px] leading-[14px] ${active ? 'text-white/80' : 'text-[#64748B]'}`}>{caption}</p> : null}
    </div>}
  </button>
);

export default function TerminalWorkspaceSidebar({
  className = '',
  showBrand = true,
  isCollapsed = false,
  showIdentityInSidebar = false,
  locked = false,
  isOnline = true,
  terminalUser = null,
  accessibleCompanies = [],
  companyName: propCompanyName = '',
  branchName: propBranchName = '',
  currentViewMode = 'checkout',
  isMsmeMode = false,
  canViewPos = false,
  canTransactPos = null,
  canViewItems = null,
  canViewReports = null,
  canViewAffiliates = null,
  canViewAudit = false,
  canReviewVoidApprovals = false,
  canAccessPosOnlySetup = false,
  catalogOnlyAccess = false,
  canCreateItems = false,
  canViewVouchers = false,
  canManageCategories = false,
  showFnbService = false,
  showServiceOperations = false,
  showIncomingQueue = true,
  canAccessServiceOperations = false,
  allowAdminNavigationWithoutShift = false,
  canAdjustCashDrawer = false,
  canSwitchPosLocation = false,
  canCloseShift = null,
  canCloseDay = false,
  shiftState = { shift: null },
  incomingOrdersState = { orders: [] },
  adminLocationMonitorState = { orders: [] },
  canViewAdminLocationMonitor = false,
  branchViewLocationId = null,
  locationsState = { locations: [] },
  operatingLocationId = null,
  viewingLocationId = null,
  terminalMeta = null,
  queueLocationScopeId = null,
  queueSummary = {},
  onboardingRestricted = false,
  settingsTargetViewMode = 'settings_profile',
  onSelectViewMode = () => {},
  onPrefetchViewMode = () => {},
  onUnlock = () => {},
  onLock = () => {},
}) {
  const normalizedRole = String(terminalUser?.role || '').trim().toLowerCase();
  const isCashierRole = normalizedRole === 'cashier';
  const shouldShowIncomingQueue = showIncomingQueue;
  const hasActiveShift = Boolean(shiftState?.shift);
  const isBranchReadOnlyView = Boolean(branchViewLocationId);
  const isAdminBranchMonitor = isBranchReadOnlyView || (!hasActiveShift && canViewAdminLocationMonitor);
  const effectiveCanTransactPos = canTransactPos == null ? canViewPos : canTransactPos;
  const effectiveCanViewItems = canViewItems == null ? canViewPos : canViewItems;
  const effectiveCanViewReports = canViewReports == null ? canViewPos : canViewReports;
  const effectiveCanViewAffiliates = canViewAffiliates == null ? canViewPos : canViewAffiliates;
  const effectiveCanCloseShift = canCloseShift == null ? canViewPos : canCloseShift;
  const incomingCount = resolvePosIncomingOrders({
    showIncomingQueue,
    canViewPos,
    hasActiveShift,
    canViewAdminLocationMonitor,
    branchViewLocationId,
    incomingOrdersState,
    adminLocationMonitorState
  }).length;
  const navigationShiftReady = hasActiveShift || allowAdminNavigationWithoutShift;
  const canAccessItemsWorkspace = effectiveCanViewItems || canManageCategories || (catalogOnlyAccess && canCreateItems);
  const shouldShowPosOnlySetup = canAccessPosOnlySetup
    && !onboardingRestricted
    && settingsTargetViewMode !== 'terminal_setup';
  const sellWorkspaceModes = new Set(['checkout', 'receipt']);
  const onboardingCaption = 'Finish onboarding in Settings first';
  const catalogOnlyDisabledCaption = 'DGFY Admin must enable POS before this page is available';

  const companyRows = Array.isArray(accessibleCompanies) ? accessibleCompanies : [];
  const currentCompanyId = String(terminalUser?.company?.id || terminalUser?.tenant_id || '').trim();
  const currentCompany = companyRows.find(
    (c) => c?.is_current === true || (currentCompanyId && String(c?.tenant_id || '').trim() === currentCompanyId)
  ) || companyRows[0];

  const resolvedCompanyName = String(
    propCompanyName ||
    currentCompany?.company_name ||
    currentCompany?.name ||
    terminalUser?.company_name ||
    terminalUser?.company?.name ||
    terminalUser?.business_name ||
    ''
  ).trim();

  const locationsList = (Array.isArray(locationsState?.locations) ? locationsState.locations : [])
    .filter((location) => location?.is_active !== false);
  const registerLocationId = shiftState?.shift?.location_id || queueLocationScopeId || operatingLocationId;
  const activeLocation = locationsList.find(
    (loc) => String(loc?.id || loc?.location_id || '').trim() === String(registerLocationId || '').trim()
  ) || locationsList[0];
  const viewingLocation = locationsList.find(
    (loc) => String(loc?.id || loc?.location_id || '').trim() === String(viewingLocationId || registerLocationId || '').trim()
  ) || activeLocation;

  const resolvedBranchName = String(
    propBranchName ||
    activeLocation?.name ||
    activeLocation?.location_name ||
    shiftState?.shift?.branch_name ||
    shiftState?.shift?.location_name ||
    terminalMeta?.branch_name ||
    terminalMeta?.location_name ||
    ''
  ).trim();
  const resolvedRegisterBranchName = String(
    activeLocation?.name
    || activeLocation?.location_name
    || shiftState?.shift?.branch_name
    || shiftState?.shift?.location_name
    || terminalMeta?.branch_name
    || terminalMeta?.location_name
    || resolvedBranchName
    || ''
  ).trim();
  const resolvedViewingBranchName = String(
    viewingLocation?.name
    || viewingLocation?.location_name
    || resolvedRegisterBranchName
    || ''
  ).trim();
  return (
    <aside
      className={`${className} h-full min-h-0 overflow-hidden rounded-none border-0 border-r border-slate-200 bg-white shadow-sm`}
      style={{
        background: 'var(--pos-shell-sidebar)',
        borderColor: 'var(--pos-shell-sidebar-border)',
        color: 'var(--pos-shell-sidebar-text)'
      }}
    >
      <div className="dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        {showBrand && !isCollapsed && (
        <div className="relative overflow-hidden bg-transparent px-3 pt-3 pb-2 text-center">
          <div className="flex items-center justify-center">
            <img
              src={DGFY_POS_LOGO}
              alt="DGFY"
              className="w-[120px] h-auto object-contain"
            />
          </div>
          {(resolvedCompanyName || resolvedBranchName || isAdminBranchMonitor || viewingLocationId) ? (
            <div className="mt-1.5 min-w-0 px-1 text-center">
              {resolvedCompanyName ? (
                <div
                  className="truncate text-[13px] font-extrabold text-[#0F172A] leading-snug"
                  title={resolvedCompanyName}
                >
                  {resolvedCompanyName}
                </div>
              ) : null}
              {isAdminBranchMonitor || viewingLocationId ? (
                <>
                <div
                  className="mt-0.5 truncate text-[11px] font-semibold text-[#1A4E8D] leading-snug"
                  title={resolvedViewingBranchName}
                >
                  Viewing branch: {resolvedViewingBranchName || 'Not selected'}
                </div>
                <div
                  className="mt-0.5 truncate text-[11px] font-semibold text-[#64748B] leading-snug"
                  title={resolvedRegisterBranchName}
                >
                  Register branch: {resolvedRegisterBranchName || 'Not assigned'}
                </div>
                </>
              ) : resolvedBranchName ? (
                <div
                  className="mt-0.5 truncate text-[11px] font-semibold text-[#64748B] leading-snug"
                  title={resolvedBranchName}
                >
                  {resolvedBranchName}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        )}
        {showBrand && isCollapsed && (
          <div className="flex justify-center px-2 py-3">
            <img
              src={DGFY_POS_LOGO}
              alt="DGFY"
              className="h-8 w-7 object-cover object-left"
            />
          </div>
        )}

        {IS_DGFY_POS_SURFACE && showIdentityInSidebar && !isCollapsed && (
        <div className="px-3 pb-3 pt-1">
          <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#0B449C] text-white">
              <UserRound className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-extrabold text-[#0F172A]">{terminalUser?.username || 'Locked'}</div>
              <div className="truncate text-[11px] text-[#64748B]">{terminalUser?.email || 'Sign in required'}</div>
            </div>
          </div>
        </div>
        )}

        <div className={isCollapsed ? 'px-2 py-3' : `px-3 ${showBrand ? 'py-6' : 'pb-6 pt-3'}`}>
        {catalogOnlyAccess ? (
          <>
            {!isCollapsed ? (
              <div
                data-testid="pos-catalog-only-banner"
                className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 text-[11px] leading-4 text-blue-950"
                role="status"
              >
                <p className="font-extrabold">Catalog-only access</p>
                <p className="mt-1">Add items and categories now. POS onboarding, selling, POS operations, and storefront visibility stay deferred until DGFY Admin enables POS.</p>
              </div>
            ) : null}
            {!isCollapsed && <p className="mt-4 text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Primary Modes</p>}
            <div className={isCollapsed ? 'mt-2 space-y-2' : 'mt-3 space-y-2'}>
              <NavButton
                label={posNavLabel('sell', 'Sell')}
                icon={ShoppingCart}
                active={sellWorkspaceModes.has(currentViewMode)}
                onClick={() => onSelectViewMode('checkout')}
                disabled
                caption={catalogOnlyDisabledCaption}
                testId="pos-nav-sell"
                navId="sell"
                collapsed={isCollapsed}
              />
              {showFnbService && (
                <NavButton
                  label={posNavLabel('fnb-service', 'F&B service')}
                  icon={Utensils}
                  active={currentViewMode === 'fnb_service'}
                  onClick={() => onSelectViewMode('fnb_service')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-fnb-service"
                  navId="fnb-service"
                  collapsed={isCollapsed}
                />
              )}
              <NavButton
                label={posNavLabel('history', 'History')}
                icon={History}
                active={currentViewMode === 'history'}
                onClick={() => onSelectViewMode('history')}
                disabled
                caption={catalogOnlyDisabledCaption}
                testId="pos-nav-history"
                navId="history"
                collapsed={isCollapsed}
              />
              {!isCashierRole && (
                <NavButton
                  label={posNavLabel('reports', 'Report')}
                  icon={BarChart3}
                  active={currentViewMode === 'reports'}
                  onClick={() => onSelectViewMode('reports')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-reports"
                  navId="reports"
                  collapsed={isCollapsed}
                />
              )}
              <NavButton
                label={posNavLabel('items', 'Items')}
                icon={ClipboardList}
                active={currentViewMode === 'items'}
                onClick={() => onSelectViewMode('items')}
                onPrefetch={() => onPrefetchViewMode('items')}
                disabled={locked || !canAccessItemsWorkspace}
                caption={locked ? 'Unlock terminal to continue' : (!canAccessItemsWorkspace ? 'POS view or category-management permission required' : 'Add items and categories')}
                testId="pos-nav-items"
                navId="items"
                collapsed={isCollapsed}
              />
              {showServiceOperations && (
                <NavButton
                  label={posNavLabel('services', 'Services')}
                  icon={CalendarCheck}
                  active={currentViewMode === 'services'}
                  onClick={() => onSelectViewMode('services')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-services"
                  navId="services"
                  collapsed={isCollapsed}
                />
              )}
              {shouldShowIncomingQueue && (
                <NavButton
                  label={`${posNavLabel('orders', 'Orders')} (${incomingCount})`}
                  icon={Truck}
                  active={currentViewMode === 'incoming_queue'}
                  onClick={() => onSelectViewMode('incoming_queue')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-orders"
                  navId="orders"
                  collapsed={isCollapsed}
                />
              )}
              <NavButton
                label={posNavLabel('shift', 'Shift')}
                icon={ListChecks}
                active={currentViewMode === 'shift_controls' || currentViewMode === 'close_shift' || currentViewMode === 'cash_drawer'}
                onClick={() => onSelectViewMode('shift_controls')}
                disabled
                caption={catalogOnlyDisabledCaption}
                testId="pos-nav-shift"
                navId="shift"
                collapsed={isCollapsed}
              />
            </div>

            <div className={`${isCollapsed ? 'my-3' : 'my-5'} border-t border-slate-200`} />
            {!isCollapsed && <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Setup</p>}
            <div className="space-y-2">
              <NavButton
                label={posNavLabel('onboarding', 'Onboarding')}
                icon={Settings}
                active={['location_scope', 'settings_profile', 'settings_pos', 'settings_storefront'].includes(currentViewMode)}
                onClick={() => onSelectViewMode(settingsTargetViewMode)}
                onPrefetch={() => onPrefetchViewMode(settingsTargetViewMode)}
                disabled={locked || !isOnline || isBranchReadOnlyView || catalogOnlyAccess || !onboardingRestricted}
                caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : (catalogOnlyAccess ? 'POS onboarding will be available after DGFY Admin enables POS' : (!onboardingRestricted ? 'Onboarding is already complete' : 'Continue tenant onboarding inside POS')))}
                testId="pos-nav-onboarding"
                navId="onboarding"
                collapsed={isCollapsed}
              />
              {canViewVouchers && !isCashierRole && (
                <NavButton
                  label={posNavLabel('vouchers', 'Vouchers')}
                  icon={Ticket}
                  active={currentViewMode === 'settings_vouchers'}
                  onClick={() => onSelectViewMode('settings_vouchers')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-vouchers"
                  navId="vouchers"
                  collapsed={isCollapsed}
                />
              )}
              {canViewVouchers && !isCashierRole && (
                <NavButton
                  label={posNavLabel('pricelists', 'Pricelists')}
                  icon={Tags}
                  active={currentViewMode === 'settings_pricelists'}
                  onClick={() => onSelectViewMode('settings_pricelists')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-pricelists"
                  navId="pricelists"
                  collapsed={isCollapsed}
                />
              )}
              {!isCashierRole && (
                <NavButton
                  label={posNavLabel('affiliates', 'Affiliates')}
                  icon={Percent}
                  active={currentViewMode === 'settings_affiliates'}
                  onClick={() => onSelectViewMode('settings_affiliates')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-affiliates"
                  navId="affiliates"
                  collapsed={isCollapsed}
                />
              )}
              {canViewAudit && (
                <NavButton
                  label={posNavLabel('audit', 'Audit')}
                  icon={ClipboardCheck}
                  active={currentViewMode === 'audit'}
                  onClick={() => onSelectViewMode('audit')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-audit"
                  navId="audit"
                  collapsed={isCollapsed}
                />
              )}
              {canReviewVoidApprovals && !isCashierRole && (
                <NavButton
                  label={posNavLabel('approvals', 'Approvals')}
                  icon={ShieldCheck}
                  active={currentViewMode === 'approvals'}
                  onClick={() => onSelectViewMode('approvals')}
                  disabled
                  caption={catalogOnlyDisabledCaption}
                  testId="pos-nav-approvals"
                  navId="approvals"
                  collapsed={isCollapsed}
                />
              )}
            </div>
          </>
        ) : (
          <>
        {!isCollapsed && <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Primary Modes</p>}
        <div className={isCollapsed ? 'space-y-2' : 'mt-3 space-y-2'}>
          {effectiveCanTransactPos && (
            <NavButton
            label={posNavLabel('sell', 'Sell')}
              icon={ShoppingCart}
              active={sellWorkspaceModes.has(currentViewMode)}
              onClick={() => onSelectViewMode('checkout')}
              onPrefetch={() => onPrefetchViewMode('checkout')}
              disabled={locked || onboardingRestricted || isBranchReadOnlyView || !navigationShiftReady}
              caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (isBranchReadOnlyView ? 'Exit branch view to sell or manage the cart' : (!navigationShiftReady ? 'Open shift first to continue' : (hasActiveShift ? 'Live selling and cart management' : 'Admin can browse, but checkout stays blocked until a shift is opened'))))}
              testId="pos-nav-sell"
              navId="sell"
              collapsed={isCollapsed}
            />
          )}
          {showFnbService && (
            <NavButton
            label={posNavLabel('fnb-service', 'F&B service')}
              icon={Utensils}
              active={currentViewMode === 'fnb_service'}
              onClick={() => onSelectViewMode('fnb_service')}
              onPrefetch={() => onPrefetchViewMode('fnb_service')}
              disabled={locked || onboardingRestricted || isBranchReadOnlyView || !navigationShiftReady}
              caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (isBranchReadOnlyView ? 'Exit branch view to operate F&B service' : (!navigationShiftReady ? 'Open shift first to continue' : 'Open checks, tables, and kitchen tickets')))}
              testId="pos-nav-fnb-service"
              navId="fnb-service"
              collapsed={isCollapsed}
            />
          )}
          {canViewPos && (
            <NavButton
            label={posNavLabel('history', 'History')}
              icon={History}
              active={currentViewMode === 'history'}
              onClick={() => onSelectViewMode('history')}
              onPrefetch={() => onPrefetchViewMode('history')}
              disabled={locked || onboardingRestricted}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (onboardingRestricted ? onboardingCaption : (hasActiveShift ? 'Invoice lookups and audit trail' : 'Admin review available without an active shift'))
              }
              testId="pos-nav-history"
              navId="history"
              collapsed={isCollapsed}
            />
          )}
          {!isCashierRole && effectiveCanViewReports && (
            <NavButton
            label={posNavLabel('reports', 'Report')}
              icon={BarChart3}
              active={currentViewMode === 'reports'}
              onClick={() => onSelectViewMode('reports')}
              onPrefetch={() => onPrefetchViewMode('reports')}
              disabled={locked || onboardingRestricted}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Cached offline estimate only' : (onboardingRestricted ? onboardingCaption : 'Daily totals, popular items, and transactions'))
              }
              testId="pos-nav-reports"
              navId="reports"
              collapsed={isCollapsed}
            />
          )}
          {canAccessItemsWorkspace && (
            <NavButton
            label={posNavLabel('items', 'Items')}
              icon={ClipboardList}
              active={currentViewMode === 'items'}
              onClick={() => onSelectViewMode('items')}
              onPrefetch={() => onPrefetchViewMode('items')}
              disabled={locked || onboardingRestricted}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (onboardingRestricted
                    ? onboardingCaption
                    : (!effectiveCanViewItems
                      ? (isOnline ? 'Manage item categories' : 'Reconnect to manage item categories')
                      : (!isOnline
                        ? 'Offline item drafts will sync manually'
                        : (!navigationShiftReady
                          ? 'Protected by POS access PIN'
                          : (isCashierRole ? 'View store items only' : 'Manage items and categories')))))
              }
              testId="pos-nav-items"
              navId="items"
              collapsed={isCollapsed}
            />
          )}
          {showServiceOperations && canAccessServiceOperations && (
            <NavButton
            label={posNavLabel('services', 'Services')}
              icon={CalendarCheck}
              active={currentViewMode === 'services'}
              onClick={() => onSelectViewMode('services')}
              onPrefetch={() => onPrefetchViewMode('services')}
              disabled={locked || !isOnline || onboardingRestricted || !canAccessServiceOperations}
              collapsed={isCollapsed}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline
                    ? 'Available online only'
                    : (onboardingRestricted
                      ? onboardingCaption
                      : (!canAccessServiceOperations
                        ? 'Services view permission required'
                        : 'Appointments, resources, waitlist, reminders, and clients')))
              }
              testId="pos-nav-services"
              navId="services"
            />
          )}
          {shouldShowIncomingQueue && (canViewPos || isAdminBranchMonitor) && (
            <NavButton
            label={`${posNavLabel('orders', 'Orders')} (${incomingCount})`}
              icon={Truck}
              active={currentViewMode === 'incoming_queue'}
              onClick={() => onSelectViewMode('incoming_queue')}
              onPrefetch={() => onPrefetchViewMode('incoming_queue')}
               disabled={locked || !isOnline || onboardingRestricted || !canViewPos || (!hasActiveShift && !isAdminBranchMonitor)}
               caption={
                 locked
                   ? 'Unlock terminal to continue'
                 : (!isOnline ? 'Available online only' : (onboardingRestricted ? onboardingCaption : (!canViewPos ? 'POS view permission required' : (!hasActiveShift ? 'Read-only branch orders; open a shift to process orders' : 'Accept, reject, and progress branch orders'))))
               }
               collapsed={isCollapsed}
             navId="orders"
             />
           )}
          {(effectiveCanTransactPos || effectiveCanCloseShift || canAdjustCashDrawer || canSwitchPosLocation || canViewAdminLocationMonitor) && (
            <NavButton
              label={posNavLabel('shift', 'Shift')}
              icon={ListChecks}
              active={currentViewMode === 'shift_controls' || currentViewMode === 'close_shift' || currentViewMode === 'cash_drawer'}
              onClick={() => onSelectViewMode('shift_controls')}
              onPrefetch={() => onPrefetchViewMode('shift_controls')}
              disabled={locked || onboardingRestricted}
              caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? (allowAdminNavigationWithoutShift ? 'Open or close shifts in admin navigation mode' : 'Open shift to unlock POS selling') : 'Open, monitor, and close the active shift'))}
              testId="pos-nav-shift"
              navId="shift"
              collapsed={isCollapsed}
            />
          )}
        </div>

        <div className={`${isCollapsed ? 'my-3' : 'my-5'} border-t border-slate-200`} />
        {!isCollapsed && <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Settings</p>}
        <div className="space-y-2">
          <NavButton
            label={posNavLabel('settings', 'Settings')}
            icon={Settings}
            active={['location_scope', 'settings_profile', 'settings_pos', 'settings_storefront'].includes(currentViewMode)
              || (currentViewMode === 'terminal_setup' && settingsTargetViewMode === 'terminal_setup')}
            onClick={() => onSelectViewMode(settingsTargetViewMode)}
            onPrefetch={() => onPrefetchViewMode(settingsTargetViewMode)}
            disabled={locked || !isOnline || isBranchReadOnlyView}
            caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : (isBranchReadOnlyView ? 'Exit branch view to change settings' : 'Profile, POS setup, and storefront tools'))}
            testId="pos-nav-settings"
            navId="settings"
            collapsed={isCollapsed}
          />
          {shouldShowPosOnlySetup && (
            <NavButton
              label={posNavLabel('terminal-setup', 'Terminal setup')}
              icon={Settings2}
              active={currentViewMode === 'terminal_setup'}
              onClick={() => onSelectViewMode('terminal_setup')}
              onPrefetch={() => onPrefetchViewMode('terminal_setup')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : (isBranchReadOnlyView ? 'Exit branch view to change terminal settings' : 'Queue scope and local sound; device, printer, and terminal controls'))}
              testId="pos-nav-terminal-setup"
              navId="terminal-setup"
              collapsed={isCollapsed}
            />
          )}
          {/* RF-4 (PR #762 review): #732's own decision record places Vouchers/Pricelists
              between Settings and Affiliates -- shipped order had them after Affiliates instead.
              Gated on canViewVouchers (mirrors routes/pricelists.js's own server-side dual-gate:
              vouchers:view/vouchers:manage OR the legacy settings:view/settings:edit pair), AND
              (RF-8) !isCashierRole -- CASHIER_ALLOWED_VIEW_MODES excludes both new modes, so a
              cashier carrying a custom settings:view grant would otherwise see a button that's
              guaranteed to reject on click. */}
          {canViewVouchers && !isCashierRole && (
            <NavButton
              label={posNavLabel('vouchers', 'Vouchers')}
              icon={Ticket}
              active={currentViewMode === 'settings_vouchers'}
              onClick={() => onSelectViewMode('settings_vouchers')}
              onPrefetch={() => onPrefetchViewMode('settings_vouchers')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Create and manage vouchers, codes, and redemption rules')
              }
              testId="pos-nav-vouchers"
              navId="vouchers"
              collapsed={isCollapsed}
            />
          )}
          {canViewVouchers && !isCashierRole && (
            <NavButton
              label={posNavLabel('pricelists', 'Pricelists')}
              icon={Tags}
              active={currentViewMode === 'settings_pricelists'}
              onClick={() => onSelectViewMode('settings_pricelists')}
              onPrefetch={() => onPrefetchViewMode('settings_pricelists')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Set per-item fixed prices for wholesale/B2B-via-B2C vouchers')
              }
              testId="pos-nav-pricelists"
              navId="pricelists"
              collapsed={isCollapsed}
            />
          )}
          {!isCashierRole && effectiveCanViewAffiliates && (
            <NavButton
              label={posNavLabel('affiliates', 'Affiliates')}
              icon={Percent}
              active={currentViewMode === 'settings_affiliates'}
              onClick={() => onSelectViewMode('settings_affiliates')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Enroll affiliates, set commission rates, and review earnings')
              }
              testId="pos-nav-affiliates"
              navId="affiliates"
              collapsed={isCollapsed}
            />
          )}
          {canViewAudit && (
            <NavButton
              label={posNavLabel('audit', 'Audit')}
              icon={ClipboardCheck}
              active={currentViewMode === 'audit'}
              onClick={() => onSelectViewMode('audit')}
              onPrefetch={() => onPrefetchViewMode('audit')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : (isBranchReadOnlyView ? 'Exit branch view to open the tenant audit log' : 'Admin-only activity log for POS and account changes'))}
              testId="pos-nav-audit"
              navId="audit"
              collapsed={isCollapsed}
            />
          )}
          {canReviewVoidApprovals && !isCashierRole && (
            <NavButton
              label={posNavLabel('approvals', 'Approvals')}
              icon={ShieldCheck}
              active={currentViewMode === 'approvals'}
              onClick={() => onSelectViewMode('approvals')}
              onPrefetch={() => onPrefetchViewMode('approvals')}
              disabled={locked || !isOnline || isBranchReadOnlyView}
              caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : (isBranchReadOnlyView ? 'Exit branch view to review approvals' : 'Review POS void and parked-sale requests'))}
              testId="pos-nav-approvals"
              navId="approvals"
              collapsed={isCollapsed}
            />
          )}
        </div>
          </>
        )}

          <div
          data-testid="pos-sidebar-session-action"
          className={`pointer-events-auto ${isCollapsed ? 'mt-3 pt-3' : 'mt-5 pt-5'} border-t border-slate-200 ${locked ? 'relative z-10' : ''}`}
        >
          {locked ? (
            <Button type="button" className={`${isCollapsed ? 'h-11 w-full rounded-xl p-0' : 'h-12 w-full rounded-lg'} flex items-center justify-center gap-2 bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73]`} onClick={onUnlock} title={isCollapsed ? 'Unlock terminal' : undefined} aria-label={isCollapsed ? 'Unlock terminal' : undefined}>
              <LogIn className="h-4 w-4" />
              {!isCollapsed && 'Unlock Terminal'}
            </Button>
          ) : (
            <Button type="button" variant="outline" className={`${isCollapsed ? 'h-11 w-full rounded-xl p-0' : 'h-12 w-full rounded-lg'} flex items-center justify-center gap-2 border border-slate-300 bg-slate-50 text-[13px] font-extrabold text-[#0F172A] transition hover:bg-slate-100`} onClick={onLock} title={isCollapsed ? 'Lock terminal' : undefined} aria-label={isCollapsed ? 'Lock terminal' : undefined}>
              <Lock className="h-4 w-4" />
              {!isCollapsed && 'Lock Terminal'}
            </Button>
          )}
        </div>
      </div>
      </div>
    </aside>
  );
}
