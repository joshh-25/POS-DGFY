import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  clearDgfySession,
  fetchDgfyLegalTerms,
  fetchDgfyMe,
  getStoredDgfyToken,
  loginDgfyAccount,
  registerDgfyAccount,
  requestDgfyEmailVerification,
  verifyDgfyEmail,
} from '../src/services/dgfyAuthService.js';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import DgfyAuthHero from '../src/features/dgfy/components/DgfyAuthHero.jsx';
import DgfyLegalAcknowledgementBox from '../src/features/dgfy/components/DgfyLegalAcknowledgementBox.jsx';
import DgfyPasswordInput from '../src/features/dgfy/components/DgfyPasswordInput.jsx';
import dgfyLogo from '../src/assets/dgfy/dgfy-logo.png';
import {
  buildDgfyAuthPath,
  buildDgfyResetPath,
  normalizeDgfyMode,
  readDgfyRouteParams,
  resolveDgfyPostAuthTarget,
  resolveStorefrontHomeUrl,
  hasAbsoluteNavigationTarget
} from '../src/features/dgfyRouteHelpers.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BUSINESS_REGISTRATION_ENTRY = '/register-company?source=dgfy&auth=login#business-registration';
const storefrontHomeUrl = resolveStorefrontHomeUrl();

const getFlowSnapshot = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.snapshot || {};
const getFlowDocuments = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.documents || [];
const hasAccountLegalVersions = (snapshot = {}) => Boolean(
  snapshot.terms_version
  && snapshot.privacy_version
  && snapshot.marketplace_terms_version
);

const extractRequestErrorDetails = (requestError) => ({
  code: String(
    requestError?.response?.data?.error_code
    || requestError?.response?.data?.code
    || requestError?.code
    || ''
  ).trim(),
  message: String(
    requestError?.response?.data?.message
    || requestError?.message
    || ''
  ).trim()
});

const resolveVerificationGuidance = ({ code = '', fallbackMessage = '' } = {}) => {
  switch (String(code || '').trim().toUpperCase()) {
    case 'EMAIL_OTP_DELIVERY_UNAVAILABLE':
      return 'Your account was created, but this environment cannot send the verification code until email delivery is configured. Retry once delivery is available.';
    case 'EMAIL_OTP_DELIVERY_FAILED':
      return 'Your account was created, but the verification code could not be delivered. Use resend code to request a fresh 6-digit code.';
    case 'EMAIL_OTP_REQUIRED':
      return 'Enter the current 6-digit verification code before email verification can continue.';
    case 'EMAIL_OTP_EXPIRED':
      return 'This verification code expired. Request a new code, then enter the latest 6-digit code from your email.';
    case 'EMAIL_OTP_ATTEMPTS_EXCEEDED':
      return 'Too many incorrect attempts were used on this code. Request a new code, then try again with the latest email.';
    case 'EMAIL_OTP_INVALID':
      return 'That verification code is invalid. Use the latest 6-digit code from your email, or request a new one if needed.';
    default:
      return fallbackMessage || 'Use the latest 6-digit code from your email. If the code is missing or no longer works, request a new one.';
  }
};

const navigateToTarget = (navigate, target) => {
  if (hasAbsoluteNavigationTarget(target)) {
    window.location.assign(target);
    return;
  }
  navigate(target, { replace: true });
};

