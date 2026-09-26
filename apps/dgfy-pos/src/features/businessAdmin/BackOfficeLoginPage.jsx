import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
    ArrowLeft,
    Building2,
    CheckCircle2,
    Eye,
    EyeOff,
    Loader2,
    LockKeyhole,
    Mail,
    ShieldCheck
} from 'lucide-react';
import dgfyLogo from '../../../../../packages/web-core/src/assets/dgfy/dgfy-logo.png';
import {
    listDgfyAccountCompanies,
    loginDgfyAccount,
    startDgfyTenantSession
} from '../../../../../packages/web-core/src/services/dgfyAuthService.js';
import {
    clearBackOfficeSession,
    grantBackOfficeSession,
    normalizeBackOfficeReturnPath
} from './businessAdminAuth.js';

const getRequestErrorMessage = (error, fallback) => (
    error?.response?.data?.message
    || error?.response?.data?.error
    || error?.message
    || fallback
);

const isSwitchableCompany = (company) => Boolean(company?.can_switch);

export default function BackOfficeLoginPage() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const returnTo = useMemo(
        () => normalizeBackOfficeReturnPath(searchParams.get('return_to') || '/backoffice/overview'),
        [searchParams]
    );
    const [form, setForm] = useState({ email: '', password: '' });
    const [companies, setCompanies] = useState([]);
    const [selectedTenantId, setSelectedTenantId] = useState('');
    const [step, setStep] = useState('credentials');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        clearBackOfficeSession();
    }, []);

    const handleAccountSubmit = async (event) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await loginDgfyAccount({
                email: form.email.trim(),
                password: form.password
            });
            const response = await listDgfyAccountCompanies();
            const availableCompanies = (response?.companies || []).filter(isSwitchableCompany);
            if (!availableCompanies.length) {
                setError('This DGFY account has no active business membership with Back Office access.');
                return;
            }
            setCompanies(availableCompanies);
            setSelectedTenantId(String(availableCompanies[0]?.tenant_id || ''));
            setStep('company');
        } catch (requestError) {
            setError(getRequestErrorMessage(requestError, 'Sign-in failed. Check your email and password, then try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompanySubmit = async (event) => {
        event.preventDefault();
        if (!selectedTenantId) {
            setError('Select a business before continuing.');
            return;
        }
        setError('');
        setIsLoading(true);
        try {
            await startDgfyTenantSession({ tenantId: selectedTenantId });
            grantBackOfficeSession();
            navigate(returnTo, { replace: true });
        } catch (requestError) {
            setError(getRequestErrorMessage(requestError, 'We could not open this business session. Try again.'));
        } finally {
            setIsLoading(false);
        }
    };

    const goBackToCredentials = () => {
        setError('');
        setStep('credentials');
    };

    return (
        <main className="flex min-h-screen items-center justify-center bg-[#f4f7fb] px-4 py-8 sm:px-6">
            <section
                className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_60px_rgba(15,23,42,0.10)] sm:p-8"
                data-testid="backoffice-login-page"
            >
                <div className="flex items-center justify-between gap-4">
                    <img src={dgfyLogo} alt="DGFY" className="h-9 w-auto object-contain" />
                    <div className="flex items-center gap-2 rounded-full bg-[#eef6ff] px-3 py-1.5 text-xs font-bold text-[#1a4e8d]">
                        <ShieldCheck size={15} aria-hidden="true" />
                        Back Office
                    </div>
                </div>

                <div className="mt-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-[#eaf3ff] text-[#1a4e8d]">
                    {step === 'credentials' ? <LockKeyhole size={24} aria-hidden="true" /> : <Building2 size={24} aria-hidden="true" />}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[#1a4e8d]">Merchant workspace</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                    {step === 'credentials' ? 'Back Office sign in' : 'Choose a business'}
                </h1>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                    {step === 'credentials'
                        ? 'Sign in with your DGFY account to manage your business.'
                        : 'Select the business you want to open in Back Office.'}
                </p>

                {error ? (
                    <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700" role="alert">
                        {error}
                    </div>
                ) : null}

                {step === 'credentials' ? (
                    <form className="mt-7 space-y-5" onSubmit={handleAccountSubmit}>
                        <div>
                            <label htmlFor="backoffice-email" className="mb-2 block text-sm font-bold text-slate-900">DGFY account email</label>
                            <div className="relative">
                                <Mail className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
                                <input
                                    id="backoffice-email"
                                    name="email"
                                    type="email"
                                    autoComplete="email"
                                    required
                                    value={form.email}
                                    onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                                    placeholder="name@company.com"
                                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-950 outline-none transition focus:border-[#1a4e8d] focus:ring-4 focus:ring-[#1a4e8d]/10"
                                />
                            </div>
                        </div>

                        <div>
                            <label htmlFor="backoffice-password" className="mb-2 block text-sm font-bold text-slate-900">Password</label>
                            <div className="relative">
                                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden="true" />
                                <input
                                    id="backoffice-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    required
                                    value={form.password}
                                    onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                                    placeholder="Enter your password"
                                    className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-11 text-sm text-slate-950 outline-none transition focus:border-[#1a4e8d] focus:ring-4 focus:ring-[#1a4e8d]/10"
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                    onClick={() => setShowPassword((current) => !current)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                                >
                                    {showPassword ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a4e8d] px-4 text-sm font-bold text-white transition hover:bg-[#143f73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <LockKeyhole size={18} aria-hidden="true" />}
                            {isLoading ? 'Signing in…' : 'Continue to Back Office'}
                        </button>
                    </form>
                ) : (
                    <form className="mt-7 space-y-5" onSubmit={handleCompanySubmit}>
                        <div>
                            <label htmlFor="backoffice-company" className="mb-2 block text-sm font-bold text-slate-900">Business</label>
                            <select
                                id="backoffice-company"
                                aria-label="Business"
                                value={selectedTenantId}
                                onChange={(event) => setSelectedTenantId(event.target.value)}
                                className="h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-[#1a4e8d] focus:ring-4 focus:ring-[#1a4e8d]/10"
                            >
                                {companies.map((company) => (
                                    <option key={company.tenant_id} value={company.tenant_id}>
                                        {company.company_name || company.name || 'Business'}{company.is_owner ? ' · Owner' : ''}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-5 text-emerald-800">
                            <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                            <span>Your DGFY account is signed in. Back Office will still verify your business permissions.</span>
                        </div>
                        <button
                            type="submit"
                            disabled={isLoading || !selectedTenantId}
                            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a4e8d] px-4 text-sm font-bold text-white transition hover:bg-[#143f73] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {isLoading ? <Loader2 className="animate-spin" size={18} aria-hidden="true" /> : <Building2 size={18} aria-hidden="true" />}
                            {isLoading ? 'Opening business…' : 'Open Back Office'}
                        </button>
                        <button type="button" onClick={goBackToCredentials} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-slate-600 hover:text-[#1a4e8d]">
                            <ArrowLeft size={16} aria-hidden="true" /> Use a different DGFY account
                        </button>
                    </form>
                )}

                <div className="mt-7 border-t border-slate-200 pt-5 text-center">
                    <Link to="/terminal" className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a4e8d] hover:underline">
                        <ArrowLeft size={16} aria-hidden="true" /> Return to POS terminal
                    </Link>
                </div>
            </section>
        </main>
    );
}
