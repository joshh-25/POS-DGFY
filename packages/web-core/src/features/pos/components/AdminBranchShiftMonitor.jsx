import React from 'react';
import { AlertTriangle, CalendarDays, Clock3, Hash, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import AdminBranchMonitorHeader from './AdminBranchMonitorHeader.jsx';
import PosShiftStateNotice from './PosShiftStateNotice.jsx';

export default function AdminBranchShiftMonitor({
  shifts = [],
  loading = false,
  errorMessage = '',
  canRecoverStaleShifts = false,
  isOnline = true,
  recoveryLoading = false,
  onRecoverShift = () => {},
  formatDateTime = (value) => value || '—',
  refreshAction = null
}) {
  const branchShifts = Array.isArray(shifts) ? shifts : [];
  const staleShiftCount = branchShifts.filter((shift) => shift?.stale_recovery?.is_stale).length;
  const shiftSummary = `${branchShifts.length} active${staleShiftCount > 0
    ? ` · ${staleShiftCount} stale to review`
    : ''}`;

  return (
    <section
      aria-labelledby="pos-admin-branch-shift-monitor-heading"
      data-testid="pos-admin-branch-shift-monitor"
      className="mt-4"
      aria-busy={loading || undefined}
    >
      <AdminBranchMonitorHeader
        headingId="pos-admin-branch-shift-monitor-heading"
        title="Active Shifts"
        subtitle={!loading || branchShifts.length > 0 ? shiftSummary : null}
        subtitleAriaLive="polite"
        subtitleAriaAtomic="true"
        action={refreshAction}
      />

      {errorMessage ? (
        <PosShiftStateNotice
          variant="error"
          title={branchShifts.length > 0 ? 'Refresh failed — showing last results' : ''}
          message={errorMessage}
          compact
          className="mt-3"
        />
      ) : loading && branchShifts.length === 0 ? (
        <PosShiftStateNotice variant="loading" message="Loading shifts…" compact className="mt-3" />
      ) : branchShifts.length === 0 ? (
        <PosShiftStateNotice variant="empty" message="No active shifts." compact className="mt-3" />
      ) : null}

      {branchShifts.length > 0 ? (
        <div className="mt-3 grid grid-cols-1 gap-3 [@media(min-width:34rem)]:grid-cols-3 2xl:grid-cols-4">
          {branchShifts.map((shift) => {
            const shiftOwner = shift?.cashier?.username
              || shift?.cashier?.email
              || (shift?.cashier_id ? `Operator #${shift.cashier_id}` : 'Unknown operator');
            const terminalId = String(shift?.terminal_id || '').trim();
            const terminalNumber = terminalId.match(/(\d+)$/)?.[1] || '—';
            const shiftId = shift?.pos_terminal_shift_id ?? '—';
            const staleStatus = shift?.stale_recovery || {};
            const ageMinutes = Number(staleStatus?.age_minutes || 0);
            const ageHours = Number.isFinite(ageMinutes) ? Math.floor(ageMinutes / 60) : 0;

            return (
              <div
                key={`admin-branch-shift-${shiftId}`}
                className="min-w-0 rounded-md border border-[#C9DCF5] bg-[#F2F7FF] p-3"
              >
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-blue-50 text-[11px] font-bold text-[#1D4F91]">
                      {terminalNumber}
                    </span>
                    <p className="min-w-0 truncate text-xs font-bold text-[#0B1647]">
                      {terminalId || `Shift #${shiftId}`}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${staleStatus?.is_stale
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${staleStatus?.is_stale ? 'bg-red-500' : 'bg-emerald-600'}`} aria-hidden="true" />
                    {staleStatus?.is_stale ? 'Stale' : 'Active'}
                  </span>
                </div>
                <div className="mt-2 space-y-1.5 text-[11px] leading-4 text-slate-600">
                  <p className="flex min-w-0 items-start gap-1.5">
                    <UserRound className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="min-w-0 break-words">Opened by {shiftOwner}</span>
                  </p>
                  <p className="flex min-w-0 items-start gap-1.5">
                    <CalendarDays className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
                    <span className="min-w-0 break-words">Opened: {formatDateTime(shift.opened_at)}</span>
                  </p>
                  <p className="flex items-start gap-1.5">
                    <Hash className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" aria-hidden="true" />
                    <span>Shift ID: #{shiftId}</span>
                  </p>
                  {staleStatus?.is_stale ? (
                    <p className="flex items-start gap-1.5 font-medium text-red-700">
                      <Clock3 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                      <span>Open for {ageHours}h</span>
                    </p>
                  ) : null}
                </div>
                {canRecoverStaleShifts && staleStatus?.is_stale ? (
                  <Button
                    type="button"
                    className="mt-3 h-8 w-full rounded-md border border-red-700 bg-red-700 px-2.5 text-[11px] font-bold text-white hover:border-red-800 hover:bg-red-800 focus-visible:ring-red-600"
                    onClick={() => onRecoverShift(shift)}
                    disabled={!isOnline || recoveryLoading}
                    aria-busy={recoveryLoading || undefined}
                  >
                    <AlertTriangle className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
                    Recover Stale Shift
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
