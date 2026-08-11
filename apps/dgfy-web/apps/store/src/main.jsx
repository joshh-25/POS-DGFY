import React, { useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import StorefrontApp from './StorefrontApp.jsx';
import { appBasePath } from './app/runtime/storefrontRuntime.js';
import StorefrontLoginPage from './auth/pages/StorefrontLoginPage.jsx';
import StorefrontRegisterPage from './auth/pages/StorefrontRegisterPage.jsx';
import StorefrontAffiliateAcceptPage from './auth/pages/StorefrontAffiliateAcceptPage.jsx';
import StorefrontResetPasswordPage from './auth/pages/StorefrontResetPasswordPage.jsx';
import StorefrontBusinessGrowPage from './business/pages/StorefrontBusinessGrowPage.jsx';
import { initBrowserSentry, setSentryRoute } from '../../../src/observability/sentryClient.js';
import ErrorBoundary from '../../../src/components/common/ErrorBoundary.jsx';
import {
  capturePageview,
  getStoredAnalyticsConsent,
  initBrowserAnalytics
} from '../../../src/observability/analyticsClient.js';
import { ConsentBanner } from './Components/ConsentBanner.jsx';
import {
  getCustomStorefrontRouteContext,
  readRouteSlug,
  readStoreSubpage
} from './app/routing/storefrontRouting.js';

const rootElement = document.getElementById('root');
const STOREFRONT_ROOT_KEY = '__dgfyStorefrontReactRoot__';

initBrowserSentry({ surface: 'store' });
initBrowserAnalytics({ surface: 'store', consent: getStoredAnalyticsConsent() === true });

// Only the public storefront prompts for tracking consent today — SKUpervisor
// and POS are used by our own staff under an employment relationship, a
// different consent basis than an anonymous public visitor.
const handleConsentChange = (granted) => {
  initBrowserAnalytics({ surface: 'store', consent: granted });
};

function AnalyticsRouteTracker() {
  const location = useLocation();

  useEffect(() => {
    // The storefront's real routing is a second, window.location-based layer
    // on top of react-router (see app/routing/storefrontRouting.js) — a
    // custom merchant domain collapses everything to `/`, `/order`, etc, so
    // react-router's location.pathname alone under-describes the page.
    // Reading the routing helpers here captures what page this actually is.
    capturePageview({
      path: location.pathname,
      route_slug: readRouteSlug(),
      route_subpage: readStoreSubpage(),
      is_custom_domain: Boolean(getCustomStorefrontRouteContext())
    });
    setSentryRoute(location.pathname);
  }, [location.pathname]);

  return null;
}

// Kept exactly as-is: several integration tests render `<App/>` directly
// (no router context), and StorefrontApp itself never touches react-router
// hooks, so this stays a plain, router-free composition root.
export function App() {
  return (
    <>
      <StorefrontApp />
      <Toaster richColors position="top-right" closeButton duration={2200} />
    </>
  );
}

// The actual mount: a thin react-router gate in front of the storefront.
// `/login`, `/register`, `/reset-password` and `/business/grow` are now hosted
// in-app (formerly redirects out to skupervisor.dgfy.ph); everything else falls
// through to the untouched `App` above, which still does its own
// window.location-based routing.
function StoreRoot() {
  return (
    <BrowserRouter basename={appBasePath === '/' ? undefined : appBasePath}>
      <AnalyticsRouteTracker />
      <ConsentBanner onConsentChange={handleConsentChange} />
      <Routes>
        <Route
          path="/login"
          element={(
            <>
              <StorefrontLoginPage />
              <Toaster richColors position="top-right" closeButton duration={2200} />
            </>
          )}
        />
        <Route
          path="/register"
          element={(
            <>
              <StorefrontRegisterPage />
              <Toaster richColors position="top-right" closeButton duration={2200} />
            </>
          )}
        />
        <Route
          path="/affiliate/accept"
          element={(
            <>
              <StorefrontAffiliateAcceptPage />
              <Toaster richColors position="top-right" closeButton duration={2200} />
            </>
          )}
        />
        <Route
          path="/reset-password"
          element={(
            <>
              <StorefrontResetPasswordPage />
              <Toaster richColors position="top-right" closeButton duration={2200} />
            </>
          )}
        />
        <Route
          path="/business/grow"
          element={(
            <>
              <StorefrontBusinessGrowPage />
              <Toaster richColors position="top-right" closeButton duration={2200} />
            </>
          )}
        />
        <Route path="*" element={<App />} />
      </Routes>
    </BrowserRouter>
  );
}

if (rootElement) {
  const storefrontRoot = rootElement[STOREFRONT_ROOT_KEY]
    || (rootElement[STOREFRONT_ROOT_KEY] = ReactDOM.createRoot(rootElement));
  storefrontRoot.render(
    <React.StrictMode>
      <ErrorBoundary>
        <StoreRoot />
      </ErrorBoundary>
    </React.StrictMode>
  );
}
