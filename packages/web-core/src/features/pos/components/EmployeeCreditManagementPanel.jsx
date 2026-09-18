import { useEffect, useMemo, useRef, useState } from 'react';
import { Banknote, BadgeCheck, Check, ChevronLeft, ChevronRight, CreditCard, Eye, Filter, RefreshCw, Save, Search, SlidersHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  adjustEmployeeCreditOutstanding,
  enableEmployeeCreditForActiveEmployees,
  recordEmployeeCreditRepayment,
  updateEmployeeCreditEmployeeAccount
} from '../services/employeeCreditService.js';
import { fetchEmployees } from '../services/employeeService.js';
import PosSettingsPagination from '../settings/PosSettingsPagination.jsx';
import { PosResponsiveFormDrawer, usePosFormFocusScroll, usePosVisualViewportMetrics, usePosViewportMode } from './PosResponsiveFormDrawer.jsx';

const createIdempotencyKey = () => `employee-credit-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
const money = (value) => Number(value || 0).toFixed(2);
const PAGE_SIZE = 5;

const emptyForm = {
  isEligible: false,
  creditLimit: '',
  repayment: '',
  repaymentReason: '',
  adjustment: '',
  adjustmentReason: ''
};

const initialsFor = (name) => String(name || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .slice(0, 2)
  .map((part) => part[0])
  .join('')
  .toUpperCase() || '?';

const locationNameFor = (employee) => employee?.location?.location_name
  || employee?.location?.name
  || 'All locations';

function EmployeeCreditFormPanel({
  selectedEmployee,
  account,
  outstandingBalance,
  canRepayAll,
  creditLimit,
  availableCredit,
  detailTab,
  setDetailTab,
  actionPanel,
  toggleAccountAction,
  busy,
  disabled,
  form,
  onFormChange,
  handleRepayment,
  openRepayAllConfirmation,
  handleAdjustment,
  handleSave,
  closeCreditForm,
  collapseCreditForm,
  activeAction,
  isOverlayViewport
}) {
  const viewportMetrics = usePosVisualViewportMetrics(isOverlayViewport);
  const { formBodyRef, handleFocusCapture } = usePosFormFocusScroll(isOverlayViewport);
  const panelClassName = isOverlayViewport
    ? 'relative z-auto flex h-auto max-h-full min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_-12px_30px_rgba(0,0,0,0.16)]'
    : 'relative z-auto flex h-[min(36rem,calc(100vh-2rem))] min-h-0 min-w-0 flex-col overflow-hidden bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)] min-[1200px]:self-start min-[1200px]:overflow-visible min-[1200px]:rounded-2xl min-[1200px]:border min-[1200px]:border-slate-200';

  return (
    <aside
      role={isOverlayViewport ? 'dialog' : undefined}
      aria-labelledby="employee-credit-form-title"
      aria-describedby="employee-credit-form-description"
      aria-modal={isOverlayViewport ? 'true' : undefined}
      className={panelClassName}
    >
      <Button type="button" variant="ghost" onClick={closeCreditForm} disabled={busy} aria-label="Close employee credit form" title="Close employee credit form" className="absolute left-3 top-3 z-10 h-9 w-9 rounded-full p-0 text-slate-700 hover:bg-slate-100 hover:text-slate-950 min-[1200px]:hidden">
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </Button>
      <Button type="button" variant="outline" onClick={collapseCreditForm} disabled={busy} aria-label="Hide form" title="Hide form" className="absolute right-4 top-4 z-10 hidden h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:left-[-1rem] min-[1200px]:right-auto min-[1200px]:top-1/2 min-[1200px]:flex min-[1200px]:-translate-y-1/2">
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </Button>

      <div className="shrink-0 border-b border-slate-100 px-5 py-4 sm:px-6">
        <div className="min-w-0 pl-10 pr-10 text-center min-[1200px]:flex min-[1200px]:items-center min-[1200px]:gap-3 min-[1200px]:pl-0 min-[1200px]:text-left">
          <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-50 text-[13px] font-bold text-[#1A4E8D] min-[1200px]:flex">{initialsFor(selectedEmployee?.full_name)}</div>
          <div className="min-w-0">
            <h3 id="employee-credit-form-title" className="truncate text-[16px] font-extrabold text-slate-950">{selectedEmployee?.full_name || 'Select an employee'}</h3>
            <p id="employee-credit-form-description" className="mx-auto mt-0.5 max-w-[18rem] truncate text-[11px] font-medium text-slate-500 min-[1200px]:mx-0 min-[1200px]:max-w-none">{selectedEmployee?.employee_code || 'Employee directory record'} · {locationNameFor(selectedEmployee)}</p>
          </div>
        </div>
      </div>

      <div role="tablist" aria-label="Employee credit detail sections" className="flex gap-1 border-b border-slate-100 px-5 pt-2 sm:px-6">
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'settings', label: 'Settings' }
        ].map((tab) => {
          const isActive = detailTab === tab.id;
          return <button key={tab.id} type="button" role="tab" aria-selected={isActive} aria-controls={`employee-credit-${tab.id}-panel`} onClick={() => setDetailTab(tab.id)} className={`border-b-2 px-2.5 py-2 text-[13px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${isActive ? 'border-[#1A4E8D] text-[#1A4E8D]' : 'border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-800'}`}>{tab.label}</button>;
        })}
      </div>

      <form className={isOverlayViewport ? 'flex min-h-0 flex-col' : 'flex min-h-0 flex-1 flex-col'} onSubmit={(event) => { event.preventDefault(); handleSave(); }}>
        <div ref={formBodyRef} onFocusCapture={handleFocusCapture} style={viewportMetrics ? { maxHeight: `${viewportMetrics.formBodyMaxHeight}px` } : undefined} className={isOverlayViewport ? 'min-h-0 max-h-[calc(100vh-10rem)] max-h-[calc(100dvh-10rem)] flex-none overflow-y-auto overscroll-contain px-5 py-4 sm:px-6' : 'min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6'}>
          {detailTab === 'overview' ? (
            <div id="employee-credit-overview-panel" role="tabpanel" aria-label="Overview" className="space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[13px] sm:text-[14px]">
                <div className="flex items-start justify-between gap-3">
                  <div><p className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Account code</p><p className="mt-1 text-[14px] font-bold text-slate-900">{account?.account_code || 'Not configured'}</p></div>
                </div>
                <p className="mt-2 text-[13px] font-medium text-slate-600">Outstanding balance: <strong className="font-bold text-slate-950">PHP {money(outstandingBalance)}</strong></p>
              </div>

              <div className="grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Current balance</p><p className="mt-1 text-[16px] font-bold text-rose-600">PHP {money(outstandingBalance)}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Credit limit</p><p className="mt-1 text-[16px] font-bold text-slate-950">{creditLimit == null ? 'No limit' : `PHP ${money(creditLimit)}`}</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Available credit</p><p className="mt-1 text-[16px] font-bold text-slate-950">{availableCredit == null ? 'Open' : `PHP ${money(availableCredit)}`}</p></div>
              </div>

              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                <div><p className="text-[13px] font-bold text-slate-900">Credit status</p></div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold ${account?.is_eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}><span aria-hidden="true" className={`h-2 w-2 rounded-full ${account?.is_eligible ? 'bg-emerald-500' : 'bg-slate-400'}`} />{account?.is_eligible ? 'Enabled' : 'Disabled'}</span>
              </div>

              <section className="space-y-2.5">
                <h4 className="text-[16px] font-extrabold text-slate-900">Account actions</h4>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button type="button" aria-pressed={actionPanel === 'repayment'} onClick={() => toggleAccountAction('repayment')} disabled={busy || disabled} variant={actionPanel === 'repayment' ? 'default' : 'outline'} className={`w-full min-w-0 whitespace-nowrap text-[13px] font-semibold transition-[background-color,border-color,box-shadow,color] sm:text-[14px] ${actionPanel === 'repayment' ? 'bg-[#1A4E8D] text-white shadow-[0_0_14px_rgba(174,232,244,0.55)] ring-2 ring-[#AEE8F4]/80 ring-offset-2 hover:bg-[#123B6D]' : 'border-[#9BBBE0] bg-white text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-[#F5F9FF] hover:text-[#123B6D]'}`}><Banknote aria-hidden="true" className="mr-2 h-4 w-4" />Record repayment</Button>
                  <Button type="button" aria-pressed={actionPanel === 'adjustment'} onClick={() => toggleAccountAction('adjustment')} disabled={busy || disabled} variant={actionPanel === 'adjustment' ? 'default' : 'outline'} className={`w-full min-w-0 whitespace-nowrap text-[13px] font-semibold transition-[background-color,border-color,box-shadow,color] sm:text-[14px] ${actionPanel === 'adjustment' ? 'border-[#1A4E8D] bg-[#1A4E8D] text-white shadow-[0_0_14px_rgba(174,232,244,0.55)] ring-2 ring-[#AEE8F4]/80 ring-offset-2 hover:bg-[#123B6D]' : 'border-[#9BBBE0] bg-white text-[#1A4E8D] hover:border-[#1A4E8D] hover:bg-[#F5F9FF] hover:text-[#123B6D]'}`}><SlidersHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />Administrative adjustment</Button>
                </div>
              </section>

              {actionPanel === 'repayment' ? (
                <section className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3">
                  <div className="flex items-center gap-2"><Banknote aria-hidden="true" className="h-4 w-4 text-emerald-700" /><h4 className="text-[14px] font-bold text-slate-900">Record repayment</h4></div>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5"><Label className="text-[12px] font-bold" htmlFor="employee-credit-repayment">Amount paid</Label><Input id="employee-credit-repayment" type="number" min="0.01" step="0.01" value={form.repayment} onChange={(event) => onFormChange('repayment', event.target.value)} disabled={busy || disabled} placeholder="0.00" className="text-[16px] min-[1200px]:text-[14px]" /></div>
                    <div className="space-y-1.5"><Label className="text-[12px] font-bold" htmlFor="employee-credit-repayment-reason">Repayment reason</Label><Input id="employee-credit-repayment-reason" value={form.repaymentReason} onChange={(event) => onFormChange('repaymentReason', event.target.value)} disabled={busy || disabled} placeholder="Cash repayment or payroll deduction" className="text-[16px] min-[1200px]:text-[14px]" /></div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" onClick={handleRepayment} disabled={!account?.account_id || busy || disabled} className="text-[13px] font-bold bg-emerald-700 text-white hover:bg-emerald-800 sm:text-[14px]">{activeAction === 'repayment' ? <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <Banknote aria-hidden="true" className="mr-2 h-4 w-4" />}Record repayment</Button>
                      <Button type="button" variant="outline" onClick={openRepayAllConfirmation} disabled={!canRepayAll || busy || disabled} className="text-[13px] font-bold sm:text-[14px]"><Banknote aria-hidden="true" className="mr-2 h-4 w-4" />Repay all</Button>
                    </div>
                  </div>
                </section>
              ) : null}

              {actionPanel === 'adjustment' ? (
                <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <div className="flex items-center gap-2"><SlidersHorizontal aria-hidden="true" className="h-4 w-4 text-amber-700" /><h4 className="text-[14px] font-bold text-slate-900">Administrative adjustment</h4></div>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-slate-500">Positive adds debt; negative reduces it.</p>
                  <div className="mt-3 space-y-3">
                    <div className="space-y-1.5"><Label className="text-[12px] font-bold" htmlFor="employee-credit-adjustment">Signed adjustment</Label><Input id="employee-credit-adjustment" type="number" step="0.01" value={form.adjustment} onChange={(event) => onFormChange('adjustment', event.target.value)} disabled={busy || disabled} placeholder="Example: -25.00" className="text-[16px] min-[1200px]:text-[14px]" /></div>
                    <div className="space-y-1.5"><Label className="text-[12px] font-bold" htmlFor="employee-credit-adjustment-reason">Correction reason</Label><Input id="employee-credit-adjustment-reason" value={form.adjustmentReason} onChange={(event) => onFormChange('adjustmentReason', event.target.value)} disabled={busy || disabled} placeholder="Required audit reason" className="text-[16px] min-[1200px]:text-[14px]" /></div>
                    <Button type="button" variant="outline" onClick={handleAdjustment} disabled={!account?.account_id || busy || disabled} className="text-[13px] font-bold sm:text-[14px]">{activeAction === 'adjustment' ? <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : <SlidersHorizontal aria-hidden="true" className="mr-2 h-4 w-4" />}Apply adjustment</Button>
                  </div>
                </section>
              ) : null}
            </div>
          ) : (
            <div id="employee-credit-settings-panel" role="tabpanel" aria-label="Settings" className="space-y-4">
              <h4 className="text-[16px] font-extrabold text-slate-900">Credit settings</h4>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-[14px] font-bold text-slate-900">Eligible for credit</p></div>
                <button type="button" role="switch" aria-label="Eligible for credit" aria-checked={form.isEligible} onClick={() => onFormChange('isEligible', !form.isEligible)} disabled={busy || disabled} className={`relative inline-flex h-9 w-[7.5rem] shrink-0 items-center rounded-full px-1 text-[12px] font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${form.isEligible ? 'bg-[#1A4E8D] text-white' : 'bg-slate-300 text-slate-700'}`}>
                  <span className={`absolute top-1 flex h-7 w-7 items-center justify-center rounded-full bg-white text-[#1A4E8D] shadow-sm transition-[left,right] ${form.isEligible ? 'right-1' : 'left-1'}`}>{form.isEligible ? <Check aria-hidden="true" className="h-4 w-4" /> : null}</span><span className={`relative z-10 flex-1 text-center ${form.isEligible ? 'pr-6' : 'pl-6'}`}>{form.isEligible ? 'Enabled' : 'Disabled'}</span>
                </button>
              </div>
              <div className="space-y-1.5"><Label className="text-[12px] font-bold" htmlFor="employee-credit-limit">Credit limit (optional)</Label><Input id="employee-credit-limit" type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => onFormChange('creditLimit', event.target.value)} disabled={busy || disabled} placeholder="No limit" className="text-[16px] min-[1200px]:text-[14px]" /></div>
            </div>
          )}
        </div>

        <div className="sticky bottom-0 grid shrink-0 grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] backdrop-blur supports-[backdrop-filter]:bg-white/90 sm:flex sm:items-center sm:justify-end sm:px-6">
          {detailTab === 'settings' ? (
            <>
              <Button type="button" variant="outline" onClick={closeCreditForm} disabled={busy} className="w-full text-[13px] font-bold sm:w-auto sm:text-[14px]">Cancel</Button>
              <Button type="submit" disabled={!selectedEmployee?.employee_id || busy || disabled} className="w-full bg-[#1A4E8D] text-[13px] font-bold text-white hover:bg-[#123B6D] sm:w-auto sm:text-[14px]">{activeAction === 'save' ? <RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" /> : account?.is_eligible ? <BadgeCheck aria-hidden="true" className="mr-2 h-4 w-4" /> : <Save aria-hidden="true" className="mr-2 h-4 w-4" />}Save Employee Credit</Button>
            </>
          ) : (
            <Button type="button" variant="outline" onClick={closeCreditForm} disabled={busy} className="col-span-2 w-full text-[13px] font-bold sm:col-span-1 sm:w-auto sm:text-[14px]">Close</Button>
          )}
        </div>
      </form>
    </aside>
  );
}

