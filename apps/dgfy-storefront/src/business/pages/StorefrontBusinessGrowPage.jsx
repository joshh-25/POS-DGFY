import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Cross-app imports — same pattern as StorefrontAuthPage.jsx: the DGFY
// account/company API layer, workflow-mode labels, auth-page hero and shared
// UI primitives are shared logic living in frontend/src, not app-specific.
import api from '../../../../../../../packages/web-core/src/services/api.js';
import {
  clearDgfySession,
  dgfyAuthHeader,
  exchangeDgfyHandoff,
  fetchDgfyLegalTerms,
  fetchDgfyMe,
  getStoredDgfyAccount,
  getStoredDgfyToken,
  logoutDgfyAccount
} from '../../../../../../../packages/web-core/src/services/dgfyAuthService.js';
import DgfyAuthHero from '../../../../../../../packages/web-core/src/features/dgfy/components/DgfyAuthHero.jsx';
import { resolvePosTerminalUrl } from '../../../../../../../packages/web-core/src/features/dgfyRouteHelpers.js';
import IndustrySelect from '../../../../../../../packages/web-core/src/features/registration/IndustrySelect.jsx';

import { writeDgfyAuthToken } from '../../auth/storefrontSessionStorage.js';
import { resolveSkupervisorUrl } from '../../auth/storefrontSkupervisorLink.js';

const getFlowSnapshot = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.snapshot || {};
const getFlowDocuments = (legalTerms, flowKey) => legalTerms?.flows?.[flowKey]?.documents || [];
const hasCompanyLegalVersions = (snapshot = {}) => Boolean(
  snapshot.company_terms_version
  && snapshot.marketplace_terms_version
);
const BUSINESS_GROW_PATH = '/business/grow';
// Auth is same-origin as the storefront now, so the hero's links stay in-app.
const STOREFRONT_HOME_URL = '/';

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
    industryKey: '',
    industryTag: '',
    acceptedCompanyTerms: false
  });
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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

  const handleSubmitCompany = async (event) => {
    event.preventDefault();
    setError('');

    if (!dgfyAccount) {
      setError('Sign in with your DGFY account before registering a business.');
      return;
    }
    if (!companyForm.industryKey) {
      setError('Choose what kind of business this is before registering.');
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
        industryKey: companyForm.industryKey,
        industryTag: companyForm.industryTag,
        accepted_company_terms: true,
        company_terms_version: companyLegalSnapshot.company_terms_version,
        marketplace_terms_version: companyLegalSnapshot.marketplace_terms_version
      }, {
        withCredentials: true,
        skipTenantAuthHeaders: true,
        headers: dgfyAuthHeader()
      });

      if (!response.data?.success) throw new Error(response.data?.message || 'Registration failed');

      const registrationData = response.data.data || {};
      setCompanyForm((current) => ({ ...current, acceptedCompanyTerms: false }));
      toast.success('Registration submitted for approval.');

      if (registrationData.application_id) {
        window.location.assign(resolveSkupervisorUrl(`/register-company/status/${registrationData.application_id}`));
        return;
      }
      throw new Error('Registration submitted without an application reference. Please contact DGFY support.');
    } catch (err) {
      const message = err.response?.data?.message || err.message || 'Registration failed. Please try again.';
      setError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignOutDgfy = async () => {
    dgfySessionGenerationRef.current += 1;
    await logoutDgfyAccount(dgfyToken).catch(() => clearDgfySession());
    setDgfyToken('');
    setDgfyAccount(null);
  };

  const goToAuth = useCallback((mode) => {
    navigate(`${mode === 'create-account' ? '/register' : '/login'}?intent=register-business&mode=${mode}&return_to=${encodeURIComponent(BUSINESS_GROW_PATH)}`);
  }, [navigate]);

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
            <IndustrySelect
              idPrefix="business-grow-industry"
              value={companyForm.industryKey}
              disabled={isLoading}
              onSelect={(entry) => setCompanyForm({ ...companyForm, industryKey: entry.key })}
            />

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

            <div>
              <Label htmlFor="industryTag">Industry (optional)</Label>
              <Input
                id="industryTag"
                placeholder="e.g. coffee shop, hardware store, freelance repair"
                value={companyForm.industryTag}
                onChange={(e) => setCompanyForm({ ...companyForm, industryTag: e.target.value })}
                maxLength={120}
                disabled={isLoading}
                className="mt-1"
              />
              <p className="mt-1 text-xs text-slate-500">How you&apos;d describe your business, for your profile only — it doesn&apos;t change how DGFY works for you.</p>
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
