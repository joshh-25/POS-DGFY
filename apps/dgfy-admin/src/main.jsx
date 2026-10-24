// Chrome 80-84 runtime polyfill runs before any shared or app module.
import '../../../packages/web-core/src/compat/chrome80Runtime.js';
import React, { lazy, Suspense, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from '../../../packages/web-core/src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../packages/web-core/src/components/common/GlobalApiErrorListener.jsx';
import VersionBadge from '../../../packages/web-core/src/components/common/VersionBadge.jsx';
import { Toaster } from '@/components/ui/sonner';
import AdminLayout from './components/AdminLayout.jsx';
import { normalizeAdminRouteLabel } from './features/admin/adminRouteLabel.js';
import {
  capturePageview,
  initBrowserAnalytics,
  resetAnalyticsIdentity,
  setAnalyticsContext
} from '../../../packages/web-core/src/observability/analyticsClient.js';
import {
  initBrowserSentry,
  resetSentryIdentity,
  setSentryContext,
  setSentryRoute
} from '../../../packages/web-core/src/observability/sentryClient.js';
import { reloadOnceForChunkFailure } from '../../../packages/web-core/src/utils/chunkLoadRecovery.js';
import '../../../packages/web-core/src/index.css';

const FeedbackDashboard = lazy(() => import('../Pages/FeedbackDashboard.jsx'));
const ContactInquiriesDashboard = lazy(() => import('../Pages/ContactInquiriesDashboard.jsx'));
const TenantManager = lazy(() => import('../Pages/TenantManager.jsx'));
const TenantOverview = lazy(() => import('../Pages/TenantOverview.jsx'));
const AddTenant = lazy(() => import('../Pages/AddTenant.jsx'));
const DgfyAccountManager = lazy(() => import('../Pages/DgfyAccountManager.jsx'));
const PaymentOperations = lazy(() => import('../Pages/PaymentOperations.jsx'));
const AdminPricing = lazy(() => import('../Pages/AdminPricing.jsx'));
const HostingStatus = lazy(() => import('../Pages/HostingStatus.jsx'));
const InvoiceManager = lazy(() => import('../Pages/InvoiceManager.jsx'));
const PushDiagnostics = lazy(() => import('../Pages/PushDiagnostics.jsx'));
const PlatformAdminManager = lazy(() => import('../Pages/PlatformAdminManager.jsx'));
const StoreTemplateManager = lazy(() => import('../Pages/StoreTemplateManager.jsx'));
const ExternalDiscoveryManager = lazy(() => import('../Pages/ExternalDiscoveryManager.jsx'));

initBrowserSentry({ surface: 'admin' });
initBrowserAnalytics({ surface: 'admin' });

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    const routeLabel = normalizeAdminRouteLabel(location.pathname);
    capturePageview({ path: routeLabel });
    setSentryRoute(routeLabel);
  }, [location.pathname]);
  return null;
}

function IdentityReset() {
  useEffect(() => {
    const reset = () => {
      resetAnalyticsIdentity();
      resetSentryIdentity();
      setAnalyticsContext({});
      setSentryContext({});
    };
    window.addEventListener('auth:logout', reset);
    return () => window.removeEventListener('auth:logout', reset);
  }, []);
  return null;
}

function AdminNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <section className="max-w-md rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">Admin page not found</h1>
        <p className="mt-2 text-sm text-slate-600">This route is not part of the Platform Admin console.</p>
        <a className="mt-5 inline-flex rounded-lg bg-slate-900 px-5 py-3 text-sm font-bold text-white" href="/admin">
          Open Platform Admin
        </a>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <RouteTracker />
        <IdentityReset />
        <VersionBadge label="Platform Admin" />
        <GlobalApiErrorListener />
        <Toaster position="top-right" />
        <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm text-slate-500">Loading...</div>}>
          <Routes>
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="/admin/tenants" replace />} />
              <Route path="feedback" element={<FeedbackDashboard />} />
              <Route path="contact-inquiries" element={<ContactInquiriesDashboard />} />
              <Route path="tenants/new" element={<AddTenant />} />
              <Route path="tenants/:id" element={<TenantOverview />} />
              <Route path="tenants" element={<TenantManager />} />
              <Route path="dgfy-accounts" element={<DgfyAccountManager />} />
              <Route path="payments" element={<PaymentOperations />} />
              <Route path="pricing" element={<AdminPricing />} />
              <Route path="hosting" element={<HostingStatus />} />
              <Route path="invoices" element={<InvoiceManager />} />
              <Route path="push-diagnostics" element={<PushDiagnostics />} />
              <Route path="platform-admins" element={<PlatformAdminManager />} />
              <Route path="store-templates" element={<StoreTemplateManager />} />
              <Route path="external-discovery" element={<ExternalDiscoveryManager />} />
            </Route>
            <Route path="/admin/feedback-old" element={<Navigate to="/admin/feedback" replace />} />
            <Route path="*" element={<AdminNotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
