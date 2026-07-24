import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

// Cross-app imports, same pattern already used by
// shared/hooks/useStorefrontSession.js: the DGFY auth service and route
// helpers are shared logic living in frontend/src, not app-specific.
import {
  clearDgfySession,
  fetchDgfyLegalTerms,
  fetchDgfyMe,
  getStoredDgfyToken,
  hasDgfyExplicitSignOut,
  loginDgfyAccount,
  markDgfySessionActive,
  preflightDgfyAccountRegistration,
  registerDgfyAccount,
  requestDgfyEmailVerification,
  requestDgfySignupOtp,
  verifyDgfyEmail
} from '../../../../../src/services/dgfyAuthService.js';
import {
  readDgfyRouteParams,
  resolveDgfyPostAuthTarget
} from '../../../../../src/features/dgfyRouteHelpers.js';

import { writeDgfyAuthToken } from '../storefrontSessionStorage.js';
import { sanitizeStorefrontReturnPath, toInternalReturnPath } from '../storefrontAuthReturnPath.js';
import { buildBusinessRegistrationUrl, buildDgfyResetPasswordUrl } from '../../shared/utils/businessRegistrationUrl.js';
import StorefrontPasswordInput from '../components/StorefrontPasswordInput.jsx';
import StorefrontLegalAcknowledgement from '../components/StorefrontLegalAcknowledgement.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PH_DIAL_CODE = '+63';

const normalizePhPhoneDigits = (value = '') => {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, 10);
};

const formatPhPhoneDisplay = (digits = '') => {
  const normalized = normalizePhPhoneDigits(digits);
  return [normalized.slice(0, 3), normalized.slice(3, 6), normalized.slice(6, 10)].filter(Boolean).join(' ');
};

const isValidPhPhoneDigits = (digits = '') => /^9\d{9}$/.test(normalizePhPhoneDigits(digits));

const extractRequestErrorDetails = (requestError) => ({
  code: String(requestError?.response?.data?.error_code || requestError?.response?.data?.code || requestError?.code || '').trim(),
  message: String(requestError?.response?.data?.message || requestError?.message || '').trim(),
  field: String(requestError?.response?.data?.details?.field || requestError?.response?.data?.field || requestError?.details?.field || '').trim()
});

const resolveVerificationGuidance = (code = '', fallback = '') => {
  switch (String(code || '').trim().toUpperCase()) {
    case 'EMAIL_OTP_DELIVERY_UNAVAILABLE':
      return 'This environment cannot send the verification code until email delivery is configured. Retry once delivery is available.';
    case 'EMAIL_OTP_DELIVERY_FAILED':
      return 'The verification code could not be delivered. Use resend code to request a fresh 6-digit code.';
    case 'EMAIL_OTP_EXPIRED':
      return 'This verification code expired. Request a new code, then enter the latest 6-digit code from your email.';
    case 'EMAIL_OTP_ATTEMPTS_EXCEEDED':
      return 'Too many incorrect attempts were used on this code. Request a new code, then try again with the latest email.';
    case 'EMAIL_OTP_INVALID':
      return 'That verification code is invalid. Use the latest 6-digit code from your email, or request a new one if needed.';
    default:
      return fallback || 'Use the latest 6-digit code from your email. If the code is missing or no longer works, request a new one.';
  }
};

const inputStyle = {
  height: 42,
  width: '100%',
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  background: '#fff',
  fontSize: 14,
  color: '#0F172A',
  padding: '0 12px',
  boxSizing: 'border-box'
};

