import React from 'react';
import {
  Banknote,
  Clock3,
  History,
  ListChecks,
  LogIn,
  Lock,
  MapPinned,
  Settings2,
  Receipt,
  ShoppingCart,
  Truck
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const NavButton = ({ active = false, label, onClick, icon: Icon, disabled = false, caption = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className={`w-full rounded-xl border px-3 py-2 text-left transition ${
      active
        ? 'border-teal-300 bg-teal-50 text-teal-800'
        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
    } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
  >
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4" />
      <span className="text-sm font-semibold">{label}</span>
    </div>
    {caption ? <p className="mt-1 text-xs text-slate-500">{caption}</p> : null}
  </button>
);

export default function TerminalWorkspaceSidebar({
  className = '',
  showScrollZoneBadge = true,
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

  return (
    <aside
      className={`${className} flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:h-full xl:min-h-0 xl:overflow-y-auto xl:overscroll-contain`}
    >
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cashier Workspace</p>
        <p className="mt-1 text-sm font-semibold text-slate-900">{terminalUser?.username || 'Terminal Locked'}</p>
        <p className="text-xs text-slate-500">{shiftState?.shift ? 'Shift Open' : 'Shift Closed'}</p>
      </div>
      {showScrollZoneBadge && (
        <div className="flex justify-end">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Scroll Zone: Cashier
          </span>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Primary Modes</p>
        <NavButton
          label="Sell"
          icon={ShoppingCart}
          active={currentViewMode === 'checkout'}
          onClick={() => onSelectViewMode('checkout')}
          disabled={locked}
          caption={locked ? 'Unlock terminal to continue' : 'Live selling and cart management'}
        />
        {showIncomingQueue && (
          <NavButton
            label={`Orders (${incomingCount})`}
            icon={Truck}
            active={currentViewMode === 'incoming_queue'}
            onClick={() => onSelectViewMode('incoming_queue')}
            disabled={locked || !canViewPos}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!canViewPos ? 'POS view permission required' : 'Accept, reject, and progress online orders')
            }
          />
        )}
        <NavButton
          label="Shift"
          icon={ListChecks}
          active={currentViewMode === 'shift_controls'}
          onClick={() => onSelectViewMode('shift_controls')}
          disabled={locked}
          caption={locked ? 'Unlock terminal to continue' : 'Open shift, monitor cash, and status'}
        />
        <NavButton
          label="History"
          icon={History}
          active={currentViewMode === 'history'}
          onClick={() => onSelectViewMode('history')}
          disabled={locked || !canViewPos}
          caption={locked ? 'Unlock terminal to continue' : (!canViewPos ? 'POS view permission required' : 'Invoice lookups and audit trail')}
        />
        <NavButton
          label="Receipt"
          icon={Receipt}
          active={currentViewMode === 'receipt'}
          onClick={() => onSelectViewMode('receipt')}
          disabled={locked}
          caption={locked ? 'Unlock terminal to continue' : 'Review the latest receipt draft'}
        />
      </div>

      {showLocationScope && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Secondary Actions</p>
          <NavButton
            label={`Location Scope: ${selectedLocationName}`}
            icon={MapPinned}
            active={currentViewMode === 'location_scope'}
            onClick={() => onSelectViewMode('location_scope')}
            disabled={locked || !canViewPos}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!canViewPos ? 'POS view permission required' : 'Filter queue by fulfillment location')
            }
          />
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-2">
        {showAdvancedOps && (
          <NavButton
            label="Cash Drawer Event"
            icon={Banknote}
            active={currentViewMode === 'cash_drawer'}
            onClick={() => onSelectViewMode('cash_drawer')}
            disabled={locked || !canAdjustCashDrawer || !shiftState?.shift}
            caption={
              locked
                ? 'Unlock terminal to continue'
                : (!shiftState?.shift ? 'Open shift first to enable' : (!canAdjustCashDrawer ? 'Cash drawer permission required' : 'Cash in/out adjustments'))
            }
          />
        )}
        <NavButton
          label="Close Shift"
          icon={Lock}
          active={currentViewMode === 'close_shift'}
          onClick={() => onSelectViewMode('close_shift')}
          disabled={locked || !shiftState?.shift || !canCloseDay}
          caption={
            locked
              ? 'Unlock terminal to continue'
              : (!shiftState?.shift ? 'No active shift to close' : (!canCloseDay ? 'Close-day permission required' : 'Finalize shift and closing cash'))
          }
        />
        {showAdvancedOps && (
          <NavButton
            label="Sales Today"
            icon={Clock3}
            active={currentViewMode === 'sales_today'}
            onClick={() => onSelectViewMode('sales_today')}
            disabled={locked}
            caption={locked ? 'Unlock terminal to continue' : 'Daily totals and breakdowns'}
          />
        )}
        {showAdvancedOps && (
          <NavButton
            label="Terminal Setup Context"
            icon={Settings2}
            active={currentViewMode === 'terminal_setup'}
            onClick={() => onSelectViewMode('terminal_setup')}
            disabled={locked}
            caption={locked ? 'Unlock terminal to continue' : 'Compliance and POS setup snapshot'}
          />
        )}
      </div>

      {locked ? (
        <Button type="button" onClick={onUnlock}>
          <LogIn className="mr-2 h-4 w-4" />
          Unlock Terminal
        </Button>
      ) : (
        <Button type="button" variant="outline" onClick={onLock}>
          <Lock className="mr-2 h-4 w-4" />
          Lock Terminal
        </Button>
      )}
    </aside>
  );
}
