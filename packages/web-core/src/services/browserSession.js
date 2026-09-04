const CSRF_COOKIE_KEY = 'sku_csrf_token';
const IS_STANDALONE_POS_SURFACE = String(import.meta.env.VITE_APP_SURFACE || '').trim().toLowerCase() === 'pos';
const POS_BROWSER_SESSION_STORAGE_KEY = 'pos_browser_session_v1';
const POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY = 'pos_company_switch_handoff_v1';
const POS_COMPANY_SWITCH_HANDOFF_MAX_AGE_MS = 60_000;
const POS_DGFY_TENANT_HANDOFF_STORAGE_KEY = 'pos_dgfy_tenant_handoff_v1';
const POS_DGFY_TENANT_HANDOFF_MAX_AGE_MS = 60_000;

let accessToken = '';
let companyToken = '';
let refreshInFlight = null;
let csrfBootstrapInFlight = null;
let standalonePosSessionActivated = false;
let sessionGeneration = 0;

const readPosSessionStorage = () => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') {
    return { active: false };
  }

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(POS_BROWSER_SESSION_STORAGE_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { active: false };
    }

    return {
      active: parsed.active === true
    };
  } catch {
    return { active: false };
  }
};

const writePosSessionStorage = ({ active } = {}) => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return;

  const normalizedActive = active === true;

  if (!normalizedActive) {
    window.sessionStorage.removeItem(POS_BROWSER_SESSION_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(POS_BROWSER_SESSION_STORAGE_KEY, JSON.stringify({
    active: true
  }));
};

const readFreshPosCompanySwitchHandoff = () => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return false;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY) || 'null');
    const createdAt = Number(parsed?.createdAt || 0);
    const tenantId = String(parsed?.tenantId || '').trim();
    const isFresh = Boolean(tenantId)
      && Number.isFinite(createdAt)
      && createdAt > 0
      && Date.now() - createdAt <= POS_COMPANY_SWITCH_HANDOFF_MAX_AGE_MS;

    if (!isFresh) {
      window.sessionStorage.removeItem(POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY);
      return null;
    }
    return { tenantId };
  } catch {
    window.sessionStorage.removeItem(POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY);
    return null;
  }
};

const hasFreshPosCompanySwitchHandoff = () => Boolean(readFreshPosCompanySwitchHandoff());

const consumePosCompanySwitchHandoff = () => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return;
  window.sessionStorage.removeItem(POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY);
};

const readFreshPosDgfyTenantHandoff = () => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return null;

  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(POS_DGFY_TENANT_HANDOFF_STORAGE_KEY) || 'null');
    const createdAt = Number(parsed?.createdAt || 0);
    const tenantId = String(parsed?.tenantId || '').trim();
    const isFresh = Boolean(tenantId)
      && Number.isFinite(createdAt)
      && createdAt > 0
      && Date.now() - createdAt <= POS_DGFY_TENANT_HANDOFF_MAX_AGE_MS;

    if (!isFresh) {
      window.sessionStorage.removeItem(POS_DGFY_TENANT_HANDOFF_STORAGE_KEY);
      return null;
    }
    return { tenantId };
  } catch {
    window.sessionStorage.removeItem(POS_DGFY_TENANT_HANDOFF_STORAGE_KEY);
    return null;
  }
};

const bootstrapStandalonePosSession = () => {
  const persisted = readPosSessionStorage();
  accessToken = '';
  companyToken = '';
  standalonePosSessionActivated = persisted.active === true;
};

bootstrapStandalonePosSession();

const resolveApiBaseUrl = () => {
  const configured = (import.meta.env.VITE_API_URL || '').trim();
  if (!configured) return '/api/v1';
  if (typeof window !== 'undefined') {
    try {
      const parsed = new URL(configured, window.location.origin);
      const configuredLocal = ['localhost', '127.0.0.1', '::1'].includes(parsed.hostname);
      const runtimeLocal = ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname);
      if (configuredLocal && !runtimeLocal) return '/api/v1';
    } catch {
      return configured;
    }
  }
  return configured;
};

const readCookie = (name) => {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  return String(document.cookie || '')
    .split(';')
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(prefix))
    ?.slice(prefix.length) || '';
};

export const getCsrfToken = () => decodeURIComponent(readCookie(CSRF_COOKIE_KEY));