export default function EmployeeCreditManagementPanel({
  disabled = false,
  refreshKey = 0,
  refreshActionRef = null
}) {
  const viewportMode = usePosViewportMode();
  const isOverlayViewport = viewportMode !== 'desktop';
  const [employees, setEmployees] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [isCreditFormOpen, setIsCreditFormOpen] = useState(false);
  const [isCreditFormCollapsed, setIsCreditFormCollapsed] = useState(false);
  const [detailTab, setDetailTab] = useState('overview');
  const [actionPanel, setActionPanel] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingStatusFilter, setPendingStatusFilter] = useState('all');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState('');
  const [bulkEligibilityConfirmOpen, setBulkEligibilityConfirmOpen] = useState(false);
  const [repayAllConfirmOpen, setRepayAllConfirmOpen] = useState(false);
  const [repayAllTarget, setRepayAllTarget] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const filterContainerRef = useRef(null);

  const selectedEmployee = useMemo(
    () => employees.find((entry) => String(entry.employee_id) === String(selectedEmployeeId)) || null,
    [employees, selectedEmployeeId]
  );
  const account = selectedEmployee?.employeeCreditAccount || null;
  const outstandingBalance = Number(account?.outstanding_balance || 0);
  const canRepayAll = Boolean(account?.account_id) && Number.isFinite(outstandingBalance) && outstandingBalance > 0;
  const busy = loading || Boolean(activeAction);

  const hydrateForm = (employee) => {
    const current = employee?.employeeCreditAccount || null;
    setForm({
      ...emptyForm,
      isEligible: Boolean(current?.is_eligible),
      creditLimit: current?.credit_limit == null ? '' : String(current.credit_limit)
    });
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const rows = await fetchEmployees({ includeInactive: true });
      const nextRows = (Array.isArray(rows) ? rows : []).map((row) => ({
        ...row,
        is_active: row?.is_active !== false
      }));
      setEmployees(nextRows);
      const nextEmployeeId = selectedEmployeeId && nextRows.some((row) => String(row.employee_id) === String(selectedEmployeeId))
        ? selectedEmployeeId
        : String(nextRows[0]?.employee_id || '');
      setSelectedEmployeeId(nextEmployeeId);
      hydrateForm(nextRows.find((row) => String(row.employee_id) === String(nextEmployeeId)) || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load Employee Credit accounts.');
    } finally {
      setLoading(false);
    }
  };

  const latestLoadRef = useRef(loadAccounts);
  latestLoadRef.current = loadAccounts;

  useEffect(() => {
    if (!refreshActionRef) return undefined;
    const refresh = () => latestLoadRef.current();
    refreshActionRef.current = refresh;
    return () => {
      if (refreshActionRef.current === refresh) refreshActionRef.current = null;
    };
  }, [refreshActionRef]);

  useEffect(() => {
    loadAccounts();
    // Directory changes intentionally trigger a fresh account snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const openCreditForm = (employee) => {
    setSelectedEmployeeId(String(employee.employee_id));
    hydrateForm(employee);
    setIsCreditFormOpen(true);
    setIsCreditFormCollapsed(false);
    setDetailTab('overview');
    setActionPanel('');
  };

  const closeCreditForm = () => {
    if (busy) return;
    hydrateForm(selectedEmployee);
    setIsCreditFormOpen(false);
    setIsCreditFormCollapsed(false);
    setDetailTab('overview');
    setActionPanel('');
  };

  const collapseCreditForm = () => {
    if (busy) return;
    setIsCreditFormCollapsed(true);
  };

  const expandCreditForm = () => setIsCreditFormCollapsed(false);

  const toggleFilters = () => {
    if (filtersOpen) {
      setFiltersOpen(false);
      return;
    }
    setPendingStatusFilter(statusFilter);
    setFiltersOpen(true);
  };

  const applyStatusFilter = () => {
    setStatusFilter(pendingStatusFilter);
    setFiltersOpen(false);
  };

  const toggleAccountAction = (nextAction) => {
    if (!account?.account_id) {
      toast.error('No employee credit available yet.');
      return;
    }
    setActionPanel((current) => current === nextAction ? '' : nextAction);
  };

  const handleSave = async () => {
    if (!selectedEmployeeId) return;
    setActiveAction('save');
    try {
      await updateEmployeeCreditEmployeeAccount(selectedEmployeeId, {
        is_eligible: form.isEligible,
        credit_limit: form.creditLimit === '' ? null : Number(form.creditLimit)
      });
      toast.success('Employee Credit account updated.');
      setIsCreditFormOpen(false);
      setIsCreditFormCollapsed(false);
      await loadAccounts();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to update Employee Credit account.');
    } finally {
      setActiveAction('');
    }
  };

  const handleEnableAllActive = async () => {
    setActiveAction('bulk-eligibility');
    try {
      const result = await enableEmployeeCreditForActiveEmployees();
      const enabledCount = Number(result?.enabled_count || 0);
      toast.success(enabledCount > 0
        ? `Employee Credit enabled for ${enabledCount} active employee${enabledCount === 1 ? '' : 's'}.`
        : 'All active employees are already eligible for Employee Credit.');
      await loadAccounts();
      return { success: true };
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to enable Employee Credit for active employees.';
      toast.error(message);
      return { success: false, message };
    } finally {
      setActiveAction('');
    }
  };

  const handleRepayment = async () => {
    const amount = Number(form.repayment);
    if (!account?.account_id) {
      toast.error('No employee credit available yet.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a repayment amount greater than zero.');
      return;
    }
    if (form.repaymentReason.trim().length < 3) {
      toast.error('Enter a reason for the repayment.');
      return;
    }
    setActiveAction('repayment');
    try {
      await recordEmployeeCreditRepayment(account.account_id, {
        amount,
        reason: form.repaymentReason.trim(),
        idempotency_key: createIdempotencyKey()
      });
      toast.success('Employee Credit repayment recorded.');
      await loadAccounts();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to record Employee Credit repayment.');
    } finally {
      setActiveAction('');
    }
  };

  const openRepayAllConfirmation = () => {
    const expectedVersion = Number(account?.version);
    if (!canRepayAll) {
      toast.error('This Employee Credit account has no outstanding balance.');
      return;
    }
    if (!Number.isInteger(expectedVersion) || expectedVersion < 0) {
      toast.error('Refresh the Employee Credit account before repaying it in full.');
      return;
    }
    setRepayAllTarget({
      accountId: account.account_id,
      employeeName: selectedEmployee?.full_name || 'this employee',
      outstandingBalance,
      expectedVersion
    });
    setRepayAllConfirmOpen(true);
  };

  const handleRepayAll = async (reason) => {
    if (!repayAllTarget) return { success: false, message: 'Employee Credit account is no longer selected.' };
    setActiveAction('repay-all');
    try {
      await recordEmployeeCreditRepayment(repayAllTarget.accountId, {
        repay_all: true,
        expected_version: repayAllTarget.expectedVersion,
        reason,
        idempotency_key: createIdempotencyKey()
      });
      toast.success('Employee Credit fully repaid.');
      await loadAccounts();
      return { success: true };
    } catch (error) {
      const message = error?.response?.data?.message || 'Failed to repay Employee Credit in full.';
      if (error?.response?.status === 409) await loadAccounts();
      return { success: false, message };
    } finally {
      setActiveAction('');
    }
  };

  const handleAdjustment = async () => {
    const amount = Number(form.adjustment);
    if (!account?.account_id) {
      toast.error('No employee credit available yet.');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error('Enter a non-zero outstanding adjustment.');
      return;
    }
    if (form.adjustmentReason.trim().length < 3) {
      toast.error('Enter a reason for the outstanding adjustment.');
      return;
    }
    setActiveAction('adjustment');
    try {
      await adjustEmployeeCreditOutstanding(account.account_id, {
        amount,
        reason: form.adjustmentReason.trim(),
        idempotency_key: createIdempotencyKey()
      });
      toast.success('Employee Credit outstanding balance adjusted.');
      await loadAccounts();
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to adjust Employee Credit outstanding balance.');
    } finally {
      setActiveAction('');
    }
  };

  const filteredEmployees = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return employees.filter((employee) => [
      employee.full_name,
      employee.employee_code,
      employee.email,
      locationNameFor(employee),
      employee.employeeCreditAccount?.account_code
    ].some((value) => !query || String(value || '').toLowerCase().includes(query))
      && (statusFilter === 'all' || Boolean(employee.is_active) === (statusFilter === 'active')));
  }, [employees, searchQuery, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize));
  const pageEmployees = useMemo(
    () => filteredEmployees.slice((page - 1) * pageSize, page * pageSize),
    [filteredEmployees, page, pageSize]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  useEffect(() => {
    setPage((currentPage) => Math.min(currentPage, totalPages));
  }, [totalPages]);

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const closeOnOutsidePointer = (event) => {
      if (!filterContainerRef.current?.contains(event.target)) setFiltersOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [filtersOpen]);

  const statusFilterOptions = [
    { value: 'all', label: 'All' },
    { value: 'active', label: 'Enabled' },
    { value: 'inactive', label: 'Disabled' }
  ];

  const filterPopover = filtersOpen ? (
    <div id="employee-credit-filter-popover" role="region" aria-labelledby="employee-credit-filter-title" className="fixed inset-x-2 bottom-[calc(0.5rem+env(safe-area-inset-bottom,0px))] top-auto z-[70] max-h-[calc(100dvh-1rem)] w-auto max-w-none overflow-x-hidden overflow-y-auto overscroll-contain rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 sm:absolute sm:inset-x-auto sm:right-0 sm:bottom-auto sm:top-[calc(100%+0.5rem)] sm:max-h-none sm:w-[min(26rem,calc(100vw-2rem))] sm:overflow-hidden">
      <div className="border-b border-slate-100 px-5 py-4 text-left sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]"><Filter aria-hidden="true" className="h-4 w-4" /></div>
          <div className="min-w-0">
            <h4 id="employee-credit-filter-title" className="text-[14px] font-extrabold text-slate-950">Filter employee credit</h4>
            <p className="mt-0.5 text-[11px] font-medium leading-4 text-slate-500">Choose which employee statuses appear in the table.</p>
          </div>
        </div>
      </div>
      <div className="space-y-2 px-5 py-4 sm:px-6">
        <p id="employee-credit-status-filter-label" className="text-[12px] font-bold uppercase tracking-wide text-slate-500">Employee status</p>
        <div role="group" aria-labelledby="employee-credit-status-filter-label" className="grid gap-2 sm:grid-cols-3">
          {statusFilterOptions.map((option) => {
            const selected = pendingStatusFilter === option.value;
            return (
              <button key={option.value} type="button" aria-pressed={selected} onClick={() => setPendingStatusFilter(option.value)} className={`flex min-h-10 min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30 ${selected ? 'border-[#1A4E8D] bg-[#F5F9FF] text-[#1A4E8D]' : 'border-slate-200 bg-white text-slate-700 hover:border-[#9BBBE0] hover:bg-[#F5F9FF]'}`}>
                <span className="flex min-w-0 items-center gap-2">
                  {option.value === 'all' && selected ? <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#1A4E8D] text-white"><Check aria-hidden="true" className="h-3.5 w-3.5" /></span> : <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${option.value === 'active' ? 'bg-emerald-500' : option.value === 'inactive' ? 'bg-slate-400' : 'bg-slate-300'}`} />}
                  <span className="truncate">{option.label}</span>
                </span>
                {selected && option.value !== 'all' ? <Check aria-hidden="true" className="h-4 w-4 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-col-reverse items-stretch gap-2 border-t border-slate-100 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Button type="button" variant="ghost" onClick={() => setPendingStatusFilter('all')} disabled={pendingStatusFilter === 'all'} className="h-9 w-full px-1 text-[12px] font-medium text-slate-500 hover:bg-transparent hover:text-[#1A4E8D] sm:w-auto">Clear filter</Button>
        <Button type="button" onClick={applyStatusFilter} className="h-9 w-full bg-[#1A4E8D] px-4 text-[12px] font-bold text-white hover:bg-[#123B6D] sm:w-auto">Done</Button>
      </div>
    </div>
  ) : null;

  const creditLimit = account?.credit_limit == null ? null : Number(account.credit_limit);
  const availableCredit = creditLimit == null ? null : Math.max(0, creditLimit - outstandingBalance);
  const formPanel = isCreditFormOpen ? (
    <EmployeeCreditFormPanel
      selectedEmployee={selectedEmployee}
      account={account}
      outstandingBalance={outstandingBalance}
      canRepayAll={canRepayAll}
      creditLimit={creditLimit}
      availableCredit={availableCredit}
      detailTab={detailTab}
      setDetailTab={setDetailTab}
      actionPanel={actionPanel}
      toggleAccountAction={toggleAccountAction}
      busy={busy}
      disabled={disabled}
      form={form}
      onFormChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))}
      handleRepayment={handleRepayment}
      openRepayAllConfirmation={openRepayAllConfirmation}
      handleAdjustment={handleAdjustment}
      handleSave={handleSave}
      closeCreditForm={closeCreditForm}
      collapseCreditForm={collapseCreditForm}
      activeAction={activeAction}
      isOverlayViewport={isOverlayViewport}
    />
  ) : null;

  const responsiveFormPanel = isOverlayViewport && formPanel
    ? <PosResponsiveFormDrawer viewportMode={viewportMode} onClose={closeCreditForm}>{formPanel}</PosResponsiveFormDrawer>
    : null;

  return (
    <section className="min-w-0">
      <div className={`relative grid min-w-0 gap-4 min-[1200px]:items-stretch min-[1200px]:transition-[grid-template-columns] min-[1200px]:duration-200 min-[1200px]:ease-out ${isCreditFormOpen && !isCreditFormCollapsed ? 'min-[1200px]:grid-cols-[minmax(0,1.58fr)_minmax(19rem,1fr)]' : 'min-[1200px]:grid-cols-[minmax(0,1fr)_0fr]'}`}>
        <div className="min-w-0">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="flex min-w-0 gap-3">
              <div className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D] sm:flex"><CreditCard aria-hidden="true" className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h3 className="text-[16px] font-extrabold text-slate-950">Employee Credit</h3>
                <p className="text-[12px] font-medium leading-5 text-slate-500">Manage employee eligibility, limits, repayments, and outstanding balances.</p>
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => refreshActionRef?.current?.()} disabled={disabled || loading} className="h-9 w-9 shrink-0 p-0 sm:h-10 sm:w-auto sm:px-3">
              <RefreshCw className="h-4 w-4 sm:mr-2" /> <span className="sr-only sm:not-sr-only">Refresh</span>
            </Button>
          </div>

          <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto] gap-2.5 min-[1200px]:flex min-[1200px]:items-center">
            <div className="relative min-w-0 min-[1200px]:flex-1">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input type="search" aria-label="Search employee credit" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search employees by name, code, email, or account..." className="h-10 pl-9" />
            </div>
            <div ref={filterContainerRef} className="relative min-w-0">
              <Button type="button" variant="outline" size="sm" onClick={toggleFilters} aria-expanded={filtersOpen} aria-haspopup="true" aria-controls="employee-credit-filter-popover" title="Filters" className="h-10 w-10 shrink-0 p-0 sm:w-auto sm:px-4 min-[1200px]:w-auto"><Filter aria-hidden="true" className="h-4 w-4 sm:mr-2" /> <span className="sr-only sm:not-sr-only">Filters</span></Button>
              {filterPopover}
            </div>
            <Button type="button" size="sm" onClick={() => setBulkEligibilityConfirmOpen(true)} disabled={busy || disabled || employees.length === 0} className="col-span-2 h-10 w-full shrink-0 bg-[#1A4E8D] text-white hover:bg-[#123B6D] min-[1200px]:w-auto"><BadgeCheck aria-hidden="true" className="mr-2 h-4 w-4" /> Enable Credit to All Employees</Button>
          </div>

          <div className="mt-4 hidden overflow-hidden rounded-xl border border-slate-200 min-[1200px]:block">
            <div className="overflow-x-auto">
              <table className="w-full table-fixed text-left text-[13px] sm:text-[14px]">
                <caption className="sr-only">Employee Credit directory</caption>
                <thead className="bg-slate-50 text-[11px] font-extrabold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th scope="col" className="w-[40%] px-2 py-3 sm:px-2.5 sm:w-[29%]">Employee</th>
                    <th scope="col" className="hidden w-[18%] px-2 py-3 sm:px-2.5 sm:table-cell">Account</th>
                    <th scope="col" className="hidden w-[17%] px-2 py-3 sm:px-2.5 sm:table-cell">Credit</th>
                    <th scope="col" className="hidden w-[17%] px-2 py-3 sm:px-2.5 md:table-cell">Outstanding</th>
                    <th scope="col" className="w-[24%] px-2 py-3 sm:px-2.5 sm:w-[13%]">Status</th>
                    <th scope="col" className="w-[36%] px-2 py-3 text-right sm:px-2.5 sm:w-[17%]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pageEmployees.map((employee) => {
                    const currentAccount = employee.employeeCreditAccount || null;
                    return (
                      <tr key={employee.employee_id} className={employee.is_active ? 'bg-white' : 'bg-slate-50/80'}>
                        <td className="max-w-0 px-2 py-2.5 sm:px-2.5">
                          <div className="min-w-0"><p className="truncate font-bold text-slate-950">{employee.full_name}</p><p className="truncate text-[11px] font-medium text-slate-500">{employee.employee_code || employee.email || 'Employee directory record'}</p></div>
                        </td>
                        <td className="hidden max-w-0 truncate px-2 py-2.5 font-semibold text-slate-700 sm:px-2.5 sm:table-cell" title={currentAccount?.account_code || undefined}>{currentAccount?.account_code || 'Not configured'}</td>
                        <td className="hidden px-2 py-2.5 sm:px-2.5 sm:table-cell"><div className="flex flex-wrap items-center gap-1.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${currentAccount?.is_eligible ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{currentAccount?.is_eligible ? 'Eligible' : 'Not eligible'}</span><span className="text-[11px] text-slate-500">{currentAccount?.credit_limit == null ? 'No limit' : `PHP ${money(currentAccount.credit_limit)}`}</span></div></td>
                        <td className={`hidden whitespace-nowrap px-2 py-2.5 font-semibold sm:px-2.5 md:table-cell ${Number(currentAccount?.outstanding_balance ?? 0) === 0 ? 'text-emerald-600' : 'text-red-600'}`}>PHP {money(currentAccount?.outstanding_balance)}</td>
                        <td className="px-2 py-2.5 sm:px-2.5"><span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-extrabold ${employee.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{employee.is_active ? 'Enabled' : 'Disabled'}</span></td>
                        <td className="px-2 py-2.5 sm:px-2.5"><div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={() => openCreditForm(employee)} disabled={disabled || !employee.is_active} aria-label={`View credit for ${employee.full_name}`} title={employee.is_active ? `View credit for ${employee.full_name}` : 'Inactive employees cannot be configured'} className="h-8 w-8 border-emerald-200 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-200"><Eye aria-hidden="true" className="h-3.5 w-3.5" /></Button></div></td>
                      </tr>
                    );
                  })}
                  {pageEmployees.length === 0 && !loading ? <tr><td colSpan="6" className="px-3 py-10 text-center text-[13px] font-medium text-slate-500 sm:px-4 sm:text-[14px]">{employees.length === 0 ? 'No employees available. Add an employee first to configure Employee Credit.' : 'No employees match your filters.'}</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
          <div className="mt-4 grid gap-2 min-[1200px]:hidden">
            {pageEmployees.map((employee) => {
              const currentAccount = employee.employeeCreditAccount || null;
              const creditStatus = currentAccount?.is_eligible ? 'Eligible' : 'Not eligible';
              return (
                <article key={employee.employee_id} className={`rounded-xl border p-3 ${employee.is_active ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-50/80'}`}>
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-bold text-slate-950">{employee.full_name}</p>
                          <p className="truncate text-[11px] font-semibold text-slate-600">{employee.employee_code || employee.email || 'Employee directory record'}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold ${employee.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}>{employee.is_active ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-slate-500">
                        <span>{creditStatus}</span>
                        <span>{currentAccount?.credit_limit == null ? 'No limit' : `Limit PHP ${money(currentAccount.credit_limit)}`}</span>
                        <span className={Number(currentAccount?.outstanding_balance ?? 0) === 0 ? 'text-emerald-600' : 'text-red-600'}>Outstanding PHP {money(currentAccount?.outstanding_balance)}</span>
                      </div>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => openCreditForm(employee)} disabled={disabled || !employee.is_active} aria-label={`View credit for ${employee.full_name}`} title={employee.is_active ? `View credit for ${employee.full_name}` : 'Inactive employees cannot be configured'} className="h-9 w-9 shrink-0 border-emerald-200 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 focus-visible:ring-emerald-200"><Eye aria-hidden="true" className="h-3.5 w-3.5" /></Button>
                  </div>
                </article>
              );
            })}
            {pageEmployees.length === 0 && !loading ? <div className="rounded-xl border border-dashed border-slate-300 px-3 py-10 text-center text-[13px] font-medium text-slate-500">{employees.length === 0 ? 'No employees available. Add an employee first to configure Employee Credit.' : 'No employees match your filters.'}</div> : null}
          </div>
          <div className="mt-3">
            <PosSettingsPagination
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              total={filteredEmployees.length}
              itemLabel="employees"
              pageSizeLabel="Employees per page"
              previousLabel="Previous employee credit page"
              nextLabel="Next employee credit page"
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
              disabled={busy}
            />
          </div>
        </div>
        {!isOverlayViewport && isCreditFormOpen && !isCreditFormCollapsed ? <div className="min-w-0 min-[1200px]:h-full">{formPanel}</div> : null}
        {!isOverlayViewport && isCreditFormOpen && isCreditFormCollapsed ? <Button type="button" variant="outline" onClick={expandCreditForm} disabled={disabled} aria-label="Show form" title="Show form" className="absolute right-2 top-3 z-10 h-8 w-8 rounded-full border-slate-200 bg-slate-100 p-0 text-slate-700 shadow-[0_2px_8px_rgba(0,0,0,0.08)] hover:border-slate-300 hover:bg-slate-200 hover:text-slate-950 min-[1200px]:right-[-1rem] min-[1200px]:top-1/2 min-[1200px]:-translate-y-1/2"><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button> : null}
      </div>
      {responsiveFormPanel}

      <ConfirmActionDialog
        open={bulkEligibilityConfirmOpen}
        onOpenChange={setBulkEligibilityConfirmOpen}
        title="Enable Employee Credit for active employees?"
        description={`This will mark all ${employees.filter((employee) => employee.is_active).length} active employee${employees.filter((employee) => employee.is_active).length === 1 ? '' : 's'} eligible for Employee Credit. Existing credit limits and balances will not change. Inactive employees are not affected.`}
        confirmLabel="Enable Credit to All Employees"
        onConfirm={handleEnableAllActive}
      />
      <ConfirmActionDialog
        open={repayAllConfirmOpen}
        onOpenChange={(open) => {
          setRepayAllConfirmOpen(open);
          if (!open) setRepayAllTarget(null);
        }}
        title="Repay Employee Credit in full?"
        description={repayAllTarget ? `This will record a full repayment of PHP ${money(repayAllTarget.outstandingBalance)} for ${repayAllTarget.employeeName}. The account must still have the same balance when you confirm.` : 'This will record a full repayment for the selected Employee Credit account.'}
        confirmLabel="Repay all"
        reasonLabel="Repayment reason"
        reasonPlaceholder="Cash repayment, payroll deduction, or reference"
        reasonRequired
        reasonMinLength={3}
        onConfirm={handleRepayAll}
      />
    </section>
  );
}
