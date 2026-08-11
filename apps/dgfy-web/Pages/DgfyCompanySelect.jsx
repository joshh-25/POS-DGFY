import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Building2, CheckCircle2, Clock, Loader2, LogOut } from 'lucide-react';
import dgfyLogo from '../src/assets/dgfy/dgfy-logo.png';
import {
  acceptDgfyInvitation,
  exchangeDgfyHandoff,
  fetchDgfyMe,
  getStoredDgfyToken,
  listDgfyAccountCompanies,
  logoutDgfyAccount,
  startDgfyTenantSession
} from '../src/services/dgfyAuthService.js';
import { preparePosDgfyTenantHandoff } from '../src/services/browserSession.js';
import { buildDgfyAuthPath, DGFY_COMPANY_SELECT_ROUTE, sanitizeInternalReturnPath } from '../src/features/dgfyRouteHelpers.js';

const handleDgfyLogoError = (event) => {
  const image = event.currentTarget;
  image.style.display = 'none';
  image.parentElement?.setAttribute('data-logo-fallback', 'DGFY');
};

// Loop guard for the `next` target: never land the user back on an auth
// route once a tenant session has been established. sanitizeInternalReturnPath
// also handles the open-redirect side (single-slash paths only, no `//`).
const SKUPERVISOR_AUTH_ROUTE_PATTERN = /^\/(login|dgfy\/auth|dgfy\/companies|dgfy\/reset-password)(?:[/?#]|$)/i;

// Companies this DGFY account can actually open. `can_switch` already means
// "accepted membership + active tenant" (see serializeCompanyMembership in
// backend/src/modules/dgfy/usecases/dgfyAuthUseCases.js).
const isSwitchable = (company) => Boolean(company?.can_switch);
const isPendingInvite = (company) => company?.requires_action === 'accept_invitation';
const isUnavailable = (company) => company?.requires_action === 'unavailable';

/**
 * SKUpervisor's landing spot for a signed-in DGFY account that does not yet
 * have a SKUpervisor tenant session. A DGFY account and a SKUpervisor
 * session are two different things (see ProtectedRoute.jsx) - this page is
 * the missing bridge: it optionally exchanges an inbound cross-app handoff
 * token, confirms the DGFY session, lists the account's company
 * memberships, and starts a tenant session for the one the user picks
 * (or picks it automatically when there is exactly one, or a `tenant_id`
 * hint names one).
 */
export default function DgfyCompanySelect({ targetSurface = 'skupervisor' } = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const destinationLabel = String(targetSurface || '').trim().toLowerCase() === 'pos' ? 'DGFY POS' : 'SKUpervisor';
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [nextPath, setNextPath] = useState('/');
  const [selectingTenantId, setSelectingTenantId] = useState(null);
  const [acceptingMembershipId, setAcceptingMembershipId] = useState(null);
  const [actionError, setActionError] = useState('');

  const loadCompanies = useCallback(async () => {
    const data = await listDgfyAccountCompanies();
    setCompanies(Array.isArray(data?.companies) ? data.companies : []);
    return data;
  }, []);

  // Shared by the auto-select path below and the manual "Continue" button -
  // starting a tenant session is the same call either way, only the trigger
  // differs.
  const activateCompany = useCallback(async (tenantId, targetPath) => {
    setSelectingTenantId(tenantId);
    setActionError('');
    try {
      const targetPathname = String(targetPath || '').split('?')[0].trim();
      const tenantSession = await startDgfyTenantSession({
        tenantId,
        ...(targetPathname === '/terminal' ? { accessScope: 'pos' } : {})
      });
      if (String(targetSurface || '').trim().toLowerCase() === 'pos' && targetPathname === '/terminal') {
        preparePosDgfyTenantHandoff({
          tenantId: tenantSession?.company?.id || tenantId
        });
      }
      navigate(targetPath, { replace: true });
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || 'Unable to start a session for this company. Try again.');
      setSelectingTenantId(null);
      setStatus('ready');
    }
  }, [navigate, targetSurface]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      const currentUrl = new URL(window.location.href);
      const routeSearchParams = new URLSearchParams(String(location.search || '').trim() || currentUrl.search);
      const handoffToken = String(routeSearchParams.get('handoff_token') || '').trim();
      const tenantIdHint = String(routeSearchParams.get('tenant_id') || '').trim();
      const requestedNext = sanitizeInternalReturnPath(routeSearchParams.get('next') || '/', {
        blockedPattern: SKUPERVISOR_AUTH_ROUTE_PATTERN
      });
      if (!cancelled) setNextPath(requestedNext);

      // Strip both the handoff token and the resolved return target from the
      // URL bar before any await, same as
      // apps/store/src/shared/hooks/useStorefrontSession.js - neither should
      // linger in history or leak via Referer.
      if (handoffToken) {
        routeSearchParams.delete('handoff_token');
        const remainingSearch = routeSearchParams.toString();
        if (currentUrl.hash.startsWith('#/')) {
          const hashPath = currentUrl.hash.slice(1).split('?')[0] || DGFY_COMPANY_SELECT_ROUTE;
          currentUrl.search = '';
          currentUrl.hash = `#${hashPath}${remainingSearch ? `?${remainingSearch}` : ''}`;
        } else {
          currentUrl.search = remainingSearch ? `?${remainingSearch}` : '';
        }
        window.history.replaceState({}, '', currentUrl.toString());
        try {
          // soft_fail: an expired/already-consumed token should fall through
          // to the fetchDgfyMe check below (which will bounce to /dgfy/auth)
          // rather than showing this page as a hard error.
          await exchangeDgfyHandoff(handoffToken, { softFail: true });
        } catch {
          // Network-level failure only - soft_fail already resolves an
          // invalid/expired token without throwing.
        }
      }

      try {
        await fetchDgfyMe(getStoredDgfyToken());
      } catch {
        if (cancelled) return;
        const remainingSearch = routeSearchParams.toString();
        navigate(buildDgfyAuthPath({ returnTo: `${DGFY_COMPANY_SELECT_ROUTE}${remainingSearch ? `?${remainingSearch}` : ''}` }), { replace: true });
        return;
      }
      if (cancelled) return;

      try {
        const data = await loadCompanies();
        if (cancelled) return;
        const switchable = (data?.companies || []).filter(isSwitchable);
        const hinted = tenantIdHint ? switchable.find((company) => String(company.tenant_id) === tenantIdHint) : null;
        const autoTarget = hinted || (switchable.length === 1 ? switchable[0] : null);
        if (autoTarget) {
          await activateCompany(autoTarget.tenant_id, requestedNext);
          return;
        }
        if (!cancelled) setStatus('ready');
      } catch (requestError) {
        if (cancelled) return;
        setError(requestError?.response?.data?.message || 'Unable to load your companies. Try again.');
        setStatus('error');
      }
    };

    bootstrap();
    return () => { cancelled = true; };
  }, [activateCompany, loadCompanies, location.search, navigate]);

  const handleAcceptInvitation = async (membershipId) => {
    setAcceptingMembershipId(membershipId);
    setActionError('');
    try {
      await acceptDgfyInvitation(membershipId);
      await loadCompanies();
    } catch (requestError) {
      setActionError(requestError?.response?.data?.message || 'Unable to accept this invitation. Try again.');
    } finally {
      setAcceptingMembershipId(null);
    }
  };

  const handleSignOut = async () => {
    try { await logoutDgfyAccount(); } catch { /* best-effort; navigate regardless */ }
    navigate(buildDgfyAuthPath(), { replace: true });
  };

  const switchable = companies.filter(isSwitchable).sort((a, b) => Number(b.is_owner) - Number(a.is_owner));
  const pendingInvites = companies.filter(isPendingInvite);
  const unavailable = companies.filter(isUnavailable);
  const isEmpty = status === 'ready' && !switchable.length && !pendingInvites.length && !unavailable.length;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-4 py-10">
      <div className="w-full max-w-lg">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <div className="flex justify-center mb-4">
              <span className="relative inline-flex min-h-16 min-w-28 items-center justify-center rounded-xl text-2xl font-black tracking-tight text-[#1A4E8D] before:content-[attr(data-logo-fallback)]">
                <img src={dgfyLogo} alt="DGFY" className="h-16 w-auto object-contain" onError={handleDgfyLogoError} />
              </span>
            </div>
            <p className="text-slate-600 mt-2">Choose a business to open in {destinationLabel}</p>
          </div>

          {status === 'loading' && (
            <div className="flex flex-col items-center gap-3 py-10 text-slate-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">Loading your businesses…</p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
              <Button type="button" className="w-full" onClick={() => window.location.reload()}>Try again</Button>
            </div>
          )}

          {status === 'ready' && (
            <div className="space-y-6">
              {actionError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">{actionError}</div>
              )}

              {isEmpty && (
                <div className="text-center space-y-4 py-4">
                  <p className="text-slate-600 text-sm">This DGFY account isn&apos;t linked to any business yet.</p>
                  <Button asChild className="w-full"><Link to="/register-company">Register a business</Link></Button>
                </div>
              )}

              {switchable.length > 0 && (
                <div className="space-y-2">
                  {switchable.map((company) => (
                    <button
                      key={company.membership_id}
                      type="button"
                      onClick={() => activateCompany(company.tenant_id, nextPath)}
                      disabled={selectingTenantId !== null}
                      className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-4 text-left transition hover:border-[#1A4E8D] hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center gap-3 min-w-0">
                        <Building2 className="h-5 w-5 text-slate-400 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 truncate">{company.company_name}</span>
                          <span className="block text-xs text-slate-500 capitalize">{company.is_owner ? 'Owner' : company.role}</span>
                        </span>
                      </span>
                      {selectingTenantId === company.tenant_id
                        ? <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                        : <span className="text-xs font-medium text-[#1A4E8D] shrink-0">Continue</span>}
                    </button>
                  ))}
                </div>
              )}

              {pendingInvites.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Pending invitations</p>
                  {pendingInvites.map((company) => (
                    <div key={company.membership_id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <span className="flex items-center gap-3 min-w-0">
                        <Clock className="h-5 w-5 text-amber-500 shrink-0" />
                        <span className="min-w-0">
                          <span className="block font-medium text-slate-900 truncate">{company.company_name}</span>
                          <span className="block text-xs text-slate-500 capitalize">Invited as {company.role}</span>
                        </span>
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={acceptingMembershipId !== null}
                        onClick={() => handleAcceptInvitation(company.membership_id)}
                      >
                        {acceptingMembershipId === company.membership_id
                          ? <Loader2 className="h-4 w-4 animate-spin" />
                          : <><CheckCircle2 className="h-4 w-4 mr-1" />Accept</>}
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {unavailable.length > 0 && (
                <div className="space-y-1">
                  {unavailable.map((company) => (
                    <div key={company.membership_id} className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                      <span className="font-medium text-slate-700">{company.company_name}</span> is unavailable right now
                      {company.tenant_status && company.tenant_status !== 'active' ? ` (${company.tenant_status})` : ''}.
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {status !== 'loading' && (
            <div className="mt-8 pt-4 border-t border-slate-100 flex items-center justify-between text-sm">
              <button type="button" onClick={handleSignOut} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800">
                <LogOut className="h-3.5 w-3.5" />
                Not you? Sign out
              </button>
              <Link to="/register-company" className="text-[#1A4E8D] hover:underline font-medium">Register a business</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
