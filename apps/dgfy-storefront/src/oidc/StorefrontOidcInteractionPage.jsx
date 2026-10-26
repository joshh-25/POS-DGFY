import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  bindOidcInteraction,
  fetchOidcInteraction,
  prepareOidcCompletion,
  validateOidcCompletionUrl
} from './oidcInteractionService.js';

const shellClass = 'mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center px-4 py-10 sm:px-6';
const cardClass = 'w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-9';
const primaryButtonClass = 'min-h-12 rounded-xl bg-[#1A4E8D] px-5 py-3 text-sm font-bold text-white hover:bg-[#153f74] disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'min-h-12 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50';

const buildAuthPath = (mode, id, reason = '') => {
  const params = new URLSearchParams({ oidc_interaction_id: id, mode });
  if (reason) params.set('reason', reason);
  return `/${mode === 'create-account' ? 'register' : 'login'}?${params.toString()}`;
};

const safeErrorMessage = (error) => {
  const status = Number(error?.response?.status || 0);
  if (status === 410) return 'This sign-in request expired. Start again from DGLaundry.';
  if (status === 503) return 'DGFY sign-in is temporarily unavailable. Try again from DGLaundry.';
  return 'DGFY could not load this sign-in request. Start again from DGLaundry.';
};

export default function StorefrontOidcInteractionPage() {
  const { id = '' } = useParams();
  const [interaction, setInteraction] = useState(null);
  const [loadState, setLoadState] = useState('loading');
  const [error, setError] = useState('');
  const [isPreparing, setIsPreparing] = useState(false);
  const [accountConfirmed, setAccountConfirmed] = useState(false);
  const account = interaction?.account;
  const companies = Array.isArray(interaction?.companies) ? interaction.companies : [];
  const loginPath = useMemo(() => buildAuthPath('sign-in', id, 'signed-out'), [id]);
  const registerPath = useMemo(() => buildAuthPath('create-account', id, 'signed-out'), [id]);
  const canComplete = Boolean(interaction?.authenticated && (!interaction.prompt_login || interaction.fresh_auth_verified));
  const accountReady = canComplete && (!interaction?.prompt_select_account || accountConfirmed);

  useEffect(() => {
    let cancelled = false;
    setLoadState('loading');
    setError('');
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const handoff = fragment.get('oidc_handoff') || '';
    if (window.location.hash) {
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    }
    bindOidcInteraction(id, handoff)
      .then(() => fetchOidcInteraction(id))
      .then((data) => {
        if (cancelled) return;
        setInteraction(data);
        setLoadState('ready');
      })
      .catch((requestError) => {
        if (cancelled) return;
        if (requestError?.response?.status === 401) {
          setInteraction({ authenticated: false, companies: [] });
          setLoadState('ready');
          return;
        }
        setError(safeErrorMessage(requestError));
        setLoadState('error');
      });
    return () => { cancelled = true; };
  }, [id]);

  const continueWith = async (action, companyId = '') => {
    if (isPreparing) return;
    setError('');
    setIsPreparing(true);
    try {
      const result = await prepareOidcCompletion(id, { action, companyId });
      const completionUrl = validateOidcCompletionUrl(result?.completion_url);
      if (!completionUrl) throw new Error('The sign-in handoff is unavailable.');
      window.location.assign(completionUrl);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || 'DGFY could not prepare this sign-in. Try again.');
      if (requestError?.response?.status === 401) {
        setInteraction((current) => ({ ...current, authenticated: false, account: null, companies: [] }));
      }
    } finally {
      setIsPreparing(false);
    }
  };

  if (loadState === 'loading') {
    return <main className={shellClass}><section className={cardClass} aria-live="polite"><p className="text-sm text-slate-600">Loading secure sign-in…</p></section></main>;
  }

  if (loadState === 'error') {
    return (
      <main className={shellClass}>
        <section className={cardClass}>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#1A4E8D]">DGFY account</p>
          <h1 className="mt-3 text-2xl font-bold text-slate-900">Sign-in unavailable</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600" role="alert">{error}</p>
          <Link className="mt-6 inline-flex min-h-12 items-center rounded-xl bg-[#1A4E8D] px-5 text-sm font-bold text-white" to="/">Go to DGFY</Link>
        </section>
      </main>
    );
  }

  const showNewCompany = Boolean(interaction?.new_company_intent || companies.length === 0);
  return (
    <main className={shellClass}>
      <section className={cardClass}>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#1A4E8D]">DGFY account</p>
        <h1 className="mt-3 text-2xl font-bold text-slate-900 sm:text-3xl">Continue to DGLaundry</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Sign in with your DGFY account, then choose the DGLaundry company you want to use.</p>

        {error && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p>}

        {!interaction?.authenticated ? (
          <div className="mt-7 rounded-2xl bg-slate-50 p-5">
            <p className="text-sm text-slate-700">Use an existing DGFY account or create one to continue.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {interaction?.screen_hint === 'signup' ? (
                <>
                  <Link className={`${primaryButtonClass} inline-flex items-center justify-center`} to={registerPath} state={{ oidcLoginHint: interaction?.login_hint || '' }}>Create an account</Link>
                  <Link className={`${secondaryButtonClass} inline-flex items-center justify-center`} to={loginPath} state={{ oidcLoginHint: interaction?.login_hint || '' }}>I already have an account</Link>
                </>
              ) : (
                <>
                  <Link className={`${primaryButtonClass} inline-flex items-center justify-center`} to={loginPath} state={{ oidcLoginHint: interaction?.login_hint || '' }}>Sign in</Link>
                  <Link className={`${secondaryButtonClass} inline-flex items-center justify-center`} to={registerPath} state={{ oidcLoginHint: interaction?.login_hint || '' }}>Create an account</Link>
                </>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="mt-7 rounded-2xl border border-blue-100 bg-blue-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-800">Signed in as</p>
              <p className="mt-1 font-semibold text-slate-900">{[account?.first_name, account?.last_name].filter(Boolean).join(' ') || 'DGFY account'}</p>
              {account?.email && <p className="mt-1 break-all text-sm text-slate-600">{account.email}</p>}
              {interaction?.prompt_login && !interaction?.fresh_auth_verified && (
                <p className="mt-3 text-sm text-blue-900">DGLaundry asked you to confirm your password before continuing.</p>
              )}
            {interaction?.prompt_select_account && !accountConfirmed && (
              <button type="button" className={`${secondaryButtonClass} mt-4 w-full sm:w-auto`} onClick={() => setAccountConfirmed(true)}>
                Continue as {account?.email || 'this DGFY account'}
              </button>
            )}
              <Link className="mt-3 inline-block text-sm font-semibold text-[#1A4E8D] underline" to={loginPath} state={{ oidcLoginHint: interaction?.login_hint || '' }}>Use a different account</Link>
            </div>

            {accountReady && !interaction?.new_company_intent && companies.length > 0 && (
              <div className="mt-7">
                <h2 className="text-sm font-bold text-slate-900">Choose a DGLaundry company</h2>
                <div className="mt-3 grid gap-3">
                  {companies.map((company) => (
                    <button
                      key={company.id}
                      type="button"
                      disabled={isPreparing}
                      onClick={() => continueWith('company', company.id)}
                      className="flex min-h-14 items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left hover:border-[#1A4E8D] hover:bg-blue-50 disabled:opacity-50"
                    >
                      <span>
                        <span className="block font-semibold text-slate-900">{company.name}</span>
                        {company.role && <span className="mt-0.5 block text-xs capitalize text-slate-500">{company.role}</span>}
                      </span>
                      <span className="pl-3 text-sm font-bold text-[#1A4E8D]">Continue</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {accountReady && showNewCompany && (
              <div className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <h2 className="font-bold text-slate-900">Setting up a new DGLaundry company?</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">Continue with your DGFY identity. DGLaundry will guide you through company setup.</p>
                <button type="button" className={`${primaryButtonClass} mt-4 w-full sm:w-auto`} disabled={isPreparing} onClick={() => continueWith('create_company')}>
                  {isPreparing ? 'Preparing…' : 'Continue to company setup'}
                </button>
              </div>
            )}

            {interaction?.authenticated && interaction?.prompt_login && !interaction?.fresh_auth_verified && (
              <Link className={`${primaryButtonClass} mt-6 inline-flex w-full items-center justify-center`} to={loginPath} state={{ oidcLoginHint: account?.email || interaction?.login_hint || '' }}>Sign in again to continue</Link>
            )}
          </>
        )}

        <p className="mt-8 text-center text-xs leading-5 text-slate-500">Your DGFY password is sent only to DGFY. DGLaundry receives your identity and the company access you select.</p>
      </section>
    </main>
  );
}
