import React, { Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import TerminalPage from '../../../src/features/pos/pages/TerminalPage.jsx';
import ErrorBoundary from '../../../src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../src/components/common/GlobalApiErrorListener.jsx';
import { PermissionProvider } from '../../../src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import { buildSkupervisorPath } from '../../../src/features/pos/utils/skupervisorHandoff.js';
import { login as loginTenantSession } from '../../../src/services/authService.js';
import { getCurrentUser } from '../../../src/services/authService.js';
import { initBrowserSentry, identifySentryUser, resetSentryIdentity, setSentryContext, setSentryRoute } from '../../../src/observability/sentryClient.js';
import {
  capturePageview,
  identifyAnalyticsUser,
  initBrowserAnalytics,
  resetAnalyticsIdentity,
  setAnalyticsContext
} from '../../../src/observability/analyticsClient.js';
import { reloadOnceForChunkFailure } from '../../../src/utils/chunkLoadRecovery.js';
import '../../../src/index.css';

// Vite's own dynamic-import helper (__vitePreload) fires this event on a
// chunk-load failure -- it's the only thing that catches the idle-time
// preloadWorkspaces() prefetch in TerminalPageLayout, which sits outside
// any Suspense boundary and would otherwise surface as an unhandled
// promise rejection. React.lazy failures inside Suspense are handled by
// ErrorBoundary instead; this and that share the same one-shot reload
// budget (see chunkLoadRecovery.js).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnceForChunkFailure();
  });
}

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
const enableDevAutoLogin = import.meta.env.DEV && import.meta.env.VITE_POS_DEV_AUTO_LOGIN === 'true';
const devAutoLoginCompanyToken = String(import.meta.env.VITE_POS_DEV_COMPANY_TOKEN || 'token-original').trim();
const devAutoLoginEmail = String(import.meta.env.VITE_POS_DEV_EMAIL || 'admin@test.com').trim();
const devAutoLoginPassword = String(import.meta.env.VITE_POS_DEV_PASSWORD || 'Admin123!').trim();
const POS_DEV_SERVICE_WORKER_RESET_MARKER = 'dgfy_pos_dev_service_worker_reset_v1';

initBrowserSentry({ surface: 'pos' });
initBrowserAnalytics({ surface: 'pos' });

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    capturePageview({ path: location.pathname });
    setSentryRoute(location.pathname);
  }, [location.pathname]);

  return null;
}

// Cashier identity isn't known at mount (TerminalPage.jsx owns the login
// flow); resolve it the same way PermissionContext does -- via
// getCurrentUser() -- on mount and whenever auth state changes, rather than
// reaching into the 4,892-line TerminalPage component. Feeds both PostHog
// and Sentry from this single lookup.
function ObservabilityIdentitySync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        // getCurrentUser() (GET /users/me) returns `user_id`, not `id` --
        // backend/src/services/userService.js's attribute list never
        // selects `id`. Checking `user?.id` here was always false, so this
        // sync silently fell through to resetSentryIdentity() on every
        // call, and every POS Sentry event reported 0 users regardless of
        // who was signed in.
        const userId = user?.user_id || user?.id;
        if (userId) {
          identifyAnalyticsUser({ id: userId, role: user.role });
          setAnalyticsContext({ tenantId: user.company?.id, businessMode: user.company?.business_mode });
          identifySentryUser({ id: userId, role: user.role });
          setSentryContext({ tenantId: user.company?.id, businessMode: user.company?.business_mode });
        } else {
          resetAnalyticsIdentity();
          resetSentryIdentity();
        }
      } catch {
        // Identity sync is best-effort; a failed lookup just leaves the
        // anonymous PostHog id in place.
      }
    };

    sync();
    window.addEventListener('auth:login', sync);
    window.addEventListener('auth:logout', sync);
    return () => {
      cancelled = true;
      window.removeEventListener('auth:login', sync);
      window.removeEventListener('auth:logout', sync);
    };
  }, []);

  return null;
}

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

const resetStaleDevelopmentServiceWorkers = async () => {
  if (typeof window === 'undefined' || !import.meta.env.DEV) return false;
  if (!('serviceWorker' in navigator)) return false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const hasController = Boolean(navigator.serviceWorker.controller);
    if (registrations.length === 0 && !hasController) {
      window.sessionStorage.removeItem(POS_DEV_SERVICE_WORKER_RESET_MARKER);
      return false;
    }

    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith('sku-admin-') || cacheName.startsWith('sku-pos-'))
          .map((cacheName) => window.caches.delete(cacheName))
      );
    }

    if (window.sessionStorage.getItem(POS_DEV_SERVICE_WORKER_RESET_MARKER) !== 'reloaded') {
      window.sessionStorage.setItem(POS_DEV_SERVICE_WORKER_RESET_MARKER, 'reloaded');
      window.location.reload();
      return true;
    }
    window.sessionStorage.removeItem(POS_DEV_SERVICE_WORKER_RESET_MARKER);
  } catch {
    // A stale local worker must never prevent the POS app from mounting.
  }
  return false;
};

const mountApp = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <HashRouter>
          <AnalyticsRouteTracker />
          <ObservabilityIdentitySync />
          <PermissionProvider>
            <WorkflowModeProvider>
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
            </WorkflowModeProvider>
          </PermissionProvider>
        </HashRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

const bootstrapPosApp = async () => {
  if (await resetStaleDevelopmentServiceWorkers()) return;

  if (enableDevAutoLogin) {
    try {
      window.localStorage.setItem('pos_terminal_identity_v1', 'COUNTER-01');

      await loginTenantSession({
        email: devAutoLoginEmail,
        password: devAutoLoginPassword,
        companyToken: devAutoLoginCompanyToken
      });
    } catch {
      // Local POS auto-login is best-effort only.
    } finally {
      mountApp();
    }
  } else {
    mountApp();
  }

  registerPosServiceWorker();
};

bootstrapPosApp();
