import React, { useEffect, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from '../Layout.jsx'
import AdminLayout from '../Components/admin/AdminLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { PermissionProvider } from './store/PermissionContext.jsx'
import { WorkflowModeProvider } from './features/settings/WorkflowModeContext.jsx'
import WorkflowModeRouteGate from './features/settings/components/WorkflowModeRouteGate.jsx'
import { getPageNameFromPath } from '../utils.js'
import { getAccessToken, refreshBrowserSession, setBrowserSession } from './services/browserSession.js'
import { login as loginTenantSession, getCurrentUser } from './services/authService.js'
import { shouldRefreshBrowserSessionForPath } from './services/publicRoutePolicy.js'
import ErrorBoundary from './components/common/ErrorBoundary.jsx' // Fix 10.3
import NotFoundPage from './components/common/NotFoundPage.jsx'
import GlobalApiErrorListener from './components/common/GlobalApiErrorListener.jsx'
import { Toaster } from '@/components/ui/sonner'
import { getRuntimeConfig } from './utils/runtimeConfig.js'
import { initBrowserSentry } from './observability/sentryClient.js'
import {
  capturePageview,
  identifyAnalyticsUser,
  initBrowserAnalytics,
  resetAnalyticsIdentity,
  setAnalyticsContext
} from './observability/analyticsClient.js'
import './index.css'

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`
const runtimeConfig = getRuntimeConfig(import.meta.env, typeof window !== 'undefined' ? window.location : undefined)
const RootRouter = runtimeConfig.isDesktopShell ? HashRouter : BrowserRouter
const devAutoLoginEnabled = String(import.meta.env.VITE_DEV_AUTO_LOGIN_ENABLED || '').trim().toLowerCase() === 'true'

initBrowserSentry({ surface: runtimeConfig.appSurface || 'skupervisor' })
// SKUpervisor previously had no PostHog init at all -- it's staff-facing
// (same consent basis as POS: employment relationship, not the storefront's
// anonymous-visitor consent banner), so behavioral analytics apply here too.
initBrowserAnalytics({ surface: runtimeConfig.appSurface || 'skupervisor' })

const shouldRunDevAutoLogin = () => {
  if (!import.meta.env.DEV) return false
  if (!devAutoLoginEnabled) return false
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

// Lazy-loaded pages â€” each page is a separate JS chunk downloaded on first visit
const Dashboard = lazy(() => import('../Pages/Dashboard.jsx'))
const Items = lazy(() => import('./features/inventory/pages/ItemsPage.jsx'))
const Suppliers = lazy(() => import('../Pages/Suppliers.jsx'))
const PurchaseOrders = lazy(() => import('../Pages/PurchaseOrders.jsx'))
const JobOrders = lazy(() => import('./features/jobOrders/pages/JobOrdersPage.jsx'))
const StockMovements = lazy(() => import('./features/stockMovements/pages/StockMovementsPage.jsx'))
const Services = lazy(() => import('./features/services/pages/ServicesPage.jsx'))
const Fnb = lazy(() => import('./features/fnb/pages/FnbPage.jsx'))
const Hospitality = lazy(() => import('./features/hospitality/pages/HospitalityPage.jsx'))
const Reports = lazy(() => import('../Pages/Reports.jsx'))
const Settings = lazy(() => import('../Pages/Settings.jsx'))
const Login = lazy(() => import('../Pages/Login.jsx'))
const Register = lazy(() => import('../Pages/Register.jsx'))
const RegisterCompany = lazy(() => import('../Pages/RegisterCompany.jsx'))
const DgfyAuthPage = lazy(() => import('../Pages/DgfyAuthPage.jsx'))
const DgfyResetPasswordPage = lazy(() => import('../Pages/DgfyResetPasswordPage.jsx'))
const LegalDocument = lazy(() => import('../Pages/LegalDocument.jsx'))
const AcceptInvite = lazy(() => import('../Pages/AcceptInvite.jsx'))
const Reactivate = lazy(() => import('../Pages/Reactivate.jsx'))
const MobileReceive = lazy(() => import('../Pages/MobileReceive.jsx'))
const DispatchOrders = lazy(() => import('../Pages/DispatchOrders.jsx'))
const AiChat = lazy(() => import('../Pages/AiChat.jsx'))
const POSPage = lazy(() => import('./features/pos/pages/SkupervisorPOSPage.jsx'))
const TerminalPage = lazy(() => import('./features/pos/pages/TerminalPage.jsx'))
const SalesPage = lazy(() => import('./features/sales/pages/SalesPage.jsx'))
const FeedbackDashboard = lazy(() => import('../Pages/admin/FeedbackDashboard.jsx'))
const TenantManager = lazy(() => import('../Pages/admin/TenantManager.jsx'))
const DgfyAccountManager = lazy(() => import('../Pages/admin/DgfyAccountManager.jsx'))
const PaymentOperations = lazy(() => import('../Pages/admin/PaymentOperations.jsx'))
const AdminPricing = lazy(() => import('../Pages/admin/AdminPricing.jsx'))
const HostingStatus = lazy(() => import('../Pages/admin/HostingStatus.jsx'))

function App() {
  const location = useLocation()
  const currentPageName = getPageNameFromPath(location.pathname)

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
  }, [location.pathname]);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <Routes>
        {/* Public routes - Login and Register pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-company" element={<RegisterCompany />} />
        <Route path="/dgfy/auth" element={<DgfyAuthPage />} />
        <Route path="/dgfy/reset-password" element={<DgfyResetPasswordPage />} />
        <Route path="/legal/:slug" element={<LegalDocument />} />
        <Route path="/privacy" element={<LegalDocument />} />
        <Route path="/accept-invite" element={<AcceptInvite />} />
        <Route path="/reactivate" element={<Reactivate />} />

        {/* Protected routes - require authentication */}
        <Route path="/" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/items" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <Items />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/suppliers" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <Suppliers />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/purchase-orders" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <PurchaseOrders />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/job-orders" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="productionWorkflows" moduleLabel="Job Orders">
              <Layout currentPageName={currentPageName}>
                <JobOrders />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/stock-movements" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="inventory" moduleLabel="Stock Movements">
              <Layout currentPageName={currentPageName}>
                <StockMovements />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/dispatch-orders" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="productionWorkflows" moduleLabel="Dispatch Orders">
              <Layout currentPageName={currentPageName}>
                <DispatchOrders />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <Reports />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/ai-chat" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate blockInMsme moduleLabel="AI Chat">
              <Layout currentPageName={currentPageName}>
                <AiChat />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        {/* Integrated POS inside the authenticated SKUpervisor application shell. */}
        <Route path="/pos" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <POSPage />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/services" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="services" moduleLabel="Services">
              <Layout currentPageName={currentPageName}>
                <Services />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/fnb" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="fnbDining" moduleLabel="Food & Beverage">
              <Layout currentPageName={currentPageName}>
                <Fnb />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/hospitality" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate requiredCapability="hospitalityReservations" moduleLabel="Hospitality">
              <Layout currentPageName={currentPageName}>
                <Hospitality />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        {/* Dedicated POS application surface; intentionally leaves the IMS shell. */}
        <Route path="/terminal" element={<TerminalPage />} />
        <Route path="/sales" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <SalesPage />
            </Layout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <Layout currentPageName={currentPageName}>
              <Settings />
            </Layout>
          </ProtectedRoute>
        } />

        {/* Mobile receive page - no sidebar layout for phone-first UX */}
        <Route path="/receive/:token" element={
          <ProtectedRoute>
            <MobileReceive />
          </ProtectedRoute>
        } />

        {/* Admin Portal - nested routes with AdminLayout */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/tenants" replace />} />
          <Route path="feedback" element={<FeedbackDashboard />} />
          <Route path="tenants" element={<TenantManager />} />
          <Route path="dgfy-accounts" element={<DgfyAccountManager />} />
          <Route path="payments" element={<PaymentOperations />} />
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="hosting" element={<HostingStatus />} />
        </Route>

         {/* Legacy route - redirect to new admin portal */}
         <Route path="/admin/feedback-old" element={<Navigate to="/admin/feedback" replace />} />
         <Route path="*" element={<NotFoundPage />} />
       </Routes>
    </Suspense>
  )
}

// Mirrors apps/pos/src/main.jsx's AnalyticsIdentitySync: resolves the
// signed-in staff member via getCurrentUser() (same call PermissionContext
// makes) on mount and on auth state changes, without expanding
// PermissionContext's public API just for analytics.
function AnalyticsIdentitySync() {
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;
        if (user?.id) {
          identifyAnalyticsUser({ id: user.id, role: user.role });
          setAnalyticsContext({ tenantId: user.company?.id, businessMode: user.company?.business_mode });
        } else {
          resetAnalyticsIdentity();
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
          <AnalyticsIdentitySync />
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
      const AUTO_EMAIL = 'admin@test.com';
      const AUTO_PASSWORD = 'Admin123!';
      const COMPANY_TOKEN = 'token-original';
      const TERMINAL_ID = 'COUNTER-01';

      const session = await loginTenantSession({
        email: AUTO_EMAIL,
        password: AUTO_PASSWORD,
        companyToken: COMPANY_TOKEN
      });
      if (session?.token) {
        localStorage.setItem('pos_terminal_identity_v1', TERMINAL_ID);
      }
    } catch (e) {
      // best-effort only; do not block app mount
      // console.warn('Auto-login failed', e);
    } finally {
      mountApp();
    }
  })();
} else {
  mountApp();
}
