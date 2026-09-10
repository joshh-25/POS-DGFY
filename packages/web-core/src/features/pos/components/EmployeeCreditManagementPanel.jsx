import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, Banknote, CreditCard, RefreshCw, Save, SlidersHorizontal } from 'lucide-react';
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

const createIdempotencyKey = () => `employee-credit-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`}`;
const money = (value) => Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function EmployeeCreditManagementPanel({ disabled = false, refreshKey = 0 }) {
  const [accounts, setAccounts] = useState([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState('');
  const [bulkEligibilityConfirmOpen, setBulkEligibilityConfirmOpen] = useState(false);
  const [repayAllConfirmOpen, setRepayAllConfirmOpen] = useState(false);
  const [repayAllTarget, setRepayAllTarget] = useState(null);
  const [form, setForm] = useState({
    isEligible: false,
    creditLimit: '',
    repayment: '',
    repaymentReason: '',
    adjustment: '',
    adjustmentReason: ''
  });

  const selectedEmployee = useMemo(
    () => accounts.find((entry) => String(entry.employee_id) === String(selectedEmployeeId)) || null,
    [accounts, selectedEmployeeId]
  );
  const account = selectedEmployee?.employeeCreditAccount || null;
  const outstandingBalance = Number(account?.outstanding_balance || 0);
  const canRepayAll = Boolean(account?.account_id) && Number.isFinite(outstandingBalance) && outstandingBalance > 0;

  const hydrateForm = (employee) => {
    const current = employee?.employeeCreditAccount || null;
    setForm({
      isEligible: Boolean(current?.is_eligible),
      creditLimit: current?.credit_limit == null ? '' : String(current.credit_limit),
      repayment: '',
      repaymentReason: '',
      adjustment: '',
      adjustmentReason: ''
    });
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const rows = await fetchEmployees({ includeInactive: false });
      setAccounts(rows);
      const nextEmployeeId = selectedEmployeeId && rows.some((row) => String(row.employee_id) === String(selectedEmployeeId))
        ? selectedEmployeeId
        : String(rows[0]?.employee_id || '');
      setSelectedEmployeeId(nextEmployeeId);
      hydrateForm(rows.find((row) => String(row.employee_id) === String(nextEmployeeId)) || null);
    } catch (error) {
      toast.error(error?.response?.data?.message || 'Failed to load Employee Credit accounts.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
    // The selected employee is intentionally preserved across refreshes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  const handleEmployeeChange = (event) => {
    const employeeId = event.target.value;
    setSelectedEmployeeId(employeeId);
    hydrateForm(accounts.find((entry) => String(entry.employee_id) === String(employeeId)) || null);
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
      toast.error('Save the Employee Credit account before recording a repayment.');
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
      if (error?.response?.status === 409) {
        await loadAccounts();
      }
      return { success: false, message };
    } finally {
      setActiveAction('');
    }
  };

  const handleAdjustment = async () => {
    const amount = Number(form.adjustment);
    if (!account?.account_id) {
      toast.error('Save the Employee Credit account before adjusting its outstanding balance.');
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

  const busy = loading || Boolean(activeAction);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-[#1A4E8D]"><CreditCard className="h-5 w-5" /></div>
          <div>
            <h3 className="text-[15px] font-black text-slate-950">Employee Credit</h3>
            <p className="text-xs text-slate-500">Open-tab employee charges, repayments, and audited outstanding balances. Excluded from cash drawer sales totals.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setBulkEligibilityConfirmOpen(true)} disabled={busy || disabled || accounts.length === 0}>
            <BadgeCheck className="mr-2 h-4 w-4" /> Enable active employees
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={loadAccounts} disabled={busy || disabled}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="space-y-1.5 lg:col-span-2">
          <span className="text-xs font-bold text-slate-700">Employee</span>
          <select value={selectedEmployeeId} onChange={handleEmployeeChange} disabled={busy || disabled} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900">
            {accounts.length === 0 ? <option value="">No active employees found</option> : null}
            {accounts.map((entry) => <option key={entry.employee_id} value={entry.employee_id}>{entry.full_name} ({entry.employee_code})</option>)}
          </select>
        </label>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Account</p>
          <p className="mt-1 font-black text-slate-900">{account?.account_code || 'Created when first saved'}</p>
          <p className="mt-2 text-slate-600">Outstanding balance: <strong className="text-slate-950">₱{money(account?.outstanding_balance)}</strong></p>
          {Number(account?.balance || 0) !== 0 ? (
            <p className="mt-1 text-xs text-slate-500">Legacy funded balance: ₱{money(account.balance)}</p>
          ) : null}
        </div>
        <label className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
          <span><span className="block text-sm font-black text-slate-900">Eligible for credit</span><span className="text-xs text-slate-500">Disabled accounts cannot be charged.</span></span>
          <input type="checkbox" checked={form.isEligible} onChange={(event) => setForm((current) => ({ ...current, isEligible: event.target.checked }))} disabled={busy || disabled} className="h-5 w-5 accent-[#0F9D8A]" />
        </label>

        <div className="space-y-1.5">
          <Label>Credit limit (optional)</Label>
          <Input type="number" min="0" step="0.01" value={form.creditLimit} onChange={(event) => setForm((current) => ({ ...current, creditLimit: event.target.value }))} disabled={busy || disabled} placeholder="No limit" />
        </div>

        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Banknote className="h-4 w-4 text-emerald-700" />
            <p className="text-sm font-black text-slate-900">Record repayment</p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label>Amount paid</Label>
              <Input type="number" min="0.01" step="0.01" value={form.repayment} onChange={(event) => setForm((current) => ({ ...current, repayment: event.target.value }))} disabled={busy || disabled} placeholder="0.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Repayment reason</Label>
              <Input value={form.repaymentReason} onChange={(event) => setForm((current) => ({ ...current, repaymentReason: event.target.value }))} disabled={busy || disabled} placeholder="Cash repayment, payroll deduction, or reference" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={handleRepayment} disabled={!account?.account_id || busy || disabled} className="bg-emerald-700 text-white hover:bg-emerald-800">
                {activeAction === 'repayment' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <Banknote className="mr-2 h-4 w-4" />}
                Record repayment
              </Button>
              <Button type="button" variant="outline" onClick={openRepayAllConfirmation} disabled={!canRepayAll || busy || disabled}>
                <Banknote className="mr-2 h-4 w-4" />
                Repay all
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 lg:col-span-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-amber-700" />
            <p className="text-sm font-black text-slate-900">Administrative outstanding correction</p>
          </div>
          <p className="mt-1 text-xs text-slate-500">Positive increases debt; negative reduces debt. Use repayment above for normal collections.</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,0.6fr)_minmax(0,1fr)_auto] lg:items-end">
            <div className="space-y-1.5">
              <Label>Signed adjustment</Label>
              <Input type="number" step="0.01" value={form.adjustment} onChange={(event) => setForm((current) => ({ ...current, adjustment: event.target.value }))} disabled={busy || disabled} placeholder="Example: -25.00" />
            </div>
            <div className="space-y-1.5">
              <Label>Correction reason</Label>
              <Input value={form.adjustmentReason} onChange={(event) => setForm((current) => ({ ...current, adjustmentReason: event.target.value }))} disabled={busy || disabled} placeholder="Required audit reason" />
            </div>
            <Button type="button" variant="outline" onClick={handleAdjustment} disabled={!account?.account_id || busy || disabled}>
              {activeAction === 'adjustment' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : <SlidersHorizontal className="mr-2 h-4 w-4" />}
              Apply correction
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <Button type="button" onClick={handleSave} disabled={!selectedEmployeeId || busy || disabled} className="bg-[#0F9D8A] text-white hover:bg-[#0B7F70]">
          {activeAction === 'save' ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : account?.is_eligible ? <BadgeCheck className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
          Save Employee Credit
        </Button>
      </div>

      <ConfirmActionDialog
        open={bulkEligibilityConfirmOpen}
        onOpenChange={setBulkEligibilityConfirmOpen}
        title="Enable Employee Credit for active employees?"
        description={`This will mark all ${accounts.length} active employee${accounts.length === 1 ? '' : 's'} eligible for Employee Credit. Existing credit limits and balances will not change. Inactive employees are not affected.`}
        confirmLabel="Enable active employees"
        onConfirm={handleEnableAllActive}
      />
      <ConfirmActionDialog
        open={repayAllConfirmOpen}
        onOpenChange={(open) => {
          setRepayAllConfirmOpen(open);
          if (!open) setRepayAllTarget(null);
        }}
        title="Repay Employee Credit in full?"
        description={repayAllTarget
          ? `This will record a full repayment of ₱${money(repayAllTarget.outstandingBalance)} for ${repayAllTarget.employeeName}. The account must still have the same balance when you confirm.`
          : 'This will record a full repayment for the selected Employee Credit account.'}
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
