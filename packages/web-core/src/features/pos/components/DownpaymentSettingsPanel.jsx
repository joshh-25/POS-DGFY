import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleDollarSign, RefreshCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { fetchDownpaymentSettings, updateDownpaymentSettings } from '../services/downpaymentSettingsService.js';
import {
    createDefaultDownpaymentForm,
    formToPayload,
    isSplitConfigurable,
    previewDownpaymentSplit,
    settingsToForm,
    validateDownpaymentForm
} from '../utils/downpaymentSettingsForm.js';

const formatDisplayMoney = (value) => `₱${Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Phase 143 (#848). Modelled on AffiliatesWorkspacePanel.jsx: a self-contained tenant-settings
// panel with its own fetch/save and its own permission gate, rendered as a tab inside
// SettingsWorkspace (TerminalOperationsWorkspace.jsx). Reads/writes the already-shipped Phase 138
// (#820) API -- no backend change.

// Duplicated locally rather than imported -- resolveUserPermissionList in
// TerminalOperationsWorkspace.jsx is not exported, and every sibling panel already re-implements
// this same check (see AffiliatesWorkspacePanel.jsx's identical comment).
const resolveUserPermissionList = (user) => {
    if (Array.isArray(user?.permissions)) return user.permissions;
    if (typeof user?.permissions !== 'string') return [];
    try {
        const parsed = JSON.parse(user.permissions);
        if (Array.isArray(parsed)) return parsed;
        if (!parsed || typeof parsed !== 'object') return [];
        return Object.entries(parsed).flatMap(([entity, actions]) => (
            actions && typeof actions === 'object'
                ? Object.entries(actions).filter(([, allowed]) => allowed === true).map(([action]) => `${entity}:${action}`)
                : []
        ));
    } catch {
        return [];
    }
};

// Phase 150 (#866): customer_choice was reserved (schema-authorized, backend-rejected) since #820
// -- that reservation is lifted, and it's now offered here as a third mode. Under it, the customer
// gets exactly two options at checkout: pay the full total online, or pay a downpayment online with
// the balance settled on delivery/pickup (COD) -- plain COD-with-no-downpayment is not a third
// option here, since that's already what 'full_payment' + a cash capability expresses.
const PAYMENT_MODE_OPTIONS = [
    { value: 'full_payment', label: 'Full payment up front', description: 'Customers pay the full order total at checkout.' },
    { value: 'downpayment_required', label: 'Downpayment required', description: 'Customers pay a downpayment online; the balance is settled on delivery/pickup.' },
    { value: 'customer_choice', label: 'Let the customer choose', description: 'Customers pick at checkout: pay the full total online, or pay a downpayment online with the balance on delivery/pickup.' }
];

export default function DownpaymentSettingsPanel({ terminalUser = null, locked = false, sectionId }) {
    const isMasterAdmin = terminalUser?.is_master_admin === true;
    const permissionList = useMemo(() => resolveUserPermissionList(terminalUser), [terminalUser]);
    const canView = isMasterAdmin || permissionList.includes('downpayment:view') || permissionList.includes('downpayment:settings');
    const canManage = isMasterAdmin || permissionList.includes('downpayment:settings');

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(createDefaultDownpaymentForm());
    const [validationErrors, setValidationErrors] = useState([]);
    const [sampleTotalPesos, setSampleTotalPesos] = useState('1000');

    const loadData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const settings = await fetchDownpaymentSettings();
            setForm(settingsToForm(settings));
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to load downpayment settings.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (locked || !canView) return;
        loadData();
        // Stable initial load, mirrors AffiliatesWorkspacePanel's own effect -- loadData is not a dependency.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [locked, canView]);

    const updateField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

    const splitConfigurable = isSplitConfigurable(form.payment_mode);
    const isCustomerChoice = form.payment_mode === 'customer_choice';
    const preview = useMemo(
        () => previewDownpaymentSplit({ form, sampleTotalPesos }),
        [form, sampleTotalPesos]
    );
    const fieldErrorFor = (field) => validationErrors.find((entry) => entry.field === field)?.message;

    const handleSave = async () => {
        if (!canManage) return;
        const errors = validateDownpaymentForm(form);
        setValidationErrors(errors);
        if (errors.length > 0) {
            toast.error('Fix the highlighted fields before saving.');
            return;
        }

        setSaving(true);
        try {
            // Always PUTs the full six-field payload, never a single dirty field -- the backend
            // re-validates the whole merged (effective) row on every write, so a partial diff can
            // 422 an already-configured downpayment_required tenant.
            const updated = await updateDownpaymentSettings(formToPayload(form));
            setForm(settingsToForm(updated));
            toast.success('Downpayment settings updated');
        } catch (err) {
            const serverErrors = Array.isArray(err?.response?.data?.errors) ? err.response.data.errors : [];
            if (serverErrors.length > 0) setValidationErrors(serverErrors);
            toast.error(err?.response?.data?.message || 'Failed to update downpayment settings.');
        } finally {
            setSaving(false);
        }
    };

    if (!canView) {
        return (
            <div id={sectionId} className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                You don&apos;t have access to view downpayment settings.
            </div>
        );
    }

    if (loading) {
        return (
            <div id={sectionId} className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                Loading downpayment settings...
            </div>
        );
    }

    if (error) {
        return (
            <div id={sectionId} className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
                <p>{error}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={loadData}>
                    <RefreshCcw className="mr-2 h-4 w-4" /> Retry
                </Button>
            </div>
        );
    }

    return (
        <div id={sectionId} className="space-y-4">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                <div className="flex items-start gap-2">
                    <CircleDollarSign className="mt-0.5 h-5 w-5 text-[#1A4E8D]" />
                    <div>
                        <h2 className="text-[15px] font-black text-slate-950">Payment Mode</h2>
                        <p className="text-xs text-slate-500">
                            Choose whether customers pay the full order total up front, or a downpayment online
                            with the balance settled on delivery/pickup.
                        </p>
                    </div>
                </div>

                <div className="mt-4 space-y-2">
                    {PAYMENT_MODE_OPTIONS.map((option) => (
                        <label
                            key={option.value}
                            className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3 transition ${
                                form.payment_mode === option.value
                                    ? 'border-[#1A4E8D] bg-blue-50/60'
                                    : 'border-slate-200 bg-white hover:border-blue-200'
                            }`}
                        >
                            <input
                                type="radio"
                                name="downpayment-payment-mode"
                                className="mt-1 h-4 w-4"
                                checked={form.payment_mode === option.value}
                                disabled={!canManage}
                                onChange={() => updateField('payment_mode', option.value)}
                            />
                            <div>
                                <p className="text-sm font-bold text-slate-900">{option.label}</p>
                                <p className="text-xs text-slate-500">{option.description}</p>
                            </div>
                        </label>
                    ))}
                </div>
            </div>

            {splitConfigurable && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-200/70">
                    <h3 className="text-[13px] font-black text-slate-900">Downpayment Amount</h3>

                    <div className="mt-3 space-y-1.5">
                        <Label htmlFor="downpayment-type">Type</Label>
                        <Select
                            value={form.downpayment_type}
                            onValueChange={(value) => updateField('downpayment_type', value)}
                        >
                            <SelectTrigger id="downpayment-type" className="w-full" disabled={!canManage}>
                                <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="percentage">Percentage of order total</SelectItem>
                                <SelectItem value="fixed">Fixed amount</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {form.downpayment_type === 'percentage' ? (
                        <div className="mt-3 space-y-1.5">
                            <Label htmlFor="downpayment-rate">Percentage (%)</Label>
                            <Input
                                id="downpayment-rate"
                                type="number"
                                min="0.01"
                                max="100"
                                step="0.01"
                                disabled={!canManage}
                                value={form.downpayment_rate_percentage}
                                onChange={(e) => updateField('downpayment_rate_percentage', e.target.value)}
                                placeholder="20"
                            />
                            <p className="text-xs text-slate-500">
                                What share of each order&apos;s total is captured online now. Scales with the
                                order, so it&apos;s paired with a minimum below to protect small orders.
                            </p>
                            {fieldErrorFor('downpayment_rate_bps') && (
                                <p className="text-xs text-rose-600">{fieldErrorFor('downpayment_rate_bps')}</p>
                            )}
                        </div>
                    ) : (
                        <div className="mt-3 space-y-1.5">
                            <Label htmlFor="downpayment-fixed">Fixed amount (₱)</Label>
                            <Input
                                id="downpayment-fixed"
                                type="number"
                                min="0.01"
                                step="0.01"
                                disabled={!canManage}
                                value={form.downpayment_fixed_pesos}
                                onChange={(e) => updateField('downpayment_fixed_pesos', e.target.value)}
                                placeholder="500.00"
                            />
                            <p className="text-xs text-slate-500">
                                The same amount is captured online on every order, regardless of its total — it
                                is reduced only if the order itself is worth less than this. There&apos;s no
                                separate minimum in this mode: this amount already is the floor.
                            </p>
                            {fieldErrorFor('downpayment_fixed_centavos') && (
                                <p className="text-xs text-rose-600">{fieldErrorFor('downpayment_fixed_centavos')}</p>
                            )}
                        </div>
                    )}

                    {form.downpayment_type === 'percentage' && (
                        <div className="mt-3 space-y-1.5">
                            <Label htmlFor="downpayment-min">Minimum downpayment (₱)</Label>
                            <Input
                                id="downpayment-min"
                                type="number"
                                min="0.01"
                                step="0.01"
                                disabled={!canManage}
                                value={form.min_downpayment_pesos}
                                onChange={(e) => updateField('min_downpayment_pesos', e.target.value)}
                                placeholder="50.00"
                            />
                            <p className="text-xs text-slate-500">
                                A floor under the percentage above, so a small order never produces a
                                downpayment too small to be worth collecting online. E.g. 10% of ₱500 is
                                ₱50 — with a ₱100 minimum, that order captures ₱100 instead.
                            </p>
                            {fieldErrorFor('min_downpayment_centavos') && (
                                <p className="text-xs text-rose-600">{fieldErrorFor('min_downpayment_centavos')}</p>
                            )}
                        </div>
                    )}

                    <div className="mt-4 flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2">
                        <div>
                            <span className="text-sm font-bold text-slate-900">Refundable</span>
                            <p className="text-xs text-slate-500">Whether the downpayment can be refunded on cancellation.</p>
                        </div>
                        <Switch
                            aria-label="Downpayment refundable"
                            checked={form.downpayment_refundable === true}
                            disabled={!canManage}
                            onCheckedChange={(value) => updateField('downpayment_refundable', value)}
                        />
                    </div>

                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <Label htmlFor="downpayment-sample-total" className="text-xs text-slate-600">
                                Preview on a sample order total (₱)
                            </Label>
                            <Input
                                id="downpayment-sample-total"
                                type="number"
                                min="0"
                                step="0.01"
                                className="h-8 w-28 text-right"
                                value={sampleTotalPesos}
                                onChange={(e) => setSampleTotalPesos(e.target.value)}
                            />
                        </div>
                        {isCustomerChoice && (
                            <div className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">If they pay in full</p>
                                <div className="mt-1 flex items-center justify-between text-sm">
                                    <span className="text-slate-600">Customer pays now</span>
                                    <span className="font-bold text-slate-900">
                                        {Number(sampleTotalPesos) > 0 ? formatDisplayMoney(sampleTotalPesos) : '—'}
                                    </span>
                                </div>
                            </div>
                        )}
                        <div className="mt-2 rounded-md border border-slate-200 bg-white px-2.5 py-2">
                            {isCustomerChoice && (
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">If they pay a downpayment</p>
                            )}
                            <div className="mt-1 flex items-center justify-between text-sm">
                                <span className="text-slate-600">Customer pays now</span>
                                <span className="font-bold text-slate-900">
                                    {preview.downpaymentAmountPesos !== null ? formatDisplayMoney(preview.downpaymentAmountPesos) : '—'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between text-sm">
                                <span className="text-slate-600">Balance on delivery</span>
                                <span className="font-bold text-slate-900">
                                    {preview.balanceDueAmountPesos !== null ? formatDisplayMoney(preview.balanceDueAmountPesos) : '—'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {!canManage && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                    You can view downpayment settings but can&apos;t change them. Ask an admin for the
                    <code className="mx-1 rounded bg-amber-100 px-1">downpayment:settings</code>
                    permission.
                </p>
            )}

            <div className="flex justify-end">
                <Button type="button" disabled={locked || !canManage || saving} onClick={handleSave}>
                    <Save className="mr-2 h-4 w-4" /> {saving ? 'Saving…' : 'Save'}
                </Button>
            </div>
        </div>
    );
}
