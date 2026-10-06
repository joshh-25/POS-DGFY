import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Info, Lock, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { businessAdminApi, getBusinessAdminErrorMessage } from './businessAdminService.js';

const PAYMENT_METHODS = Object.freeze([
    { key: 'card', label: 'Card' },
    { key: 'ewallet', label: 'E-wallet' },
    { key: 'qrph', label: 'QR Ph' },
    { key: 'online_banking', label: 'Online banking' },
    { key: 'other', label: 'Other' }
]);

const EMPTY_POLICY = Object.freeze({
    card: { rate_bps: 0, fixed_centavos: 0 },
    ewallet: { rate_bps: 0, fixed_centavos: 0 },
    qrph: { rate_bps: 0, fixed_centavos: 0 },
    online_banking: { rate_bps: 0, fixed_centavos: 0 },
    other: { rate_bps: 0, fixed_centavos: 0 }
});

const money = (centavos) => new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    maximumFractionDigits: 2
}).format((Number(centavos) || 0) / 100);

const dateTime = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime())
        ? String(value)
        : parsed.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });
};

const asObject = (value) => {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
};

const localDateTimeValue = (value) => {
    const parsed = value ? new Date(value) : new Date(Date.now() + 60_000);
    if (Number.isNaN(parsed.getTime())) return '';
    const local = new Date(parsed.getTime() - (parsed.getTimezoneOffset() * 60_000));
    return local.toISOString().slice(0, 16);
};

const nextEffectiveDate = (policy) => {
    const latest = policy?.effective_at ? new Date(policy.effective_at) : null;
    const minimum = latest && !Number.isNaN(latest.getTime()) && latest.getTime() >= Date.now()
        ? latest.getTime() + 60_000
        : Date.now() + 60_000;
    return localDateTimeValue(new Date(minimum));
};

const buildForm = (policy) => {
    const source = asObject(policy?.fallback_fee_policy);
    const customerSource = asObject(policy?.customer_processing_fee_policy);
    const customerPolicyValue = policy?.customer_processing_fee_policy;
    const customerEnabled = customerPolicyValue !== null
        && customerPolicyValue !== undefined
        && Object.keys(customerSource).length > 0;
    return {
        ...Object.fromEntries(PAYMENT_METHODS.map(({ key }) => {
            const entry = source[key] || EMPTY_POLICY[key];
            return [key, {
                rate: Number(entry.rate_bps || 0) / 100,
                fixed: Number(entry.fixed_centavos || 0) / 100
            }];
        })),
        customer_enabled: customerEnabled,
        customer_mode: customerSource.mode === 'percentage' ? 'percentage' : 'fixed',
        customer_rate: Number(customerSource.rate_bps || 0) / 100,
        customer_fixed: Number(customerSource.fixed_centavos || 0) / 100,
        customer_label: String(customerSource.label || 'Item processing fee'),
        effective_at: nextEffectiveDate(policy),
        reason: ''
    };
};

const parseRateBps = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error('Rate must be between 0% and 100%.');
    const bps = Math.round(parsed * 100);
    if (Math.abs((parsed * 100) - bps) > 0.0001) throw new Error('Rate supports up to two decimal places.');
    return bps;
};

const parseCentavos = (value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 9_007_199_254_740.99) {
        throw new Error('Fixed amount must be a non-negative PHP amount.');
    }
    return Math.round(parsed * 100);
};

const buildPayload = (form, expectedPolicyVersion) => {
    const fallback = Object.fromEntries(PAYMENT_METHODS.map(({ key }) => [key, {
        rate_bps: parseRateBps(form[key].rate),
        fixed_centavos: parseCentavos(form[key].fixed)
    }]));
    const effectiveAt = new Date(form.effective_at);
    if (Number.isNaN(effectiveAt.getTime())) throw new Error('Effective date is invalid.');
    const reason = String(form.reason || '').trim();
    if (reason.length < 3 || reason.length > 500) throw new Error('Reason must be between 3 and 500 characters.');
    const customerProcessingFeePolicy = form.customer_enabled
        ? {
            mode: form.customer_mode === 'percentage' ? 'percentage' : 'fixed',
            fixed_centavos: form.customer_mode === 'percentage' ? 0 : parseCentavos(form.customer_fixed),
            rate_bps: form.customer_mode === 'percentage' ? parseRateBps(form.customer_rate) : 0,
            label: String(form.customer_label || '').trim()
        }
        : null;
    if (customerProcessingFeePolicy && (customerProcessingFeePolicy.label.length < 1 || customerProcessingFeePolicy.label.length > 80)) {
        throw new Error('Item processing fee label must be between 1 and 80 characters.');
    }
    return {
        expected_policy_version: Number(expectedPolicyVersion || 0),
        fallback_fee_policy: fallback,
        customer_processing_fee_policy: customerProcessingFeePolicy,
        effective_at: effectiveAt.toISOString(),
        reason
    };
};

