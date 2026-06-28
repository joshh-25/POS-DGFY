import React from 'react';
import ReactDOM from 'react-dom/client';
import { setBrowserSession } from '../../../src/services/browserSession.js';
import { resolveApiBaseUrl } from '../../../src/utils/runtimeConfig.js';
import PosApp from './app/PosApp.jsx';
import '../../../src/index.css';

const appBasePath = String(import.meta.env.BASE_URL || '/').replace(/\/+$/, '') || '/';
const serviceWorkerUrl = appBasePath === '/' ? '/sw.js' : `${appBasePath}/sw.js`;
const runtimeApiBaseUrl = resolveApiBaseUrl(import.meta.env, typeof window !== 'undefined' ? window.location : undefined);
const enableDevAutoLogin = import.meta.env.DEV && import.meta.env.VITE_POS_DEV_AUTO_LOGIN === 'true';
const devAutoLoginCompanyToken = String(import.meta.env.VITE_POS_DEV_COMPANY_TOKEN || 'token-original').trim();
const devAutoLoginEmail = String(import.meta.env.VITE_POS_DEV_EMAIL || 'admin@test.com').trim();
const devAutoLoginPassword = String(import.meta.env.VITE_POS_DEV_PASSWORD || 'Admin123!').trim();

const registerPosServiceWorker = async () => {
  if (typeof window === 'undefined') return;
  if (import.meta.env.DEV) return;
  if (!('serviceWorker' in navigator)) return;
  try {
    let hasReloadedForServiceWorkerUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hasReloadedForServiceWorkerUpdate) return;
      hasReloadedForServiceWorkerUpdate = true;
      window.location.reload();
    });

    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map(async (registration) => {
      const scriptUrl = String(registration.active?.scriptURL || registration.waiting?.scriptURL || registration.installing?.scriptURL || '');
      if (scriptUrl && !scriptUrl.endsWith('/sw.js')) return;
      await registration.update().catch(() => {});
    }));

    const probe = await fetch(serviceWorkerUrl, { method: 'GET', cache: 'no-store' });
    const contentType = String(probe.headers.get('content-type') || '').toLowerCase();
    const scriptLike = contentType.includes('javascript') || contentType.includes('ecmascript');
    if (!probe.ok || !scriptLike) return;

    const registration = await navigator.serviceWorker.register(serviceWorkerUrl, {
      scope: appBasePath === '/' ? '/' : `${appBasePath}/`
    });
    await registration.update().catch(() => {});
    if (registration?.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    registration?.installing?.addEventListener('statechange', (event) => {
      const nextWorker = event?.target;
      if (nextWorker?.state === 'installed') {
        nextWorker.postMessage({ type: 'SKIP_WAITING' });
      }
    });
  } catch {
    // Service worker support is optional for local development.
  }
};

const mountApp = () => {
  ReactDOM.createRoot(document.getElementById('root')).render(<PosApp />);
};

if (enableDevAutoLogin) {
  (async () => {
    try {
      window.localStorage.setItem('pos_terminal_identity_v1', 'COUNTER-01');

      const response = await fetch(`${runtimeApiBaseUrl}/auth/login`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-company-token': devAutoLoginCompanyToken
        },
        body: JSON.stringify({ email: devAutoLoginEmail, password: devAutoLoginPassword })
      });
      const body = await response.json().catch(() => null);
      if (response.ok && body?.success && body?.data?.token) {
        setBrowserSession({ token: body.data.token, companyToken: devAutoLoginCompanyToken });
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
