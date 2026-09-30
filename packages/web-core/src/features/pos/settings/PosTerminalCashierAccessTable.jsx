import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Info, KeyRound, ListChecks, ShieldCheck, Trash2, UserRoundPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { resolveUserPermissionList } from '../utils/terminalWorkspaceUtils.js';
import { POS_TABLE_HEADER_STANDARD_CLASS, POS_TABLE_SURFACE_CLASS } from '../components/PosTableSurface.jsx';
import PosSearchField from '../components/PosSearchField.jsx';

const permissionSwitchClass = (enabled) => `relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors ${
  enabled ? 'border-[#2563EB] bg-[#2563EB]' : 'border-slate-300 bg-slate-200'
} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/20 disabled:cursor-not-allowed disabled:opacity-60`;

function PermissionSwitch({ label, ariaLabel, enabled, onChange, disabled, testId, layout = 'spread' }) {
  const layoutClass = layout === 'inline'
    ? 'inline-flex min-w-0 items-center gap-2'
    : layout === 'grid-cell'
      ? 'contents'
      : 'grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2';
  return (
    <div className={layoutClass}>
      <span className="min-w-0 truncate text-[11px] font-extrabold text-[#334155]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-label={ariaLabel || label}
        aria-checked={enabled}
        data-testid={testId}
        onClick={() => onChange(!enabled)}
        disabled={disabled}
        className={permissionSwitchClass(enabled)}
      >
        <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${enabled ? 'translate-x-5' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function CashierName({ cashier, canRemoveCashiers = false, onRemove = () => {}, disabled = false }) {
  const cashierLabel = cashier?.username || cashier?.email || `cashier ${cashier?.user_id || ''}`;

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-[#1A4E8D]">
        {String(cashier?.username || cashier?.email || '?').trim().slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-bold text-[#0F172A] sm:text-[14px]">
          {cashier?.username || cashier?.email || `Cashier ${cashier?.user_id || ''}`}
        </p>
        <p className="truncate text-[11px] font-medium text-[#64748B]">{cashier?.email || 'No account email'}</p>
        {canRemoveCashiers ? (
          <Button
            type="button"
            variant="outline"
            data-testid={`remove-cashier-${cashier.user_id}`}
            aria-label={`Remove cashier ${cashierLabel}`}
            className="mt-1 h-7 whitespace-nowrap rounded-md border-rose-200 px-2 text-[10px] font-extrabold text-rose-700 hover:bg-rose-50"
            onClick={() => onRemove(cashier)}
            disabled={disabled}
          >
            <Trash2 className="mr-1 h-3 w-3" aria-hidden="true" />
            Remove access
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function TerminalAssignmentControl({ cashier, terminals = [], assignedTerminalIndexes = [], onSave, disabled }) {
  const [open, setOpen] = useState(false);
  const [pendingIndexes, setPendingIndexes] = useState(() => new Set(assignedTerminalIndexes));
  const [saving, setSaving] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const cashierLabel = cashier?.username || cashier?.email || `cashier ${cashier?.user_id || ''}`;
  const assignedCount = assignedTerminalIndexes.length;

  const updatePosition = () => {
    const trigger = triggerRef.current;
    if (!trigger || typeof window === 'undefined') return;
    const anchor = trigger.getBoundingClientRect();
    const width = Math.min(288, Math.max(220, window.innerWidth - 32));
    const estimatedHeight = Math.min(360, 136 + (terminals.length * 40));
    const left = Math.min(
      Math.max(16, anchor.right - width),
      Math.max(16, window.innerWidth - width - 16)
    );
    const belowTop = anchor.bottom + 8;
    const top = belowTop + estimatedHeight <= window.innerHeight - 16
      ? belowTop
      : Math.max(16, anchor.top - estimatedHeight - 8);
    setPosition({ left, top, width });
  };

  useEffect(() => {
    if (!open) return undefined;
    updatePosition();
    const handleOutside = (event) => {
      if (!triggerRef.current?.contains(event.target) && !popoverRef.current?.contains(event.target)) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, terminals.length]);

  const openPopover = () => {
    setPendingIndexes(new Set(assignedTerminalIndexes));
    setOpen(true);
  };

  const toggleTerminal = (terminalIndex) => {
    setPendingIndexes((current) => {
      const next = new Set(current);
      if (next.has(terminalIndex)) next.delete(terminalIndex);
      else next.add(terminalIndex);
      return next;
    });
  };

  const applyAssignments = async () => {
    setSaving(true);
    try {
      const saved = await onSave?.(Array.from(pendingIndexes));
      if (saved !== false) setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-label={`Assign ${cashierLabel} to terminals`}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={open ? () => setOpen(false) : openPopover}
        disabled={disabled || terminals.length === 0}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-blue-200 px-2.5 text-[10px] font-extrabold text-[#1A4E8D] transition-colors hover:border-[#1A4E8D] hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ListChecks className="h-3.5 w-3.5" aria-hidden="true" />
        {assignedCount > 0 ? `${assignedCount} assigned` : 'Assign'}
      </button>
      {open && position && typeof document !== 'undefined'
        ? createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={`Assign ${cashierLabel} to terminals`}
            style={{ left: position.left, top: position.top, width: position.width }}
            className="fixed z-[70] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-300/50"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2">
              <div className="min-w-0">
                <p className="text-[14px] font-bold text-[#0F172A]">Assign terminals</p>
                <p className="mt-0.5 truncate text-[11px] font-medium text-[#64748B]">{cashierLabel}</p>
              </div>
              <button type="button" aria-label="Close terminal assignment" onClick={() => setOpen(false)} className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div role="group" aria-label="Available terminals" className="mt-2 max-h-56 space-y-1 overflow-y-auto">
              {terminals.map((terminalOption) => {
                const selected = pendingIndexes.has(terminalOption.index);
                return (
                  <button
                    key={`cashier-terminal-option-${terminalOption.index}`}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleTerminal(terminalOption.index)}
                    disabled={saving}
                    className={`flex w-full items-center justify-between gap-3 rounded-lg border px-2.5 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${selected ? 'border-blue-200 bg-blue-50 text-[#1A4E8D]' : 'border-transparent text-[#334155] hover:border-slate-200 hover:bg-slate-50'}`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-extrabold">{terminalOption.terminalId}</span>
                      <span className="block truncate text-[11px] font-medium text-slate-500">{terminalOption.label || 'No terminal label'}{terminalOption.isActive === false ? ' · Inactive' : ''}</span>
                    </span>
                    <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md border ${selected ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white' : 'border-slate-300 bg-white text-transparent'}`} aria-hidden="true">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
              <span className="text-[11px] font-medium text-slate-500">{pendingIndexes.size} selected</span>
              <Button type="button" className="h-8 rounded-lg bg-[#1A4E8D] px-3 text-[13px] font-extrabold text-white hover:bg-[#123B6D] sm:text-[14px]" onClick={applyAssignments} disabled={saving}>
                {saving ? 'Saving…' : 'Done'}
              </Button>
            </div>
          </div>,
          document.body
        )
        : null}
    </>
  );
}

function MobileCashierTable({
  visibleCashiers,
  assignmentTerminals,
  getAssignedTerminalIndexes,
  onAssignCashier,
  terminalRegistrySaving,
  discountApprovers,
  discountApproversLoading,
  canManageDiscountApprovalPins,
  discountAuthorizationSavingUserId,
  setApprovalPinUser,
  setApprovalPin,
  dayCloseOperators,
  dayCloseOperatorsLoading,
  canManageDayClosePins,
  dayCloseAccessSavingUserId,
  setDayClosePinUser,
  cashierVoidAccessSavingUserId,
  updateDiscountAuthorization,
  updateDayCloseAccess,
  updateCashierVoidAccess,
  updateCashierDrawerAccess,
  canRemoveCashiers,
  setCashierRemoveUser,
  locked,
  loading
}) {
  return (
    <div className="min-w-0 md:hidden">
      <p className="mb-2 px-1 text-[11px] font-medium text-slate-500">Swipe horizontally to view all permissions.</p>
      <div
        className={`${POS_TABLE_SURFACE_CLASS} min-w-0 overflow-x-auto overscroll-x-contain`}
        role="region"
        aria-label="Cashier permissions table on mobile"
        tabIndex={0}
      >
        <table className="w-full min-w-[720px] table-fixed text-left text-[12px]">
          <caption className="sr-only">Cashier permissions for the selected terminal. Swipe horizontally to view all columns.</caption>
          <colgroup>
            <col className="w-[190px]" />
            <col className="w-[135px]" />
            <col className="w-[125px]" />
            <col className="w-[190px]" />
            <col className="w-[100px]" />
          </colgroup>
          <thead className={`${POS_TABLE_HEADER_STANDARD_CLASS} bg-slate-50 text-[10px] font-extrabold uppercase tracking-wide text-[#334155]`}>
            <tr>
              <th scope="col" className="px-2">Cashier</th>
              <th scope="col" aria-label="POS Discount Authorization" title="POS Discount Authorization" className="px-2">Discount</th>
              <th scope="col" aria-label="Day Close Access" title="Day Close Access" className="px-2">Day close</th>
              <th scope="col" aria-label="Cashier Void and Cash Authorization" title="Cashier Void and Cash Authorization" className="px-2">Void / cash</th>
              <th scope="col" aria-label="Assigned terminals" title="Assigned terminals" className="px-2 text-right">Terminals</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visibleCashiers.map((cashier) => {
              const cashierPermissions = resolveUserPermissionList(cashier);
              const discountRecord = discountApprovers.find((entry) => Number(entry?.user_id) === Number(cashier?.user_id)) || cashier;
              const dayCloseRecord = dayCloseOperators.find((entry) => Number(entry?.user_id) === Number(cashier?.user_id)) || cashier;
              const hasDiscountAccess = discountRecord?.is_master_admin === true
                || ['admin', 'manager'].includes(String(discountRecord?.role || '').toLowerCase())
                || resolveUserPermissionList(discountRecord).includes('pos:discount_authorize');
              const hasDayCloseAccess = dayCloseRecord?.is_master_admin === true
                || resolveUserPermissionList(dayCloseRecord).includes('pos:close_day');
              const hasVoidAccess = cashierPermissions.includes('pos:void');
              const hasDrawerAccess = cashierPermissions.includes('pos:cash_drawer_adjust');
              const cashierLabel = cashier.username || cashier.email || `cashier ${cashier.user_id}`;
              const savingVoidAccess = Number(cashierVoidAccessSavingUserId) === Number(cashier?.user_id);
              const savingDiscountAccess = Number(discountAuthorizationSavingUserId) === Number(cashier?.user_id);
              const savingDayCloseAccess = Number(dayCloseAccessSavingUserId) === Number(cashier?.user_id);
              const permissionDisabled = locked || loading;

              return (
                <tr key={`mobile-terminal-cashier-row-${cashier.user_id}`} className="align-top">
                  <td className="px-2 py-2.5 align-middle">
                    <CashierName cashier={cashier} canRemoveCashiers={canRemoveCashiers} onRemove={setCashierRemoveUser} disabled={permissionDisabled} />
                  </td>
                  <td className="px-2 py-2.5">
                    <PermissionSwitch
                      label={hasDiscountAccess ? 'Enabled' : 'Disabled'}
                      ariaLabel={`Can authorize discounts for ${cashierLabel}`}
                      enabled={hasDiscountAccess}
                      onChange={() => updateDiscountAuthorization(discountRecord, !hasDiscountAccess)}
                      disabled={permissionDisabled || !canManageDiscountApprovalPins || savingDiscountAccess || discountApproversLoading}
                      testId={`mobile-pos-cashier-discount-toggle-${cashier.user_id}`}
                      layout="inline"
                    />
                    {canManageDiscountApprovalPins ? (
                      hasDiscountAccess ? (
                        <Button
                          type="button"
                          variant="default"
                          className="mt-2 h-7 rounded-md border border-teal-600 bg-teal-600 px-2 text-[10px] font-extrabold text-white hover:bg-teal-700 hover:text-white focus-visible:ring-teal-500"
                          onClick={() => {
                            setApprovalPinUser(discountRecord);
                            setApprovalPin('');
                          }}
                          disabled={permissionDisabled || savingDiscountAccess}
                        >
                          <KeyRound className="mr-1 h-3 w-3" />
                          {discountRecord?.pos_approval_pin_configured ? 'Reset PIN' : 'Set PIN'}
                        </Button>
                      ) : (
                        <span className="mt-1 block text-[11px] font-medium leading-4 text-slate-400">Enable access to set PIN</span>
                      )
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5">
                    <PermissionSwitch
                      label={hasDayCloseAccess ? 'Enabled' : 'Disabled'}
                      ariaLabel={`Can generate Z-reading for ${cashierLabel}`}
                      enabled={hasDayCloseAccess}
                      onChange={() => updateDayCloseAccess(dayCloseRecord, !hasDayCloseAccess)}
                      disabled={permissionDisabled || !canManageDayClosePins || savingDayCloseAccess || dayCloseOperatorsLoading}
                      testId={`mobile-pos-cashier-day-close-toggle-${cashier.user_id}`}
                      layout="inline"
                    />
                    {canManageDayClosePins && hasDayCloseAccess ? (
                      dayCloseRecord?.pos_day_close_pin_configured ? (
                        <Button
                          type="button"
                          variant="outline"
                          className="mt-2 h-7 rounded-md px-2 text-[10px] font-extrabold text-blue-700"
                          onClick={() => setDayClosePinUser(dayCloseRecord)}
                          disabled={permissionDisabled || savingDayCloseAccess}
                        >
                          <KeyRound className="mr-1 h-3 w-3" />
                          Reset PIN
                        </Button>
                      ) : (
                        <span className="mt-1 block text-[11px] font-medium leading-4 text-amber-700">PIN setup pending</span>
                      )
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5">
                    <div className="grid gap-2">
                      <PermissionSwitch
                        label={hasVoidAccess ? 'Void enabled' : 'Void disabled'}
                        ariaLabel={`Can void POS transactions for ${cashierLabel}`}
                        enabled={hasVoidAccess}
                        onChange={() => updateCashierVoidAccess(cashier, !hasVoidAccess)}
                        disabled={permissionDisabled || savingVoidAccess}
                        testId={`mobile-pos-cashier-void-toggle-${cashier.user_id}`}
                        layout="inline"
                      />
                      <PermissionSwitch
                        label={hasDrawerAccess ? 'Cash enabled' : 'Cash disabled'}
                        ariaLabel={`Can refund cash and adjust drawer for ${cashierLabel}`}
                        enabled={hasDrawerAccess}
                        onChange={() => updateCashierDrawerAccess(cashier, !hasDrawerAccess)}
                        disabled={permissionDisabled || savingVoidAccess}
                        testId={`mobile-pos-cashier-drawer-toggle-${cashier.user_id}`}
                        layout="inline"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-right align-middle">
                    <TerminalAssignmentControl
                      cashier={cashier}
                      terminals={assignmentTerminals}
                      assignedTerminalIndexes={getAssignedTerminalIndexes(cashier)}
                      onSave={(terminalIndexes) => onAssignCashier(cashier, terminalIndexes)}
                      disabled={permissionDisabled || terminalRegistrySaving}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CashierScopeInfo() {
  const [open, setOpen] = useState(false);

  return (
    <span className="group relative inline-flex">
      <button
        type="button"
        aria-label="Cashier assignment scope"
        aria-expanded={open}
        aria-controls="pos-terminal-cashier-scope-tooltip"
        onClick={() => setOpen((current) => !current)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="inline-flex h-6 w-6 items-center justify-center rounded-full text-[#6B86A8] transition hover:bg-blue-50 hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
      >
        <Info className="h-4 w-4" aria-hidden="true" />
      </button>
      <span
        id="pos-terminal-cashier-scope-tooltip"
        role="tooltip"
        className={`pointer-events-none absolute left-0 top-full z-30 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-slate-200 bg-white p-3 text-[11px] leading-5 text-[#475569] shadow-xl shadow-slate-200/70 transition duration-150 group-hover:visible group-hover:opacity-100 ${open ? 'visible opacity-100' : 'invisible opacity-0'}`}
      >
        <span className="mb-1 block font-extrabold text-[#0F172A]">How cashier access is scoped</span>
        <span className="block">• Cashiers shown here are assigned to this terminal.</span>
        <span className="block">• Invite DGFY accounts and assign one or more store locations first.</span>
        <span className="block">• A cashier can be assigned to multiple terminals in the same location.</span>
        <span className="block">• Permission changes update the cashier account wherever they sign in.</span>
      </span>
    </span>
  );
}

function PermissionColumnHeader({ label, description, className = '' }) {
  const tooltipId = `pos-terminal-column-help-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const infoButtonRef = useRef(null);
  const [tooltipHovered, setTooltipHovered] = useState(false);
  const [tooltipFocused, setTooltipFocused] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState(null);
  const tooltipOpen = tooltipHovered || tooltipFocused;

  const updateTooltipPosition = () => {
    const button = infoButtonRef.current;
    if (!button || typeof window === 'undefined') return;

    const anchor = button.getBoundingClientRect();
    const tooltipWidth = Math.min(256, Math.max(0, window.innerWidth - 32));
    const left = Math.min(
      Math.max(16, anchor.left),
      Math.max(16, window.innerWidth - tooltipWidth - 16)
    );
    const estimatedHeight = 64;
    const belowTop = anchor.bottom + 8;
    const top = belowTop + estimatedHeight <= window.innerHeight - 16
      ? belowTop
      : Math.max(16, anchor.top - estimatedHeight - 8);

    setTooltipPosition({ left, top, width: tooltipWidth });
  };

  useEffect(() => {
    if (!tooltipOpen) return undefined;
    const reposition = () => updateTooltipPosition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [tooltipOpen]);

  return (
    <span role="columnheader" className={`inline-flex items-center gap-1.5 ${className}`}>
      <span>{label}</span>
      <span className="group relative inline-flex shrink-0">
        <button
          type="button"
          ref={infoButtonRef}
          aria-label={`${label}: ${description}`}
          aria-describedby={tooltipOpen ? tooltipId : undefined}
          onMouseEnter={() => { updateTooltipPosition(); setTooltipHovered(true); }}
          onMouseLeave={() => setTooltipHovered(false)}
          onFocus={() => { updateTooltipPosition(); setTooltipFocused(true); }}
          onBlur={() => setTooltipFocused(false)}
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[#6B86A8] transition-colors hover:bg-blue-50 hover:text-[#1A4E8D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </span>
      {tooltipOpen && tooltipPosition && typeof document !== 'undefined'
        ? createPortal(
          <span
            id={tooltipId}
            role="tooltip"
            style={{ left: tooltipPosition.left, top: tooltipPosition.top, width: tooltipPosition.width }}
            className="pointer-events-none fixed z-[60] rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] font-semibold leading-4 text-[#475569] shadow-lg shadow-slate-200/70"
          >
            {description}
          </span>,
          document.body
        )
        : null}
    </span>
  );
}

export default function PosTerminalCashierAccessTable({
  terminal,
  locationName,
  assignmentTerminals = [],
  getAssignedTerminalIndexes = () => [],
  onAssignCashier = async () => {},
  cashiers = [],
  locationCashiers = [],
  terminalRegistrySaving = false,
  cashiersLoading,
  cashiersLoaded,
  setCashierInvitationOpen,
  locked,
  loading,
  canManageCashiers,
  discountApprovers,
  discountApproversLoading,
  canManageDiscountApprovalPins,
  updateDiscountAuthorization,
  discountAuthorizationSavingUserId,
  setApprovalPinUser,
  setApprovalPin,
  dayCloseOperators,
  dayCloseOperatorsLoading,
  canManageDayClosePins,
  updateDayCloseAccess,
  dayCloseAccessSavingUserId,
  setDayClosePinUser,
  cashierVoidAccessSavingUserId,
  updateCashierVoidAccess,
  updateCashierDrawerAccess,
  canRemoveCashiers = false,
  setCashierRemoveUser = () => {}
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const assignedCashiers = Array.isArray(cashiers) ? cashiers : [];
  const eligibleCashiers = Array.isArray(locationCashiers) ? locationCashiers : [];
  const visibleCashiers = useMemo(() => {
    const query = String(searchQuery || '').trim().toLowerCase();
    if (!query) return assignedCashiers;
    return assignedCashiers.filter((cashier) => (
      String(cashier?.username || '').toLowerCase().includes(query)
      || String(cashier?.email || '').toLowerCase().includes(query)
    ));
  }, [assignedCashiers, searchQuery]);

  if (!canManageCashiers) return null;

  const locationAssigned = Number(terminal?.location_id) > 0;
  const terminalLabel = terminal?.terminal_id || 'this terminal';
  const resolvedLocationName = locationName || (locationAssigned ? 'assigned store location' : 'unassigned');

  return (
    <section
      aria-labelledby="pos-terminal-cashier-settings-title"
      className="mt-8 min-w-0 sm:mt-10"
      data-testid="pos-cashier-void-authorization"
    >
      <div className="relative flex flex-col gap-4 px-0 py-4 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-[#1A4E8D]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h3 id="pos-terminal-cashier-settings-title" className="text-[16px] font-extrabold text-[#0F172A]">
                Cashier Settings
              </h3>
              <CashierScopeInfo />
              <span
                className="inline-flex max-w-full shrink-0 items-center gap-1.5 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-[#1A4E8D]"
                title={`Store location · ${resolvedLocationName}`}
              >
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span className="min-w-0 truncate">Store location · {resolvedLocationName}</span>
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-[#64748B]">
              Manage cashier permissions for <span className="font-extrabold text-[#1A4E8D]">{terminalLabel}</span>.
            </p>
          </div>
        </div>
        <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto lg:gap-3">
          <PosSearchField
            ariaLabel="Search cashier name or email"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            onClear={() => setSearchQuery('')}
            placeholder="Search cashier name or email"
            disabled={!locationAssigned || loading}
            className="min-w-0 flex-1 sm:w-64 sm:flex-none"
            inputClassName="h-9 sm:text-[14px]"
          />
          <Button
            type="button"
            className="h-9 w-10 shrink-0 justify-center gap-1.5 rounded-lg border border-[#1A4E8D] bg-[#1A4E8D] p-0 text-[13px] font-semibold text-white shadow-sm hover:bg-[#143F73] sm:w-auto sm:px-3 sm:text-[14px]"
            onClick={() => setCashierInvitationOpen(true)}
            disabled={locked || loading || !locationAssigned}
            aria-label="Invite Cashier"
            title="Invite Cashier"
          >
            <UserRoundPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="sr-only sm:not-sr-only">Invite Cashier</span>
          </Button>
        </div>
      </div>

      {!locationAssigned ? (
        <p className="px-4 py-5 text-[12px] font-semibold text-slate-500">
          Assign a store location to this terminal before adding or viewing cashiers.
        </p>
      ) : cashiersLoading || !cashiersLoaded ? (
        <p className="px-4 py-5 text-[12px] font-semibold text-slate-500">Loading cashiers for this store...</p>
      ) : assignedCashiers.length === 0 ? (
        <p className="px-4 py-5 text-[12px] font-semibold text-slate-500">
          {eligibleCashiers.length === 0
            ? `No active cashiers are available from ${resolvedLocationName} yet. Use Invite Cashier to add one.`
            : `No cashiers are assigned to this terminal yet. Use the Assign action in a cashier row to add one from ${resolvedLocationName}.`}
        </p>
      ) : visibleCashiers.length === 0 ? (
        <p className="px-4 py-5 text-[12px] font-semibold text-slate-500">
          No cashier matches “{searchQuery}”.
        </p>
      ) : (
        <div className="mt-3 sm:mt-4">
          <MobileCashierTable
            visibleCashiers={visibleCashiers}
            assignmentTerminals={assignmentTerminals}
            getAssignedTerminalIndexes={getAssignedTerminalIndexes}
            onAssignCashier={onAssignCashier}
            terminalRegistrySaving={terminalRegistrySaving}
            discountApprovers={discountApprovers}
            discountApproversLoading={discountApproversLoading}
            canManageDiscountApprovalPins={canManageDiscountApprovalPins}
            discountAuthorizationSavingUserId={discountAuthorizationSavingUserId}
            setApprovalPinUser={setApprovalPinUser}
            setApprovalPin={setApprovalPin}
            dayCloseOperators={dayCloseOperators}
            dayCloseOperatorsLoading={dayCloseOperatorsLoading}
            canManageDayClosePins={canManageDayClosePins}
            dayCloseAccessSavingUserId={dayCloseAccessSavingUserId}
            setDayClosePinUser={setDayClosePinUser}
            cashierVoidAccessSavingUserId={cashierVoidAccessSavingUserId}
            updateDiscountAuthorization={updateDiscountAuthorization}
            updateDayCloseAccess={updateDayCloseAccess}
            updateCashierVoidAccess={updateCashierVoidAccess}
            updateCashierDrawerAccess={updateCashierDrawerAccess}
            canRemoveCashiers={canRemoveCashiers}
            setCashierRemoveUser={setCashierRemoveUser}
            locked={locked}
            loading={loading}
          />
          <div className={`${POS_TABLE_SURFACE_CLASS} hidden md:block`}>
          <div className="overflow-x-auto">
            <div className="pos-cashier-permissions-table min-w-[1080px]" role="table" aria-label="Cashier permissions for selected terminal">
            <div
              role="row"
              className="pos-cashier-permissions-header grid grid-cols-[minmax(220px,1.25fr)_minmax(180px,1fr)_minmax(170px,1fr)_minmax(230px,1.2fr)_minmax(150px,0.8fr)] gap-4 bg-[#F8FAFC] px-4 py-3 text-[11px] font-extrabold text-[#334155]"
            >
              <span role="columnheader" data-pos-cashier-name-header="true">Cashier</span>
              <PermissionColumnHeader
                label="POS Discount Authorization"
                description="Controls this cashier account&apos;s permission to authorize POS discounts."
                className="pos-cashier-permission-subheader"
              />
              <PermissionColumnHeader
                label="Day Close Access"
                description="Controls this cashier account&apos;s permission to generate Z-reading reports."
                className="pos-cashier-permission-subheader"
              />
              <PermissionColumnHeader
                label="Cashier Void and Cash Authorization"
                description="Controls separate POS void and cash refund or drawer adjustment permissions."
                className="pos-cashier-permission-subheader"
              />
              <span role="columnheader" data-pos-cashier-terminals-header="true">Assigned terminals</span>
              <span role="columnheader" className="hidden min-[768px]:block min-[1200px]:hidden" data-pos-cashier-permissions-header="true">Permissions</span>
            </div>
            <div role="rowgroup">
              {visibleCashiers.map((cashier) => {
                const cashierPermissions = resolveUserPermissionList(cashier);
                const discountRecord = discountApprovers.find((entry) => Number(entry?.user_id) === Number(cashier?.user_id)) || cashier;
                const dayCloseRecord = dayCloseOperators.find((entry) => Number(entry?.user_id) === Number(cashier?.user_id)) || cashier;
                const hasDiscountAccess = discountRecord?.is_master_admin === true
                  || ['admin', 'manager'].includes(String(discountRecord?.role || '').toLowerCase())
                  || resolveUserPermissionList(discountRecord).includes('pos:discount_authorize');
                const hasDayCloseAccess = dayCloseRecord?.is_master_admin === true
                  || resolveUserPermissionList(dayCloseRecord).includes('pos:close_day');
                const hasVoidAccess = cashierPermissions.includes('pos:void');
                const hasDrawerAccess = cashierPermissions.includes('pos:cash_drawer_adjust');
                const cashierLabel = cashier.username || cashier.email || `cashier ${cashier.user_id}`;
                const savingVoidAccess = Number(cashierVoidAccessSavingUserId) === Number(cashier?.user_id);
                const savingDiscountAccess = Number(discountAuthorizationSavingUserId) === Number(cashier?.user_id);
                const savingDayCloseAccess = Number(dayCloseAccessSavingUserId) === Number(cashier?.user_id);
                return (
                  <div
                    key={`terminal-cashier-row-${cashier.user_id}`}
                    role="row"
                    className="pos-cashier-permissions-data-row grid grid-cols-[minmax(220px,1.25fr)_minmax(180px,1fr)_minmax(170px,1fr)_minmax(230px,1.2fr)_minmax(150px,0.8fr)] items-center gap-4 border-t border-slate-100 px-4 py-3"
                  >
                    <div role="cell" className="min-w-0">
                      <CashierName cashier={cashier} canRemoveCashiers={canRemoveCashiers} onRemove={setCashierRemoveUser} disabled={locked || loading} />
                    </div>
                    <div role="cell" data-pos-cashier-permission="discount" aria-label={`POS discount authorization for ${cashierLabel}`} className="min-w-0">
                      <div className="flex flex-col items-start gap-2">
                        <PermissionSwitch
                          label={hasDiscountAccess ? 'Enabled' : 'Disabled'}
                          ariaLabel={`Can authorize discounts for ${cashierLabel}`}
                          enabled={hasDiscountAccess}
                          onChange={() => updateDiscountAuthorization(discountRecord, !hasDiscountAccess)}
                          disabled={locked || loading || !canManageDiscountApprovalPins || savingDiscountAccess || discountApproversLoading}
                          testId={`pos-cashier-discount-toggle-${cashier.user_id}`}
                          layout="inline"
                        />
                        {canManageDiscountApprovalPins ? (
                          hasDiscountAccess ? (
                            <Button
                              type="button"
                              variant="default"
                              className="h-7 rounded-md border border-teal-600 bg-teal-600 px-2 text-[10px] font-extrabold text-white hover:bg-teal-700 hover:text-white focus-visible:ring-teal-500"
                              onClick={() => {
                                setApprovalPinUser(discountRecord);
                                setApprovalPin('');
                              }}
                              disabled={locked || loading || savingDiscountAccess}
                            >
                              <KeyRound className="mr-1 h-3 w-3" />
                              {discountRecord?.pos_approval_pin_configured ? 'Reset PIN' : 'Set PIN'}
                            </Button>
                          ) : (
                            <span className="block text-[11px] font-medium leading-4 text-slate-400">Enable access to set PIN</span>
                          )
                        ) : null}
                      </div>
                    </div>
                    <div role="cell" data-pos-cashier-permission="day-close" aria-label={`Day close access for ${cashierLabel}`} className="min-w-0">
                      <div className="flex flex-col items-start gap-2">
                        <PermissionSwitch
                          label={hasDayCloseAccess ? 'Enabled' : 'Disabled'}
                          ariaLabel={`Can generate Z-reading for ${cashierLabel}`}
                          enabled={hasDayCloseAccess}
                          onChange={() => updateDayCloseAccess(dayCloseRecord, !hasDayCloseAccess)}
                          disabled={locked || loading || !canManageDayClosePins || savingDayCloseAccess || dayCloseOperatorsLoading}
                          testId={`pos-cashier-day-close-toggle-${cashier.user_id}`}
                          layout="inline"
                        />
                        {canManageDayClosePins && hasDayCloseAccess ? (
                          dayCloseRecord?.pos_day_close_pin_configured ? (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-7 rounded-md px-2 text-[10px] font-extrabold text-blue-700"
                              onClick={() => setDayClosePinUser(dayCloseRecord)}
                              disabled={locked || loading || savingDayCloseAccess}
                            >
                              <KeyRound className="mr-1 h-3 w-3" />
                              Reset PIN
                            </Button>
                          ) : (
                            <span className="block text-[11px] font-medium leading-4 text-amber-700">PIN setup pending</span>
                          )
                        ) : null}
                      </div>
                    </div>
                    <div role="cell" data-pos-cashier-permission="cashier-void" aria-label={`Void and cash authorization for ${cashierLabel}`} className="min-w-0">
                      <div className="inline-grid max-w-full grid-cols-[minmax(0,max-content)_auto] items-center gap-x-2 gap-y-2">
                        <PermissionSwitch
                          label={hasVoidAccess ? 'Void enabled' : 'Can void POS transactions'}
                          ariaLabel={`Can void POS transactions for ${cashierLabel}`}
                          enabled={hasVoidAccess}
                          onChange={() => updateCashierVoidAccess(cashier, !hasVoidAccess)}
                          disabled={locked || loading || savingVoidAccess}
                          testId={`pos-cashier-void-toggle-${cashier.user_id}`}
                          layout="grid-cell"
                        />
                        <PermissionSwitch
                          label={hasDrawerAccess ? 'Cash enabled' : 'Can refund cash / adjust drawer'}
                          ariaLabel={`Can refund cash and adjust drawer for ${cashierLabel}`}
                          enabled={hasDrawerAccess}
                          onChange={() => updateCashierDrawerAccess(cashier, !hasDrawerAccess)}
                          disabled={locked || loading || savingVoidAccess}
                          testId={`pos-cashier-drawer-toggle-${cashier.user_id}`}
                          layout="grid-cell"
                        />
                      </div>
                    </div>
                    <div role="cell" data-pos-cashier-terminals-cell="true" className="relative min-w-0">
                      <TerminalAssignmentControl
                        cashier={cashier}
                        terminals={assignmentTerminals}
                        assignedTerminalIndexes={getAssignedTerminalIndexes(cashier)}
                        onSave={(terminalIndexes) => onAssignCashier(cashier, terminalIndexes)}
                        disabled={locked || loading || terminalRegistrySaving}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            </div>
          </div>
        </div>
        </div>
      )}
    </section>
  );
}
