import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { login } from '../src/services/authService.js';
import api from '../src/services/api.js';
import { clearClientSession } from '../src/services/sessionCleanup.js';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, Loader2, AlertTriangle, ArrowRight, Eye, EyeOff } from 'lucide-react';
import dgfyLogo from '../src/assets/dgfy/dgfy-logo.png';
import { buildDgfyAuthPath, DGFY_COMPANY_SELECT_ROUTE } from '../src/features/dgfyRouteHelpers.js';

const handleDgfyLogoError = (event) => {
  const image = event.currentTarget;
  image.style.display = 'none';
  image.parentElement?.setAttribute('data-logo-fallback', 'DGFY');
};

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const registrationLoginState = location.state?.registration || null;
  const initialRegistrationEmail = (registrationLoginState?.email || '').trim();
  const initialRegistrationToken = (registrationLoginState?.companyToken || '').trim();
  const sessionExpired = new URLSearchParams(location.search).get('reason') === 'session_expired';
  // Owners/developers with a DGFY account sign in there instead of the staff
  // form below - see DgfyCompanySelect.jsx for what happens after. This
  // routes through the company picker (not straight to the target path) so a
  // tenant session gets started even when the account owns more than one
  // company. ProtectedRoute.jsx stashes the attempted URL in localStorage
  // before bouncing here; the staff form below still reads/clears that same
  // key on its own successful login.
  const dgfySignInHref = buildDgfyAuthPath({
    returnTo: `${DGFY_COMPANY_SELECT_ROUTE}?next=${encodeURIComponent(localStorage.getItem('redirectAfterLogin') || '/')}`
  });
  const [formData, setFormData] = useState({
    email: initialRegistrationEmail,
    password: '',
    companyToken: initialRegistrationToken
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  // New state for email lookup
  const [showTokenField, setShowTokenField] = useState(false);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [availableTenants, setAvailableTenants] = useState([]);
  const [lookupDone, setLookupDone] = useState(Boolean(initialRegistrationEmail && initialRegistrationToken));
  const [lookupError, setLookupError] = useState('');

  // Inactive / rejected tenant state
  const [tenantStatus, setTenantStatus] = useState(null); // 'inactive' | 'rejected' | null
  const [rejectionReason, setRejectionReason] = useState('');
  const [identifiedToken, setIdentifiedToken] = useState(initialRegistrationToken);
  const [lastLookupEmail, setLastLookupEmail] = useState(initialRegistrationEmail.toLowerCase());
  const lookupGenerationRef = useRef(0);

  const resetResolvedIdentity = ({ clearPassword = false } = {}) => {
    lookupGenerationRef.current += 1;
    setFormData((previous) => ({
      ...previous,
      ...(clearPassword ? { password: '' } : {}),
      companyToken: ''
    }));
    setShowTokenField(false);
    setIsLookingUp(false);
    setAvailableTenants([]);
    setLookupDone(false);
    setLookupError('');
    setTenantStatus(null);
    setRejectionReason('');
    setIdentifiedToken('');
    setLastLookupEmail('');
    setError('');
  };

  // Clear stale company token when landing on login page
  // and reset any stale in-memory state from a previous user session.
  useEffect(() => {
    clearClientSession({
      reason: 'login_entry',
      broadcast: false,
      emitAuthEvents: false,
      redirectTo: null
    });
  }, []);

  // Look up tenant by email when user finishes typing
  const handleEmailBlur = async () => {
    // Strict email regex matching backend/Joi: something@something.something
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    const normalizedEmail = (formData.email || '').trim().toLowerCase();

    if (!normalizedEmail || !emailRegex.test(normalizedEmail)) {
      return null;
    }

    // Avoid re-running lookup on every blur/click if email is unchanged and already resolved.
    if (lookupDone && normalizedEmail === lastLookupEmail && formData.companyToken) {
      return formData.companyToken;
    }

    const lookupGeneration = ++lookupGenerationRef.current;
    setIsLookingUp(true);
    setLookupError('');
    setAvailableTenants([]);
    setTenantStatus(null);
    setRejectionReason('');
    setIdentifiedToken('');
    let resolvedToken = null;

    try {
      if (import.meta.env.DEV) console.debug('[Login] Looking up email:', formData.email);
      const response = await api.post(
        '/auth/lookup',
        { email: normalizedEmail },
        { timeout: 8000, skipAuthRefresh: true, skipTenantAuthHeaders: true }
      );
      if (lookupGeneration !== lookupGenerationRef.current) return null;
      const data = response.data.data;
      if (import.meta.env.DEV) console.debug('[Login] Lookup success:', data);

      if (!data) {
        throw new Error('Invalid response from server');
      }

      if (data.multiple) {
        // Multiple tenants - show selector
        setAvailableTenants(data.tenants);
        setShowTokenField(true);
        setFormData(prev => ({ ...prev, companyToken: '' }));
      } else {
        resolvedToken = data.company_token;
        setIdentifiedToken(data.company_token);
        setError('');
        setFormData(prev => ({ ...prev, companyToken: data.company_token }));
        setShowTokenField(false);
        setAvailableTenants([]);

        if (data.status === 'pending') {
          setLookupError('Your company is currently awaiting approval. You can sign in once activated.');
        } else if (data.status === 'inactive') {
          setTenantStatus('inactive');
        } else if (data.status === 'rejected') {
          setTenantStatus('rejected');
          setRejectionReason(data.rejection_reason || '');
        }
      }
      setLastLookupEmail(normalizedEmail);
      setLookupDone(true);
    } catch (err) {
      if (lookupGeneration !== lookupGenerationRef.current) return null;
      console.error('❌ [Login] Lookup failed:', err.response?.status, err.response?.data || err.message);
      if (err.response?.status === 404) {
        setLookupError('Email not found. Enter your company token manually.');
        setShowTokenField(true);
        setFormData(prev => ({ ...prev, companyToken: '' }));
      } else {
        setLookupError('Identification failed. Please enter your company token manually.');
        setShowTokenField(true);
      }
      setLookupDone(true);
    } finally {
      if (lookupGeneration === lookupGenerationRef.current) setIsLookingUp(false);
    }
    return resolvedToken;
  };


  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');

    // Browser autofill may visually fill inputs without firing React onChange.
    // Read DOM values as fallback so submit logic uses what the user actually sees.
    const domEmail = typeof document !== 'undefined'
      ? document.getElementById('email')?.value
      : '';
    const domPassword = typeof document !== 'undefined'
      ? document.getElementById('password')?.value
      : '';
    const domCompanyToken = typeof document !== 'undefined'
      ? document.getElementById('companyToken')?.value
      : '';

    const effectiveEmail = (formData.email || domEmail || '').trim();
    const effectivePassword = formData.password || domPassword || '';
    const effectiveCompanyToken = (formData.companyToken || domCompanyToken || '').trim();

    if (effectiveEmail !== formData.email || effectivePassword !== formData.password || effectiveCompanyToken !== formData.companyToken) {
      setFormData({
        email: effectiveEmail,
        password: effectivePassword,
        companyToken: effectiveCompanyToken
      });
    }

    const hasManualToken = Boolean(effectiveCompanyToken);

    // If lookup is still running and user has no manual token yet, block submit.
    if (isLookingUp && !hasManualToken) {
      setError('Identifying company... please wait.');
      return;
    }

    let currentToken = effectiveCompanyToken;

    // If lookup wasn't performed yet, do it now only when token is not already provided.
    if (!lookupDone && effectiveEmail && !hasManualToken) {
      setIsLoading(true);
      currentToken = await handleEmailBlur();
      setIsLoading(false);
    }

    // Validate company token is present
    if (!currentToken) {
      setError('Company token is required. Please enter your company token.');
      setShowTokenField(true);
      return;
    }

    setIsLoading(true);

    try {
      if (import.meta.env.DEV) console.debug('[Login] Attempting sign-in for:', { email: formData.email, companyToken: currentToken });
      await login({
        email: effectiveEmail,
        password: effectivePassword,
        companyToken: currentToken
      });

      // Get redirect path or default to dashboard
      const redirectPath = localStorage.getItem('redirectAfterLogin') || '/';
      localStorage.removeItem('redirectAfterLogin');

      navigate(redirectPath);
    } catch (err) {
      console.error('❌ [Login] Authentication failed:', err.response?.status, err.response?.data || err.message);
      setError(err.response?.data?.message || 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <span className="relative inline-flex min-h-16 min-w-28 items-center justify-center rounded-xl text-2xl font-black tracking-tight text-[#1A4E8D] before:content-[attr(data-logo-fallback)]">
                <img src={dgfyLogo} alt="DGFY" className="h-16 w-auto object-contain" onError={handleDgfyLogoError} />
              </span>
            </div>
            <p className="text-slate-600 mt-2">Sign in to your account</p>
          </div>

          {/* Session-expired notice - api.js hard-redirects here on an
              unrecoverable 401 with this reason. Named after both sign-in
              paths below since either one could have been the expired
              session. */}
          {sessionExpired && (
            <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>Your session expired. Sign in again with your DGFY account or your staff credentials below.</span>
            </div>
          )}

          {/* DGFY account entry point - business owners/developers use their
              DGFY account (the same one they use on dgfy.ph) instead of the
              staff credential form below. */}
          <a
            href={dgfySignInHref}
            onClick={() => localStorage.removeItem('redirectAfterLogin')}
            className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg border border-[#1A4E8D] bg-[#1A4E8D] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#163f73]"
          >
            Sign in with your DGFY account
          </a>
          <div className="relative mb-6 text-center">
            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-200" /></div>
            <span className="relative bg-white px-3 text-xs uppercase tracking-wide text-slate-400">Or sign in as staff</span>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  placeholder="admin@test.com"
                  value={formData.email}
                  onChange={(e) => {
                    const nextEmail = e.target.value;
                    const identityWasResolved = Boolean(
                      formData.companyToken
                      || identifiedToken
                      || availableTenants.length
                      || lookupDone
                    );
                    resetResolvedIdentity({ clearPassword: identityWasResolved });
                    setFormData((previous) => ({ ...previous, email: nextEmail }));
                  }}
                  onBlur={handleEmailBlur}
                  required
                  disabled={isLoading}
                  className="mt-1"
                />
                {isLookingUp && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                  </div>
                )}
              </div>
              {lookupError && (
                <p className="text-xs text-amber-600 mt-1">{lookupError}</p>
              )}
            </div>

            <div>
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={passwordVisible ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  disabled={isLoading}
                  className="mt-1 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setPasswordVisible((current) => !current)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800"
                  aria-label={passwordVisible ? 'Hide password' : 'Show password'}
                  disabled={isLoading}
                >
                  {passwordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Company Token Field - Conditionally shown */}
            {showTokenField ? (
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="companyToken">Company Token</Label>
                  <button
                    type="button"
                    onClick={() => setShowTokenField(false)}
                    className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                  >
                    Hide <ChevronUp className="w-3 h-3" />
                  </button>
                </div>
                {availableTenants.length > 0 ? (
                  <Select
                    value={formData.companyToken}
                    onValueChange={(value) => {
                      setFormData({ ...formData, companyToken: value });
                      const selected = availableTenants.find(t => t.company_token === value);
                      if (selected) {
                        setIdentifiedToken(value);
                        if (selected.status === 'inactive') {
                          setTenantStatus('inactive');
                        } else if (selected.status === 'rejected') {
                          setTenantStatus('rejected');
                          setRejectionReason(selected.rejection_reason || '');
                        } else {
                          setTenantStatus(null);
                        }
                      }
                    }}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select your company" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableTenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.company_token}>
                          {tenant.name}{tenant.status === 'inactive' ? ' (Inactive)' : tenant.status === 'rejected' ? ' (Rejected)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="companyToken"
                    name="companyToken"
                    type="text"
                    autoComplete="off"
                    placeholder="e.g., token-tenant-a"
                    value={formData.companyToken}
                    onChange={(e) => setFormData({ ...formData, companyToken: e.target.value })}
                    disabled={isLoading}
                    className="mt-1"
                  />
                )}
              </div>
            ) : (
              lookupDone && formData.companyToken && (
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Company identified automatically</span>
                  <button
                    type="button"
                    onClick={() => setShowTokenField(true)}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    Change <ChevronDown className="w-3 h-3" />
                  </button>
                </div>
              )
            )}

            {/* Show token field link if not looking up and no auto-resolve happened */}
            {!showTokenField && !lookupDone && (
              <button
                type="button"
                onClick={() => setShowTokenField(true)}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                Enter company token manually <ChevronDown className="w-3 h-3" />
              </button>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>

          {/* Inactive tenant — reactivation */}
          {tenantStatus === 'inactive' && (
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-800">Account Inactive</p>
                  <p className="text-xs text-amber-700 mt-1">
                    Your company account is currently inactive. Subscription reactivation is currently unavailable.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-3"
                    onClick={() => navigate('/register-company')}
                  >
                    <ArrowRight className="w-3 h-3 mr-1" />
                    Contact Your Administrator
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Rejected tenant — re-submit */}
          {tenantStatus === 'rejected' && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-800">Registration Rejected</p>
                  {rejectionReason && (
                    <p className="text-xs text-red-700 mt-1">Reason: {rejectionReason}</p>
                  )}
                  <p className="text-xs text-red-700 mt-1">Sign in to the DGFY account that submitted the registration, then use its protected registration-status page to correct and resubmit it. Company tokens cannot resubmit applications.</p>
                </div>
              </div>
            </div>
          )}

          {/* Registration Link */}
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-slate-600">
              Don&apos;t have an account?{' '}
              <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                Create one here
              </Link>
            </p>
            <p className="text-sm text-slate-600">
              Need a new company?{' '}
              <Link to="/register-company" className="text-indigo-600 hover:text-indigo-700 font-medium">
                Register Company
              </Link>
            </p>
          </div>

          {/* Development Credentials Info */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-900 mb-2">Development Credentials:</p>
              <p className="text-xs text-blue-700">Email: admin@tenant-a.com</p>
              <p className="text-xs text-blue-700">Password: Admin123!</p>
              <p className="text-xs text-blue-700">Token: token-tenant-a</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-slate-500 mt-6">
          SKUpervisor v1.0.0
        </p>
      </div>
    </div>
  );
}
