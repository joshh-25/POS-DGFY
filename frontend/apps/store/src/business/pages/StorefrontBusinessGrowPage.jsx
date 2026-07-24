import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { LogOut } from 'lucide-react';

// Cross-app imports — same pattern as StorefrontAuthPage.jsx: the DGFY
// account/company API layer and workflow-mode labels are shared logic
// living in frontend/src, not app-specific.
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
import { resolvePosTerminalUrl } from '../../../../../src/features/dgfyRouteHelpers.js';
import { WORKFLOW_MODE_LABELS, WORKFLOW_MODE_SELECT_VALUES } from '../../../../../src/features/settings/workflowMode.js';

import { writeDgfyAuthToken } from '../../auth/storefrontSessionStorage.js';
import StorefrontLegalAcknowledgement from '../../auth/components/StorefrontLegalAcknowledgement.jsx';

const wait = (ms) => new Promise((resolve) => window.setTimeout(resolve, ms));
const POS_ONBOARDING_ENTRY_SEARCH = '?setup_flow=tenant_onboarding&setup_step=storefront_setup';
const BUSINESS_GROW_PATH = '/business/grow';

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

const inputStyle = {
  height: 42,
  width: '100%',
  borderRadius: 10,
  border: '1px solid #CBD5E1',
  background: '#fff',
  fontSize: 14,
  color: '#0F172A',
  padding: '0 12px',
  boxSizing: 'border-box',
  marginTop: 6
};

function PrimaryBtn({ children, disabled, type = 'submit', onClick }) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
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

