import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../src/services/api.js';
import {
    clearDgfySession,
    completeDgfyPasswordReset,
    dgfyAuthHeader,
    exchangeDgfyHandoff,
    fetchDgfyLegalTerms,
    fetchDgfyMe,
    getStoredDgfyAccount,
    getStoredDgfyToken,
    loginDgfyAccount,
    logoutDgfyAccount,
    requestDgfyPasswordReset,
    registerDgfyAccount,
    startDgfyTenantSession
} from '../src/services/dgfyAuthService.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Eye, EyeOff, LogOut, UserRound } from 'lucide-react';
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_SELECT_VALUES } from '../src/features/settings/workflowMode.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getFlowSnapshot = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.snapshot || {};
const getFlowDocuments = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.documents || [];
const hasAccountLegalVersions = (snapshot = {}) => Boolean(
    snapshot.terms_version
    && snapshot.privacy_version
    && snapshot.marketplace_terms_version
);
const hasCompanyLegalVersions = (snapshot = {}) => Boolean(
    snapshot.company_terms_version
    && snapshot.marketplace_terms_version
);

const PasswordInput = ({
    id,
    value,
    onChange,
    placeholder,
    autoComplete,
    disabled,
    required = true
}) => {
    const [visible, setVisible] = useState(false);
    return (
        <div className="relative">
            <Input
                id={id}
                type={visible ? 'text' : 'password'}
                autoComplete={autoComplete}
                placeholder={placeholder}
                value={value}
                onChange={onChange}
                required={required}
                disabled={disabled}
                className="mt-1 pr-11"
            />
            <button
                type="button"
                onClick={() => setVisible((current) => !current)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                aria-label={visible ? 'Hide password' : 'Show password'}
                disabled={disabled}
            >
                {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
        </div>
    );
};

const LegalAcknowledgementBox = ({
    id,
    checked,
    onChange,
    disabled,
    disabledReason,
    label,
    documents,
    snapshotText,
    versionLabel
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const closeButtonRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return undefined;

        closeButtonRef.current?.focus();
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setIsOpen(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isOpen]);

    return (
        <div className="rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4 text-sm text-slate-700">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <label htmlFor={id} className="flex gap-3 leading-6">
                    <input
                        id={id}
                        type="checkbox"
                        checked={checked}
                        onChange={onChange}
                        disabled={disabled}
                        className="mt-1 h-5 w-5 shrink-0 accent-[#1f5f9f]"
                        required
                    />
                    <span>{label}</span>
                </label>
                <button
                    type="button"
                    onClick={() => setIsOpen(true)}
                    className="self-start rounded-lg border border-[#1f5f9f] px-3 py-1.5 text-xs font-semibold text-[#1f5f9f] hover:bg-[#e8f4ff]"
                >
                    View terms
                </button>
            </div>
            {disabledReason ? (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{disabledReason}</p>
            ) : null}
            {versionLabel ? (
                <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{versionLabel}</p>
            ) : null}
            {isOpen ? (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 px-4 py-6"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) {
                            setIsOpen(false);
                        }
                    }}
                >
                    <div role="dialog" aria-modal="true" aria-labelledby={`${id}-terms-title`} className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 id={`${id}-terms-title`} className="text-lg font-semibold text-[#132033]">Current DGFY Terms</h2>
                                {versionLabel ? (
                                    <p className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500">{versionLabel}</p>
                                ) : null}
                            </div>
                            <button ref={closeButtonRef} type="button" onClick={() => setIsOpen(false)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                                Close
                            </button>
                        </div>
                        <div className="mt-4 grid gap-3">
                            {documents.map((document) => (
                                <section key={document.key || document.version} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                                    <h3 className="text-sm font-semibold text-slate-800">
                                        {document.title} <span className="text-xs text-slate-500">({document.version})</span>
                                    </h3>
                                    <p className="mt-2 text-xs leading-5 text-slate-600">{document.summary}</p>
                                    {document.href ? (
                                        <a className="mt-2 inline-block text-xs font-medium text-[#1f5f9f] hover:underline" href={document.href} target="_blank" rel="noreferrer">
                                            Open full terms
                                        </a>
                                    ) : null}
                                </section>
                            ))}
                        </div>
                        {snapshotText ? (
                            <p className="mt-4 rounded-xl bg-[#f7fbfa] px-3 py-2 text-xs leading-5 text-slate-600">{snapshotText}</p>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </div>
    );
};

export default function RegisterCompany() {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const businessSectionRef = useRef(null);
    const initialAuthMode = searchParams.get('auth') === 'login' || searchParams.get('source') === 'dgfy'
        ? 'login'
        : 'register';
    const [dgfyToken, setDgfyToken] = useState(() => getStoredDgfyToken());
    const [dgfyAccount, setDgfyAccount] = useState(() => getStoredDgfyAccount());
    const [legalTerms, setLegalTerms] = useState(null);
    const [legalTermsError, setLegalTermsError] = useState('');
    const [authMode, setAuthMode] = useState(initialAuthMode);
    const [authForm, setAuthForm] = useState({
        firstName: '',
        middleName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: '',
        acceptedTerms: false
    });
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [resetForm, setResetForm] = useState({ email: '', code: '', password: '', confirmPassword: '' });
    const [resetStep, setResetStep] = useState('request');
    const [companyForm, setCompanyForm] = useState({
        companyName: '',
        workflowMode: 'food_manufacturing',
        acceptedCompanyTerms: false
    });
    const [success, setSuccess] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const handoffExchangeStartedRef = useRef(false);
    const dgfySessionGenerationRef = useRef(0);

    const clearHandoffTokenFromUrl = useCallback(() => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('handoff_token');
        if (!nextParams.get('source')) nextParams.set('source', 'dgfy');
        if (!nextParams.get('auth')) nextParams.set('auth', 'login');
        navigate({
            pathname: '/register-company',
            search: `?${nextParams.toString()}`,
            hash: 'business-registration'
        }, { replace: true });
    }, [navigate, searchParams]);

    useEffect(() => {
        let cancelled = false;
        fetchDgfyLegalTerms()
            .then((data) => {
                if (cancelled) return;
                setLegalTerms(data || null);
                setLegalTermsError('');
            })
            .catch(() => {
                if (cancelled) return;
                setLegalTerms(null);
                setLegalTermsError('DGFY terms are temporarily unavailable. Registration is disabled until the current terms load.');
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        let cancelled = false;
        const token = getStoredDgfyToken();
        const sessionGeneration = dgfySessionGenerationRef.current;

        fetchDgfyMe(token)
            .then((data) => {
                if (cancelled) return;
                if (sessionGeneration !== dgfySessionGenerationRef.current) return;
                setDgfyToken(data?.token || token || getStoredDgfyToken());
                setDgfyAccount(data?.account || null);
            })
            .catch(() => {
                if (cancelled) return;
                if (sessionGeneration !== dgfySessionGenerationRef.current) return;
                clearDgfySession();
                setDgfyToken('');
                setDgfyAccount(null);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    useEffect(() => {
        if (!dgfyAccount) return;
        const shouldFocusBusinessRegistration = searchParams.get('source') === 'dgfy'
            || (typeof window !== 'undefined' && window.location.hash === '#business-registration');
        if (!shouldFocusBusinessRegistration) return;

        const focusBusinessRegistration = () => {
            const businessSection = businessSectionRef.current;
            if (typeof businessSection?.scrollIntoView === 'function') {
                businessSection.scrollIntoView({ block: 'start', behavior: 'smooth' });
            }
            if (typeof businessSection?.focus === 'function') {
                businessSection.focus({ preventScroll: true });
            }
        };
        if (typeof window.requestAnimationFrame === 'function') {
            window.requestAnimationFrame(focusBusinessRegistration);
        } else {
            focusBusinessRegistration();
        }
    }, [dgfyAccount, searchParams]);

    const businessIndustryOptions = useMemo(() => WORKFLOW_MODE_SELECT_VALUES.map((mode) => ({
        value: mode,
        label: WORKFLOW_MODE_LABELS[mode] || mode
    })), []);
    const accountLegalSnapshot = getFlowSnapshot(legalTerms, 'account_registration');
    const companyLegalSnapshot = getFlowSnapshot(legalTerms, 'company_registration');
    const accountLegalDocuments = getFlowDocuments(legalTerms, 'account_registration');
    const companyLegalDocuments = getFlowDocuments(legalTerms, 'company_registration');
    const accountLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasAccountLegalVersions(accountLegalSnapshot);
    const companyLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasCompanyLegalVersions(companyLegalSnapshot);
    const accountLegalDisabledReason = legalTermsError
        || (!legalTerms ? 'Current DGFY account terms must load before creating an account.' : '')
        || (!hasAccountLegalVersions(accountLegalSnapshot) ? 'Current DGFY account terms are incomplete. Registration is disabled until the current terms are published.' : '');
    const companyLegalDisabledReason = legalTermsError
        || (!legalTerms ? 'Current DGFY company terms must load before registering a company.' : '')
        || (!hasCompanyLegalVersions(companyLegalSnapshot) ? 'Current DGFY company terms are incomplete. Company registration is disabled until the current terms are published.' : '');

    const setDgfySessionState = (session) => {
        dgfySessionGenerationRef.current += 1;
        setDgfyToken(session?.token || getStoredDgfyToken());
        setDgfyAccount(session?.account || null);
        setError('');
        setNotice('');
        fetchDgfyMe(session?.token || getStoredDgfyToken()).then((data) => {
            if (data?.account) setDgfyAccount(data.account);
        }).catch(() => {});
    };

    useEffect(() => {
        const handoffToken = String(searchParams.get('handoff_token') || '').trim();
        if (!handoffToken || handoffExchangeStartedRef.current) return undefined;

        handoffExchangeStartedRef.current = true;
        setAuthMode('login');
        setIsLoading(true);
        exchangeDgfyHandoff(handoffToken, { softFail: true })
            .then((session) => {
                if (session?.status === 'invalid') {
                    clearDgfySession();
                    setDgfyToken('');
                    setDgfyAccount(null);
                    setError('Your DGFY handoff expired. Sign in again to register your business.');
                    clearHandoffTokenFromUrl();
                    return;
                }
                setDgfySessionState(session);
                setNotice('DGFY account connected. Register your business below.');
                clearHandoffTokenFromUrl();
            })
            .catch(() => {
                clearDgfySession();
                setDgfyToken('');
                setDgfyAccount(null);
                setError('Your DGFY handoff expired. Sign in again to register your business.');
                clearHandoffTokenFromUrl();
            })
            .finally(() => setIsLoading(false));

        return undefined;
    }, [clearHandoffTokenFromUrl, searchParams]);

    const handleRegisterDgfyAccount = async (event) => {
        event.preventDefault();
        setError('');

        if (!authForm.firstName.trim() || !authForm.lastName.trim()) {
            setError('Last name and first name are required.');
            return;
        }
        if (!emailPattern.test(authForm.email.trim())) {
            setError('Enter a valid email address.');
            return;
        }
        if (authForm.password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (authForm.password !== authForm.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        if (!authForm.acceptedTerms) {
            setError('Accept the DGFY account terms before creating an account.');
            return;
        }
        if (accountLegalTermsUnavailable) {
            setError(accountLegalDisabledReason || 'Current DGFY terms must load before creating an account.');
            return;
        }

        setIsLoading(true);
        try {
            const session = await registerDgfyAccount({
                first_name: authForm.firstName,
                middle_name: authForm.middleName,
                last_name: authForm.lastName,
                email: authForm.email,
                phone: authForm.phone,
                password: authForm.password,
                confirm_password: authForm.confirmPassword,
                accepted_terms: true,
                terms_version: accountLegalSnapshot.terms_version,
                privacy_version: accountLegalSnapshot.privacy_version,
                marketplace_terms_version: accountLegalSnapshot.marketplace_terms_version
            });
            setDgfySessionState(session);
        } catch (err) {
            setError(err.response?.data?.message || 'Could not create your DGFY account.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLoginDgfyAccount = async (event) => {
        event.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            const session = await loginDgfyAccount(loginForm);
            setDgfySessionState(session);
        } catch (err) {
            setError(err.response?.data?.message || 'DGFY sign-in failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestPasswordReset = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        setIsLoading(true);
        try {
            await requestDgfyPasswordReset(resetForm.email);
            setResetStep('complete');
            setNotice('If a matching DGFY account exists, a password reset code has been sent.');
        } catch (err) {
            setError(err.response?.data?.message || 'Could not request password reset.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCompletePasswordReset = async (event) => {
        event.preventDefault();
        setError('');
        setNotice('');
        if (resetForm.password.length < 8) {
            setError('Password must be at least 8 characters.');
            return;
        }
        if (resetForm.password !== resetForm.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        setIsLoading(true);
        try {
            await completeDgfyPasswordReset({
                email: resetForm.email,
                code: resetForm.code,
                password: resetForm.password,
                confirm_password: resetForm.confirmPassword
            });
            setAuthMode('login');
            setLoginForm((current) => ({ ...current, email: resetForm.email, password: '' }));
            setResetForm({ email: '', code: '', password: '', confirmPassword: '' });
            setResetStep('request');
            setNotice('Password reset complete. Sign in with your new password.');
        } catch (err) {
            setError(err.response?.data?.message || 'Password reset failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSubmitCompany = async (event) => {
        event.preventDefault();
        setError('');
        setSuccess(null);

        if (!dgfyToken || !dgfyAccount) {
            setError('Sign in with your DGFY account before registering a business.');
            return;
        }
        if (!companyForm.acceptedCompanyTerms) {
            setError('Accept the DGFY company terms before registering a company.');
            return;
        }
        if (companyLegalTermsUnavailable) {
            setError(companyLegalDisabledReason || 'Current DGFY company terms must load before registering a company.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await api.post('/admin/tenants/register', {
                name: companyForm.companyName,
                workflowMode: companyForm.workflowMode,
                accepted_company_terms: true,
                company_terms_version: companyLegalSnapshot.company_terms_version,
                marketplace_terms_version: companyLegalSnapshot.marketplace_terms_version
            }, {
                headers: dgfyAuthHeader()
            });

            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Registration failed');
            }

            setSuccess({
                message: response.data.message,
                data: response.data.data || {}
            });
            setCompanyForm((current) => ({ ...current, acceptedCompanyTerms: false }));
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const goToManualSkupervisorLogin = useCallback(() => {
        navigate('/login', {
            state: {
                registration: {
                    email: dgfyAccount?.email,
                    companyToken: success?.data?.company_token,
                    companyName: success?.data?.name
                }
            }
        });
    }, [dgfyAccount?.email, navigate, success?.data?.company_token, success?.data?.name]);

    const handleProceedToSkupervisor = async () => {
        setError('');
        setNotice('');

        if (!success?.data?.company_token || success?.data?.status !== 'active' || !dgfyToken) {
            goToManualSkupervisorLogin();
            return;
        }

        setIsLoading(true);
        try {
            await startDgfyTenantSession({
                tenantId: success.data.id,
                companyToken: success.data.company_token
            }, dgfyToken);
            navigate('/', { replace: true });
        } catch (sessionError) {
            setNotice(sessionError.response?.data?.message || 'Company created. Sign in to SKUpervisor to continue.');
            goToManualSkupervisorLogin();
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOutDgfy = async () => {
        dgfySessionGenerationRef.current += 1;
        await logoutDgfyAccount(dgfyToken).catch(() => clearDgfySession());
        setDgfyToken('');
        setDgfyAccount(null);
        setSuccess(null);
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#f4faf8] px-4 py-10">
                <div className="mx-auto w-full max-w-xl rounded-[28px] border border-[#d8e8e3] bg-white p-8 shadow-sm">
                    <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-[#0f7f73]" />
                    <h1 className="text-center text-2xl font-bold text-[#132033]">Company Created</h1>
                    <p className="mt-2 text-center text-sm text-slate-600">{success.message}</p>
                    {notice ? (
                        <div className="mt-5 rounded-2xl border border-[#b7ded7] bg-[#eefaf7] p-3 text-sm text-[#0f766e]">
                            {notice}
                        </div>
                    ) : null}
                    <div className="mt-6 rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                        <p className="text-sm font-semibold text-[#132033]">{success.data?.name}</p>
                        <p className="mt-1 text-sm text-slate-600">Business industry: {WORKFLOW_MODE_LABELS[success.data?.workflow_mode] || success.data?.workflow_mode}</p>
                        <p className="mt-1 text-sm text-slate-600">Compliance starts as non-compliant. You can upgrade later in Settings &gt; Compliance.</p>
                    </div>
                    <Button
                        className="mt-6 w-full bg-[#1f5f9f] hover:bg-[#174f86]"
                        onClick={handleProceedToSkupervisor}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Opening SKUpervisor...' : 'Proceed to SKUpervisor'}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f4faf8] px-4 py-10">
            <div className="mx-auto grid w-full max-w-5xl gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                <aside className="rounded-[32px] bg-[#142437] p-8 text-white shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8f4ff] text-[#1f5f9f]">
                        <Building2 className="h-7 w-7" />
                    </div>
                    <h1 className="mt-8 text-4xl font-black leading-tight">
                        Register Your <span className="text-[#2d68a8]">Business</span>
                    </h1>
                    <p className="mt-5 max-w-sm text-base leading-7 text-slate-200">
                        Use one DGFY account for customer orders, profile, tracking, business ownership, and company invitations.
                    </p>
                    <div className="mt-8 border-t border-white/15 pt-5 text-sm text-slate-200">
                        Company registration uses your signed-in DGFY account email and phone. Compliance starts non-compliant and can be changed later in SKUpervisor Settings.
                    </div>
                </aside>

                <main className="rounded-[28px] border border-[#d8e8e3] bg-white p-6 shadow-sm md:p-8">
                    {error && (
                        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}
                    {notice && (
                        <div className="mb-5 rounded-2xl border border-[#b7ded7] bg-[#eefaf7] p-3 text-sm text-[#0f766e]">
                            {notice}
                        </div>
                    )}

                    {!dgfyAccount ? (
                        <section>
                            <div className="mb-6 flex rounded-2xl bg-slate-100 p-1">
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('register')}
                                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${authMode === 'register' ? 'bg-white text-[#132033] shadow-sm' : 'text-slate-600'}`}
                                >
                                    Create DGFY account
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('login')}
                                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${authMode === 'login' ? 'bg-white text-[#132033] shadow-sm' : 'text-slate-600'}`}
                                >
                                    Sign in
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setAuthMode('reset')}
                                    className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold ${authMode === 'reset' ? 'bg-white text-[#132033] shadow-sm' : 'text-slate-600'}`}
                                >
                                    Reset
                                </button>
                            </div>

                            {authMode === 'register' ? (
                                <form onSubmit={handleRegisterDgfyAccount} className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="lastName">Last Name</Label>
                                            <Input id="lastName" value={authForm.lastName} onChange={(e) => setAuthForm({ ...authForm, lastName: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                        <div>
                                            <Label htmlFor="firstName">First Name</Label>
                                            <Input id="firstName" value={authForm.firstName} onChange={(e) => setAuthForm({ ...authForm, firstName: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                    </div>
                                    <div>
                                        <Label htmlFor="middleName">Optional Middle Name</Label>
                                        <Input id="middleName" value={authForm.middleName} onChange={(e) => setAuthForm({ ...authForm, middleName: e.target.value })} disabled={isLoading} className="mt-1" />
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="dgfyEmail">Email</Label>
                                            <Input id="dgfyEmail" type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                        <div>
                                            <Label htmlFor="dgfyPhone">Contact Number</Label>
                                            <Input id="dgfyPhone" type="tel" value={authForm.phone} onChange={(e) => setAuthForm({ ...authForm, phone: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="dgfyPassword">Password</Label>
                                            <PasswordInput id="dgfyPassword" autoComplete="new-password" placeholder="At least 8 characters" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} disabled={isLoading} />
                                        </div>
                                        <div>
                                            <Label htmlFor="dgfyConfirmPassword">Confirm Password</Label>
                                            <PasswordInput id="dgfyConfirmPassword" autoComplete="new-password" placeholder="Re-enter password" value={authForm.confirmPassword} onChange={(e) => setAuthForm({ ...authForm, confirmPassword: e.target.value })} disabled={isLoading} />
                                        </div>
                                    </div>
                                    <LegalAcknowledgementBox
                                        id="acceptedTerms"
                                        checked={authForm.acceptedTerms}
                                        onChange={(e) => setAuthForm({ ...authForm, acceptedTerms: e.target.checked })}
                                        disabled={isLoading || accountLegalTermsUnavailable}
                                        disabledReason={accountLegalTermsUnavailable ? accountLegalDisabledReason : ''}
                                        label="I have reviewed and agree to the current DGFY Account Terms, Privacy Policy, and Marketplace Provider Terms."
                                        documents={accountLegalDocuments}
                                        snapshotText={accountLegalSnapshot.acknowledgement_text}
                                        versionLabel={accountLegalSnapshot.marketplace_terms_version ? `Marketplace terms version ${accountLegalSnapshot.marketplace_terms_version}` : ''}
                                    />
                                    <Button type="submit" disabled={isLoading || !authForm.acceptedTerms || accountLegalTermsUnavailable} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                        {isLoading ? 'Creating account...' : 'Create DGFY Account'}
                                    </Button>
                                </form>
                            ) : authMode === 'login' ? (
                                <form onSubmit={handleLoginDgfyAccount} className="space-y-4">
                                    <div>
                                        <Label htmlFor="dgfyLoginEmail">Email</Label>
                                        <Input id="dgfyLoginEmail" type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} required disabled={isLoading} className="mt-1" />
                                    </div>
                                    <div>
                                        <Label htmlFor="dgfyLoginPassword">Password</Label>
                                        <PasswordInput id="dgfyLoginPassword" autoComplete="current-password" placeholder="Enter your password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} disabled={isLoading} />
                                    </div>
                                    <Button type="submit" disabled={isLoading} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                        {isLoading ? 'Signing in...' : 'Sign in with DGFY'}
                                    </Button>
                                </form>
                            ) : (
                                <form onSubmit={resetStep === 'request' ? handleRequestPasswordReset : handleCompletePasswordReset} className="space-y-4">
                                    <div>
                                        <Label htmlFor="dgfyResetEmail">Email</Label>
                                        <Input id="dgfyResetEmail" type="email" value={resetForm.email} onChange={(e) => setResetForm({ ...resetForm, email: e.target.value })} required disabled={isLoading || resetStep === 'complete'} className="mt-1" />
                                    </div>
                                    {resetStep === 'complete' && (
                                        <>
                                            <div>
                                                <Label htmlFor="dgfyResetCode">Reset Code</Label>
                                                <Input id="dgfyResetCode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={resetForm.code} onChange={(e) => setResetForm({ ...resetForm, code: e.target.value.replace(/\D/g, '').slice(0, 6) })} required disabled={isLoading} className="mt-1" />
                                            </div>
                                            <div className="grid gap-4 md:grid-cols-2">
                                                <div>
                                                    <Label htmlFor="dgfyResetPassword">New Password</Label>
                                                    <PasswordInput id="dgfyResetPassword" autoComplete="new-password" placeholder="At least 8 characters" value={resetForm.password} onChange={(e) => setResetForm({ ...resetForm, password: e.target.value })} disabled={isLoading} />
                                                </div>
                                                <div>
                                                    <Label htmlFor="dgfyResetConfirmPassword">Confirm New Password</Label>
                                                    <PasswordInput id="dgfyResetConfirmPassword" autoComplete="new-password" placeholder="Re-enter password" value={resetForm.confirmPassword} onChange={(e) => setResetForm({ ...resetForm, confirmPassword: e.target.value })} disabled={isLoading} />
                                                </div>
                                            </div>
                                        </>
                                    )}
                                    <Button type="submit" disabled={isLoading} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                        {isLoading ? 'Working...' : resetStep === 'request' ? 'Send Reset Code' : 'Reset Password'}
                                    </Button>
                                </form>
                            )}
                        </section>
                    ) : (
                        <div id="business-registration" ref={businessSectionRef} tabIndex={-1} className="space-y-5 scroll-mt-6 outline-none focus-visible:ring-2 focus-visible:ring-[#1f5f9f]">
                            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f4ff] text-[#1f5f9f]">
                                        <UserRound className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-[#132033]">{[dgfyAccount.first_name, dgfyAccount.middle_name, dgfyAccount.last_name].filter(Boolean).join(' ')}</p>
                                        <p className="text-xs text-slate-600">{dgfyAccount.email} &middot; {dgfyAccount.phone}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={handleSignOutDgfy} className="text-slate-500 hover:text-slate-800" aria-label="Sign out of DGFY">
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </div>

                            <form onSubmit={handleSubmitCompany} className="space-y-5">
                                <div>
                                    <Label htmlFor="companyName">Company Name</Label>
                                    <Input id="companyName" value={companyForm.companyName} onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })} required minLength={3} maxLength={100} disabled={isLoading} className="mt-1" />
                                </div>

                                <div>
                                    <Label htmlFor="workflowMode">Business Industry</Label>
                                    <select
                                        id="workflowMode"
                                        value={companyForm.workflowMode}
                                        onChange={(e) => setCompanyForm({ ...companyForm, workflowMode: e.target.value })}
                                        disabled={isLoading}
                                        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
                                    >
                                        {businessIndustryOptions.map((mode) => (
                                            <option key={mode.value} value={mode.value}>{mode.label}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                                    <p className="text-sm font-semibold text-[#132033]">DGFY account connected</p>
                                    <p className="mt-2 text-xs text-slate-600">
                                        Company registration will use your DGFY account email, {dgfyAccount.email}, and phone. No additional DGFY email code is required for this registration.
                                    </p>
                                </div>
                                <LegalAcknowledgementBox
                                    id="acceptedCompanyTerms"
                                    checked={companyForm.acceptedCompanyTerms}
                                    onChange={(e) => setCompanyForm({ ...companyForm, acceptedCompanyTerms: e.target.checked })}
                                    disabled={isLoading || companyLegalTermsUnavailable}
                                    disabledReason={companyLegalTermsUnavailable ? companyLegalDisabledReason : ''}
                                    label="I have reviewed and agree to the current DGFY Company Registration Terms and Marketplace Provider Terms."
                                    documents={companyLegalDocuments}
                                    snapshotText={companyLegalSnapshot.acknowledgement_text}
                                    versionLabel={companyLegalSnapshot.marketplace_terms_version ? `Marketplace terms version ${companyLegalSnapshot.marketplace_terms_version}` : ''}
                                />

                                <Button type="submit" disabled={isLoading || !companyForm.acceptedCompanyTerms || companyLegalTermsUnavailable} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                    {isLoading ? 'Creating Company...' : 'Create Company'}
                                </Button>
                            </form>
                        </div>
                    )}

                    <div className="mt-6 text-center text-sm text-slate-600">
                        Already have a company?{' '}
                        <Link to="/login" className="font-medium text-[#1f5f9f] hover:text-[#174f86]">
                            Sign in to SKUpervisor
                        </Link>
                    </div>
                </main>
            </div>
        </div>
    );
}
