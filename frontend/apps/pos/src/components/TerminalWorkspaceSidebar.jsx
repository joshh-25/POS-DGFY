import React from 'react';
import {
  Banknote,
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
import { Button } from '@/components/ui/button';
import { resolveAppAssetUrl } from '@/src/utils/assetUrl.js';
const IS_DGFY_POS_SURFACE = import.meta.env.VITE_APP_SURFACE === 'pos';
const DGFY_POS_LOGO = resolveAppAssetUrl('/dgfy-horizontal_logo-removebg-preview.png');

const NavButton = ({ active = false, label, onClick, icon: Icon, disabled = false, caption = '', testId = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    data-testid={testId || undefined}
    className={`flex min-w-0 w-full items-start gap-2.5 rounded-2xl border px-3 py-3 text-left transition ${
      active
        ? 'border-amber-300 bg-gradient-to-br from-amber-500 to-orange-600 text-white shadow-lg shadow-orange-950/20'
        : 'border-white/10 bg-white/[0.06] text-[#F8FAFC] hover:border-amber-200/30 hover:bg-white/[0.09]'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  >
    <Icon className={`mt-0.5 h-[18px] w-[18px] shrink-0 ${active ? 'text-white' : 'text-amber-200'}`} />
    <div className="min-w-0">
      <span className="block truncate text-[12px] font-extrabold leading-4">{label}</span>
      {caption ? <p className={`mt-1 line-clamp-2 text-[10.5px] leading-[14px] ${active ? 'text-white/80' : 'text-amber-50/70'}`}>{caption}</p> : null}
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
  onSelectViewMode = () => {},
  onUnlock = () => {},
  onLock = () => {}
}) {
  const incomingCount = canViewPos && Array.isArray(incomingOrdersState?.orders)
    ? incomingOrdersState.orders.length
    : 0;
  const locations = Array.isArray(locationsState?.locations) ? locationsState.locations : [];
  const selectedLocationName = !queueLocationScopeId
    ? 'Not selected'
    : (locations.find((location) => Number(location.location_id) === Number(queueLocationScopeId))?.name || 'Selected Location');
  const showIncomingQueue = !isMsmeMode;
  const showLocationScope = !isMsmeMode;
  const showAdvancedOps = !isMsmeMode;
  const hasActiveShift = Boolean(shiftState?.shift);
  const sellWorkspaceModes = new Set(['checkout', 'receipt']);

  return (
    <aside
      className={`${className} rounded-none border-0 border-r xl:h-full xl:min-h-0 xl:overflow-hidden`}
      style={{
        background: 'var(--pos-shell-sidebar)',
        borderColor: 'var(--pos-shell-sidebar-border)',
        color: 'var(--pos-shell-sidebar-text)'
      }}
    >
      <div className="dgfy-pos-sidebar-scroll min-h-0 flex-1 overflow-y-auto">
        {showBrand && (
        <div className="relative overflow-hidden px-4 pb-4 pt-5">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.05] px-4 py-4 shadow-lg shadow-black/20">
            <div className="flex items-center justify-between gap-3">
              <img
                src={DGFY_POS_LOGO}
                alt="DGFY"
                className="h-7 w-auto object-contain"
              />
              <span className="rounded-full border border-amber-300/20 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.24em] text-amber-100">
                POS
              </span>
            </div>
            <div className="mt-4 rounded-2xl border border-white/10 bg-black/10 px-3 py-3">
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-amber-100/80">Terminal workspace</p>
              <p className="mt-1 text-sm font-bold text-white">Cashier-first shell</p>
              <p className="mt-1 text-[11px] leading-4 text-amber-50/70">
                Dedicated selling, orders, history, and shift controls separate from SKUpervisor admin screens.
              </p>
            </div>
          </div>
        </div>
        )}

        {IS_DGFY_POS_SURFACE && showIdentityInSidebar && (
        <div className="px-3 pb-3 pt-1">
          <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-amber-400 to-orange-600 text-white shadow-lg shadow-orange-950/30">
              <UserRound className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-[13px] font-extrabold text-white">{terminalUser?.username || 'Locked'}</div>
              <div className="truncate text-[11px] text-amber-50/70">{terminalUser?.email || 'Sign in required'}</div>
            </div>
          </div>
        </div>
        )}

        <div className={`px-3 ${showBrand ? 'py-6' : 'pb-6 pt-3'}`}>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.24em] text-amber-100/75">Primary Modes</p>
        <div className="mt-3 space-y-2">
          <NavButton
            label="Sell"
            icon={ShoppingCart}
            active={sellWorkspaceModes.has(currentViewMode)}
            onClick={() => onSelectViewMode('checkout')}
            disabled={locked || !hasActiveShift}
            caption={locked ? 'Unlock terminal to continue' : (!hasActiveShift ? 'Open shift first to continue' : 'Live selling and cart management')}
          />
          <NavButton
            label="History"
            icon={History}
            active={currentViewMode === 'history'}
            onClick={() => onSelectViewMode('history')}
            disabled={locked || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Invoice lookups and audit trail'))
            }
            testId="pos-nav-history"
          />
          <NavButton
            label="Report"
            icon={BarChart3}
            active={currentViewMode === 'reports'}
            onClick={() => onSelectViewMode('reports')}
            disabled={locked || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Daily totals, popular items, and transactions'))
            }
            testId="pos-nav-reports"
          />
          <NavButton
            label="Items"
            icon={ClipboardList}
            active={currentViewMode === 'items'}
            onClick={() => onSelectViewMode('items')}
            disabled={locked || !canViewPos || !hasActiveShift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Edit SKUpervisor item price and cost'))
            }
            testId="pos-nav-items"
          />
          {showIncomingQueue && (
            <NavButton
              label={`Orders (${incomingCount})`}
              icon={Truck}
              active={currentViewMode === 'incoming_queue'}
              onClick={() => onSelectViewMode('incoming_queue')}
              disabled={locked || !canViewPos || !hasActiveShift}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Accept, reject, and progress online orders'))
              }
            />
          )}
          <NavButton
            label="Shift"
            icon={ListChecks}
            active={currentViewMode === 'shift_controls' || currentViewMode === 'close_shift'}
            onClick={() => onSelectViewMode('shift_controls')}
            disabled={locked}
            caption={locked ? 'Unlock terminal to continue' : (!hasActiveShift ? 'Open shift to unlock POS selling' : 'Open, monitor, and close the active shift')}
          />
        </div>

        <div className="my-5 border-t border-white/10" />
        <p className="mb-3 text-[11px] font-extrabold uppercase tracking-[0.24em] text-amber-100/75">Secondary Actions</p>
        <div className="space-y-2">
          {showLocationScope && (
            <NavButton
              label={`Location Scope: ${selectedLocationName}`}
              icon={MapPinned}
              active={currentViewMode === 'location_scope'}
              onClick={() => onSelectViewMode('location_scope')}
              disabled={locked || !canViewPos || !hasActiveShift}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!hasActiveShift ? 'Open shift first to continue' : (!canViewPos ? 'POS view permission required' : 'Filter queue by fulfillment location'))
              }
            />
          )}
          {showAdvancedOps && (
            <NavButton
              label="Cash Drawer Event"
              icon={Banknote}
              active={currentViewMode === 'cash_drawer'}
              onClick={() => onSelectViewMode('cash_drawer')}
              disabled={locked || !canAdjustCashDrawer || !hasActiveShift}
              caption={
                locked
                  ? 'Unlock terminal to continue'
                  : (!hasActiveShift ? 'Open shift first to enable' : (!canAdjustCashDrawer ? 'Cash drawer permission required' : 'Cash in/out adjustments'))
              }
            />
          )}
          {showAdvancedOps && (
            <NavButton
              label="Terminal Setup Context"
              icon={Settings2}
              active={currentViewMode === 'terminal_setup'}
              onClick={() => onSelectViewMode('terminal_setup')}
              disabled={locked || !hasActiveShift}
              caption={locked ? 'Unlock terminal to continue' : (!hasActiveShift ? 'Open shift first to continue' : 'Compliance and POS setup snapshot')}
            />
          )}
        </div>

        {locked ? (
          <Button type="button" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-amber-200/20 bg-gradient-to-r from-amber-500 to-orange-600 text-[13px] font-extrabold text-white shadow-lg shadow-orange-950/30 hover:from-amber-400 hover:to-orange-500" onClick={onUnlock}>
            <LogIn className="h-4 w-4" />
            Unlock Terminal
          </Button>
        ) : (
          <Button type="button" variant="outline" className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/12 bg-white/[0.06] text-[13px] font-extrabold text-white transition hover:bg-white/[0.11]" onClick={onLock}>
            <Lock className="h-4 w-4" />
            Lock Terminal
          </Button>
        )}
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 text-[11px] leading-5 text-amber-50/70">
          <p className="font-bold text-white">Terminal note</p>
          <p>POS keeps selling controls separate from SKUpervisor workspace management and reporting.</p>
        </div>
      </div>
      </div>
    </aside>
  );
}
