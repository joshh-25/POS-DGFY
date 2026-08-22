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
  MapPinned,
  Percent,
  Settings2,
  ShoppingCart,
  Tags,
  Ticket,
  Truck,
  UserRound
} from 'lucide-react';
import { Button } from '../../../../Components/ui/button.jsx';
import { resolveAppAssetUrl } from '../../../utils/assetUrl.js';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const DGFY_POS_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');

const NavButton = ({
  active = false,
  label,
  onClick,
  onPrefetch,
  icon: Icon,
  disabled = false,
  caption = '',
  testId = '',
  collapsed = false
}) => (
  <button
    type="button"
    onClick={onClick}
    onPointerEnter={onPrefetch}
    onFocus={onPrefetch}
    disabled={disabled}
    title={collapsed ? label : undefined}
    aria-label={collapsed ? label : undefined}
    data-testid={testId || undefined}
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
  canViewPos = false,
  canViewAudit = false,
  canViewVouchers = false,
  canManageCategories = false,
  showServiceOperations = false,
  showIncomingQueue = true,
  canAccessServiceOperations = false,
  allowAdminNavigationWithoutShift = false,
  canAdjustCashDrawer = false,
  canCloseDay = false,
  shiftState = { shift: null },
  incomingOrdersState = { orders: [] },
  locationsState = { locations: [] },
  operatingLocationId = null,
  terminalMeta = null,
  queueLocationScopeId = null,
  queueSummary = {},
  onboardingRestricted = false,
  settingsTargetViewMode = 'settings_profile',
  onSelectViewMode = () => {},
  onPrefetchViewMode = () => {},
  onUnlock = () => {},
  onLock = () => {}
}) {
  const incomingCount = canViewPos && Array.isArray(incomingOrdersState?.orders)
    ? incomingOrdersState.orders.length
    : 0;
  const normalizedRole = String(terminalUser?.role || '').trim().toLowerCase();
  const isCashierRole = normalizedRole === 'cashier';
  const shouldShowIncomingQueue = showIncomingQueue;
  const hasActiveShift = Boolean(shiftState?.shift);
  const navigationShiftReady = hasActiveShift || allowAdminNavigationWithoutShift;
  const canAccessItemsWorkspace = canViewPos || canManageCategories;
  const sellWorkspaceModes = new Set(['checkout', 'receipt']);
  const onboardingCaption = 'Finish onboarding in Settings first';

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

  const locationsList = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const activeLocation = locationsList.find(
    (loc) => String(loc?.id || loc?.location_id || '').trim() === String(operatingLocationId || queueLocationScopeId || '').trim()
  ) || locationsList[0];

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
          {(resolvedCompanyName || resolvedBranchName) ? (
            <div className="mt-1.5 min-w-0 px-1 text-center">
              {resolvedCompanyName ? (
                <div
                  className="truncate text-[13px] font-extrabold text-[#0F172A] leading-snug"
                  title={resolvedCompanyName}
                >
                  {resolvedCompanyName}
                </div>
              ) : null}
              {resolvedBranchName ? (
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
              className="h-8 w-8 object-cover object-left"
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
        {!isCollapsed && <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Primary Modes</p>}
        <div className={isCollapsed ? 'space-y-2' : 'mt-3 space-y-2'}>
          <NavButton
            label="Sell"
            icon={ShoppingCart}
            active={sellWorkspaceModes.has(currentViewMode)}
            onClick={() => onSelectViewMode('checkout')}
            onPrefetch={() => onPrefetchViewMode('checkout')}
            disabled={locked || onboardingRestricted || !navigationShiftReady}
            caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (!navigationShiftReady ? 'Open shift first to continue' : (hasActiveShift ? 'Live selling and cart management' : 'Admin can browse, but checkout stays blocked until a shift is opened')))}
            collapsed={isCollapsed}
          />
          <NavButton
            label="History"
            icon={History}
            active={currentViewMode === 'history'}
            onClick={() => onSelectViewMode('history')}
            onPrefetch={() => onPrefetchViewMode('history')}
            disabled={locked || onboardingRestricted || !canViewPos}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (onboardingRestricted ? onboardingCaption : (!canViewPos ? 'POS view permission required' : (hasActiveShift ? 'Invoice lookups and audit trail' : 'Admin review available without an active shift')))
            }
            testId="pos-nav-history"
            collapsed={isCollapsed}
          />
          {!isCashierRole && (
            <NavButton
              label="Report"
              icon={BarChart3}
              active={currentViewMode === 'reports'}
              onClick={() => onSelectViewMode('reports')}
              onPrefetch={() => onPrefetchViewMode('reports')}
              disabled={locked || onboardingRestricted || !canViewPos}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                : (!isOnline ? 'Cached offline estimate only' : (onboardingRestricted ? onboardingCaption : (!canViewPos ? 'POS view permission required' : 'Daily totals, popular items, and transactions')))
              }
              testId="pos-nav-reports"
              collapsed={isCollapsed}
            />
          )}
          <NavButton
            label="Items"
            icon={ClipboardList}
            active={currentViewMode === 'items'}
            onClick={() => onSelectViewMode('items')}
            onPrefetch={() => onPrefetchViewMode('items')}
            disabled={locked || onboardingRestricted || !canAccessItemsWorkspace}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (onboardingRestricted
                  ? onboardingCaption
                  : (!canAccessItemsWorkspace
                    ? 'POS view or category-management permission required'
                    : (!canViewPos
                      ? (isOnline ? 'Manage item categories' : 'Reconnect to manage item categories')
                      : (!isOnline
                        ? 'Offline item drafts will sync manually'
                        : (!navigationShiftReady
                          ? 'Protected by POS access PIN'
                          : (isCashierRole ? 'View store items only' : 'Manage items and categories'))))))
            }
            testId="pos-nav-items"
            collapsed={isCollapsed}
          />
          {showServiceOperations && (
            <NavButton
              label="Services"
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
            />
          )}
          {shouldShowIncomingQueue && (
            <NavButton
              label={`Orders (${incomingCount})`}
              icon={Truck}
              active={currentViewMode === 'incoming_queue'}
              onClick={() => onSelectViewMode('incoming_queue')}
              onPrefetch={() => onPrefetchViewMode('incoming_queue')}
               disabled={locked || !isOnline || onboardingRestricted || !canViewPos || !hasActiveShift}
               caption={
                 locked
                   ? 'Unlock terminal to continue'
                 : (!isOnline ? 'Available online only' : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to view branch orders' : (!canViewPos ? 'POS view permission required' : 'Accept, reject, and progress branch orders'))))
               }
               collapsed={isCollapsed}
             />
           )}
          <NavButton
            label="Shift"
            icon={ListChecks}
            active={currentViewMode === 'shift_controls' || currentViewMode === 'close_shift' || currentViewMode === 'cash_drawer'}
            onClick={() => onSelectViewMode('shift_controls')}
            onPrefetch={() => onPrefetchViewMode('shift_controls')}
            disabled={locked || onboardingRestricted}
            caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? (allowAdminNavigationWithoutShift ? 'Open or close shifts in admin navigation mode' : 'Open shift to unlock POS selling') : 'Open, monitor, and close the active shift'))}
            collapsed={isCollapsed}
          />
        </div>

        <div className={`${isCollapsed ? 'my-3' : 'my-5'} border-t border-slate-200`} />
        {!isCollapsed && <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Settings</p>}
        <div className="space-y-2">
          <NavButton
            label="Settings"
            icon={Settings2}
            active={['location_scope', 'terminal_setup', 'settings_profile', 'settings_pos', 'settings_storefront'].includes(currentViewMode)}
            onClick={() => onSelectViewMode(settingsTargetViewMode)}
            onPrefetch={() => onPrefetchViewMode(settingsTargetViewMode)}
            disabled={locked || !isOnline}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!isOnline ? 'Available online only' : (isCashierRole
                  ? 'Profile, POS setup, and storefront tools'
                  : 'Profile, POS setup, and storefront tools'))
            }
            testId="pos-nav-settings"
            collapsed={isCollapsed}
          />
          {/* RF-4 (PR #762 review): #732's own decision record places Vouchers/Pricelists
              between Settings and Affiliates -- shipped order had them after Affiliates instead.
              Gated on canViewVouchers (mirrors routes/pricelists.js's own server-side dual-gate:
              vouchers:view/vouchers:manage OR the legacy settings:view/settings:edit pair), AND
              (RF-8) !isCashierRole -- CASHIER_ALLOWED_VIEW_MODES excludes both new modes, so a
              cashier carrying a custom settings:view grant would otherwise see a button that's
              guaranteed to reject on click. */}
          {canViewVouchers && !isCashierRole && (
            <NavButton
              label="Vouchers"
              icon={Ticket}
              active={currentViewMode === 'settings_vouchers'}
              onClick={() => onSelectViewMode('settings_vouchers')}
              onPrefetch={() => onPrefetchViewMode('settings_vouchers')}
              disabled={locked || !isOnline}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Create and manage vouchers, codes, and redemption rules')
              }
              testId="pos-nav-vouchers"
              collapsed={isCollapsed}
            />
          )}
          {canViewVouchers && !isCashierRole && (
            <NavButton
              label="Pricelists"
              icon={Tags}
              active={currentViewMode === 'settings_pricelists'}
              onClick={() => onSelectViewMode('settings_pricelists')}
              onPrefetch={() => onPrefetchViewMode('settings_pricelists')}
              disabled={locked || !isOnline}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Set per-item fixed prices for wholesale/B2B-via-B2C vouchers')
              }
              testId="pos-nav-pricelists"
              collapsed={isCollapsed}
            />
          )}
          {!isCashierRole && (
            <NavButton
              label="Affiliates"
              icon={Percent}
              active={currentViewMode === 'settings_affiliates'}
              onClick={() => onSelectViewMode('settings_affiliates')}
              disabled={locked || !isOnline}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!isOnline ? 'Available online only' : 'Enroll affiliates, set commission rates, and review earnings')
              }
              testId="pos-nav-affiliates"
              collapsed={isCollapsed}
            />
          )}
          {canViewAudit && (
            <NavButton
              label="Audit"
              icon={ClipboardCheck}
              active={currentViewMode === 'audit'}
              onClick={() => onSelectViewMode('audit')}
              onPrefetch={() => onPrefetchViewMode('audit')}
              disabled={locked || !isOnline}
              caption={locked ? 'Unlock terminal to continue' : (!isOnline ? 'Available online only' : 'Admin-only activity log for POS and account changes')}
              testId="pos-nav-audit"
              collapsed={isCollapsed}
            />
          )}
        </div>

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
