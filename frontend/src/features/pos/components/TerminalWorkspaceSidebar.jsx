import React from 'react';
import {
  BarChart3,
  ClipboardList,
  History,
  ListChecks,
  LogIn,
  Lock,
  MapPinned,
  Settings2,
  ShoppingCart,
  Truck,
  UserRound
} from 'lucide-react';
import { Button } from '../../../../Components/ui/button.jsx';
import { resolveAppAssetUrl } from '../../../utils/assetUrl.js';

const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const DGFY_POS_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');

const NavButton = ({ active = false, label, onClick, icon: Icon, disabled = false, caption = '', testId = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId || undefined}
    className={`flex min-w-0 w-full items-start gap-2.5 rounded-lg border px-2.5 py-2.5 text-left transition ${
      active
        ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-sm shadow-blue-900/20'
        : 'border-slate-200 bg-white text-[#0F172A] hover:border-blue-200 hover:bg-slate-50'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  >
    <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-[#1A4E8D]'}`} />
    <div className="min-w-0">
      <span className="block truncate text-[12px] font-extrabold leading-4">{label}</span>
      {caption ? <p className={`mt-1 line-clamp-2 text-[10.5px] leading-[14px] ${active ? 'text-white/80' : 'text-[#64748B]'}`}>{caption}</p> : null}
    </div>
  </button>
);

export default function TerminalWorkspaceSidebar({
  className = '',
  showBrand = true,
  showIdentityInSidebar = false,
  locked = false,
  isMsmeMode = false,
  terminalUser = null,
  currentViewMode = 'checkout',
  canViewPos = false,
  canAdjustCashDrawer = false,
  canCloseDay = false,
  shiftState = { shift: null },
  incomingOrdersState = { orders: [] },
  locationsState = { locations: [] },
  queueLocationScopeId = null,
  queueSummary = {},
  onboardingRestricted = false,
  settingsTargetViewMode = 'settings_profile',
  onSelectViewMode = () => {},
  onUnlock = () => {},
  onLock = () => {}
}) {
  const incomingCount = canViewPos && Array.isArray(incomingOrdersState?.orders)
    ? incomingOrdersState.orders.length
    : 0;
  const showIncomingQueue = !isMsmeMode;
  const showAdvancedOps = !isMsmeMode;
  const hasActiveShift = Boolean(shiftState?.shift);
  const sellWorkspaceModes = new Set(['checkout', 'receipt']);
  const onboardingCaption = 'Finish onboarding in Settings first';

  return (
    <aside
      className={`${className} rounded-none border-0 border-r border-slate-200 bg-white shadow-sm xl:h-full xl:min-h-0 xl:overflow-hidden`}
      style={{
        background: 'var(--pos-shell-sidebar)',
        borderColor: 'var(--pos-shell-sidebar-border)',
        color: 'var(--pos-shell-sidebar-text)'
      }}
    >
      <div className="dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        {showBrand && (
        <div className="relative h-[60px] overflow-hidden bg-transparent px-4">
          <div className="flex h-full items-center justify-center">
            <img
              src={DGFY_POS_LOGO}
              alt="DGFY"
              className="w-[120px] h-auto object-contain"
            />
          </div>
        </div>
        )}

        {IS_DGFY_POS_SURFACE && showIdentityInSidebar && (
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

        <div className={`px-3 ${showBrand ? 'py-6' : 'pb-6 pt-3'}`}>
        <p className="text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Primary Modes</p>
        <div className="mt-3 space-y-2">
          <NavButton
            label="Sell"
            icon={ShoppingCart}
            active={sellWorkspaceModes.has(currentViewMode)}
            onClick={() => onSelectViewMode('checkout')}
            disabled={locked || onboardingRestricted || !hasActiveShift}
            caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to continue' : 'Live selling and cart management'))}
          />
          <NavButton
            label="History"
            icon={History}
            active={currentViewMode === 'history'}
            onClick={() => onSelectViewMode('history')}
            disabled={locked || onboardingRestricted || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Invoice lookups and audit trail')))
            }
            testId="pos-nav-history"
          />
          <NavButton
            label="Report"
            icon={BarChart3}
            active={currentViewMode === 'reports'}
            onClick={() => onSelectViewMode('reports')}
            disabled={locked || onboardingRestricted || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Daily totals, popular items, and transactions')))
            }
            testId="pos-nav-reports"
          />
          <NavButton
            label="Items"
            icon={ClipboardList}
            active={currentViewMode === 'items'}
            onClick={() => onSelectViewMode('items')}
            disabled={locked || onboardingRestricted || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Edit SKUpervisor item price and cost')))
            }
            testId="pos-nav-items"
          />
          {showIncomingQueue && (
            <NavButton
              label={`Orders (${incomingCount})`}
              icon={Truck}
              active={currentViewMode === 'incoming_queue'}
              onClick={() => onSelectViewMode('incoming_queue')}
               disabled={locked || onboardingRestricted || !canViewPos || !hasActiveShift}
               caption={
                 locked
                   ? 'Unlock terminal to continue'
                 : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Accept, reject, and progress online orders')))
               }
             />
           )}
          <NavButton
            label="Shift"
            icon={ListChecks}
            active={currentViewMode === 'shift_controls' || currentViewMode === 'close_shift' || currentViewMode === 'cash_drawer'}
            onClick={() => onSelectViewMode('shift_controls')}
            disabled={locked || onboardingRestricted}
            caption={locked ? 'Unlock terminal to continue' : (onboardingRestricted ? onboardingCaption : (!hasActiveShift ? 'Open shift to unlock POS selling' : 'Open, monitor, and close the active shift'))}
          />
        </div>

        <div className="my-5 border-t border-slate-200" />
        <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-[#334155]">Settings</p>
        <div className="space-y-2">
          {showAdvancedOps && (
            <NavButton
              label="Settings"
              icon={Settings2}
              active={['location_scope', 'terminal_setup', 'settings_profile', 'settings_pos', 'settings_storefront'].includes(currentViewMode)}
              onClick={() => onSelectViewMode(settingsTargetViewMode)}
              disabled={locked ? true : false}
              caption={locked ? 'Unlock terminal to continue' : 'Profile, POS setup, and storefront tools'}
            />
          )}
        </div>

        {locked ? (
          <Button type="button" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#1A4E8D] text-[13px] font-extrabold text-white hover:bg-[#143F73]" onClick={onUnlock}>
            <LogIn className="h-4 w-4" />
            Unlock Terminal
          </Button>
        ) : (
          <Button type="button" variant="outline" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-50 text-[13px] font-extrabold text-[#0F172A] transition hover:bg-slate-100" onClick={onLock}>
            <Lock className="h-4 w-4" />
            Lock Terminal
          </Button>
        )}
      </div>
      </div>
    </aside>
  );
}
