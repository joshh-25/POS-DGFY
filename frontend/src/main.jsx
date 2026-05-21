import React, { useEffect, lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from '../Layout.jsx'
import AdminLayout from '../Components/admin/AdminLayout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import { PermissionProvider } from './store/PermissionContext.jsx'
import { WorkflowModeProvider } from './features/settings/WorkflowModeContext.jsx'
import WorkflowModeRouteGate from './features/settings/components/WorkflowModeRouteGate.jsx'
import { getPageNameFromPath } from '../utils.js'
import api from './services/api.js'
import { clearClientSession } from './services/sessionCleanup.js'
import ErrorBoundary from './components/common/ErrorBoundary.jsx' // Fix 10.3
import GlobalApiErrorListener from './components/common/GlobalApiErrorListener.jsx'
import { Toaster } from '@/components/ui/sonner'
import './index.css'

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/'
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`

const registerAdminServiceWorker = async () => {
  if (typeof window === 'undefined') return
  if (import.meta.env.DEV) return
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
const AcceptInvite = lazy(() => import('../Pages/AcceptInvite.jsx'))
const Reactivate = lazy(() => import('../Pages/Reactivate.jsx'))
const MobileReceive = lazy(() => import('../Pages/MobileReceive.jsx'))
const DispatchOrders = lazy(() => import('../Pages/DispatchOrders.jsx'))
const AiChat = lazy(() => import('../Pages/AiChat.jsx'))
const POSPage = lazy(() => import('./features/pos/pages/POSPage.jsx'))
const TerminalPage = lazy(() => import('./features/pos/pages/TerminalPage.jsx'))
const SalesPage = lazy(() => import('./features/sales/pages/SalesPage.jsx'))
const FeedbackViewer = lazy(() => import('../Pages/FeedbackViewer.jsx'))
const FeedbackDashboard = lazy(() => import('../Pages/admin/FeedbackDashboard.jsx'))
const TenantManager = lazy(() => import('../Pages/admin/TenantManager.jsx'))
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
    const validateCompanyToken = async () => {
      const authToken = localStorage.getItem('authToken');
      const refreshToken = localStorage.getItem('refreshToken');
      const companyToken = localStorage.getItem('companyToken');

      if ((authToken || refreshToken) && !companyToken) {
        clearClientSession({
          reason: 'tenant_context_missing',
          broadcast: true,
          emitAuthEvents: true,
          redirectTo: '/login?reason=tenant_context_missing'
        });
        return;
      }

      if (!companyToken) return;

      try {
        await api.get(`/auth/validate-token/${companyToken}`);
      } catch (error) {
        if (error.response?.status === 404 || error.response?.status === 400) {
          clearClientSession({
            reason: 'tenant_context_invalid',
            broadcast: true,
            emitAuthEvents: true,
            redirectTo: '/login?reason=tenant_context_invalid'
          });
        }
      }
    };

    validateCompanyToken();
  }, []);

  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen text-gray-400">Loading...</div>}>
      <Routes>
        {/* Public routes - Login and Register pages */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/register-company" element={<RegisterCompany />} />
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
            <WorkflowModeRouteGate blockInMsme blockInServices blockInFnb blockInHospitality moduleLabel="Job Orders">
              <Layout currentPageName={currentPageName}>
                <JobOrders />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/stock-movements" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate blockInMsme blockInServices moduleLabel="Stock Movements">
              <Layout currentPageName={currentPageName}>
                <StockMovements />
              </Layout>
            </WorkflowModeRouteGate>
          </ProtectedRoute>
        } />
        <Route path="/dispatch-orders" element={
          <ProtectedRoute>
            <WorkflowModeRouteGate blockInMsme blockInServices blockInFnb blockInHospitality moduleLabel="Dispatch Orders">
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
          <Route path="pricing" element={<AdminPricing />} />
          <Route path="hosting" element={<HostingStatus />} />
        </Route>

        {/* Legacy route - redirect to new admin portal */}
        <Route path="/admin/feedback-old" element={<FeedbackViewer />} />
      </Routes>
    </Suspense>
  )
}

const rootElement = document.getElementById('root');
ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <PermissionProvider>
          <WorkflowModeProvider>
            <GlobalApiErrorListener />
            <Toaster position="top-right" />
            <App />
          </WorkflowModeProvider>
        </PermissionProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
)

registerAdminServiceWorker()
