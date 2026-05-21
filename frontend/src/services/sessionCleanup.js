import useStore from '../store/useStore.js';
import { clearAllClientCaches } from './cacheRegistry.js';

const AUTH_EPOCH_KEY = 'authEpoch';

const parseEpoch = (value) => {
  const parsed = Number.parseInt(value ?? '0', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
};

export const getAuthEpoch = () => parseEpoch(localStorage.getItem(AUTH_EPOCH_KEY));

export const bumpAuthEpoch = () => {
  const nextEpoch = getAuthEpoch() + 1;
  localStorage.setItem(AUTH_EPOCH_KEY, String(nextEpoch));
  return nextEpoch;
};

let isClearing = false;

export const clearClientSession = ({
  reason = 'logout',
  broadcast = true,
  emitAuthEvents = true,
  redirectTo = null
} = {}) => {
  if (isClearing) return;

  isClearing = true;
  try {
    localStorage.removeItem('authToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('companyToken');

    bumpAuthEpoch();

    const resetStore = useStore.getState()?.reset;
    if (typeof resetStore === 'function') {
      resetStore();
    }

    clearAllClientCaches();

    if (emitAuthEvents) {
      window.dispatchEvent(new CustomEvent('auth:logout', { detail: { reason, broadcast } }));
      window.dispatchEvent(new CustomEvent('auth:session-cleared', { detail: { reason } }));
    }

    if (redirectTo) {
      window.location.href = redirectTo;
    }
  } finally {
    isClearing = false;
  }
};
