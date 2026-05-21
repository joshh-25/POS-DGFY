import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../src/services/api.js';
import {
    acceptDgfyInvitation,
    clearDgfySession,
    dgfyAuthHeader,
    fetchDgfyMe,
    getStoredDgfyAccount,
    getStoredDgfyToken,
    loginDgfyAccount,
    registerDgfyAccount
} from '../src/services/dgfyAuthService.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Building2, CheckCircle2, Eye, EyeOff, LogOut, UserRound } from 'lucide-react';
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_SELECT_VALUES } from '../src/features/settings/workflowMode.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

export default function RegisterCompany() {
    const navigate = useNavigate();
    const [dgfyToken, setDgfyToken] = useState(() => getStoredDgfyToken());
    const [dgfyAccount, setDgfyAccount] = useState(() => getStoredDgfyAccount());
    const [dgfyMemberships, setDgfyMemberships] = useState([]);
    const [authMode, setAuthMode] = useState('register');
    const [authForm, setAuthForm] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        password: '',
        confirmPassword: ''
    });
    const [loginForm, setLoginForm] = useState({ email: '', password: '' });
    const [companyForm, setCompanyForm] = useState({
        companyName: '',
        workflowMode: 'food_manufacturing',
        emailOtpCode: ''
    });
    const [otpSentTo, setOtpSentTo] = useState('');
    const [success, setSuccess] = useState(null);
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSendingOtp, setIsSendingOtp] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const token = getStoredDgfyToken();
        if (!token) return undefined;

        fetchDgfyMe(token)
            .then((data) => {
                if (cancelled) return;
                setDgfyToken(token);
                setDgfyAccount(data?.account || null);
                setDgfyMemberships(Array.isArray(data?.memberships) ? data.memberships : []);
            })
            .catch(() => {
                if (cancelled) return;
                clearDgfySession();
                setDgfyToken('');
                setDgfyAccount(null);
                setDgfyMemberships([]);
            });

        return () => {
            cancelled = true;
        };
    }, []);

    const businessIndustryOptions = useMemo(() => WORKFLOW_MODE_SELECT_VALUES.map((mode) => ({
        value: mode,
        label: WORKFLOW_MODE_LABELS[mode] || mode
    })), []);

    const setDgfySessionState = (session) => {
        setDgfyToken(session?.token || getStoredDgfyToken());
        setDgfyAccount(session?.account || null);
        setDgfyMemberships([]);
        setError('');
        fetchDgfyMe(session?.token || getStoredDgfyToken()).then((data) => {
            setDgfyMemberships(Array.isArray(data?.memberships) ? data.memberships : []);
        }).catch(() => {});
    };

    const pendingInvitations = dgfyMemberships.filter((membership) => (
        membership?.source === 'invite' && membership?.status === 'pending'
    ));

    const handleRegisterDgfyAccount = async (event) => {
        event.preventDefault();
        setError('');

        if (!authForm.firstName.trim() || !authForm.lastName.trim()) {
            setError('First name and last name are required.');
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

        setIsLoading(true);
        try {
            const session = await registerDgfyAccount({
                first_name: authForm.firstName,
                last_name: authForm.lastName,
                email: authForm.email,
                phone: authForm.phone,
                password: authForm.password,
                confirm_password: authForm.confirmPassword
            });
            setDgfySessionState(session);
            setCompanyForm((current) => ({ ...current, emailOtpCode: '' }));
            setOtpSentTo('');
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
            setCompanyForm((current) => ({ ...current, emailOtpCode: '' }));
            setOtpSentTo('');
        } catch (err) {
            setError(err.response?.data?.message || 'DGFY sign-in failed.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRequestEmailOtp = async () => {
        setError('');
        const email = String(dgfyAccount?.email || '').trim();
        if (!emailPattern.test(email)) {
            setError('Your DGFY account must have a valid email before requesting a code.');
            return;
        }

        setIsSendingOtp(true);
        try {
            await api.post('/auth/email-otp/request', {
                purpose: 'company_registration',
                email
            });
            setOtpSentTo(email);
            setCompanyForm((current) => ({ ...current, emailOtpCode: '' }));
        } catch (err) {
            setError(err.response?.data?.message || 'Could not send verification code. Please try again.');
        } finally {
            setIsSendingOtp(false);
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
        if (!/^\d{6}$/.test(String(companyForm.emailOtpCode || '').trim())) {
            setError('Enter the 6-digit verification code sent to your DGFY email.');
            return;
        }

        setIsLoading(true);
        try {
            const response = await api.post('/admin/tenants/register', {
                name: companyForm.companyName,
                workflowMode: companyForm.workflowMode,
                email_otp_code: String(companyForm.emailOtpCode || '').trim()
            }, {
                headers: dgfyAuthHeader()
            });

            if (!response.data?.success) {
                throw new Error(response.data?.message || 'Registration failed');
            }

            setSuccess({
                message: response.data.message,
                data: response.data.data
            });
            setCompanyForm((current) => ({ ...current, emailOtpCode: '' }));
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Registration failed. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleSignOutDgfy = () => {
        clearDgfySession();
        setDgfyToken('');
        setDgfyAccount(null);
        setDgfyMemberships([]);
        setSuccess(null);
        setOtpSentTo('');
    };

    const handleAcceptDgfyInvitation = async (membershipId) => {
        setError('');
        setIsLoading(true);
        try {
            await acceptDgfyInvitation(membershipId, dgfyToken);
            const data = await fetchDgfyMe(dgfyToken);
            setDgfyMemberships(Array.isArray(data?.memberships) ? data.memberships : []);
        } catch (err) {
            setError(err.response?.data?.message || 'Could not accept this company invitation.');
        } finally {
            setIsLoading(false);
        }
    };

    if (success) {
        return (
            <div className="min-h-screen bg-[#f4faf8] px-4 py-10">
                <div className="mx-auto w-full max-w-xl rounded-[28px] border border-[#d8e8e3] bg-white p-8 shadow-sm">
                    <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-[#0f7f73]" />
                    <h1 className="text-center text-2xl font-bold text-[#132033]">Company Created</h1>
                    <p className="mt-2 text-center text-sm text-slate-600">{success.message}</p>
                    <div className="mt-6 rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                        <p className="text-sm font-semibold text-[#132033]">{success.data?.name}</p>
                        <p className="mt-1 text-sm text-slate-600">Business industry: {WORKFLOW_MODE_LABELS[success.data?.workflow_mode] || success.data?.workflow_mode}</p>
                        <p className="mt-1 text-sm text-slate-600">Compliance starts as non-compliant. You can upgrade later in Settings &gt; Compliance.</p>
                    </div>
                    <Button
                        className="mt-6 w-full bg-[#1f5f9f] hover:bg-[#174f86]"
                        onClick={() => navigate('/login', {
                            state: {
                                registration: {
                                    email: dgfyAccount?.email,
                                    companyToken: success.data?.company_token,
                                    companyName: success.data?.name
                                }
                            }
                        })}
                    >
                        Continue to SKUpervisor Login
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
                        Company registration uses your verified DGFY email and phone. Compliance starts non-compliant and can be changed later in SKUpervisor Settings.
                    </div>
                </aside>

                <main className="rounded-[28px] border border-[#d8e8e3] bg-white p-6 shadow-sm md:p-8">
                    {error && (
                        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                            {error}
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
                            </div>

                            {authMode === 'register' ? (
                                <form onSubmit={handleRegisterDgfyAccount} className="space-y-4">
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="firstName">First Name</Label>
                                            <Input id="firstName" value={authForm.firstName} onChange={(e) => setAuthForm({ ...authForm, firstName: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                        <div>
                                            <Label htmlFor="lastName">Last Name</Label>
                                            <Input id="lastName" value={authForm.lastName} onChange={(e) => setAuthForm({ ...authForm, lastName: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                    </div>
                                    <div className="grid gap-4 md:grid-cols-2">
                                        <div>
                                            <Label htmlFor="dgfyEmail">Email</Label>
                                            <Input id="dgfyEmail" type="email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required disabled={isLoading} className="mt-1" />
                                        </div>
                                        <div>
                                            <Label htmlFor="dgfyPhone">Phone Number</Label>
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
                                    <Button type="submit" disabled={isLoading} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                        {isLoading ? 'Creating account...' : 'Create DGFY Account'}
                                    </Button>
                                </form>
                            ) : (
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
                            )}
                        </section>
                    ) : (
                        <form onSubmit={handleSubmitCompany} className="space-y-5">
                            <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#e8f4ff] text-[#1f5f9f]">
                                        <UserRound className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-[#132033]">{dgfyAccount.first_name} {dgfyAccount.last_name}</p>
                                        <p className="text-xs text-slate-600">{dgfyAccount.email} · {dgfyAccount.phone}</p>
                                    </div>
                                </div>
                                <button type="button" onClick={handleSignOutDgfy} className="text-slate-500 hover:text-slate-800" aria-label="Sign out of DGFY">
                                    <LogOut className="h-4 w-4" />
                                </button>
                            </div>

                            {pendingInvitations.length > 0 && (
                                <div className="rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
                                    <p className="text-sm font-semibold text-[#132033]">Company Invitations</p>
                                    <div className="mt-3 space-y-3">
                                        {pendingInvitations.map((membership) => (
                                            <div key={membership.id} className="flex flex-col gap-3 rounded-xl border border-[#d8e8e3] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                                                <div>
                                                    <p className="text-sm font-semibold text-[#132033]">{membership.company?.name || 'Company'}</p>
                                                    <p className="text-xs text-slate-600">Role: {membership.role || 'staff'}</p>
                                                </div>
                                                <Button type="button" variant="outline" disabled={isLoading} onClick={() => handleAcceptDgfyInvitation(membership.id)}>
                                                    Accept Invitation
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

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
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                                    <div className="flex-1">
                                        <Label htmlFor="emailOtpCode">Email Verification Code</Label>
                                        <Input
                                            id="emailOtpCode"
                                            inputMode="numeric"
                                            pattern="[0-9]{6}"
                                            maxLength={6}
                                            placeholder="123456"
                                            value={companyForm.emailOtpCode}
                                            onChange={(e) => setCompanyForm({ ...companyForm, emailOtpCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                                            required
                                            disabled={isLoading}
                                            className="mt-1"
                                        />
                                    </div>
                                    <Button type="button" variant="outline" onClick={handleRequestEmailOtp} disabled={isLoading || isSendingOtp}>
                                        {isSendingOtp ? 'Sending...' : otpSentTo ? 'Resend Code' : 'Send Code'}
                                    </Button>
                                </div>
                                <p className="mt-2 text-xs text-slate-500">
                                    {otpSentTo ? `Code sent to ${otpSentTo}.` : 'Send a fresh code to your DGFY email before creating the company.'}
                                </p>
                            </div>

                            <Button type="submit" disabled={isLoading} className="w-full bg-[#1f5f9f] hover:bg-[#174f86]">
                                {isLoading ? 'Creating Company...' : 'Create Company'}
                            </Button>
                        </form>
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
