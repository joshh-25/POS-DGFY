import { sanitizeInternalReturnPath } from './businessAdminRouteHelpers.js';

const BACK_OFFICE_SESSION_STORAGE_KEY = 'dgfy_backoffice_session_granted_v1';

const readPersistedGrant = () => {
    if (typeof window === 'undefined') return false;
    try {
        return window.sessionStorage.getItem(BACK_OFFICE_SESSION_STORAGE_KEY) === 'granted';
    } catch {
        return false;
    }
};

let backOfficeSessionGranted = readPersistedGrant();
const listeners = new Set();

const notify = () => {
    listeners.forEach((listener) => listener(backOfficeSessionGranted));
};

export const isBackOfficeSessionGranted = () => backOfficeSessionGranted;

export const grantBackOfficeSession = () => {
    backOfficeSessionGranted = true;
    try {
        window.sessionStorage.setItem(BACK_OFFICE_SESSION_STORAGE_KEY, 'granted');
    } catch {
        // The server remains authoritative if session storage is unavailable.
    }
    notify();
};

export const clearBackOfficeSession = () => {
    backOfficeSessionGranted = false;
    try {
        window.sessionStorage.removeItem(BACK_OFFICE_SESSION_STORAGE_KEY);
    } catch {
        // Best-effort cleanup when browser storage is unavailable.
    }
    notify();
};

export const subscribeToBackOfficeSession = (listener) => {
    if (typeof listener !== 'function') return () => {};
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const BACK_OFFICE_LOGIN_PATH_PATTERN = /^\/(?:backoffice|business-admin)\/login(?:[/?#]|$)/i;
const BACK_OFFICE_POS_HANDOFF_PARAM = 'pos_handoff';

export const normalizeBackOfficeReturnPath = (path = '') => sanitizeInternalReturnPath(path, {
    fallback: '/backoffice/overview',
    blockedPattern: BACK_OFFICE_LOGIN_PATH_PATTERN
});

export const isBackOfficePosHandoff = (search = '') => {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    return params.get(BACK_OFFICE_POS_HANDOFF_PARAM) === '1';
};

export const removeBackOfficePosHandoff = (search = '') => {
    const params = new URLSearchParams(String(search || '').replace(/^\?/, ''));
    params.delete(BACK_OFFICE_POS_HANDOFF_PARAM);
    const nextSearch = params.toString();
    return nextSearch ? `?${nextSearch}` : '';
};

export const buildBackOfficeLoginPath = (returnTo = '/backoffice/overview') => (
    `/backoffice/login?return_to=${encodeURIComponent(normalizeBackOfficeReturnPath(returnTo))}`
);