const fallbackSummary = (policy) => PAYMENT_METHODS.map(({ key, label }) => {
    const entry = asObject(policy?.fallback_fee_policy)[key];
    if (!entry) return `${label}: not configured`;
    return `${label}: ${(Number(entry.rate_bps || 0) / 100).toFixed(2)}% + ${money(entry.fixed_centavos || 0)}`;
}).join(' · ');

const customerSummary = (policy) => {
    const customerPolicy = asObject(policy?.customer_processing_fee_policy);
    if (!Object.keys(customerPolicy).length) return 'Item processing fee: disabled';
    if (customerPolicy.mode === 'percentage') {
        return `Item processing fee: ${(Number(customerPolicy.rate_bps || 0) / 100).toFixed(2)}% (${customerPolicy.label || 'Item processing fee'})`;
    }
    return `Item processing fee: ${money(customerPolicy.fixed_centavos || 0)} (${customerPolicy.label || 'Item processing fee'})`;
};

export default function ProcessingFeePolicyEditor({
    canEdit = false,
    onDirtyChange = () => {},
    onSettingsSaved = () => {}
}) {
    const [policies, setPolicies] = useState([]);
    const [form, setForm] = useState(() => buildForm(null));
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const latest = policies[0] || null;
    const policyVersion = Number(latest?.version || 0);

    const loadPolicies = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const result = await businessAdminApi.tenantRevenueFeeHistory();
            const nextPolicies = Array.isArray(result?.policies) ? result.policies : [];
            setPolicies(nextPolicies);
            setForm(buildForm(nextPolicies[0] || null));
            onDirtyChange(false);
        } catch (loadError) {
            setError(getBusinessAdminErrorMessage(loadError));
        } finally {
            setLoading(false);
        }
    }, [onDirtyChange]);

    useEffect(() => {
        void loadPolicies();
    }, [loadPolicies]);

    const updateMethod = (method, field, value) => {
        setForm((current) => ({
            ...current,
            [method]: { ...current[method], [field]: value }
        }));
        setNotice('');
        onDirtyChange(true);
    };

    const updateFormField = (field, value) => {
        setForm((current) => ({ ...current, [field]: value }));
        setNotice('');
        onDirtyChange(true);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        if (!canEdit || saving) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const result = await businessAdminApi.saveTenantRevenueFeePolicy(buildPayload(form, policyVersion));
            const saved = result?.policy;
            const nextPolicies = saved
                ? [saved, ...policies.filter((policy) => String(policy.policy_id) !== String(saved.policy_id))]
                : policies;
            setPolicies(nextPolicies);
            setForm(buildForm(saved || nextPolicies[0] || null));
            setNotice(`Item processing fee policy v${saved?.version || policyVersion + 1} saved.`);
            onDirtyChange(false);
            onSettingsSaved({ policyVersion: saved?.version || policyVersion + 1 });
        } catch (saveError) {
            setError(getBusinessAdminErrorMessage(saveError));
        } finally {
            setSaving(false);
        }
    };

    const canSubmit = useMemo(() => canEdit && !saving && !loading, [canEdit, loading, saving]);

    return (
        <div className="business-admin-processing-fee-editor" data-testid="business-admin-processing-fee-editor">
            <div className="business-admin-processing-fee-intro">
                <div>
                    <div className="business-admin-card-title">Payment provider fallback fees and item processing fee</div>
                    <p className="business-admin-card-subtitle">
                        Set an exact fallback estimate by payment method. Provider or reconciled statement data always wins over this estimate.
                    </p>
                </div>
                <div className="business-admin-processing-fee-version">
                    <span>Current version</span>
                    <strong>v{policyVersion}</strong>
                </div>
            </div>

            <div className="business-admin-alert info" role="note">
                <Info size={17} />
                <div>
                    <strong>Fallbacks are estimates, not provider evidence.</strong>
                    <span>Payments using a fallback remain on hold until actual PayMongo or statement/API data reconciles them.</span>
                </div>
            </div>

            <fieldset className="business-admin-processing-fee-customer" disabled={!canEdit || loading}>
                <legend>Item processing fee</legend>
                <p className="business-admin-card-subtitle">
                    This fee covers processing the ordered items. It is calculated from the discounted item subtotal, is independent of the payment method, and is added before delivery fees.
                </p>
                <label className="business-admin-processing-fee-toggle">
                    <input
                        type="checkbox"
                        checked={form.customer_enabled}
                        onChange={(event) => updateFormField('customer_enabled', event.target.checked)}
                    />
                    <span>Enable item processing fee</span>
                </label>
                {form.customer_enabled ? (
                    <div className="business-admin-processing-fee-form-row">
                        <label className="business-admin-field">
                            <span>Fee type</span>
                            <select
                                value={form.customer_mode}
                                onChange={(event) => updateFormField('customer_mode', event.target.value)}
                                aria-label="Item processing fee type"
                            >
                                <option value="fixed">Fixed amount</option>
                                <option value="percentage">Percentage of discounted items</option>
                            </select>
                        </label>
                        {form.customer_mode === 'percentage' ? (
                            <label className="business-admin-field">
                                <span>Percentage (%)</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={form.customer_rate}
                                    onChange={(event) => updateFormField('customer_rate', event.target.value)}
                                    aria-label="Item processing fee percentage"
                                />
                            </label>
                        ) : (
                            <label className="business-admin-field">
                                <span>Fixed amount (PHP)</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.customer_fixed}
                                    onChange={(event) => updateFormField('customer_fixed', event.target.value)}
                                    aria-label="Item processing fee fixed amount"
                                />
                            </label>
                        )}
                        <label className="business-admin-field">
                            <span>Customer-facing item fee label</span>
                            <input
                                type="text"
                                value={form.customer_label}
                                onChange={(event) => updateFormField('customer_label', event.target.value)}
                                maxLength={80}
                                aria-label="Customer-facing item fee label"
                            />
                        </label>
                    </div>
                ) : null}
            </fieldset>

            {!canEdit ? (
                <div className="business-admin-alert warning" role="status">
                    <Lock size={17} />
                    <div><strong>View-only policy access.</strong><span>Only the tenant Owner or an explicitly authorized fee-policy editor can change fallback values.</span></div>
                </div>
            ) : null}

            {error ? <div className="business-admin-alert error" role="alert"><Info size={17} /><span>{error}</span></div> : null}
            {notice ? <div className="business-admin-alert success" role="status"><ShieldCheck size={17} /><span>{notice}</span></div> : null}

            <form onSubmit={handleSubmit} className="business-admin-processing-fee-form">
                <div className="business-admin-processing-fee-method-grid">
                    {PAYMENT_METHODS.map(({ key, label }) => (
                        <fieldset className="business-admin-processing-fee-method" key={key} disabled={!canEdit || loading}>
                            <legend>{label}</legend>
                            <label>
                                <span>Rate (%)</span>
                                <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    step="0.01"
                                    value={form[key].rate}
                                    onChange={(event) => updateMethod(key, 'rate', event.target.value)}
                                    aria-label={`${label} fallback rate`}
                                />
                            </label>
                            <label>
                                <span>Fixed amount (PHP)</span>
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form[key].fixed}
                                    onChange={(event) => updateMethod(key, 'fixed', event.target.value)}
                                    aria-label={`${label} fallback fixed amount`}
                                />
                            </label>
                        </fieldset>
                    ))}
                </div>

                <div className="business-admin-processing-fee-form-row">
                    <label className="business-admin-field">
                        <span>Effective date and time</span>
                        <input
                            type="datetime-local"
                            value={form.effective_at}
                            onChange={(event) => updateFormField('effective_at', event.target.value)}
                            disabled={!canEdit || loading}
                            required
                        />
                    </label>
                    <label className="business-admin-field">
                        <span>Reason for change</span>
                        <input
                            type="text"
                            value={form.reason}
                            onChange={(event) => updateFormField('reason', event.target.value)}
                            disabled={!canEdit || loading}
                            minLength={3}
                            maxLength={500}
                            placeholder="e.g. Updated provider contract estimate"
                            required
                        />
                    </label>
                </div>

                <div className="business-admin-processing-fee-save-bar">
                    <span>Platform settlement rate, payout destination, and payer allocation are not editable here.</span>
                    <button type="submit" className="business-admin-button primary" disabled={!canSubmit}>
                        {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
                        {saving ? 'Saving…' : 'Save fee policy'}
                    </button>
                </div>
            </form>

            <section className="business-admin-processing-fee-history" aria-label="Item processing fee policy history">
                <div className="business-admin-card-header">
                    <div>
                        <div className="business-admin-card-title">Version history</div>
                        <div className="business-admin-card-subtitle">Historical policies remain immutable and are selected by effective date.</div>
                    </div>
                    <button type="button" className="business-admin-button" onClick={() => void loadPolicies()} disabled={loading || saving}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>
                {loading ? <div className="business-admin-processing-fee-empty">Loading fee policy…</div> : null}
                {!loading && !policies.length ? <div className="business-admin-processing-fee-empty">No tenant policy version exists yet. Saving creates version 1 with the platform fields kept on hold.</div> : null}
                {!loading && policies.length ? (
                    <div className="business-admin-table-wrap">
                        <table className="business-admin-table">
                            <thead><tr><th>Version</th><th>Effective</th><th>Item processing fee</th><th>Fallback configuration</th><th>Reason</th><th>Created by</th></tr></thead>
                            <tbody>{policies.map((policy) => (
                                <tr key={policy.policy_id || policy.version}>
                                    <td><strong>v{policy.version}</strong>{policy.version === policyVersion ? <span className="business-admin-status available ml-2">Current</span> : null}</td>
                                    <td>{dateTime(policy.effective_at)}</td>
                                    <td>{customerSummary(policy)}</td>
                                    <td>{fallbackSummary(policy)}</td>
                                    <td>{policy.reason || '—'}</td>
                                    <td>{policy.created_by || '—'}</td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                ) : null}
            </section>
        </div>
    );
}