/* ─── Field group ───────────────────────────────────────────── */
function FieldGroup({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold" style={{ color: '#0F172A' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

/* ─── Primary button ────────────────────────────────────────── */
function PrimaryBtn({ children, disabled, type = 'submit', onClick }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="w-full rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
      style={{ background: '#1A4E8D', height: 48, border: 'none', cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
}

/* ─── OR divider ────────────────────────────────────────────── */
function Divider() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex-1 border-t" style={{ borderColor: '#E2E8F0' }} />
      <span className="text-xs font-medium" style={{ color: '#94A3B8' }}>or</span>
      <span className="flex-1 border-t" style={{ borderColor: '#E2E8F0' }} />
    </div>
  );
}

/* ─── Business Registration Card ────────────────────────────── */
function BusinessRegistrationCard() {
  return (
    <div
      className="mt-2 flex flex-col gap-4 rounded-2xl p-6 sm:flex-row sm:items-center sm:gap-6"
      style={{ border: '1px solid #E2E8F0', background: '#F8FAFC' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold leading-snug" style={{ color: '#0F172A' }}>
          Register your business<br />with your DGFY account
        </p>
        <p className="mt-1.5 text-sm leading-relaxed" style={{ color: '#64748B' }}>
          Use your existing DGFY account to<br />create and manage your business profile.
        </p>
      </div>
      <Link
        to={BUSINESS_REGISTRATION_ENTRY}
        className="flex-shrink-0 rounded-xl px-5 py-2.5 text-sm font-bold transition-colors hover:bg-[#1A4E8D] hover:text-white"
        style={{ border: '1.5px solid #1A4E8D', color: '#1A4E8D', whiteSpace: 'nowrap' }}
      >
        Register Business
      </Link>
    </div>
  );
}

const inputClass = 'h-10 w-full rounded-lg border-[#CBD5E1] bg-white text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#1A4E8D] focus:ring-2 focus:ring-[#1A4E8D]/20';

/* ═══════════════════════════════════════════════════════════ */
export default function DgfyAuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const routeParams = useMemo(() => readDgfyRouteParams(searchParams), [searchParams]);
  const [mode, setMode] = useState(() => normalizeDgfyMode(routeParams.mode));
  const [legalTerms, setLegalTerms] = useState(null);
  const [legalTermsError, setLegalTermsError] = useState('');
  const [authForm, setAuthForm] = useState({
    firstName: '',
    middleName: '',
    lastName: '',
    email: routeParams.email || '',
    phone: '',
    password: '',
    confirmPassword: '',
    acceptedTerms: false
  });
  const [loginForm, setLoginForm] = useState({ email: routeParams.email || '', password: '' });
  const [error, setError] = useState(routeParams.reason === 'handoff-expired'
    ? 'Your DGFY handoff expired. Sign in again to register your business.'
    : '');
  const [notice, setNotice] = useState(() => String(location.state?.notice || '').trim());
  const [isLoading, setIsLoading] = useState(false);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationState, setVerificationState] = useState({
    requestStatus: 'idle',
    guidance: '',
    errorCode: ''
  });

  useEffect(() => { setMode(normalizeDgfyMode(routeParams.mode)); }, [routeParams.mode]);

  useEffect(() => {
    const stateNotice = String(location.state?.notice || '').trim();
    if (!stateNotice) return;
    setNotice(stateNotice);
    navigate(location.pathname + location.search + location.hash, { replace: true, state: null });
  }, [location.hash, location.pathname, location.search, location.state?.notice, navigate]);

  useEffect(() => {
    const authFormSnapshot = location.state?.authFormSnapshot;
    if (!authFormSnapshot || typeof authFormSnapshot !== 'object') return;
    setAuthForm((current) => ({
      ...current,
      ...authFormSnapshot,
      email: String(authFormSnapshot.email || current.email || '').trim()
    }));
    navigate(location.pathname + location.search + location.hash, {
      replace: true,
      state: location.state?.notice ? { notice: location.state.notice } : null
    });
  }, [location.hash, location.pathname, location.search, location.state, navigate]);

  useEffect(() => {
    let cancelled = false;
    fetchDgfyLegalTerms()
      .then((data) => { if (!cancelled) { setLegalTerms(data || null); setLegalTermsError(''); } })
      .catch(() => { if (!cancelled) { setLegalTerms(null); setLegalTermsError('DGFY terms are temporarily unavailable. Registration is disabled until the current terms load.'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDgfyMe(getStoredDgfyToken())
      .then(() => {
        if (cancelled) return;
        navigateToTarget(navigate, resolveDgfyPostAuthTarget({ intent: routeParams.intent, returnTo: routeParams.returnTo }));
      })
      .catch(() => { if (!cancelled) { clearDgfySession(); setSessionResolved(true); } });
    return () => { cancelled = true; };
  }, [navigate, routeParams.intent, routeParams.returnTo]);

  const accountLegalSnapshot = getFlowSnapshot(legalTerms, 'account_registration');
  const accountLegalDocuments = getFlowDocuments(legalTerms, 'account_registration');
  const accountLegalLinkState = useMemo(() => ({
    returnTo: buildDgfyAuthPath({
      intent: routeParams.intent,
      mode: 'create-account',
      returnTo: routeParams.returnTo,
      email: authForm.email
    }),
    authFormSnapshot: authForm
  }), [authForm, routeParams.intent, routeParams.returnTo]);
  const accountLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasAccountLegalVersions(accountLegalSnapshot);
  const accountLegalDisabledReason = legalTermsError
    || (!legalTerms ? 'Current DGFY account terms must load before creating an account.' : '')
    || (!hasAccountLegalVersions(accountLegalSnapshot) ? 'Current DGFY account terms are incomplete. Registration is disabled until the current terms are published.' : '');

  const handleAuthSuccess = useCallback(async (session) => {
    const target = resolveDgfyPostAuthTarget({ intent: routeParams.intent, returnTo: routeParams.returnTo });
    setNotice(routeParams.intent === 'register-business' ? 'DGFY account connected. Continuing to business registration...' : 'DGFY account connected. Returning to your account...');
    try { await fetchDgfyMe(session?.token || getStoredDgfyToken()).catch(() => null); }
    finally { navigateToTarget(navigate, target); }
  }, [navigate, routeParams.intent, routeParams.returnTo]);

  const handleRegister = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    if (!authForm.firstName.trim() || !authForm.lastName.trim()) { toast.error('Last name and first name are required.'); return; }
    if (!emailPattern.test(authForm.email.trim())) { toast.error('Enter a valid email address.'); return; }
    if (authForm.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (authForm.password !== authForm.confirmPassword) { toast.error('Passwords do not match.'); return; }
    if (!authForm.acceptedTerms) { toast.error('Accept the DGFY account terms before creating an account.'); return; }
    if (accountLegalTermsUnavailable) { toast.error(accountLegalDisabledReason || 'Current DGFY terms must load before creating an account.'); return; }
    setIsLoading(true);
    try {
      const session = await registerDgfyAccount({
        first_name: authForm.firstName, middle_name: authForm.middleName, last_name: authForm.lastName,
        email: authForm.email, phone: authForm.phone, password: authForm.password, confirm_password: authForm.confirmPassword,
        accepted_terms: true, terms_version: accountLegalSnapshot.terms_version,
        privacy_version: accountLegalSnapshot.privacy_version, marketplace_terms_version: accountLegalSnapshot.marketplace_terms_version
      });
      toast.success('Account created successfully');
      try {
        await requestDgfyEmailVerification(session?.token);
        setVerificationState({
          requestStatus: 'sent',
          guidance: 'We sent a 6-digit verification code to your email. Registration stays paused until you verify the account with the latest code.',
          errorCode: ''
        });
        setResendCooldown(60);
      } catch (requestError) {
        const { code, message } = extractRequestErrorDetails(requestError);
        setVerificationState({
          requestStatus: 'failed',
          guidance: resolveVerificationGuidance({
            code,
            fallbackMessage: 'Your account was created, but the verification code was not sent yet. Use resend code to request a fresh email.'
          }),
          errorCode: code
        });
        setResendCooldown(0);
        toast.error(message || 'Account created, but the verification code could not be sent yet.');
      }
      setVerifyCode('');
      setMode('verify-email');
    } catch (requestError) { toast.error(requestError.response?.data?.message || 'Could not create your DGFY account.'); }
    finally { setIsLoading(false); }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    if (!verifyCode.trim()) { toast.error('Enter the verification code sent to your email.'); return; }
    setIsLoading(true);
    try {
      await verifyDgfyEmail(verifyCode.trim());
      toast.success('Email verified successfully. Please sign in to continue.');
      clearDgfySession();
      setVerificationState({
        requestStatus: 'verified',
        guidance: '',
        errorCode: ''
      });
      setLoginForm((prev) => ({ ...prev, email: authForm.email, password: '' }));
      setMode('sign-in');
    } catch (requestError) {
      const { code, message } = extractRequestErrorDetails(requestError);
      setVerificationState({
        requestStatus: code === 'EMAIL_OTP_EXPIRED' ? 'expired' : 'failed',
        guidance: resolveVerificationGuidance({ code }),
        errorCode: code
      });
      toast.error(message || 'Invalid or expired verification code.');
    }
    finally { setIsLoading(false); }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      await requestDgfyEmailVerification();
      setVerificationState({
        requestStatus: 'sent',
        guidance: 'A fresh 6-digit verification code was sent to your email. Use the latest code only; older codes no longer work.',
        errorCode: ''
      });
      setVerifyCode('');
      toast.success('Verification code resent to your email.');
      setResendCooldown(60);
    } catch (requestError) {
      const { code, message } = extractRequestErrorDetails(requestError);
      setVerificationState({
        requestStatus: 'failed',
        guidance: resolveVerificationGuidance({
          code,
          fallbackMessage: 'The verification code could not be resent yet. Check your email delivery setup, then try again.'
        }),
        errorCode: code
      });
      toast.error(message || 'Could not resend the verification code. Please try again.');
    }
  };

  // Countdown for resend cooldown
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    setIsLoading(true);
    try {
      const session = await loginDgfyAccount(loginForm);
      toast.success('Signed in successfully');
      await handleAuthSuccess(session);
    }
    catch (requestError) { toast.error(requestError.response?.data?.message || 'DGFY sign-in failed.'); }
    finally { setIsLoading(false); }
  };

  const switchMode = (next) => {
    setMode(next);
    setError('');
    setNotice('');
    if (next !== 'verify-email') {
      setVerifyCode('');
      setVerificationState({
        requestStatus: 'idle',
        guidance: '',
        errorCode: ''
      });
    }
  };

  /* ─── Session loading ─────────────────────────────────────── */
  if (!sessionResolved) {
    return (
      <div className="flex min-h-screen">
        <div className="hidden lg:flex lg:w-[45%]"><DgfyAuthHero /></div>
        <div className="flex flex-1 items-center justify-center bg-white px-8">
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl font-black text-xl text-white" style={{ background: '#1A4E8D' }}>D</div>
            <h1 className="text-xl font-bold" style={{ color: '#0F172A' }}>Restoring your session…</h1>
            <p className="mt-2 text-sm" style={{ color: '#64748B' }}>Checking whether you already have an active DGFY account session.</p>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Main layout — full page split ──────────────────────── */
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">

      {/* ── LEFT: Hero panel — hidden on mobile ─────────────── */}
      <div className="hidden lg:flex lg:w-[45%]">
        <DgfyAuthHero />
      </div>

      {/* ── RIGHT: Form panel — scrollable ──────────────────── */}
      <div
        className="flex flex-1 flex-col justify-center overflow-y-auto bg-white"
        style={{ minHeight: '100vh' }}
      >
        <div className="mx-auto w-full max-w-[640px] px-6 py-8 sm:px-8 sm:py-12">

          {/* Mobile: compact logo */}
          <div className="mb-8 flex items-center justify-center lg:hidden">
            <a href={storefrontHomeUrl} aria-label="Back to DGFY storefront">
              <img src={dgfyLogo} alt="DGFY Logo" className="h-10 w-auto object-contain" />
            </a>
          </div>

          {/* Error / Notice */}
          {error && (
            <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
              {error}
            </div>
          )}
          {notice && (
            <div className="mb-5 rounded-xl px-4 py-3 text-sm" style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8' }}>
              {notice}
            </div>
          )}

          {/* ── VERIFY EMAIL VIEW ───────────────────────────── */}
          {mode === 'verify-email' && (
            <div className="flex flex-col items-center text-center gap-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: '#EFF6FF' }}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="#1A4E8D" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Check your email</h1>
                <p className="mt-3 text-sm leading-relaxed" style={{ color: '#64748B' }}>
                  We sent a 6-digit verification code to <strong style={{ color: '#0F172A' }}>{authForm.email}</strong>.<br />Enter it below to activate your account.
                </p>
              </div>
              <div
                className="w-full rounded-2xl px-4 py-3 text-left text-sm"
                style={{
                  background: verificationState.requestStatus === 'sent'
                    ? '#EFF6FF'
                    : verificationState.requestStatus === 'verified'
                      ? '#F0FDF4'
                      : '#FFF7ED',
                  border: verificationState.requestStatus === 'sent'
                    ? '1px solid #BFDBFE'
                    : verificationState.requestStatus === 'verified'
                      ? '1px solid #BBF7D0'
                      : '1px solid #FED7AA',
                  color: verificationState.requestStatus === 'sent'
                    ? '#1D4ED8'
                    : verificationState.requestStatus === 'verified'
                      ? '#15803D'
                      : '#C2410C'
                }}
              >
                <p className="font-semibold">
                  {verificationState.requestStatus === 'sent'
                    ? 'Verification code ready'
                    : verificationState.requestStatus === 'expired'
                      ? 'Verification code expired'
                      : verificationState.requestStatus === 'failed'
                        ? 'Verification requires attention'
                        : 'Verification in progress'}
                </p>
                <p className="mt-1 leading-relaxed">
                  {verificationState.guidance || 'Use the latest 6-digit code from your email to finish registration.'}
                </p>
              </div>

              <form onSubmit={handleVerifyEmail} className="flex w-full flex-col gap-4">
                <FieldGroup id="dgfyVerifyCode" label="Verification Code">
                  <Input
                    id="dgfyVerifyCode"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="Enter 6-digit code"
                    value={verifyCode}
                    onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    maxLength={6}
                    required
                    disabled={isLoading}
                    className={`${inputClass} text-center text-2xl tracking-[0.5em] font-bold`}
                  />
                </FieldGroup>

                <div className="mt-2">
                  <PrimaryBtn disabled={isLoading || verifyCode.trim().length !== 6}>{isLoading ? 'Verifying…' : 'Verify Email'}</PrimaryBtn>
                </div>
              </form>

              <p className="text-sm" style={{ color: '#64748B' }}>
                Didn't receive a code?{' '}
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resendCooldown > 0}
                  className="font-bold hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ color: '#1A4E8D', background: 'none', border: 'none', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', padding: 0 }}
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
                </button>
              </p>
            </div>
          )}

          {/* ── LOGIN VIEW ──────────────────────────────────── */}
          {mode === 'sign-in' && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Welcome Back</h1>
              </div>

              <form onSubmit={handleLogin} className="flex flex-col gap-4">
                <FieldGroup id="dgfyLoginEmail" label="Email Address">
                  <Input id="dgfyLoginEmail" type="email" placeholder="name@company.com" value={loginForm.email}
                    onChange={(e) => setLoginForm((c) => ({ ...c, email: e.target.value }))}
                    required disabled={isLoading} className={inputClass} />
                </FieldGroup>

                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="dgfyLoginPassword" className="text-sm font-semibold" style={{ color: '#0F172A' }}>Password</label>
                    <Link
                      to={buildDgfyResetPath({ intent: routeParams.intent, returnTo: routeParams.returnTo, email: loginForm.email })}
                      className="text-xs font-semibold hover:underline"
                      style={{ color: '#1A4E8D' }}
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <DgfyPasswordInput id="dgfyLoginPassword" autoComplete="current-password" placeholder="••••••••"
                    value={loginForm.password} onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))} disabled={isLoading} />
                </div>

                <div className="mt-4">
                  <PrimaryBtn disabled={isLoading}>{isLoading ? 'Signing in…' : 'Login'}</PrimaryBtn>
                </div>
              </form>

              <Divider />

              <p className="text-center text-sm" style={{ color: '#64748B' }}>
                Don't have an account?{' '}
                <button type="button" onClick={() => switchMode('create-account')}
                  className="font-bold hover:underline"
                  style={{ color: '#1A4E8D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Sign up
                </button>
              </p>

              <div className="lg:hidden">
                <BusinessRegistrationCard />
              </div>
            </div>
          )}

          {/* ── SIGN UP VIEW ──────────────────────────────────── */}
          {mode === 'create-account' && (
            <div className="flex flex-col gap-6">
              <div className="text-center">
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#0F172A' }}>Create your DGFY Account</h1>
              </div>

              <form onSubmit={handleRegister} className="flex flex-col gap-4">
                {/* Personal Information */}
                <div className="mb-2 border-b pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: '#64748B' }}>Personal Information</h3>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <FieldGroup id="dgfyLastName" label="Last Name">
                    <Input id="dgfyLastName" placeholder="e.g. Doe" value={authForm.lastName}
                      onChange={(e) => setAuthForm((c) => ({ ...c, lastName: e.target.value }))}
                      required disabled={isLoading} className={inputClass} />
                  </FieldGroup>
                  <FieldGroup id="dgfyFirstName" label="First Name">
                    <Input id="dgfyFirstName" placeholder="e.g. John" value={authForm.firstName}
                      onChange={(e) => setAuthForm((c) => ({ ...c, firstName: e.target.value }))}
                      required disabled={isLoading} className={inputClass} />
                  </FieldGroup>
                  <FieldGroup id="dgfyMiddleName" label="Middle Name (Optional)">
                    <Input id="dgfyMiddleName" placeholder="e.g. Smith" value={authForm.middleName}
                      onChange={(e) => setAuthForm((c) => ({ ...c, middleName: e.target.value }))}
                      disabled={isLoading} className={inputClass} />
                  </FieldGroup>
                </div>

                <div className="grid gap-4 sm:grid-cols-2 mt-2">
                  <FieldGroup id="dgfyEmail" label="Email Address">
                    <Input id="dgfyEmail" type="email" placeholder="name@company.com" value={authForm.email}
                      onChange={(e) => setAuthForm((c) => ({ ...c, email: e.target.value }))}
                      required disabled={isLoading} className={inputClass} />
                  </FieldGroup>
                  <FieldGroup id="dgfyPhone" label="Mobile Number">
                    <Input id="dgfyPhone" type="tel" placeholder="e.g. +1 234 567 8900" value={authForm.phone}
                      onChange={(e) => setAuthForm((c) => ({ ...c, phone: e.target.value }))}
                      required disabled={isLoading} className={inputClass} />
                  </FieldGroup>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <FieldGroup id="dgfyPassword" label="Password">
                    <DgfyPasswordInput id="dgfyPassword" autoComplete="new-password" placeholder="••••••••"
                      value={authForm.password} onChange={(e) => setAuthForm((c) => ({ ...c, password: e.target.value }))} disabled={isLoading} />
                  </FieldGroup>
                  <FieldGroup id="dgfyConfirmPassword" label="Confirm Password">
                    <DgfyPasswordInput id="dgfyConfirmPassword" autoComplete="new-password" placeholder="••••••••"
                      value={authForm.confirmPassword} onChange={(e) => setAuthForm((c) => ({ ...c, confirmPassword: e.target.value }))} disabled={isLoading} />
                  </FieldGroup>
                </div>

                <div className="mt-2">
                  <DgfyLegalAcknowledgementBox
                    id="dgfyAccountTerms"
                    checked={authForm.acceptedTerms}
                    onChange={(e) => setAuthForm((c) => ({ ...c, acceptedTerms: e.target.checked }))}
                    disabled={isLoading || accountLegalTermsUnavailable}
                    disabledReason={accountLegalTermsUnavailable ? accountLegalDisabledReason : ''}
                    label="I have reviewed and agree to the current DGFY Account Terms, Privacy Policy, and Marketplace Provider Terms."
                    documents={accountLegalDocuments}
                    documentLinkState={accountLegalLinkState}
                    snapshotText={accountLegalSnapshot.acknowledgement_text || legalTerms?.provider_clause || ''}
                    versionLabel={[accountLegalSnapshot.terms_version, accountLegalSnapshot.privacy_version, accountLegalSnapshot.marketplace_terms_version].filter(Boolean).join(' · ')}
                  />
                </div>

                <div className="mt-4">
                  <PrimaryBtn disabled={isLoading}>{isLoading ? 'Creating account…' : 'Create Account'}</PrimaryBtn>
                </div>
              </form>

              <Divider />

              <p className="text-center text-sm" style={{ color: '#64748B' }}>
                Already have an account?{' '}
                <button type="button" onClick={() => switchMode('sign-in')}
                  className="font-bold hover:underline"
                  style={{ color: '#1A4E8D', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  Sign in
                </button>
              </p>

              <div className="lg:hidden">
                <BusinessRegistrationCard />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