export const ensureCsrfToken = async ({ force = false } = {}) => {
  const currentToken = getCsrfToken();
  if (currentToken && !force) return currentToken;
  if (typeof fetch !== 'function') return '';
  if (csrfBootstrapInFlight) return csrfBootstrapInFlight;

  csrfBootstrapInFlight = (async () => {
    const response = await fetch(`${resolveApiBaseUrl()}/auth/csrf-token`, {
      method: 'GET',
      credentials: 'include',
      headers: {
        Accept: 'application/json'
      }
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const error = new Error(data?.message || 'CSRF token bootstrap failed');
      error.response = { status: response.status, data };
      throw error;
    }
    return getCsrfToken();
  })().finally(() => {
    csrfBootstrapInFlight = null;
  });

  return csrfBootstrapInFlight;
};

export const setBrowserSession = ({ token, companyToken: nextCompanyToken } = {}) => {
  let sessionChanged = false;
  if (token !== undefined) {
    const normalizedToken = String(token || '').trim();
    sessionChanged = sessionChanged || normalizedToken !== accessToken;
    accessToken = normalizedToken;
    if (IS_STANDALONE_POS_SURFACE && accessToken) {
      standalonePosSessionActivated = true;
    }
  }
  if (nextCompanyToken !== undefined) {
    const normalizedCompanyToken = String(nextCompanyToken || '').trim();
    sessionChanged = sessionChanged || normalizedCompanyToken !== companyToken;
    companyToken = normalizedCompanyToken;
  }
  if (sessionChanged) sessionGeneration += 1;
  if (IS_STANDALONE_POS_SURFACE) {
    writePosSessionStorage({
      active: standalonePosSessionActivated
    });
  }
  if (typeof window !== 'undefined') {
    const event = typeof CustomEvent === 'function'
      ? new CustomEvent('auth:session-updated')
      : new Event('auth:session-updated');
    window.dispatchEvent(event);
  }
};

export const clearBrowserSession = () => {
  sessionGeneration += 1;
  accessToken = '';
  companyToken = '';
  standalonePosSessionActivated = false;
  if (IS_STANDALONE_POS_SURFACE && typeof window !== 'undefined') {
    window.sessionStorage.removeItem(POS_BROWSER_SESSION_STORAGE_KEY);
  }
};

export const preparePosCompanySwitchHandoff = ({ tenantId } = {}) => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return;

  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId || !accessToken || !companyToken) {
    throw new Error('The selected company session could not be prepared for POS.');
  }

  window.sessionStorage.setItem(POS_COMPANY_SWITCH_HANDOFF_STORAGE_KEY, JSON.stringify({
    tenantId: normalizedTenantId,
    createdAt: Date.now()
  }));
};

// Unlike the consuming refresh helper, TerminalPage needs to read the target
// tenant before refresh so it can discard prior-company UI state first.
export const getFreshPosCompanySwitchHandoff = () => readFreshPosCompanySwitchHandoff();

// DGFY Business has already authenticated the account and selected a company
// before it reaches the standalone POS HashRouter. This short-lived marker
// contains no credential; it only lets POS discard stale terminal-local state
// before validating the freshly installed tenant session with the API.
export const preparePosDgfyTenantHandoff = ({ tenantId } = {}) => {
  if (!IS_STANDALONE_POS_SURFACE || typeof window === 'undefined') return;

  const normalizedTenantId = String(tenantId || '').trim();
  if (!normalizedTenantId || !accessToken || !companyToken) {
    throw new Error('The selected DGFY company session could not be prepared for POS.');
  }

  window.sessionStorage.setItem(POS_DGFY_TENANT_HANDOFF_STORAGE_KEY, JSON.stringify({
    tenantId: normalizedTenantId,
    createdAt: Date.now()
  }));
};

export const consumePosDgfyTenantHandoff = () => {
  const handoff = readFreshPosDgfyTenantHandoff();
  if (handoff && typeof window !== 'undefined') {
    window.sessionStorage.removeItem(POS_DGFY_TENANT_HANDOFF_STORAGE_KEY);
  }
  return handoff;
};

export const getAccessToken = () => accessToken;
export const getCompanyToken = () => companyToken;
export const getBrowserSessionSnapshot = () => ({
  token: accessToken,
  companyToken,
  generation: sessionGeneration,
  active: standalonePosSessionActivated
});
export const canRefreshBrowserSession = () => (
  !IS_STANDALONE_POS_SURFACE
  || standalonePosSessionActivated
  || hasFreshPosCompanySwitchHandoff()
);

export const getAuthHeaders = ({ includeCsrf = false } = {}) => {
  const headers = {};
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (companyToken) headers['x-company-token'] = companyToken;
  const csrfToken = includeCsrf ? getCsrfToken() : '';
  if (csrfToken) headers['x-csrf-token'] = csrfToken;
  return headers;
};

export const refreshBrowserSession = async () => {
  // A fresh POS page must authenticate explicitly. Cookie rotation remains
  // available only after this page has established an authenticated session.
  if (!canRefreshBrowserSession()) return '';
  if (refreshInFlight) return refreshInFlight;
  const consumesCompanySwitchHandoff = IS_STANDALONE_POS_SURFACE
    && !standalonePosSessionActivated
    && hasFreshPosCompanySwitchHandoff();
  refreshInFlight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      await ensureCsrfToken();
      const response = await fetch(`${resolveApiBaseUrl()}/auth/refresh-token`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders({ includeCsrf: true })
        },
        body: '{}',
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(data?.message || 'Session refresh failed');
        error.response = { status: response.status, data };
        throw error;
      }
      const session = data?.data || {};
      setBrowserSession({
        token: session.token,
        companyToken: session.company?.token || companyToken
      });
      return session.token || '';
    } finally {
      clearTimeout(timeout);
      if (consumesCompanySwitchHandoff) consumePosCompanySwitchHandoff();
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
};
