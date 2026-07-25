import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle2, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Cross-app imports — same pattern as StorefrontAuthPage.jsx: the DGFY
// account/company API layer, workflow-mode labels, auth-page hero and shared
// UI primitives are shared logic living in frontend/src, not app-specific.
import api from '../../../../../src/services/api.js';
import {
  clearDgfySession,
  dgfyAuthHeader,
  exchangeDgfyHandoff,
  fetchDgfyLegalTerms,
  fetchDgfyMe,
  getStoredDgfyAccount,
  getStoredDgfyToken,
  startDgfyTenantSession,
  logoutDgfyAccount
} from '../../../../../src/services/dgfyAuthService.js';
import DgfyAuthHero from '../../../../../src/features/dgfy/components/DgfyAuthHero.jsx';
import { resolvePosTerminalUrl } from '../../../../../src/features/dgfyRouteHelpers.js';
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_SELECT_VALUES } from '../../../../../src/features/settings/workflowMode.js';

import { writeDgfyAuthToken } from '../../auth/storefrontSessionStorage.js';
import { resolveSkupervisorUrl } from '../../auth/storefrontSkupervisorLink.js';

const getFlowSnapshot = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.snapshot || {};
const getFlowDocuments = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.documents || [];
const hasCompanyLegalVersions = (snapshot = {}) => Boolean(
  snapshot.company_terms_version
  && snapshot.marketplace_terms_version
);
const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const POS_ONBOARDING_ENTRY_SEARCH = '?setup_flow=tenant_onboarding&setup_step=storefront_setup';
const BUSINESS_GROW_PATH = '/business/grow';
// Auth is same-origin as the storefront now, so the hero's links stay in-app.
const STOREFRONT_HOME_URL = '/';

const getStatusCode = (error) => Number(error?.response?.status || error?.status || 0);

const getRetryAfterSeconds = (error) => {
  const retryAfterSeconds = Number(error?.response?.data?.retryAfterSeconds || error?.retryAfterSeconds || 0);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) return Math.ceil(retryAfterSeconds);
  const retryAfterHeader = error?.response?.headers?.['retry-after'] || error?.response?.headers?.get?.('retry-after');
  const retryAfter = Number(retryAfterHeader || 0);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? Math.ceil(retryAfter) : 0;
};

const getTenantSessionFallbackMessage = (error) => {
  if (getStatusCode(error) !== 429) {
    return error?.response?.data?.message || 'Company created. Use the button below to sign in to POS with this company prefilled.';
  }
  const retryAfterSeconds = getRetryAfterSeconds(error);
  const retryCopy = retryAfterSeconds > 0
    ? ` Please wait about ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute${Math.ceil(retryAfterSeconds / 60) === 1 ? '' : 's'} before trying the automatic POS handoff again.`
    : ' Please wait before trying the automatic POS handoff again.';
  return `Company created. POS session opening is temporarily rate-limited.${retryCopy} You can still use the button below to continue through POS sign-in.`;
};

