// Chrome 80-84 runtime polyfill -- must be the first import so it runs before any
// other module code. Same browser-support guards as the other apps (ADR 0067 / #666).
import '../../../packages/web-core/src/compat/chrome80Runtime.js';
import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ProtectedRoute from '../../../packages/web-core/src/components/ProtectedRoute.jsx';
import ErrorBoundary from '../../../packages/web-core/src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../packages/web-core/src/components/common/GlobalApiErrorListener.jsx';
import VersionBadge from '../../../packages/web-core/src/components/common/VersionBadge.jsx';
import { PermissionProvider } from '../../../packages/web-core/src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../packages/web-core/src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import { getCurrentUser } from '../../../packages/web-core/src/services/authService.js';
import { initBrowserSentry, identifySentryUser, resetSentryIdentity, setSentryContext, setSentryRoute } from '../../../packages/web-core/src/observability/sentryClient.js';
import {
  capturePageview,
  identifyAnalyticsUser,
  initBrowserAnalytics,
  resetAnalyticsIdentity,
  setAnalyticsContext
} from '../../../packages/web-core/src/observability/analyticsClient.js';
import { reloadOnceForChunkFailure } from '../../../packages/web-core/src/utils/chunkLoadRecovery.js';
import '../../../packages/web-core/src/index.css';

// Keep OPIS-only body portals (dialogs, menus, and notifications) on the same typography
// stack as the shell.
if (typeof document !== 'undefined') {
  document.body.setAttribute('data-opis-surface', 'opis');
}

// Vite's own dynamic-import helper (__vitePreload) fires this event on a chunk-load
// failure. React.lazy failures inside Suspense are handled by ErrorBoundary instead;
// this and that share the same one-shot reload budget (see chunkLoadRecovery.js).
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    reloadOnceForChunkFailure();
  });
}

function OpisRouteNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wide text-[#1A4E8D]">DGFY OPIS</p>
        <h1 className="mt-2 text-2xl font-black text-slate-950">Route not available</h1>
        <p className="mt-2 text-sm text-slate-600">
          This app serves the DGFY Back Office. Terminal operations stay on POS.
        </p>
        <Link
          to="/"
          className="mt-5 inline-flex h-11 items-center justify-center rounded-lg bg-[#1A4E8D] px-5 text-sm font-bold text-white hover:bg-[#143F73]"
        >
          Open Back Office
        </Link>
      </section>
    </main>
  );
}

function BusinessAdminAliasRoute() {
  const location = useLocation();
  const suffix = String(location.pathname || '').replace(/^\/business-admin/, '') || '/';
  const search = location.search || '';
  return <Navigate to={`/backoffice${suffix === '/' ? '/overview' : suffix}${search}`} replace />;
}

// `/` renders the Back Office overview directly (issue #2052 follow-up); the legacy
// `/backoffice/overview` URL redirects to `/` preserving the query string, mirroring
// BusinessAdminAliasRoute's pattern above.
function BackofficeOverviewRedirect() {
  const location = useLocation();
  const search = location.search || '';
  return <Navigate to={`/${search}`} replace />;
}

const DgfyAuthPage = lazy(() => import('../../../packages/web-core/Pages/DgfyAuthPage.jsx'));
const DgfyCompanySelect = lazy(() => import('../../../packages/web-core/Pages/DgfyCompanySelect.jsx'));
const RegisterCompany = lazy(() => import('../../../packages/web-core/Pages/RegisterCompany.jsx'));
const CompanyRegistrationStatus = lazy(() => import('../../../packages/web-core/Pages/CompanyRegistrationStatus.jsx'));
const MobileReceivePage = lazy(() => import('../../../packages/web-core/src/features/merchantBackOffice/pages/MobileReceivePage.jsx'));
const BusinessAdminPage = lazy(() => import('./features/businessAdmin/BusinessAdminPage.jsx'));

initBrowserSentry({ surface: 'opis' });
initBrowserAnalytics({ surface: 'opis' });

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    capturePageview({ path: location.pathname });
    setSentryRoute(location.pathname);
  }, [location.pathname]);

  return null;
}

// Identity resolution mirrors the other apps: getCurrentUser() on mount and whenever auth
// state changes. getCurrentUser() (GET /users/me) returns `user_id`, not `id`.
function ObservabilityIdentitySync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
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

const mountApp = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <ErrorBoundary>
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true
          }}
        >
          <AnalyticsRouteTracker />
          <ObservabilityIdentitySync />
          <VersionBadge label="OPIS" />
          <PermissionProvider>
            <WorkflowModeProvider>
              <GlobalApiErrorListener />
              <Toaster position="top-right" />
              <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading...</div>}>
                <Routes>
                  <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
                  <Route path="/dgfy/companies" element={<DgfyCompanySelect targetSurface="opis" />} />
                  <Route path="/register-company" element={<RegisterCompany />} />
                  <Route path="/register-company/status/:applicationId" element={<CompanyRegistrationStatus />} />
                  <Route path="/backoffice/*" element={<BusinessAdminPage />} />
                  <Route path="/backoffice/overview" element={<BackofficeOverviewRedirect />} />
                  <Route path="/business-admin/*" element={<BusinessAdminAliasRoute />} />
                  <Route path="/receive/:token" element={<ProtectedRoute><MobileReceivePage /></ProtectedRoute>} />
                  <Route path="/" element={<BusinessAdminPage />} />
                  <Route path="*" element={<OpisRouteNotFound />} />
                </Routes>
              </Suspense>
            </WorkflowModeProvider>
          </PermissionProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </React.StrictMode>
  );
};

mountApp();
