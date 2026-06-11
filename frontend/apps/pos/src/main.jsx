import React, { Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Link, Route, Routes } from 'react-router-dom';
import TerminalPage from '../../../src/features/pos/pages/TerminalPage.jsx';
import ErrorBoundary from '../../../src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../src/components/common/GlobalApiErrorListener.jsx';
import { PermissionProvider } from '../../../src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import { buildSkupervisorPath } from '../../../src/features/pos/utils/skupervisorHandoff.js';
import { setBrowserSession } from '../../../src/services/browserSession.js';
import { resolveApiBaseUrl } from '../../../src/utils/runtimeConfig.js';
import '../../../src/index.css';

function PosRouteNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1A4E8D]">DGFY POS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Route not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          This standalone POS app serves the DGFY terminal. Sales reports open in SKUpervisor.
        </p>
        <Link
          to="/terminal"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#1A4E8D] px-5 text-sm font-bold text-white hover:bg-[#143F73]"
        >
          Open POS Terminal
        </Link>
      </section>
    </main>
  );
}

function SkupervisorSalesRedirect() {
  useEffect(() => {
    const query = typeof window === 'undefined' ? '' : window.location.search;
    window.location.replace(buildSkupervisorPath('/sales', query));
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1A4E8D]">DGFY POS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Opening SKUpervisor</h1>
        <p className="mt-2 text-sm text-slate-600">
          Sales reports are handled in the SKUpervisor app context.
        </p>
      </section>
    </main>
  );
}

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
const runtimeApiBaseUrl = resolveApiBaseUrl(import.meta.env, typeof window !== 'undefined' ? window.location : undefined);

const registerPosServiceWorker = async () => {
  if (typeof window === 'undefined') return;
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  try {
    const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
    const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
    const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
    if (!probe.ok || !scriptLike) return;

    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: appBasePath === '/' ? '/' : `${appBasePath}/`
    });
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
  } catch {
    // Service worker support is optional for local development.
  }
};

const mountApp = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <PermissionProvider>
          <WorkflowModeProvider>
            <HashRouter>
              <GlobalApiErrorListener />
              <Toaster position="top-right" />
              <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading...</div>}>
                <Routes>
                  <Route
                    path="/sales"
                    element={<SkupervisorSalesRedirect />}
                  />
                  <Route path="/" element={<TerminalPage />} />
                  <Route path="/terminal" element={<TerminalPage />} />
                  <Route path="/login" element={<TerminalPage />} />
                  <Route path="*" element={<PosRouteNotFound />} />
                </Routes>
              </Suspense>
            </HashRouter>
          </WorkflowModeProvider>
        </PermissionProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

if (import.meta.env.DEV) {
  (async () => {
    const companyToken = 'token-original';
    try {
      window.localStorage.setItem('companyToken', companyToken);
      window.localStorage.setItem('pos_terminal_identity_v1', 'COUNTER-01');

      const response = await fetch(`${runtimeApiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-company-token': companyToken
        },
        body: JSON.stringify({ email: 'admin@test.com', password: 'Admin123!' })
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success && body?.data?.token) {
        setBrowserSession({ token: body.data.token, companyToken });
        window.localStorage.setItem('authToken', body.data.token);
        if (body.data.refreshToken) {
          window.localStorage.setItem('refreshToken', body.data.refreshToken);
        }
        window.dispatchEvent(new CustomEvent('auth:login'));
      }
    } catch {
      // Local POS auto-login is best-effort only.
    } finally {
      mountApp();
    }
  })();
} else {
  mountApp();
}

registerPosServiceWorker();
