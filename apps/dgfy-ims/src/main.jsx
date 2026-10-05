// Chrome 80-84 iMin WebView runtime polyfill -- must be the first import so it
// runs before any other module code (including bundled deps like
// maplibre-gl). See ADR 0067 / #666.
import '../../../packages/web-core/src/compat/chrome80Runtime.js';
import React, { useEffect, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom'
import ProtectedRoute from '../../../packages/web-core/src/components/ProtectedRoute.jsx'
import { PermissionProvider } from '../../../packages/web-core/src/store/PermissionContext.jsx'
import { WorkflowModeProvider } from '../../../packages/web-core/src/features/settings/WorkflowModeContext.jsx'
import MerchantSurfaceRetired from './pages/MerchantSurfaceRetired.jsx'
import { getAccessToken, refreshBrowserSession, setBrowserSession } from '../../../packages/web-core/src/services/browserSession.js'
import { login as loginTenantSession, getCurrentUser } from '../../../packages/web-core/src/services/authService.js'
import { shouldRefreshBrowserSessionForPath } from '../../../packages/web-core/src/services/publicRoutePolicy.js'
import ErrorBoundary from '../../../packages/web-core/src/components/common/ErrorBoundary.jsx' // Fix 10.3
import NotFoundPage from '../../../packages/web-core/src/components/common/NotFoundPage.jsx'
import GlobalApiErrorListener from '../../../packages/web-core/src/components/common/GlobalApiErrorListener.jsx'
import VersionBadge from '../../../packages/web-core/src/components/common/VersionBadge.jsx'
import { Toaster } from '@/components/ui/sonner'
import { getRuntimeConfig } from '../../../packages/web-core/src/utils/runtimeConfig.js'
import { initBrowserSentry, identifySentryUser, resetSentryIdentity, setSentryContext, setSentryRoute } from '../../../packages/web-core/src/observability/sentryClient.js'
import {
  capturePageview,
  identifyAnalyticsUser,
  initBrowserAnalytics,
  resetAnalyticsIdentity,
  setAnalyticsContext
} from '../../../packages/web-core/src/observability/analyticsClient.js'
import '../../../packages/web-core/src/index.css'

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`
const runtimeConfig = getRuntimeConfig(import.meta.env, typeof window !== 'undefined' ? window.location : undefined)
const RootRouter = runtimeConfig.isDesktopShell ? HashRouter : BrowserRouter
const devAutoLoginEnabled = String(import.meta.env.VITE_DEV_AUTO_LOGIN_ENABLED || '').trim().toLowerCase() === 'true'
const devAutoLoginEmail = String(import.meta.env.VITE_DEV_AUTO_LOGIN_EMAIL || '').trim()
const devAutoLoginPassword = String(import.meta.env.VITE_DEV_AUTO_LOGIN_PASSWORD || '').trim()
const devAutoLoginCompanyToken = String(import.meta.env.VITE_DEV_AUTO_LOGIN_COMPANY_TOKEN || '').trim()
const hasDevAutoLoginCredentials = Boolean(
  devAutoLoginEmail && devAutoLoginPassword && devAutoLoginCompanyToken
)

// backendOrigin is resolved at runtime from the desktop preload bridge, so
// it is invisible to the build-time-only trace-propagation resolver. Without
// passing it explicitly, the Electron shell would never attach
// sentry-trace/baggage to its API calls and its errors could not be
// correlated with the backend's.
initBrowserSentry({
  surface: runtimeConfig.appSurface || 'skupervisor',
  extraTracePropagationTargets: [runtimeConfig.backendOrigin].filter(Boolean)
})
// SKUpervisor previously had no PostHog init at all -- it's staff-facing
// (same consent basis as POS: employment relationship, not the storefront's
// anonymous-visitor consent banner), so behavioral analytics apply here too.
initBrowserAnalytics({ surface: runtimeConfig.appSurface || 'skupervisor' })

const shouldRunDevAutoLogin = () => {
  if (!import.meta.env.DEV) return false
  if (!devAutoLoginEnabled) return false
  if (!hasDevAutoLoginCredentials) return false
  if (typeof window === 'undefined') return false
  const pathname = String(window.location?.pathname || '/')
  if (pathname === '/terminal' || pathname.startsWith('/terminal/')) return false
  return shouldRefreshBrowserSessionForPath(pathname)
}

const applyDesktopShellBootstrap = () => {
  if (typeof window === 'undefined') return
  if (!runtimeConfig.isDesktopShell) return

  try {
    if (runtimeConfig.companyToken) {
      setBrowserSession({ companyToken: runtimeConfig.companyToken })
    }
    if (runtimeConfig.terminalId) {
      window.localStorage.setItem('pos_terminal_identity_v1', runtimeConfig.terminalId)
    }
  } catch {
    // Shell bootstrap values are optional and should not block app mount.
  }
}

const registerAdminServiceWorker = async () => {
  if (typeof window === 'undefined') return
  if (import.meta.env.DEV) return
  if (runtimeConfig.isDesktopShell) return
  if (!('serviceWorker' in navigator)) return

  try {
    const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' })
    const contentType = String(probe.headers.get('content-type') || '').toLowerCase()
    const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript')
    if (!probe.ok || !scriptLike) return

    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: appBasePath === '/' ? '/' : `${appBasePath}/`
    })
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' })
    }
  } catch {
    // Service worker support is optional and should not block the admin shell.
  }
}

// Auth, invite, legal, and platform-admin routes remain as compatibility and
// internal support surfaces. Merchant operations now belong to POS Back Office.
const Login = lazy(() => import('../Pages/Login.jsx'))
const Register = lazy(() => import('../Pages/Register.jsx'))
const RegisterCompany = lazy(() => import('../../../packages/web-core/Pages/RegisterCompany.jsx'))
const CompanyRegistrationStatus = lazy(() => import('../../../packages/web-core/Pages/CompanyRegistrationStatus.jsx'))
const DgfyAuthPage = lazy(() => import('../../../packages/web-core/Pages/DgfyAuthPage.jsx'))
const DgfyCompanySelect = lazy(() => import('../../../packages/web-core/Pages/DgfyCompanySelect.jsx'))
const DgfyResetPasswordPage = lazy(() => import('../Pages/DgfyResetPasswordPage.jsx'))
const LegalDocument = lazy(() => import('../Pages/LegalDocument.jsx'))
const AcceptInvite = lazy(() => import('../Pages/AcceptInvite.jsx'))
const Reactivate = lazy(() => import('../Pages/Reactivate.jsx'))

const LegacyMerchantRoute = ({ target = '/backoffice/overview', title }) => (
  <ProtectedRoute>
    <MerchantSurfaceRetired target={target} title={title} />
  </ProtectedRoute>
)

function LegacyReceiveRoute() {
  const { token } = useParams()
  const safeToken = encodeURIComponent(String(token || '').trim())
  return <LegacyMerchantRoute target={`/receive/${safeToken}`} title="Receiving workspace moved" />
}

function App() {
  const location = useLocation()

  /* 
   * Authentication is handled by ProtectedRoute components. 
   * Global auth check can be added here if needed in future.
   */
  useEffect(() => {
    if (!shouldRefreshBrowserSessionForPath(location.pathname)) return;
    if (getAccessToken()) return;
    refreshBrowserSession().catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    capturePageview({ path: location.pathname });
    setSentryRoute(location.pathname);
  }, [location.pathname]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <Routes>
        {/* Public routes - Login and Register pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/register-company/status/:applicationId" element={<CompanyRegistrationStatus />} />
        <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
        <Route path="/dgfy/companies" element={<DgfyCompanySelect />} />
        <Route path="/dgfy/reset-password" element={<DgfyResetPasswordPage />} />
        <Route path="/legal/:slug" element={<LegalDocument />} />
        <Route path="/privacy" element={<LegalDocument />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/reactivate" element={<Reactivate />} />

        {/* Merchant operations have moved to POS Back Office. Keep these URLs
            as a safe, authenticated handoff for old bookmarks and QR links. */}
        <Route path="/" element={<LegacyMerchantRoute />} />
        <Route path="/items" element={<LegacyMerchantRoute target="/backoffice/catalog" title="Catalog workspace moved" />} />
        <Route path="/suppliers" element={<LegacyMerchantRoute target="/backoffice/suppliers" title="Supplier workspace moved" />} />
        <Route path="/purchase-orders" element={<LegacyMerchantRoute target="/backoffice/purchase-orders" title="Purchase-order workspace moved" />} />
        <Route path="/job-orders" element={<LegacyMerchantRoute target="/backoffice/job-orders" title="Job-order workspace moved" />} />
        <Route path="/stock-movements" element={<LegacyMerchantRoute target="/backoffice/stock-movements" title="Inventory workspace moved" />} />
        <Route path="/dispatch-orders" element={<LegacyMerchantRoute target="/backoffice/dispatch-orders" title="Dispatch workspace moved" />} />
        <Route path="/reports" element={<LegacyMerchantRoute target="/backoffice/reports" title="Reports workspace moved" />} />
        <Route path="/ai-chat" element={<LegacyMerchantRoute target="/backoffice/ai-chat" title="Assistant workspace moved" />} />
        <Route path="/pos" element={<LegacyMerchantRoute target="/terminal" title="POS terminal moved" />} />
        <Route path="/services" element={<LegacyMerchantRoute target="/backoffice/services" title="Services workspace moved" />} />
        <Route path="/fnb" element={<LegacyMerchantRoute target="/backoffice/fnb" title="Food-and-beverage workspace moved" />} />
        <Route path="/hospitality" element={<LegacyMerchantRoute target="/backoffice/hospitality" title="Hospitality workspace moved" />} />
        <Route path="/terminal" element={<MerchantSurfaceRetired target="/terminal" title="POS terminal moved" />} />
        <Route path="/sales" element={<LegacyMerchantRoute target="/backoffice/sales" title="Sales workspace moved" />} />
        <Route path="/settings" element={<LegacyMerchantRoute target="/backoffice/settings" title="Settings workspace moved" />} />
        <Route path="/receive/:token" element={<LegacyReceiveRoute />} />

         <Route path="*" element={<NotFoundPage />} />
       </Routes>
    </Suspense>
  )
}

// Mirrors apps/dgfy-pos/src/main.jsx's identity sync: resolves the signed-in
// staff member via getCurrentUser() (same call PermissionContext makes) on
// mount and on auth state changes, without expanding PermissionContext's
// public API. Feeds both PostHog and Sentry from this single lookup rather
// than polling getCurrentUser() twice.
function ObservabilityIdentitySync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        // getCurrentUser() (GET /users/me) returns `user_id`, not `id` --
        // apps/dgfy-api/src/services/userService.js's attribute list never
        // selects `id`. Checking `user?.id` here was always false, so this
        // sync silently fell through to resetSentryIdentity() on every
        // call, and every Sentry event reported 0 users regardless of who
        // was signed in.
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

const rootElement = document.getElementById('root');

const mountApp = () => {
  applyDesktopShellBootstrap()
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ErrorBoundary>
        <RootRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <ObservabilityIdentitySync />
          <VersionBadge label="IMS" />
          <PermissionProvider>
            <WorkflowModeProvider>
              <GlobalApiErrorListener />
              <Toaster position="top-right" />
              <App />
            </WorkflowModeProvider>
          </PermissionProvider>
        </RootRouter>
      </ErrorBoundary>
    </React.StrictMode>,
  )

  registerAdminServiceWorker()
}

// Dev-only auto-login: opt-in local convenience for protected IMS routes only.
// DGFY auth and POS terminal lock routes must render without hidden tenant login.
if (shouldRunDevAutoLogin()) {
  (async () => {
    try {
      const TERMINAL_ID = 'COUNTER-01';

      const session = await loginTenantSession({
        email: devAutoLoginEmail,
        password: devAutoLoginPassword,
        companyToken: devAutoLoginCompanyToken
      });
      if (session?.token) {
        localStorage.setItem('pos_terminal_identity_v1', TERMINAL_ID);
      }
    } catch {
      // best-effort only; do not block app mount
      // console.warn('Auto-login failed', e);
    } finally {
      mountApp();
    }
  })();
} else {
  mountApp();
}
