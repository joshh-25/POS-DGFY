import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import TerminalPage from '../../../src/features/pos/pages/TerminalPage.jsx';
import ErrorBoundary from '../../../src/components/common/ErrorBoundary.jsx';
import GlobalApiErrorListener from '../../../src/components/common/GlobalApiErrorListener.jsx';
import { PermissionProvider } from '../../../src/store/PermissionContext.jsx';
import { WorkflowModeProvider } from '../../../src/features/settings/WorkflowModeContext.jsx';
import { Toaster } from '@/components/ui/sonner';
import '../../../src/index.css';

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;

const registerPosServiceWorker = async () => {
  if (typeof window === 'undefined') return;
  if (!('serviceWorker' in navigator)) return;
  try {
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PermissionProvider>
        <WorkflowModeProvider>
          <BrowserRouter>
            <GlobalApiErrorListener />
            <Toaster position="top-right" />
            <TerminalPage />
          </BrowserRouter>
        </WorkflowModeProvider>
      </PermissionProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

registerPosServiceWorker();
