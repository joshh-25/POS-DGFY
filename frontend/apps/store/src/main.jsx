import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import './index.css';
import StorefrontApp from './StorefrontApp.jsx';
import { appBasePath } from './app/runtime/storefrontRuntime.js';
import StorefrontLoginPage from './auth/pages/StorefrontLoginPage.jsx';
import StorefrontRegisterPage from './auth/pages/StorefrontRegisterPage.jsx';
import StorefrontBusinessGrowPage from './business/pages/StorefrontBusinessGrowPage.jsx';

const rootElement = document.getElementById('root');

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
// `/login` and `/register` are now hosted in-app (formerly a redirect out to
// skupervisor.dgfy.ph); everything else falls through to the untouched
// `App` above, which still does its own window.location-based routing.
function StoreRoot() {
  return (
    <BrowserRouter basename={appBasePath === '/' ? undefined : appBasePath}>
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
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <StoreRoot />
    </React.StrictMode>
  );
}
