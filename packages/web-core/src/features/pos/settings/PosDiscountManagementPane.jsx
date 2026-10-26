import { useCallback, useEffect, useState } from 'react';
import { BadgePercent, Edit3, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ConfirmActionDialog from '@/components/ui/ConfirmActionDialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { POS_MODAL_FOOTER_SURFACE_CLASS, POS_MODAL_HEADER_SURFACE_CLASS } from '../components/posModalStyles.js';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { POS_TABLE_HEADER_STANDARD_CLASS } from '../components/PosTableSurface.jsx';
import {
  createDiscountRule,
  deleteDiscountRule,
  getDiscountRules,
  updateDiscountRule
} from '@/services/settingsService.js';

const EMPTY_DRAFT = {
  name: '',
  percentage: '',
  description: '',
  is_enabled: false,
  is_approved: false
};

const getErrorMessage = (error, fallbackMessage) => {
  const validationErrors = Array.isArray(error?.response?.data?.errors)
    ? error.response.data.errors
    : [];
  const firstValidationMessage = validationErrors.find((entry) => String(entry?.message || '').trim())?.message;
  return String(
    firstValidationMessage
      || error?.response?.data?.message
      || error?.message
      || fallbackMessage
  ).trim();
};

const formatDate = (value) => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString();
};

const formatPercentage = (value) => {
  const percentage = Number(value);
  if (!Number.isFinite(percentage)) return '—';
  return `${percentage}%`;
};

const formatFixedAmount = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Fixed amount';
  return `Fixed amount · PHP ${amount.toFixed(2)}`;
};

const getDraftFromRule = (rule) => ({
  name: String(rule?.name || ''),
  percentage: rule?.method === 'percentage' && rule?.percentage != null
    ? String(rule.percentage)
    : '',
  description: String(rule?.description || ''),
  is_enabled: rule?.is_enabled === true,
  is_approved: rule?.is_approved === true
});

