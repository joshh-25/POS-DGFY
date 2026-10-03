import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
} from '../src/services/dgfyAuthService.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Building2, Eye, EyeOff, LogOut, UserRound } from 'lucide-react';
import DgfyAuthHero from '../src/features/dgfy/components/DgfyAuthHero.jsx';
import IndustrySelect from '../src/features/registration/IndustrySelect.jsx';
import {
    getCompanyRegistrationMenuImageValidationError,
    uploadCompanyRegistrationMenuImage
} from '../src/features/registration/companyRegistrationUploads.js';
import { buildDgfyAuthPath, DGFY_REGISTER_COMPANY_ENTRY } from '../src/features/dgfyRouteHelpers.js';

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

const COMPANY_REGISTRATION_DRAFT_KEY = 'dgfy.company-registration.draft.v1';
const readCompanyRegistrationDraft = () => {
    if (typeof window === 'undefined') return {};
    try { return JSON.parse(window.sessionStorage.getItem(COMPANY_REGISTRATION_DRAFT_KEY) || '{}'); } catch { return {}; }
};
const initialCompanyRegistrationForm = () => ({
    companyName: '', industryKey: '', industryTag: '', businessType: '',
    description: '', storefrontPhone: '', storefrontEmail: '', website: '', facebook: '', instagram: '', deliveryPartnersText: '',
    locationName: '', addressLine: '', barangay: '', city: '', province: '', postalCode: '', latitude: '', longitude: '', hoursText: '',
    acceptedCompanyTerms: false, acceptedMarketplaceTerms: false,
    ...readCompanyRegistrationDraft()
});

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
    const [companyForm, setCompanyForm] = useState(initialCompanyRegistrationForm);
    const [companyStep, setCompanyStep] = useState(1);
    const [companyMenuImage, setCompanyMenuImage] = useState(null);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const handoffExchangeStartedRef = useRef(false);
    const dgfySessionGenerationRef = useRef(0);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const { acceptedCompanyTerms, acceptedMarketplaceTerms, ...draft } = companyForm;
        window.sessionStorage.setItem(COMPANY_REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
    }, [companyForm]);

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

        const activeDgfyToken = dgfyToken || getStoredDgfyToken();
        if (!dgfyAccount) {
            setError('Sign in with your DGFY account before registering a business.');
            return;
        }
        if (!companyForm.industryKey) {
            setError('Choose what kind of business this is before registering.');
            return;
        }
        if (!companyForm.acceptedCompanyTerms || !companyForm.acceptedMarketplaceTerms) {
            setError('Accept both the DGFY company terms and marketplace provider terms before registering a company.');
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
                industryKey: companyForm.industryKey,
                industryTag: companyForm.industryTag,
                business_type: companyForm.businessType || companyForm.industryTag || companyForm.industryKey,
                storefront_profile: {
                    description: companyForm.description,
                    phone: companyForm.storefrontPhone,
                    email: companyForm.storefrontEmail,
                    website: companyForm.website,
                    facebook: companyForm.facebook,
                    instagram: companyForm.instagram
                },
                delivery_partners: companyForm.deliveryPartnersText.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 3),
                location: {
                    name: companyForm.locationName,
                    address_line: companyForm.addressLine,
                    barangay: companyForm.barangay,
                    city: companyForm.city,
                    province: companyForm.province,
                    postal_code: companyForm.postalCode,
                    latitude: companyForm.latitude || null,
                    longitude: companyForm.longitude || null
                },
                hours: companyForm.hoursText ? companyForm.hoursText.split('\n').map((line) => {
                    const match = line.match(/^(.+?)\s+(\S+)\s*-\s*(\S+)$/);
                    return match
                        ? { day: match[1].trim(), open: match[2], close: match[3], closed: false }
                        : null;
                }).filter(Boolean) : [],
                accepted_company_terms: true,
                accepted_marketplace_terms: true,
                company_terms_version: companyLegalSnapshot.company_terms_version,
                marketplace_terms_version: companyLegalSnapshot.marketplace_terms_version
            }, {
                withCredentials: true,
                skipTenantAuthHeaders: true,
                headers: dgfyAuthHeader()
            });

            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Registration failed');
            }

            const registrationSuccess = { message: response.data.message, data: response.data.data || {} };
            const applicationId = registrationSuccess.data?.application_id;
            let menuUploadWarning = '';
            if (applicationId && companyMenuImage) {
                try {
                    await uploadCompanyRegistrationMenuImage(applicationId, companyMenuImage);
                } catch {
                    menuUploadWarning = 'Company registration was submitted, but the optional menu image could not be uploaded. You can retry it from the registration status page.';
                }
            }
            setCompanyForm(initialCompanyRegistrationForm());
            setCompanyMenuImage(null);
            if (typeof window !== 'undefined') window.sessionStorage.removeItem(COMPANY_REGISTRATION_DRAFT_KEY);
            if (applicationId) {
                navigate(`/register-company/status/${applicationId}`, menuUploadWarning ? { state: { uploadWarning: menuUploadWarning } } : undefined);
                return;
            }
            setError('Registration submitted without an application reference. Please contact support.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const updateCompanyForm = (patch) => setCompanyForm((current) => ({ ...current, ...patch }));
    const handleMenuImageChange = (event) => {
        const file = event.target.files?.[0] || null;
        event.target.value = '';
        if (!file) return;
        const validationError = getCompanyRegistrationMenuImageValidationError(file);
        if (validationError) {
            setCompanyMenuImage(null);
            setError(validationError);
            return;
        }
        setCompanyMenuImage(file);
        setError('');
    };
    const advanceCompanyStep = () => {
        setError('');
        if (companyStep === 1 && (!companyForm.companyName.trim() || !companyForm.industryKey)) {
            setError('Enter a company name and choose a business industry before continuing.');
            return;
        }
        setCompanyStep((step) => Math.min(3, step + 1));
    };
    const retreatCompanyStep = () => { setError(''); setCompanyStep((step) => Math.max(1, step - 1)); };

    const handleSignOutDgfy = async () => {
        dgfySessionGenerationRef.current += 1;
        await logoutDgfyAccount(dgfyToken).catch(() => clearDgfySession());
        setDgfyToken('');
        setDgfyAccount(null);
    };

    const renderContent = () => {
        if (!dgfyAccount) {
            return (
                <div className="mx-auto w-full max-w-md text-center">
                    <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#fef3c7] text-[#d97706]">
                        <AlertTriangle className="h-8 w-8" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">
                        Register Your Business
                    </h1>
                    <p className="mt-3 text-sm text-[#64748b]">
                        To register a business, you must first have an active DGFY customer account.
                    </p>
                    <div className="mt-8 flex flex-col gap-3">
                        <button
                            type="button"
                            onClick={() => navigate(buildDgfyAuthPath({
                                intent: 'register-business',
                                mode: 'sign-in',
                                returnTo: DGFY_REGISTER_COMPANY_ENTRY
                            }))}
                            className="w-full rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
                            style={{ background: '#1A4E8D', height: 48 }}
                        >
                            Register Company Using My DGFY Account
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(buildDgfyAuthPath({
                                intent: 'register-business',
                                mode: 'create-account',
                                returnTo: DGFY_REGISTER_COMPANY_ENTRY
                            }))}
                            className="w-full rounded-xl text-sm font-bold transition-opacity hover:bg-slate-50"
                            style={{ color: '#1A4E8D', border: '1.5px solid #1A4E8D', height: 48 }}
                        >
                            Create DGFY Account
                        </button>
                    </div>
                </div>
            );
        }

        return (
            <div className="mx-auto w-full max-w-[500px]">
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

                    <form onSubmit={handleSubmitCompany} className="space-y-5" aria-label="Company registration">
                        <nav aria-label="Company registration steps" className="grid grid-cols-3 gap-2">
                            {['Business Information', 'Storefront Content Setup', 'Location, Business Hours and Menu'].map((label, index) => {
                                const step = index + 1;
                                return <button key={label} type="button" aria-current={companyStep === step ? 'step' : undefined} onClick={() => step < companyStep && setCompanyStep(step)} disabled={isLoading || step > companyStep} className={`rounded-xl border px-2 py-2 text-left text-xs font-semibold ${companyStep === step ? 'border-[#1f5f9f] bg-[#e8f4ff] text-[#1f5f9f]' : 'border-slate-200 text-slate-500'}`}><span className="block text-[10px] uppercase tracking-wide">Step {step}</span>{label}</button>;
                            })}
                        </nav>

                        {companyStep === 1 ? (
                            <section aria-labelledby="business-information-title" className="space-y-4">
                                <div><h2 id="business-information-title" className="text-lg font-semibold text-[#132033]">Business Information</h2><p className="mt-1 text-sm text-slate-600">Tell us the business identity and operating industry.</p></div>
                                <IndustrySelect idPrefix="register-company-industry" value={companyForm.industryKey} disabled={isLoading} onSelect={(entry) => updateCompanyForm({ industryKey: entry.key })} />
                                <div><Label htmlFor="companyName">Company Name</Label><Input id="companyName" placeholder="Enter your company name" value={companyForm.companyName} onChange={(e) => updateCompanyForm({ companyName: e.target.value })} required minLength={3} maxLength={100} disabled={isLoading} className="mt-1" /></div>
                                <div><Label htmlFor="businessType">Business type</Label><Input id="businessType" placeholder="e.g. cafe, salon, retail shop" value={companyForm.businessType} onChange={(e) => updateCompanyForm({ businessType: e.target.value })} maxLength={120} disabled={isLoading} className="mt-1" /></div>
                                <div><Label htmlFor="industryTag">Industry detail (optional)</Label><Input id="industryTag" placeholder="How you describe your business" value={companyForm.industryTag} onChange={(e) => updateCompanyForm({ industryTag: e.target.value })} maxLength={120} disabled={isLoading} className="mt-1" /></div>
                            </section>
                        ) : null}

                        {companyStep === 2 ? (
                            <section aria-labelledby="storefront-content-title" className="space-y-4">
                                <div><h2 id="storefront-content-title" className="text-lg font-semibold text-[#132033]">Storefront Content Setup</h2><p className="mt-1 text-sm text-slate-600">These fields are optional and can be refined later in Settings.</p></div>
                                <div><Label htmlFor="storefrontDescription">Storefront description</Label><textarea id="storefrontDescription" value={companyForm.description} onChange={(e) => updateCompanyForm({ description: e.target.value })} maxLength={2000} disabled={isLoading} className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                                <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="storefrontPhone">Public phone</Label><Input id="storefrontPhone" value={companyForm.storefrontPhone} onChange={(e) => updateCompanyForm({ storefrontPhone: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="storefrontEmail">Public email</Label><Input id="storefrontEmail" type="email" value={companyForm.storefrontEmail} onChange={(e) => updateCompanyForm({ storefrontEmail: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="website">Website</Label><Input id="website" value={companyForm.website} onChange={(e) => updateCompanyForm({ website: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="deliveryPartners">Delivery partners (up to 3)</Label><Input id="deliveryPartners" placeholder="Grab, foodpanda" value={companyForm.deliveryPartnersText} onChange={(e) => updateCompanyForm({ deliveryPartnersText: e.target.value })} disabled={isLoading} /></div></div>
                                <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="facebook">Facebook (optional)</Label><Input id="facebook" value={companyForm.facebook} onChange={(e) => updateCompanyForm({ facebook: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="instagram">Instagram (optional)</Label><Input id="instagram" value={companyForm.instagram} onChange={(e) => updateCompanyForm({ instagram: e.target.value })} disabled={isLoading} /></div></div>
                            </section>
                        ) : null}

                        {companyStep === 3 ? (
                            <section aria-labelledby="location-hours-menu-title" className="space-y-4">
                                <div><h2 id="location-hours-menu-title" className="text-lg font-semibold text-[#132033]">Location, Business Hours and Menu</h2><p className="mt-1 text-sm text-slate-600">Add the primary storefront location and hours. The menu image is optional and remains private until reviewed.</p></div>
                                <div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="locationName">Location name</Label><Input id="locationName" value={companyForm.locationName} onChange={(e) => updateCompanyForm({ locationName: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="addressLine">Address</Label><Input id="addressLine" value={companyForm.addressLine} onChange={(e) => updateCompanyForm({ addressLine: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="barangay">Barangay (optional)</Label><Input id="barangay" value={companyForm.barangay} onChange={(e) => updateCompanyForm({ barangay: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="city">City</Label><Input id="city" value={companyForm.city} onChange={(e) => updateCompanyForm({ city: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="province">Province</Label><Input id="province" value={companyForm.province} onChange={(e) => updateCompanyForm({ province: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="postalCode">Postal code</Label><Input id="postalCode" value={companyForm.postalCode} onChange={(e) => updateCompanyForm({ postalCode: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="latitude">Latitude</Label><Input id="latitude" inputMode="decimal" value={companyForm.latitude} onChange={(e) => updateCompanyForm({ latitude: e.target.value })} disabled={isLoading} /></div><div><Label htmlFor="longitude">Longitude</Label><Input id="longitude" inputMode="decimal" value={companyForm.longitude} onChange={(e) => updateCompanyForm({ longitude: e.target.value })} disabled={isLoading} /></div></div>
                                <div><Label htmlFor="hoursText">Business hours</Label><textarea id="hoursText" placeholder={'One per line, for example:\nMonday 09:00-18:00'} value={companyForm.hoursText} onChange={(e) => updateCompanyForm({ hoursText: e.target.value })} disabled={isLoading} className="mt-1 min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
                                <div className="rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4"><p className="text-sm font-semibold text-[#132033]">DGFY account connected</p><p className="mt-2 text-xs text-slate-600">Registration uses {dgfyAccount.email}.</p></div>
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <Label htmlFor="menuImage">Menu image (optional)</Label>
                                    <p className="mt-1 text-xs text-slate-500">Upload a JPG, JPEG, or PNG menu image. You can also upload it later from the registration status page.</p>
                                    <input id="menuImage" type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handleMenuImageChange} disabled={isLoading} className="mt-3 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-[#e8f4ff] file:px-3 file:py-2 file:font-semibold file:text-[#1f5f9f] hover:file:bg-[#d9edff]" />
                                    {companyMenuImage ? <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600"><span className="truncate">Selected: {companyMenuImage.name}</span><button type="button" onClick={() => setCompanyMenuImage(null)} disabled={isLoading} className="shrink-0 font-semibold text-[#1f5f9f] hover:underline">Remove</button></div> : null}
                                </div>
                                <LegalAcknowledgementBox id="acceptedCompanyTerms" checked={companyForm.acceptedCompanyTerms} onChange={(e) => updateCompanyForm({ acceptedCompanyTerms: e.target.checked })} disabled={isLoading || companyLegalTermsUnavailable} disabledReason={companyLegalTermsUnavailable ? companyLegalDisabledReason : ''} label="I agree to the current DGFY Company Registration Terms." documents={companyLegalDocuments} snapshotText={companyLegalSnapshot.acknowledgement_text} versionLabel={companyLegalSnapshot.company_terms_version ? `Company terms version ${companyLegalSnapshot.company_terms_version}` : ''} />
                                <LegalAcknowledgementBox id="acceptedMarketplaceTerms" checked={companyForm.acceptedMarketplaceTerms} onChange={(e) => updateCompanyForm({ acceptedMarketplaceTerms: e.target.checked })} disabled={isLoading || companyLegalTermsUnavailable} disabledReason={companyLegalTermsUnavailable ? companyLegalDisabledReason : ''} label="I agree to the current DGFY Marketplace Provider Terms." documents={companyLegalDocuments} snapshotText={companyLegalSnapshot.acknowledgement_text} versionLabel={companyLegalSnapshot.marketplace_terms_version ? `Marketplace terms version ${companyLegalSnapshot.marketplace_terms_version}` : ''} />
                            </section>
                        ) : null}

                        <div className="flex gap-3"><Button type="button" variant="outline" onClick={retreatCompanyStep} disabled={isLoading || companyStep === 1}>Back</Button>{companyStep < 3 ? <Button type="button" onClick={advanceCompanyStep} disabled={isLoading} className="flex-1 bg-[#1f5f9f] hover:bg-[#174f86]">Continue</Button> : <Button type="submit" disabled={isLoading || !companyForm.acceptedCompanyTerms || !companyForm.acceptedMarketplaceTerms || companyLegalTermsUnavailable} className="flex-1 bg-[#1f5f9f] hover:bg-[#174f86]">{isLoading ? 'Creating Company...' : 'Submit Details and Create Company'}</Button>}</div>
                    </form>
                </div>

            </div>
        );
    };

    return (
        <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
            {/* ── LEFT: Hero panel — hidden on mobile ─────────────── */}
            <div className="hidden lg:flex lg:w-[45%]">
                <DgfyAuthHero />
            </div>

            {/* ── RIGHT: Form panel ──────────────────── */}
            <div className="flex flex-1 flex-col justify-center overflow-y-auto bg-white" style={{ minHeight: '100vh' }}>
                <div className="mx-auto w-full max-w-[640px] px-6 py-8 sm:px-8 sm:py-12">
                    {/* Mobile logo */}
                    <div className="mb-8 flex items-center justify-center lg:hidden">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl font-black text-lg text-white" style={{ background: '#1A4E8D' }}>D</div>
                        <span className="ml-3 text-2xl font-black tracking-tight" style={{ color: '#1A4E8D' }}>DGFY</span>
                    </div>

                    {renderContent()}
                </div>
            </div>
        </div>
    );
}