function FieldGroup({ id, label, children }) {
  return (
    <div>
      <label htmlFor={id} style={{ display: 'block', marginBottom: 6, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{label}</label>
      {children}
    </div>
  );
}

function PrimaryBtn({ children, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      style={{
        width: '100%',
        height: 46,
        borderRadius: 12,
        border: 'none',
        color: '#fff',
        fontSize: 14,
        fontWeight: 800,
        background: disabled ? '#e2e8f0' : 'linear-gradient(135deg, #ea580c, #c2410c)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        boxShadow: disabled ? 'none' : '0 10px 24px rgba(234,88,12,0.22)'
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1, borderTop: '1px solid #E2E8F0' }} />
      <span style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>or</span>
      <span style={{ flex: 1, borderTop: '1px solid #E2E8F0' }} />
    </div>
  );
}

/**
 * The in-store replacement for the skupervisor `/dgfy/auth` page. Renders
 * sign-in on `/login` and create-account (+ email verification) on
 * `/register` — same backend endpoints, same DGFY account, now same origin
 * as the storefront instead of a cross-app redirect.
 */
export default function StorefrontAuthPage({ initialMode }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const routeParams = useMemo(() => readDgfyRouteParams(searchParams), [searchParams]);

  const [view, setView] = useState(initialMode);
  const [sessionResolved, setSessionResolved] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [legalTerms, setLegalTerms] = useState(null);
  const [legalTermsError, setLegalTermsError] = useState('');

  const [loginForm, setLoginForm] = useState({ email: routeParams.email || '', password: '' });
  const [registerForm, setRegisterForm] = useState({
    firstName: '', middleName: '', lastName: '',
    email: routeParams.email || '', phone: '',
    password: '', confirmPassword: '', acceptedTerms: false
  });
  const [emailError, setEmailError] = useState('');
  const [phoneError, setPhoneError] = useState('');

  const [verifyCode, setVerifyCode] = useState('');
  const [legacyVerificationToken, setLegacyVerificationToken] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationState, setVerificationState] = useState({ requestStatus: 'idle', guidance: '', errorCode: '' });

  useEffect(() => { setView(initialMode); }, [initialMode]);

  const returnPath = useMemo(
    () => sanitizeStorefrontReturnPath(
      toInternalReturnPath(resolveDgfyPostAuthTarget({ intent: routeParams.intent, returnTo: routeParams.returnTo }))
    ),
    [routeParams.intent, routeParams.returnTo]
  );

  // If a session already exists (cookie or legacy token), skip the form and
  // go straight back to where the customer came from.
  useEffect(() => {
    let cancelled = false;
    if (routeParams.reason === 'signed-out' || hasDgfyExplicitSignOut()) {
      setSessionResolved(true);
      return undefined;
    }
    fetchDgfyMe(getStoredDgfyToken())
      .then((session) => {
        if (cancelled) return;
        if (session?.token) writeDgfyAuthToken(session.token);
        markDgfySessionActive();
        navigate(returnPath, { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        clearDgfySession();
        setSessionResolved(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchDgfyLegalTerms()
      .then((data) => { if (!cancelled) { setLegalTerms(data || null); setLegalTermsError(''); } })
      .catch(() => { if (!cancelled) { setLegalTerms(null); setLegalTermsError('DGFY terms are temporarily unavailable. Registration is disabled until the current terms load.'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const accountFlow = legalTerms?.flows?.account_registration || {};
  const accountLegalSnapshot = accountFlow.snapshot || {};
  const accountLegalDocuments = accountFlow.documents || [];
  const hasAccountLegalVersions = Boolean(
    accountLegalSnapshot.terms_version && accountLegalSnapshot.privacy_version && accountLegalSnapshot.marketplace_terms_version
  );
  const accountLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasAccountLegalVersions;
  const accountLegalDisabledReason = legalTermsError
    || (!legalTerms ? 'Current DGFY account terms must load before creating an account.' : '')
    || (!hasAccountLegalVersions ? 'Current DGFY account terms are incomplete. Registration is disabled until the current terms are published.' : '');

  const goToLogin = useCallback((extraParams = {}) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(extraParams).forEach(([key, value]) => {
      if (value) params.set(key, value); else params.delete(key);
    });
    navigate(`/login${params.toString() ? `?${params.toString()}` : ''}`);
  }, [navigate, searchParams]);

  const goToRegister = useCallback(() => {
    navigate(`/register${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
  }, [navigate, searchParams]);

  const handleAuthSuccess = useCallback(async (session) => {
    setNotice('Signed in. Returning to your account…');
    const token = session?.token || getStoredDgfyToken();
    if (token) writeDgfyAuthToken(token);
    markDgfySessionActive();
    try { await fetchDgfyMe(token).catch(() => null); }
    finally { navigate(returnPath, { replace: true }); }
  }, [navigate, returnPath]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(''); setNotice('');
    setIsLoading(true);
    try {
      const session = await loginDgfyAccount(loginForm);
      toast.success('Signed in successfully');
      await handleAuthSuccess(session);
    } catch (requestError) {
      const message = requestError?.response?.data?.message || requestError?.message || 'DGFY sign-in failed.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError(''); setNotice(''); setEmailError(''); setPhoneError('');

    if (!registerForm.firstName.trim() || !registerForm.lastName.trim()) {
      toast.error('Last name and first name are required.');
      return;
    }
    if (!EMAIL_PATTERN.test(registerForm.email.trim())) {
      setEmailError('Enter a valid email address.');
      toast.error('Enter a valid email address.');
      return;
    }
    const normalizedPhoneDigits = normalizePhPhoneDigits(registerForm.phone);
    if (!isValidPhPhoneDigits(normalizedPhoneDigits)) {
      setPhoneError('Enter a valid Philippine mobile number starting with 9.');
      toast.error('Enter a valid Philippine mobile number starting with 9.');
      return;
    }
    if (registerForm.password.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    if (registerForm.password !== registerForm.confirmPassword) { toast.error('Passwords do not match.'); return; }
    if (!registerForm.acceptedTerms) { toast.error('Accept the DGFY account terms before creating an account.'); return; }
    if (accountLegalTermsUnavailable) { toast.error(accountLegalDisabledReason || 'Current DGFY terms must load before creating an account.'); return; }

    const normalizedPhoneNumber = `${PH_DIAL_CODE}${normalizedPhoneDigits}`;
    setIsLoading(true);
    try {
      await preflightDgfyAccountRegistration({ email: registerForm.email.trim(), phone: normalizedPhoneNumber });
    } catch (requestError) {
      const { field, message } = extractRequestErrorDetails(requestError);
      const normalizedField = String(field || '').toLowerCase();
      const fieldMessage = normalizedField === 'phone'
        ? 'A DGFY account already exists with this phone number. Use a different mobile number or contact support.'
        : 'A DGFY account already exists with this email. Log in instead or reset your password.';
      if (normalizedField === 'phone') setPhoneError(fieldMessage); else setEmailError(fieldMessage);
      toast.error(message || fieldMessage);
      setIsLoading(false);
      return;
    }

    setVerificationState({ requestStatus: 'sending', guidance: 'Requesting your 6-digit verification code now.', errorCode: '' });
    setVerifyCode('');
    setLegacyVerificationToken('');
    setResendCooldown(0);
    setView('verify-email');
    try {
      if (typeof requestDgfySignupOtp === 'function') {
        await requestDgfySignupOtp(registerForm.email.trim());
      } else {
        const session = await registerDgfyAccount({
          first_name: registerForm.firstName,
          middle_name: registerForm.middleName,
          last_name: registerForm.lastName,
          email: registerForm.email.trim(),
          phone: normalizedPhoneNumber,
          password: registerForm.password,
          confirm_password: registerForm.confirmPassword,
          accepted_terms: true,
          terms_version: accountLegalSnapshot.terms_version,
          privacy_version: accountLegalSnapshot.privacy_version,
          marketplace_terms_version: accountLegalSnapshot.marketplace_terms_version
        });
        const token = session?.token || getStoredDgfyToken();
        setLegacyVerificationToken(token);
        await requestDgfyEmailVerification(token);
      }
      setVerificationState({
        requestStatus: 'sent',
        guidance: 'We sent a 6-digit verification code to your email. Enter the latest code to finish creating your DGFY account.',
        errorCode: ''
      });
      setResendCooldown(60);
      toast.success('Verification code sent.');
    } catch (requestError) {
      const { code, message } = extractRequestErrorDetails(requestError);
      setVerificationState({
        requestStatus: 'failed',
        guidance: resolveVerificationGuidance(code, 'The verification code was not sent yet. Use resend code to request a fresh email.'),
        errorCode: code
      });
      toast.error(message || 'Could not send the verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyEmail = async (event) => {
    event.preventDefault();
    if (!verifyCode.trim()) { toast.error('Enter the verification code sent to your email.'); return; }
    setIsLoading(true);
    try {
      const normalizedPhoneDigits = normalizePhPhoneDigits(registerForm.phone);
      const normalizedPhoneNumber = `${PH_DIAL_CODE}${normalizedPhoneDigits}`;
      if (legacyVerificationToken) {
        await verifyDgfyEmail(verifyCode.trim());
      } else {
        await registerDgfyAccount({
          first_name: registerForm.firstName,
          middle_name: registerForm.middleName,
          last_name: registerForm.lastName,
          email: registerForm.email.trim(),
          phone: normalizedPhoneNumber,
          password: registerForm.password,
          confirm_password: registerForm.confirmPassword,
          email_otp_code: verifyCode.trim(),
          accepted_terms: true,
          terms_version: accountLegalSnapshot.terms_version,
          privacy_version: accountLegalSnapshot.privacy_version,
          marketplace_terms_version: accountLegalSnapshot.marketplace_terms_version
        });
      }
      toast.success('Account created successfully. Please sign in to continue.');
      clearDgfySession();
      setVerificationState({ requestStatus: 'verified', guidance: '', errorCode: '' });
      setLegacyVerificationToken('');
      goToLogin({ email: registerForm.email });
    } catch (requestError) {
      const { code, message } = extractRequestErrorDetails(requestError);
      setVerificationState({
        requestStatus: code === 'EMAIL_OTP_EXPIRED' ? 'expired' : 'failed',
        guidance: resolveVerificationGuidance(code),
        errorCode: code
      });
      toast.error(message || 'Invalid or expired verification code.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (resendCooldown > 0) return;
    try {
      if (typeof requestDgfySignupOtp === 'function') {
        await requestDgfySignupOtp(registerForm.email.trim());
      } else if (legacyVerificationToken) {
        await requestDgfyEmailVerification(legacyVerificationToken);
      } else {
        throw new Error('Email verification is unavailable.');
      }
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
        guidance: resolveVerificationGuidance(code, 'The verification code could not be resent yet. Try again shortly.'),
        errorCode: code
      });
      toast.error(message || 'Could not resend the verification code. Please try again.');
    }
  };

  const resetPasswordHref = buildDgfyResetPasswordUrl({ intent: 'customer', returnTo: window?.location?.href, email: loginForm.email });
  const businessRegistrationHref = buildBusinessRegistrationUrl();

  if (!sessionResolved) {
    return (
      <StorefrontAuthShell>
        <div style={{ textAlign: 'center' }}>
          <div style={{ margin: '0 auto 16px', width: 48, height: 48, borderRadius: 16, background: '#ea580c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 20 }}>D</div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A' }}>Restoring your session…</h1>
          <p style={{ marginTop: 8, fontSize: 14, color: '#64748B' }}>Checking whether you already have an active DGFY account session.</p>
        </div>
      </StorefrontAuthShell>
    );
  }

  return (
    <StorefrontAuthShell>
      {error ? <Banner tone="error">{error}</Banner> : null}
      {notice ? <Banner tone="info">{notice}</Banner> : null}

      {view === 'verify-email' && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 20 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A' }}>Check your email</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: '#64748B' }}>
            We sent a 6-digit verification code to <strong style={{ color: '#0F172A' }}>{registerForm.email}</strong>.
            Enter it below to activate your account.
          </p>
          <div style={{ width: '100%', borderRadius: 14, padding: '12px 14px', textAlign: 'left', fontSize: 13, background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8' }}>
            <p style={{ fontWeight: 700, margin: 0 }}>
              {verificationState.requestStatus === 'sent' ? 'Verification code ready'
                : verificationState.requestStatus === 'sending' ? 'Sending verification code'
                : verificationState.requestStatus === 'expired' ? 'Verification code expired'
                : verificationState.requestStatus === 'failed' ? 'Verification requires attention'
                : 'Verification in progress'}
            </p>
            <p style={{ margin: '4px 0 0' }}>{verificationState.guidance || 'Use the latest 6-digit code from your email to finish registration.'}</p>
          </div>
          <form onSubmit={handleVerifyEmail} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FieldGroup id="storefrontVerifyCode" label="Verification Code">
              <input
                id="storefrontVerifyCode"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Enter 6-digit code"
                value={verifyCode}
                onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                required
                disabled={isLoading}
                style={{ ...inputStyle, textAlign: 'center', fontSize: 22, letterSpacing: '0.5em', fontWeight: 700 }}
              />
            </FieldGroup>
            <PrimaryBtn disabled={isLoading || verifyCode.trim().length !== 6}>{isLoading ? 'Verifying…' : 'Verify Email'}</PrimaryBtn>
          </form>
          <p style={{ fontSize: 13, color: '#64748B' }}>
            Didn&apos;t receive a code?{' '}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendCooldown > 0}
              style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: '#ea580c', cursor: resendCooldown > 0 ? 'not-allowed' : 'pointer', opacity: resendCooldown > 0 ? 0.5 : 1 }}
            >
              {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend code'}
            </button>
          </p>
        </div>
      )}

      {view === 'sign-in' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#0F172A' }}>Login your DGFY Account</h1>
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <FieldGroup id="storefrontLoginEmail" label="Email Address">
              <input
                id="storefrontLoginEmail" type="email" autoComplete="email" placeholder="name@company.com"
                value={loginForm.email} onChange={(e) => setLoginForm((c) => ({ ...c, email: e.target.value }))}
                required disabled={isLoading} style={inputStyle}
              />
            </FieldGroup>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <label htmlFor="storefrontLoginPassword" style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Password</label>
                <a href={resetPasswordHref} style={{ fontSize: 12, fontWeight: 700, color: '#ea580c', textDecoration: 'none' }}>Forgot password?</a>
              </div>
              <StorefrontPasswordInput
                id="storefrontLoginPassword" autoComplete="current-password" placeholder="••••••••"
                value={loginForm.password} onChange={(e) => setLoginForm((c) => ({ ...c, password: e.target.value }))} disabled={isLoading}
              />
            </div>
            <PrimaryBtn disabled={isLoading}>{isLoading ? 'Signing in…' : 'Login'}</PrimaryBtn>
          </form>
          <Divider />
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B' }}>
            Don&apos;t have an account?{' '}
            <button type="button" onClick={goToRegister} style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: '#ea580c', cursor: 'pointer' }}>Sign up</button>
          </p>
          <BusinessRegistrationCard href={businessRegistrationHref} />
        </div>
      )}

      {view === 'create-account' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 style={{ textAlign: 'center', fontSize: 26, fontWeight: 800, color: '#0F172A' }}>Create your DGFY Account</h1>
          <form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
              <FieldGroup id="storefrontLastName" label="Last Name">
                <input id="storefrontLastName" placeholder="e.g. Doe" value={registerForm.lastName}
                  onChange={(e) => setRegisterForm((c) => ({ ...c, lastName: e.target.value }))} required disabled={isLoading} style={inputStyle} />
              </FieldGroup>
              <FieldGroup id="storefrontFirstName" label="First Name">
                <input id="storefrontFirstName" placeholder="e.g. John" value={registerForm.firstName}
                  onChange={(e) => setRegisterForm((c) => ({ ...c, firstName: e.target.value }))} required disabled={isLoading} style={inputStyle} />
              </FieldGroup>
              <FieldGroup id="storefrontMiddleName" label="Middle Name (Optional)">
                <input id="storefrontMiddleName" placeholder="e.g. Smith" value={registerForm.middleName}
                  onChange={(e) => setRegisterForm((c) => ({ ...c, middleName: e.target.value }))} disabled={isLoading} style={inputStyle} />
              </FieldGroup>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <FieldGroup id="storefrontEmail" label="Email Address">
                <input
                  id="storefrontEmail" type="email" autoComplete="email" placeholder="name@company.com"
                  value={registerForm.email}
                  onChange={(e) => {
                    const nextEmail = e.target.value;
                    setRegisterForm((c) => ({ ...c, email: nextEmail }));
                    if (emailError) setEmailError(EMAIL_PATTERN.test(nextEmail.trim()) ? '' : emailError);
                  }}
                  required disabled={isLoading} style={inputStyle}
                  aria-invalid={Boolean(emailError)}
                />
                {emailError ? <p style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }} role="alert">{emailError}</p> : null}
              </FieldGroup>
              <FieldGroup id="storefrontPhone" label="Mobile Number">
                <div style={{ display: 'flex', gap: 8 }}>
                  <span style={{ ...inputStyle, width: 56, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontWeight: 700 }}>{PH_DIAL_CODE}</span>
                  <input
                    id="storefrontPhone" type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="917 123 4567"
                    value={registerForm.phone}
                    onChange={(e) => {
                      const nextPhone = formatPhPhoneDisplay(e.target.value);
                      setRegisterForm((c) => ({ ...c, phone: nextPhone }));
                      if (phoneError) setPhoneError(isValidPhPhoneDigits(nextPhone) ? '' : phoneError);
                    }}
                    required disabled={isLoading} style={{ ...inputStyle, flex: 1 }}
                    aria-invalid={Boolean(phoneError)}
                  />
                </div>
                {phoneError ? <p style={{ marginTop: 6, fontSize: 12, color: '#DC2626' }} role="alert">{phoneError}</p> : null}
              </FieldGroup>
            </div>

            <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <FieldGroup id="storefrontPassword" label="Password">
                <StorefrontPasswordInput id="storefrontPassword" autoComplete="new-password" placeholder="••••••••"
                  value={registerForm.password} onChange={(e) => setRegisterForm((c) => ({ ...c, password: e.target.value }))} disabled={isLoading} />
              </FieldGroup>
              <FieldGroup id="storefrontConfirmPassword" label="Confirm Password">
                <StorefrontPasswordInput id="storefrontConfirmPassword" autoComplete="new-password" placeholder="••••••••"
                  value={registerForm.confirmPassword} onChange={(e) => setRegisterForm((c) => ({ ...c, confirmPassword: e.target.value }))} disabled={isLoading} />
              </FieldGroup>
            </div>

            <StorefrontLegalAcknowledgement
              id="storefrontAccountTerms"
              checked={registerForm.acceptedTerms}
              onChange={(e) => setRegisterForm((c) => ({ ...c, acceptedTerms: e.target.checked }))}
              disabled={isLoading || accountLegalTermsUnavailable}
              disabledReason={accountLegalTermsUnavailable ? accountLegalDisabledReason : ''}
              label="I have reviewed and agree to the current DGFY Account Terms, Privacy Policy, and Marketplace Provider Terms."
              documents={accountLegalDocuments}
              versionLabel={[accountLegalSnapshot.terms_version, accountLegalSnapshot.privacy_version, accountLegalSnapshot.marketplace_terms_version].filter(Boolean).join(' · ')}
            />

            <PrimaryBtn disabled={isLoading}>{isLoading ? 'Creating account…' : 'Create Account'}</PrimaryBtn>
          </form>
          <Divider />
          <p style={{ textAlign: 'center', fontSize: 13, color: '#64748B' }}>
            Already have an account?{' '}
            <button type="button" onClick={() => goToLogin()} style={{ border: 'none', background: 'none', padding: 0, fontWeight: 800, color: '#ea580c', cursor: 'pointer' }}>Sign in</button>
          </p>
          <BusinessRegistrationCard href={businessRegistrationHref} />
        </div>
      )}
    </StorefrontAuthShell>
  );
}

function StorefrontAuthShell({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: '100%', maxWidth: 520, padding: '48px 24px' }}>
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <a href="/" aria-label="Back to DGFY storefront" style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: '#ea580c', textDecoration: 'none' }}>DGFY</a>
        </div>
        {children}
      </div>
    </div>
  );
}

function Banner({ tone, children }) {
  const styles = tone === 'error'
    ? { background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }
    : { background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#1D4ED8' };
  return (
    <div style={{ marginBottom: 20, borderRadius: 12, padding: '12px 14px', fontSize: 13, ...styles }}>
      {children}
    </div>
  );
}

function BusinessRegistrationCard({ href }) {
  return (
    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 16, padding: 20, border: '1px solid #E2E8F0', background: '#F8FAFC' }}>
      <div>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0F172A' }}>Register your business with your DGFY account</p>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748B' }}>Use your existing DGFY account to create and manage your business profile.</p>
      </div>
      <a
        href={href}
        style={{ alignSelf: 'flex-start', borderRadius: 10, border: '1.5px solid #ea580c', padding: '8px 16px', fontSize: 13, fontWeight: 800, color: '#ea580c', textDecoration: 'none' }}
      >
        Register Business
      </a>
    </div>
  );
}