export default function PosDiscountManagementPane({
  locked = false,
  loading = false,
  canEdit = true,
  settingsRefreshKey = 0,
  editorSection = 'settings',
  onSettingsSaved = async () => {}
}) {
  const [rules, setRules] = useState([]);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deletingRuleId, setDeletingRuleId] = useState(null);

  const loadRules = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRulesLoading(true);
    setLoadError('');
    try {
      const nextRules = await getDiscountRules();
      setRules(Array.isArray(nextRules) ? nextRules : []);
      return true;
    } catch (error) {
      setLoadError(getErrorMessage(error, 'Failed to load discount configurations.'));
      return false;
    } finally {
      if (!silent) setRulesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules, settingsRefreshKey]);

  const openCreateDialog = () => {
    if (locked || loading || saving || deletingRuleId !== null || !canEdit) return;
    setEditingRule(null);
    setDraft({ ...EMPTY_DRAFT });
    setFormError('');
    setDialogOpen(true);
  };

  const openEditDialog = (rule) => {
    if (locked || loading || saving || deletingRuleId !== null || !canEdit) return;
    setEditingRule(rule);
    setDraft(getDraftFromRule(rule));
    setFormError('');
    setDialogOpen(true);
  };

  const openDeleteDialog = (rule) => {
    if (locked || loading || saving || deletingRuleId !== null || !canEdit) return;
    setDeleteTarget(rule);
  };

  const closeDialog = ({ force = false } = {}) => {
    if (saving && !force) return;
    setDialogOpen(false);
    setEditingRule(null);
    setDraft({ ...EMPTY_DRAFT });
    setFormError('');
  };

  const handleSubmit = async () => {
    if (locked || loading || saving || deletingRuleId !== null || !canEdit) return;

    const name = String(draft.name || '').trim();
    const percentage = Number(draft.percentage);
    const isPercentageRule = !editingRule || editingRule.method === 'percentage';

    if (!name) {
      setFormError('Discount name is required.');
      return;
    }
    if (isPercentageRule && (!Number.isFinite(percentage) || percentage < 0 || percentage > 100)) {
      setFormError('Discount percentage must be between 0 and 100.');
      return;
    }

    const payload = {
      name,
      description: String(draft.description || '').trim() || null,
      is_enabled: draft.is_enabled === true,
      is_approved: draft.is_approved === true
    };
    if (isPercentageRule) payload.percentage = percentage;
    if (editingRule) payload.expected_configuration_version = Number(editingRule.configuration_version);

    setSaving(true);
    setFormError('');
    try {
      if (editingRule) {
        await updateDiscountRule(editingRule.discount_rule_id, payload);
      } else {
        await createDiscountRule(payload);
      }
      await loadRules({ silent: true });
      const action = editingRule ? 'updated' : 'created';
      closeDialog({ force: true });
      await onSettingsSaved?.({ section: editorSection, action, setting: 'pos_discount_rules' });
      toast.success(`Discount configuration ${action}.`);
    } catch (error) {
      if (Number(error?.response?.status) === 409) {
        await loadRules({ silent: true });
      }
      setFormError(getErrorMessage(error, 'Failed to save discount configuration.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget || locked || loading || saving || deletingRuleId !== null || !canEdit) return;

    const discountRuleId = deleteTarget.discount_rule_id;
    setDeletingRuleId(discountRuleId);
    try {
      await deleteDiscountRule(discountRuleId);
      setRules((currentRules) => currentRules.filter((rule) => rule.discount_rule_id !== discountRuleId));
      await loadRules({ silent: true });
      await onSettingsSaved?.({ section: editorSection, action: 'deleted', setting: 'pos_discount_rules' });
      toast.success('Discount configuration deleted.');
    } finally {
      setDeletingRuleId(null);
    }
  };

  const editorDisabled = locked || loading || saving || deletingRuleId !== null || !canEdit;
  const fixedAmountRule = editingRule?.method === 'fixed';

  return (
    <section aria-labelledby="pos-discount-management-heading" className="space-y-4" data-testid="pos-discount-management-pane">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#EAF3FF] text-[#1A4E8D]">
            <BadgePercent className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 id="pos-discount-management-heading" className="text-[16px] font-extrabold tracking-tight text-[#0F172A]">
              Discount Management
            </h2>
            <p className="mt-1 text-[12px] font-medium leading-5 text-[#6F86A8]">
              Configure which discounts can be selected for future POS transactions.
            </p>
          </div>
        </div>
        <div className="flex w-full justify-end sm:w-auto">
          {canEdit ? (
            <Button
              type="button"
              className="min-h-10 gap-1.5 rounded-xl bg-[#1A4E8D] px-3 text-[12px] font-extrabold text-white hover:bg-[#143F73]"
              onClick={openCreateDialog}
              disabled={editorDisabled}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add discount
            </Button>
          ) : null}
        </div>
      </div>

      {!canEdit ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] leading-5 text-amber-800">
          View-only access. Ask an administrator with settings edit permission to change discount configurations.
        </div>
      ) : null}

      {loadError ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12px] leading-5 text-rose-700" role="alert">
          <p>{loadError}</p>
          <Button
            type="button"
            variant="outline"
            className="mt-3 min-h-9 rounded-xl border-rose-200 px-3 text-[12px] font-bold text-rose-700 hover:bg-rose-100"
            onClick={() => void loadRules()}
            disabled={rulesLoading}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {rulesLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-[12px] text-slate-500" role="status">
          Loading discount configurations...
        </div>
      ) : rules.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-[13px] font-extrabold text-slate-800">No discount configurations found</p>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">Add a discount to make it available for approval and activation.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#DDE8F5] bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className={`${POS_TABLE_HEADER_STANDARD_CLASS} border-b border-slate-100 bg-slate-50`}>
                <tr className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[#6F86A8]">
                  <th className="px-4">Discount</th>
                  <th className="px-4">Rate</th>
                  <th className="px-4">Availability</th>
                  <th className="px-4">Created</th>
                  <th className="px-4">Last updated</th>
                  <th className="px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rules.map((rule) => {
                  const available = rule.is_enabled === true && rule.is_approved === true;
                  const fixedAmount = rule.method === 'fixed';
                  return (
                    <tr key={rule.discount_rule_id} className="align-top text-[12px] text-[#0F172A]">
                      <td className="px-4 py-4">
                        <p className="font-extrabold">{rule.name || 'Unnamed discount'}</p>
                        <p className="mt-1 max-w-xs leading-5 text-slate-500">{rule.description || 'No description provided.'}</p>
                        <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                          {rule.configuration_source === 'admin' ? 'Admin configured' : 'System configuration'}
                        </p>
                      </td>
                      <td className="px-4 py-4 font-extrabold">
                        {fixedAmount ? formatFixedAmount(rule.fixed_amount) : formatPercentage(rule.percentage)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${rule.is_enabled === true ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                            {rule.is_enabled === true ? 'Active' : 'Inactive'}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold ${rule.is_approved === true ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                            {rule.is_approved === true ? 'Approved' : 'Pending approval'}
                          </span>
                        </div>
                        <p className={`mt-2 text-[11px] font-bold ${available ? 'text-emerald-700' : 'text-slate-500'}`}>
                          {available ? 'Available in POS' : 'Not available in POS'}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(rule.created_at)}</td>
                      <td className="whitespace-nowrap px-4 py-4 text-slate-500">{formatDate(rule.updated_at)}</td>
                      <td className="px-4 py-4 text-right">
                        {canEdit ? (
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-9 gap-1.5 rounded-xl px-3 text-[12px] font-bold"
                              onClick={() => openEditDialog(rule)}
                              disabled={editorDisabled}
                            >
                              <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              className="min-h-9 gap-1.5 rounded-xl border-red-200 px-3 text-[12px] font-bold text-red-700 hover:bg-red-50 hover:text-red-800"
                              onClick={() => openDeleteDialog(rule)}
                              disabled={editorDisabled}
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Delete
                            </Button>
                          </div>
                        ) : <span className="text-[11px] text-slate-400">View only</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }} overlayClassName="bg-black/30 backdrop-blur-none">
        <DialogContent className="w-[calc(100vw-1.5rem)] max-w-xl rounded-2xl border border-[#D9E5F3] bg-white p-0 shadow-2xl shadow-slate-950/15 sm:w-full">
          <DialogHeader className={['rounded-t-2xl px-5 py-4 text-left sm:px-6', POS_MODAL_HEADER_SURFACE_CLASS].join(' ')}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-[16px] font-extrabold text-[#0F172A]">
                  {editingRule ? 'Edit discount' : 'Add discount'}
                </DialogTitle>
                <DialogDescription className="mt-1 text-[12px] leading-5 text-[#64748B]">
                  Configure the discount rule for future POS transactions. It must be active and approved before cashiers can select it.
                </DialogDescription>
              </div>
              <button
                type="button"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1A4E8D]/30"
                onClick={closeDialog}
                aria-label="Close discount dialog"
                disabled={saving}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </DialogHeader>

          <div className="grid gap-4 px-5 py-5 sm:px-6">
            {formError ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-[12px] leading-5 text-rose-700" role="alert">
                {formError}
              </div>
            ) : null}

            <div className="grid gap-1.5">
              <Label htmlFor="pos-discount-name" className="text-[12px] font-extrabold text-[#334155]">Discount Name</Label>
              <Input
                id="pos-discount-name"
                value={draft.name}
                onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                placeholder="Enter discount name"
                maxLength={120}
                disabled={editorDisabled}
                autoFocus
                className="h-9 rounded-lg border-slate-200 text-[13px]"
              />
            </div>

            {fixedAmountRule ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[12px] leading-5 text-slate-600">
                This is a fixed-amount system rule ({formatFixedAmount(editingRule.fixed_amount)}). Its amount is system-controlled; you can still update its name, description, approval, and active status.
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="pos-discount-percentage" className="text-[12px] font-extrabold text-[#334155]">Discount Rate (%)</Label>
                <div className="relative">
                  <Input
                    id="pos-discount-percentage"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    inputMode="decimal"
                    value={draft.percentage}
                    onChange={(event) => setDraft((current) => ({ ...current, percentage: event.target.value }))}
                    placeholder="0–100"
                    disabled={editorDisabled}
                    className="h-9 rounded-lg border-slate-200 pr-8 text-[13px]"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] font-bold text-slate-400">%</span>
                </div>
                <p className="text-[11px] leading-4 text-[#64748B]">Use a value from 0 to 100. This rate is copied into each future transaction.</p>
              </div>
            )}

            <div className="grid gap-1.5">
              <Label htmlFor="pos-discount-description" className="text-[12px] font-extrabold text-[#334155]">Description (Optional)</Label>
              <textarea
                id="pos-discount-description"
                value={draft.description}
                onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
                placeholder="Explain when this discount should be used."
                maxLength={500}
                disabled={editorDisabled}
                rows={3}
                className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-900 outline-none placeholder:text-slate-400 focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-extrabold text-[#0F172A]">Active Status</p>
                  <p className="text-[11px] leading-4 text-[#64748B]">Allows this discount to be selected for POS transactions.</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#334155]">{draft.is_enabled === true ? 'Active' : 'Inactive'}</p>
                </div>
                <Switch
                  aria-label="Active Status"
                  checked={draft.is_enabled === true}
                  onCheckedChange={(value) => setDraft((current) => ({ ...current, is_enabled: value === true }))}
                  disabled={editorDisabled}
                  className={draft.is_enabled === true ? 'bg-[#2563EB] focus-visible:ring-[#2563EB]' : 'bg-slate-200 focus-visible:ring-[#2563EB]'}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
                <div>
                  <p className="text-[13px] font-extrabold text-[#0F172A]">POS Approval Status</p>
                  <p className="text-[11px] leading-4 text-[#64748B]">Authorizes this discount for POS transactions.</p>
                  <p className="mt-0.5 text-[11px] font-bold text-[#334155]">{draft.is_approved === true ? 'Approved' : 'Pending Approval'}</p>
                </div>
                <Switch
                  aria-label="POS Approval Status"
                  checked={draft.is_approved === true}
                  onCheckedChange={(value) => setDraft((current) => ({ ...current, is_approved: value === true }))}
                  disabled={editorDisabled}
                  className={draft.is_approved === true ? 'bg-[#2563EB] focus-visible:ring-[#2563EB]' : 'bg-slate-200 focus-visible:ring-[#2563EB]'}
                />
              </div>
            </div>
          </div>

          <DialogFooter className={['flex-col-reverse items-stretch gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:pt-4', POS_MODAL_FOOTER_SURFACE_CLASS].join(' ')}>
            <Button
              type="button"
              variant="outline"
              className="min-h-9 w-full rounded-xl px-4 text-[13px] font-bold sm:w-auto"
              onClick={closeDialog}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="min-h-9 w-full gap-1.5 rounded-xl bg-[#1A4E8D] px-4 text-[13px] font-extrabold text-white shadow-sm hover:bg-[#143F73] sm:w-auto"
              onClick={() => void handleSubmit()}
              disabled={editorDisabled}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {saving ? 'Saving...' : editingRule ? 'Save changes' : 'Add discount'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmActionDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && deletingRuleId === null) setDeleteTarget(null);
        }}
        title="Delete discount configuration?"
        description={deleteTarget
          ? `Delete "${deleteTarget.name}" permanently? Discounts used in transactions cannot be deleted and must be set to inactive instead.`
          : ''}
        confirmLabel="Delete discount"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
      />
    </section>
  );
}