// Copied verbatim from Pages/RegisterCompany.jsx. The only change: document
// links are resolved to skupervisor, which still hosts the legal pages.
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
              {documents.map((legalDocument) => (
                <section key={legalDocument.key || legalDocument.version} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <h3 className="text-sm font-semibold text-slate-800">
                    {legalDocument.title} <span className="text-xs text-slate-500">({legalDocument.version})</span>
                  </h3>
                  <p className="mt-2 text-xs leading-5 text-slate-600">{legalDocument.summary}</p>
                  {legalDocument.href ? (
                    <a className="mt-2 inline-block text-xs font-medium text-[#1f5f9f] hover:underline" href={resolveSkupervisorUrl(legalDocument.href)} target="_blank" rel="noreferrer">
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

/**
 * The in-store host for skupervisor's `/register-company` page. This is
 * `frontend/Pages/RegisterCompany.jsx` moved, not redesigned: same markup, same
 * copy, same backend endpoint (POST /api/v1/admin/tenants/register, guarded by
 * authenticateDgfyAccount). Only the navigation seam differs — the signed-out
 * CTAs go to the in-app /login and /register routes instead of skupervisor's
 * /dgfy/auth, and the DGFY session token is mirrored into storefront storage.
 */
export default function StorefrontBusinessGrowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const businessSectionRef = useRef(null);
  const handoffExchangeStartedRef = useRef(false);
  const dgfySessionGenerationRef = useRef(0);

  const [dgfyToken, setDgfyToken] = useState(() => getStoredDgfyToken());
  const [dgfyAccount, setDgfyAccount] = useState(() => getStoredDgfyAccount());
  const [legalTerms, setLegalTerms] = useState(null);
  const [legalTermsError, setLegalTermsError] = useState('');
  const [companyForm, setCompanyForm] = useState({
    companyName: '',
    workflowMode: 'food_manufacturing',
    acceptedCompanyTerms: false
  });
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const businessIndustryOptions = useMemo(() => WORKFLOW_MODE_SELECT_VALUES.map((mode) => ({
    value: mode,
    label: WORKFLOW_MODE_LABELS[mode] || mode
  })), []);

  useEffect(() => {
    let cancelled = false;
    fetchDgfyLegalTerms()
      .then((data) => { if (!cancelled) { setLegalTerms(data || null); setLegalTermsError(''); } })
      .catch(() => { if (!cancelled) { setLegalTerms(null); setLegalTermsError('DGFY terms are temporarily unavailable. Registration is disabled until the current terms load.'); } });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const token = getStoredDgfyToken();
    const sessionGeneration = dgfySessionGenerationRef.current;
    fetchDgfyMe(token)
      .then((data) => {
        if (cancelled || sessionGeneration !== dgfySessionGenerationRef.current) return;
        setDgfyToken(data?.token || token || getStoredDgfyToken());
        setDgfyAccount(data?.account || null);
      })
      .catch(() => {
        if (cancelled || sessionGeneration !== dgfySessionGenerationRef.current) return;
        clearDgfySession();
        setDgfyToken('');
        setDgfyAccount(null);
      });
    return () => { cancelled = true; };
  }, []);

  // Handles inbound cross-app handoff links (e.g. a POS/skupervisor surface
  // linking here with a one-time token) even though the primary in-app entry
  // point no longer needs one.
  useEffect(() => {
    const handoffToken = String(searchParams.get('handoff_token') || '').trim();
    if (!handoffToken || handoffExchangeStartedRef.current) return undefined;
    handoffExchangeStartedRef.current = true;
    setIsLoading(true);
    exchangeDgfyHandoff(handoffToken, { softFail: true })
      .then((session) => {
        const nextParams = new URLSearchParams(searchParams);
        nextParams.delete('handoff_token');
        navigate({ pathname: BUSINESS_GROW_PATH, search: nextParams.toString() ? `?${nextParams.toString()}` : '' }, { replace: true });
        if (session?.status === 'invalid') {
          clearDgfySession();
          setDgfyToken('');
          setDgfyAccount(null);
          setError('Your DGFY handoff expired. Sign in again to register your business.');
          return;
        }
        dgfySessionGenerationRef.current += 1;
        if (session?.token) writeDgfyAuthToken(session.token);
        setDgfyToken(session?.token || getStoredDgfyToken());
        setDgfyAccount(session?.account || null);
        setNotice('DGFY account connected. Register your business below.');
      })
      .catch(() => {
        clearDgfySession();
        setDgfyToken('');
        setDgfyAccount(null);
        setError('Your DGFY handoff expired. Sign in again to register your business.');
      })
      .finally(() => setIsLoading(false));
    return undefined;
  }, [navigate, searchParams]);

  const companyLegalSnapshot = getFlowSnapshot(legalTerms, 'company_registration');
  const companyLegalDocuments = getFlowDocuments(legalTerms, 'company_registration');
  const companyLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasCompanyLegalVersions(companyLegalSnapshot);
  const companyLegalDisabledReason = legalTermsError
    || (!legalTerms ? 'Current DGFY company terms must load before registering a company.' : '')
    || (!hasCompanyLegalVersions(companyLegalSnapshot) ? 'Current DGFY company terms are incomplete. Company registration is disabled until the current terms are published.' : '');

  const startTenantSessionWithRetry = useCallback(async (tenantData = {}, token = dgfyToken) => {
    const tenantId = String(tenantData?.id || '').trim();
    const companyToken = String(tenantData?.company_token || '').trim();
    if (!tenantId || !companyToken) throw new Error('POS session handoff is missing the required tenant identity.');
    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await startDgfyTenantSession({ tenantId, companyToken }, token);
      } catch (attemptError) {
        lastError = attemptError;
        if (getStatusCode(attemptError) === 429) break;
        if (attempt === 2) break;
        await wait(350 * (attempt + 1));
      }
    }
    throw lastError || new Error('POS session handoff failed.');
  }, [dgfyToken]);

  // POS is a separate app/origin from the storefront, so both of these are full
  // page navigations rather than router pushes.
  const redirectToPos = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.assign(resolvePosTerminalUrl(POS_ONBOARDING_ENTRY_SEARCH));
  }, []);

  const goToManualPosLogin = useCallback(() => {
    if (typeof window === 'undefined') return;
    window.location.assign(resolvePosTerminalUrl());
  }, []);

  const handleSubmitCompany = async (event) => {
    event.preventDefault();
    setError(''); setSuccess(null);

    const activeDgfyToken = dgfyToken || getStoredDgfyToken();
    if (!dgfyAccount) {
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
        withCredentials: true,
        skipTenantAuthHeaders: true,
        headers: dgfyAuthHeader()
      });

      if (!response.data?.success) throw new Error(response.data?.message || 'Registration failed');

      const registrationSuccess = { message: response.data.message, data: response.data.data || {} };
      setSuccess(registrationSuccess);
      setCompanyForm((current) => ({ ...current, acceptedCompanyTerms: false }));
      toast.success('Company created successfully.');

      if (registrationSuccess.data?.company_token && registrationSuccess.data?.status === 'active') {
        try {
          await startTenantSessionWithRetry(registrationSuccess.data, activeDgfyToken);
          redirectToPos();
          return;
        } catch (sessionError) {
          setNotice(getTenantSessionFallbackMessage(sessionError));
        }
      }
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceedToPos = useCallback(async () => {
    setError(''); setNotice('');
    const activeDgfyToken = dgfyToken || getStoredDgfyToken();
    if (!success?.data?.company_token || success?.data?.status !== 'active') {
      goToManualPosLogin();
      return;
    }
    setIsLoading(true);
    try {
      await startTenantSessionWithRetry(success.data, activeDgfyToken);
      redirectToPos();
    } catch (sessionError) {
      setNotice(getTenantSessionFallbackMessage(sessionError));
      goToManualPosLogin();
    } finally {
      setIsLoading(false);
    }
  }, [dgfyToken, goToManualPosLogin, redirectToPos, startTenantSessionWithRetry, success?.data]);

  const handleSignOutDgfy = async () => {
    dgfySessionGenerationRef.current += 1;
    await logoutDgfyAccount(dgfyToken).catch(() => clearDgfySession());
    setDgfyToken('');
    setDgfyAccount(null);
    setSuccess(null);
  };

  const goToAuth = useCallback((mode) => {
    navigate(`${mode === 'create-account' ? '/register' : '/login'}?intent=register-business&mode=${mode}&return_to=${encodeURIComponent(BUSINESS_GROW_PATH)}`);
  }, [navigate]);

  const renderContent = () => {
    if (success) {
      return (
        <div className="mx-auto w-full max-w-[500px]">
          <div className="rounded-[28px] border border-[#d8e8e3] bg-white p-8 shadow-sm">
            <CheckCircle2 className="mx-auto mb-4 h-14 w-14 text-[#0f7f73]" />
            <h1 className="text-center text-2xl font-bold text-[#132033]">Company Created</h1>
            <p className="mt-2 text-center text-sm text-slate-600">{success.message}</p>
            {notice && (
              <div className="mt-5 rounded-2xl border border-[#b7ded7] bg-[#eefaf7] p-3 text-sm text-[#0f766e]">
                {notice}
              </div>
            )}
            <div className="mt-6 rounded-2xl border border-[#d8e8e3] bg-[#f7fbfa] p-4">
              <p className="text-sm font-semibold text-[#132033]">{success.data?.name}</p>
              <p className="mt-1 text-sm text-slate-600">Business industry: {WORKFLOW_MODE_LABELS[success.data?.workflow_mode] || success.data?.workflow_mode}</p>
              <p className="mt-1 text-sm text-slate-600">Compliance starts as non-compliant. You can upgrade later in Settings &gt; Compliance.</p>
            </div>
            <Button
              className="mt-6 w-full bg-[#1f5f9f] hover:bg-[#174f86]"
              onClick={handleProceedToPos}
              disabled={isLoading}
            >
              {isLoading ? 'Opening POS...' : 'Proceed to POS'}
            </Button>
          </div>
        </div>
      );
    }

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
          {error && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="mt-8 flex flex-col gap-3">
            <button
              type="button"
              onClick={() => goToAuth('sign-in')}
              className="w-full rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90"
              style={{ background: '#1A4E8D', height: 48 }}
            >
              Register Company Using My DGFY Account
            </button>
            <button
              type="button"
              onClick={() => goToAuth('create-account')}
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

          <form onSubmit={handleSubmitCompany} className="space-y-5">
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

            <div>
              <Label htmlFor="companyName">Company Name</Label>
              <Input
                id="companyName"
                placeholder="Enter your company name"
                value={companyForm.companyName}
                onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                required
                minLength={3}
                maxLength={100}
                disabled={isLoading}
                className="mt-1"
              />
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

        <div className="mt-6 text-center text-sm text-slate-600">
          Already have a company?{' '}
          <a href={resolvePosTerminalUrl()} className="font-medium text-[#1f5f9f] hover:text-[#174f86]">
            Sign in to POS
          </a>
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
      {/* ── LEFT: Hero panel — hidden on mobile ─────────────── */}
      <div className="hidden lg:flex lg:w-[45%]">
        <DgfyAuthHero homeHref={STOREFRONT_HOME_URL} businessRegistrationTo={BUSINESS_GROW_PATH} />
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