/**
 * The in-store replacement for skupervisor's `/register-company` page.
 * Same backend endpoint (POST /api/v1/admin/tenants/register, guarded by
 * authenticateDgfyAccount — any signed-in DGFY customer may register a new
 * business), same DGFY account, now hosted at dgfy.ph/business/grow instead
 * of a cross-app redirect.
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

  const companyLegalSnapshot = legalTerms?.flows?.company_registration?.snapshot || {};
  const companyLegalDocuments = legalTerms?.flows?.company_registration?.documents || [];
  const hasCompanyLegalVersions = Boolean(companyLegalSnapshot.company_terms_version && companyLegalSnapshot.marketplace_terms_version);
  const companyLegalTermsUnavailable = !legalTerms || Boolean(legalTermsError) || !hasCompanyLegalVersions;
  const companyLegalDisabledReason = legalTermsError
    || (!legalTerms ? 'Current DGFY company terms must load before registering a company.' : '')
    || (!hasCompanyLegalVersions ? 'Current DGFY company terms are incomplete. Company registration is disabled until the current terms are published.' : '');

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
    navigate(`${mode === 'create-account' ? '/register' : '/login'}?return_to=${encodeURIComponent(BUSINESS_GROW_PATH)}`);
  }, [navigate]);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', background: '#fff' }}>
      <div style={{ width: '100%', maxWidth: 560, padding: '48px 24px' }}>
        <div style={{ marginBottom: 32, display: 'flex', justifyContent: 'center' }}>
          <a href="/" aria-label="Back to DGFY storefront" style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em', color: '#ea580c', textDecoration: 'none' }}>DGFY</a>
        </div>

        {success ? (
          <div style={{ borderRadius: 20, border: '1px solid #E2E8F0', background: '#fff', padding: 32, textAlign: 'center' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0F172A' }}>Company Created</h1>
            <p style={{ marginTop: 8, fontSize: 14, color: '#64748B' }}>{success.message}</p>
            {notice ? <Banner tone="info">{notice}</Banner> : null}
            <div style={{ marginTop: 20, textAlign: 'left', borderRadius: 14, border: '1px solid #E2E8F0', background: '#F8FAFC', padding: 16 }}>
              <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>{success.data?.name}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>Business industry: {WORKFLOW_MODE_LABELS[success.data?.workflow_mode] || success.data?.workflow_mode}</p>
              <p style={{ margin: '6px 0 0', fontSize: 13, color: '#64748B' }}>Compliance starts as non-compliant. You can upgrade later in Settings &gt; Compliance.</p>
            </div>
            <div style={{ marginTop: 20 }}>
              <PrimaryBtn type="button" disabled={isLoading} onClick={handleProceedToPos}>
                {isLoading ? 'Opening POS…' : 'Proceed to POS'}
              </PrimaryBtn>
            </div>
          </div>
        ) : !dgfyAccount ? (
          <div style={{ textAlign: 'center' }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: '#0F172A' }}>Register Your Business</h1>
            <p style={{ marginTop: 12, fontSize: 14, color: '#64748B' }}>
              To register a business, you must first have an active DGFY customer account.
            </p>
            {error ? <Banner tone="error">{error}</Banner> : null}
            <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <PrimaryBtn type="button" onClick={() => goToAuth('sign-in')}>Register Company Using My DGFY Account</PrimaryBtn>
              <button
                type="button"
                onClick={() => goToAuth('create-account')}
                style={{ width: '100%', height: 46, borderRadius: 12, border: '1.5px solid #ea580c', background: '#fff', color: '#ea580c', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
              >
                Create DGFY Account
              </button>
            </div>
          </div>
        ) : (
          <div>
            {error ? <Banner tone="error">{error}</Banner> : null}
            {notice ? <Banner tone="info">{notice}</Banner> : null}

            <div ref={businessSectionRef} tabIndex={-1} style={{ display: 'flex', flexDirection: 'column', gap: 20, outline: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, borderRadius: 14, border: '1px solid #E2E8F0', background: '#F8FAFC', padding: 14 }}>
                <div>
                  <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
                    {[dgfyAccount.first_name, dgfyAccount.middle_name, dgfyAccount.last_name].filter(Boolean).join(' ')}
                  </p>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748B' }}>{dgfyAccount.email} · {dgfyAccount.phone}</p>
                </div>
                <button type="button" onClick={handleSignOutDgfy} aria-label="Sign out of DGFY" style={{ border: 'none', background: 'none', color: '#64748B', cursor: 'pointer', display: 'flex' }}>
                  <LogOut size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmitCompany} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div>
                  <label htmlFor="storefrontWorkflowMode" style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Business Industry</label>
                  <select
                    id="storefrontWorkflowMode"
                    value={companyForm.workflowMode}
                    onChange={(e) => setCompanyForm({ ...companyForm, workflowMode: e.target.value })}
                    disabled={isLoading}
                    style={inputStyle}
                  >
                    {businessIndustryOptions.map((mode) => (
                      <option key={mode.value} value={mode.value}>{mode.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="storefrontCompanyName" style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Company Name</label>
                  <input
                    id="storefrontCompanyName"
                    placeholder="Enter your company name"
                    value={companyForm.companyName}
                    onChange={(e) => setCompanyForm({ ...companyForm, companyName: e.target.value })}
                    required
                    minLength={3}
                    maxLength={100}
                    disabled={isLoading}
                    style={inputStyle}
                  />
                </div>

                <div style={{ borderRadius: 14, border: '1px solid #E2E8F0', background: '#F8FAFC', padding: 14 }}>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0F172A' }}>DGFY account connected</p>
                  <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748B' }}>
                    Company registration will use your DGFY account email, {dgfyAccount.email}, and phone. No additional DGFY email code is required for this registration.
                  </p>
                </div>

                <StorefrontLegalAcknowledgement
                  id="storefrontCompanyTerms"
                  checked={companyForm.acceptedCompanyTerms}
                  onChange={(e) => setCompanyForm({ ...companyForm, acceptedCompanyTerms: e.target.checked })}
                  disabled={isLoading || companyLegalTermsUnavailable}
                  disabledReason={companyLegalTermsUnavailable ? companyLegalDisabledReason : ''}
                  label="I have reviewed and agree to the current DGFY Company Registration Terms and Marketplace Provider Terms."
                  documents={companyLegalDocuments}
                  versionLabel={companyLegalSnapshot.marketplace_terms_version ? `Marketplace terms version ${companyLegalSnapshot.marketplace_terms_version}` : ''}
                />

                <PrimaryBtn disabled={isLoading || !companyForm.acceptedCompanyTerms || companyLegalTermsUnavailable}>
                  {isLoading ? 'Creating Company…' : 'Create Company'}
                </PrimaryBtn>
              </form>
            </div>

            <p style={{ marginTop: 24, textAlign: 'center', fontSize: 13, color: '#64748B' }}>
              Already have a company?{' '}
              <a href={resolvePosTerminalUrl()} style={{ fontWeight: 700, color: '#ea580c', textDecoration: 'none' }}>Sign in to POS</a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
