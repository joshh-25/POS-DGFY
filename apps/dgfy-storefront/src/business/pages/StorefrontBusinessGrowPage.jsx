import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import DgfyAuthHero from '../../../../../packages/web-core/src/features/dgfy/components/DgfyAuthHero.jsx';
import {
  clearDgfySession,
  exchangeDgfyHandoff,
  fetchDgfyLegalTerms,
  fetchDgfyMe,
  getStoredDgfyAccount,
  getStoredDgfyToken,
  logoutDgfyAccount
} from '../../../../../packages/web-core/src/services/dgfyAuthService.js';
import { writeDgfyAuthToken } from '../../auth/storefrontSessionStorage.js';
import { buildBusinessRegistrationSubmissionPath } from '../model/businessRegistrationSubmission.js';
import CompanyRegistrationWizard from '../components/CompanyRegistrationWizard.jsx';

const BUSINESS_GROW_PATH = '/business/grow';
const STOREFRONT_HOME_URL = '/';

export default function StorefrontBusinessGrowPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const handoffExchangeStartedRef = useRef(false);
  const dgfySessionGenerationRef = useRef(0);

  const [dgfyToken, setDgfyToken] = useState(() => getStoredDgfyToken());
  const [dgfyAccount, setDgfyAccount] = useState(() => getStoredDgfyAccount());
  const [legalTerms, setLegalTerms] = useState(null);
  const [legalTermsError, setLegalTermsError] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

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
        setLegalTermsError('DGFY terms are temporarily unavailable. Registration cannot be submitted until the current terms load.');
      });
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

  useEffect(() => {
    const handoffToken = String(searchParams.get('handoff_token') || '').trim();
    if (!handoffToken || handoffExchangeStartedRef.current) return undefined;
    handoffExchangeStartedRef.current = true;
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
      });
    return undefined;
  }, [navigate, searchParams]);

  const handleSignOutDgfy = async () => {
    dgfySessionGenerationRef.current += 1;
    await logoutDgfyAccount(dgfyToken).catch(() => clearDgfySession());
    setDgfyToken('');
    setDgfyAccount(null);
  };

  const goToAuth = useCallback((mode) => {
    navigate(`${mode === 'create-account' ? '/register' : '/login'}?intent=register-business&mode=${mode}&return_to=${encodeURIComponent(BUSINESS_GROW_PATH)}`);
  }, [navigate]);

  const handleSubmitted = (result) => {
    const registrationData = result || {};
    if (registrationData.registration_id) {
      toast.success('Registration submitted for approval.');
      navigate(buildBusinessRegistrationSubmissionPath(registrationData.registration_id));
      return;
    }
    if (registrationData.application_id) {
      toast.success('Registration submitted for approval.');
      navigate(buildBusinessRegistrationSubmissionPath(registrationData.application_id));
      return;
    }
    if (!registrationData.registration_id && !registrationData.application_id) {
      const message = 'Registration submitted without a status reference. Please contact DGFY support.';
      setError(message);
      toast.error(message);
    }
  };

  const renderContent = () => {
    if (!dgfyAccount) {
      return (
        <div className="mx-auto w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#fef3c7] text-[#d97706]"><AlertTriangle className="h-8 w-8" aria-hidden="true" /></div>
          <h1 className="text-3xl font-bold tracking-tight text-[#0f172a]">Register Your Business</h1>
          <p className="mt-3 text-sm text-[#64748b]">To register a business, you must first have an active DGFY customer account.</p>
          {error ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
          <div className="mt-8 flex flex-col gap-3">
            <button type="button" onClick={() => goToAuth('sign-in')} className="h-12 w-full rounded-xl text-sm font-bold text-white transition-opacity hover:opacity-90" style={{ background: '#1A4E8D' }}>Register Company Using My DGFY Account</button>
            <button type="button" onClick={() => goToAuth('create-account')} className="h-12 w-full rounded-xl text-sm font-bold transition-opacity hover:bg-slate-50" style={{ color: '#1A4E8D', border: '1.5px solid #1A4E8D' }}>Create DGFY Account</button>
          </div>
        </div>
      );
    }

    return (
      <div className="w-full">
        {error ? <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{error}</div> : null}
        {notice ? <div className="mb-5 rounded-2xl border border-[#b7ded7] bg-[#eefaf7] p-3 text-sm text-[#0f766e]">{notice}</div> : null}
        {legalTermsError ? <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">{legalTermsError}</div> : null}
        <CompanyRegistrationWizard account={dgfyAccount} token={dgfyToken} legalTerms={legalTerms} onSubmitted={handleSubmitted} onSignOut={handleSignOutDgfy} />
        <div className="mt-6 text-center text-sm text-slate-600">Already have a company? <a href="/pos" className="font-medium text-[#1f5f9f] hover:text-[#174f86]">Sign in to POS</a></div>
      </div>
    );
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px]">
      <div className="hidden lg:flex lg:w-[38%]"><DgfyAuthHero homeHref={STOREFRONT_HOME_URL} businessRegistrationTo={BUSINESS_GROW_PATH} /></div>
      <div className="flex flex-1 flex-col justify-center overflow-y-auto bg-white" style={{ minHeight: '100vh' }}>
        <div className="mx-auto w-full max-w-[1040px] px-6 py-8 sm:px-8 sm:py-12">
          <div className="mb-8 flex items-center justify-center lg:hidden"><div className="flex h-10 w-10 items-center justify-center rounded-xl text-lg font-black text-white" style={{ background: '#1A4E8D' }}>D</div><span className="ml-3 text-2xl font-black tracking-tight" style={{ color: '#1A4E8D' }}>DGFY</span></div>
          {renderContent()}
        </div>
      </div>
    </div>
  );
}
