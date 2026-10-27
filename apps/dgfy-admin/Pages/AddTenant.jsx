import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useOutletContext } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { normalizeApiError } from '../../../packages/web-core/src/utils/errorHandler.js';
import IndustryPicker from '../../../packages/web-core/src/features/registration/IndustryPicker.jsx';
import * as adminService from '@/services/adminService';
import { toast } from 'sonner';

const INITIAL_FORM = Object.freeze({
    name: '',
    industryKey: '',
    workflowMode: 'food_manufacturing',
    templateKey: '',
    adminEmail: '',
    adminPhone: '',
    adminPassword: '',
    first_name: '',
    middle_name: '',
    last_name: '',
    email: '',
    phone: '',
    temporary_password: '',
    reason: ''
});

const canProvisionAccountAndCompany = (adminProfile) => adminProfile?.is_master === true
    || (adminProfile?.permissions?.includes('admin.tenants')
        && adminProfile?.permissions?.includes('admin.dgfy_accounts'));

export default function AddTenant() {
    const location = useLocation();
    const { adminProfile } = useOutletContext() || {};
    const [mode, setMode] = useState('company');
    const [form, setForm] = useState({ ...INITIAL_FORM });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [createdTenant, setCreatedTenant] = useState(null);
    const [hasTemporaryPassword, setHasTemporaryPassword] = useState(false);
    const temporaryPasswordRef = useRef('');
    const submissionInFlightRef = useRef(false);
    const canCreateCombined = canProvisionAccountAndCompany(adminProfile);
    const directoryTarget = { pathname: '/admin/tenants', search: location.search };

    useEffect(() => () => {
        temporaryPasswordRef.current = '';
    }, []);

    const setField = (key, value) => {
        setForm((current) => ({ ...current, [key]: value }));
    };

    const clearTemporaryPassword = () => {
        temporaryPasswordRef.current = '';
        setHasTemporaryPassword(false);
    };

    const resetForm = () => setForm({ ...INITIAL_FORM });

    const submitProvisioning = async (event) => {
        event.preventDefault();
        if (loading || submissionInFlightRef.current || (mode === 'account_company' && !canCreateCombined)) return;

        submissionInFlightRef.current = true;
        clearTemporaryPassword();
        setCreatedTenant(null);
        setError('');
        setLoading(true);
        try {
            const response = mode === 'account_company'
                ? await adminService.createAdminProvisionedAccountAndTenant({
                    reason: form.reason,
                    dgfy_account: {
                        first_name: form.first_name,
                        middle_name: form.middle_name,
                        last_name: form.last_name,
                        email: form.email,
                        phone: form.phone,
                        temporary_password: form.temporary_password
                    },
                    company: {
                        name: form.name,
                        workflowMode: form.workflowMode,
                        templateKey: form.templateKey || null
                    }
                })
                : await adminService.createAdminProvisionedTenant({
                    name: form.name,
                    workflowMode: form.workflowMode,
                    templateKey: form.templateKey || null,
                    adminEmail: form.adminEmail,
                    adminPhone: form.adminPhone,
                    adminPassword: form.adminPassword,
                    reason: form.reason
                });

            const data = response?.data || {};
            const tenant = data.tenant || null;
            const temporaryPassword = data.temporary_password || '';
            temporaryPasswordRef.current = temporaryPassword;
            setHasTemporaryPassword(Boolean(temporaryPassword));
            setCreatedTenant(tenant?.id ? { id: tenant.id, name: tenant.name || form.name } : null);
            resetForm();
            toast.success('Assisted provisioning completed');
        } catch (requestError) {
            const normalized = normalizeApiError(requestError);
            const message = `Assisted provisioning failed: ${normalized.message}`;
            setError(message);
            toast.error(message);
        } finally {
            submissionInFlightRef.current = false;
            setLoading(false);
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <header className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <Link to={directoryTarget} className="text-sm font-medium text-slate-600 hover:text-slate-900">
                    ← Back to tenants
                </Link>
                <div className="mt-4 flex items-start gap-3">
                    <Building2 className="mt-1 h-7 w-7 shrink-0 text-slate-700" aria-hidden="true" />
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Add tenant</h1>
                        <p className="mt-1 text-sm text-slate-600">Provision a company for platform-led setup. The request is audited with the reason you provide.</p>
                    </div>
                </div>
            </header>

            {createdTenant ? (
                <section role="status" className="rounded-xl border border-green-200 bg-green-50 p-5 text-green-950">
                    <h2 className="font-semibold">Tenant created</h2>
                    <p className="mt-1 text-sm">{createdTenant.name} is ready for the next setup steps.</p>
                    <Link
                        to={{ pathname: `/admin/tenants/${encodeURIComponent(createdTenant.id)}`, search: location.search }}
                        className="mt-3 inline-flex font-medium underline"
                    >
                        Open tenant overview
                    </Link>
                </section>
            ) : null}

            {error ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {error}
                </div>
            ) : null}

            <form onSubmit={submitProvisioning} className="space-y-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <section aria-labelledby="provisioning-mode-heading">
                    <h2 id="provisioning-mode-heading" className="text-sm font-semibold text-slate-900">Provisioning mode</h2>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button
                            type="button"
                            aria-pressed={mode === 'company'}
                            onClick={() => setMode('company')}
                            className={`rounded-md px-3 py-2 text-sm ${mode === 'company' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'}`}
                        >
                            Company only
                        </button>
                        <button
                            type="button"
                            aria-pressed={mode === 'account_company'}
                            disabled={!canCreateCombined}
                            onClick={() => canCreateCombined && setMode('account_company')}
                            className={`rounded-md px-3 py-2 text-sm ${mode === 'account_company' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'} disabled:cursor-not-allowed disabled:opacity-50`}
                        >
                            DGFY + Company
                        </button>
                    </div>
                    {!canCreateCombined ? (
                        <p className="mt-2 text-xs text-slate-600">DGFY + Company requires both tenant and DGFY account access.</p>
                    ) : null}
                    {mode === 'company' ? (
                        <p className="mt-3 text-xs text-amber-800">
                            Company only creates an operational tenant without a DGFY owner. DGFY login, company switching, owner actions, and POS access require owner assignment and an accepted membership.
                        </p>
                    ) : null}
                </section>

                <div className="rounded-lg border border-slate-200 p-3">
                    <IndustryPicker
                        idPrefix="assisted-provisioning-industry"
                        value={form.industryKey}
                        onSelect={(entry) => setForm((current) => ({
                            ...current,
                            industryKey: entry.key,
                            workflowMode: entry.workflow_mode,
                            templateKey: entry.template_key || ''
                        }))}
                    />
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Company name" value={form.name} onChange={(event) => setField('name', event.target.value)} />
                    <input required minLength={3} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Audit reason" value={form.reason} onChange={(event) => setField('reason', event.target.value)} />
                    {mode === 'company' ? (
                        <>
                            <input required type="email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Admin email" value={form.adminEmail} onChange={(event) => setField('adminEmail', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Admin phone" value={form.adminPhone} onChange={(event) => setField('adminPhone', event.target.value)} />
                            <input required minLength={8} className="rounded-lg border border-slate-300 px-3 py-2 text-sm md:col-span-2" placeholder="Temporary password" value={form.adminPassword} onChange={(event) => setField('adminPassword', event.target.value)} />
                        </>
                    ) : (
                        <>
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY first name" value={form.first_name} onChange={(event) => setField('first_name', event.target.value)} />
                            <input className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY middle name" value={form.middle_name} onChange={(event) => setField('middle_name', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY last name" value={form.last_name} onChange={(event) => setField('last_name', event.target.value)} />
                            <input required type="email" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY email" value={form.email} onChange={(event) => setField('email', event.target.value)} />
                            <input required className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="DGFY phone" value={form.phone} onChange={(event) => setField('phone', event.target.value)} />
                            <input minLength={8} className="rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Temporary password (optional)" value={form.temporary_password} onChange={(event) => setField('temporary_password', event.target.value)} />
                        </>
                    )}
                </div>

                {hasTemporaryPassword ? (
                    <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        Temporary password: <span className="font-mono font-semibold">{temporaryPasswordRef.current}</span>
                        <p className="mt-1 text-xs">Copy it now. It will be cleared when you submit another request or leave this page.</p>
                    </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                    <Button type="submit" disabled={loading || (mode === 'account_company' && !canCreateCombined)}>
                        <Building2 className="mr-2 h-4 w-4" aria-hidden="true" />
                        {loading ? 'Provisioning...' : 'Provision'}
                    </Button>
                    <Link
                        to={directoryTarget}
                        aria-disabled={loading}
                        onClick={(event) => { if (loading) event.preventDefault(); }}
                        className="inline-flex h-10 items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
                    >
                        Cancel
                    </Link>
                </div>
            </form>

            <p className="text-xs text-slate-500">Tenant compliance history, ownership changes, and capability controls are unavailable on this page in this wave.</p>
        </div>
    );
}
