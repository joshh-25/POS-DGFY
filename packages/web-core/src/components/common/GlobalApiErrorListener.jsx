import { useEffect, useRef } from 'react';
import { createErrorToastDeduper } from '../../utils/errorToastDedupe.js';
import { posToast } from '../../utils/iminRuntimeFeedback.js';

const DEFAULT_ERROR_MESSAGE = 'Server error. Please try again.';

export const setupGlobalApiErrorListeners = ({
  windowObj,
  toastApi = posToast,
  deduper = createErrorToastDeduper()
} = {}) => {
  const targetWindow = windowObj || (typeof window !== 'undefined' ? window : null);
  if (!targetWindow || typeof targetWindow.addEventListener !== 'function') {
    return () => {};
  }

  const onApiError = (event) => {
    const message = event?.detail?.message || DEFAULT_ERROR_MESSAGE;
    if (deduper.shouldSuppress(message)) return;
    toastApi.error(message, { duration: 5000 });
  };

  const onLegacyServerError = (event) => {
    const message = event?.detail?.message || DEFAULT_ERROR_MESSAGE;
    if (deduper.shouldSuppress(message)) return;
    toastApi.error(message, { duration: 5000 });
  };

  const onCapabilityBlocked = (event) => {
    if (event?.detail?.suppressToast === true) return;
    const title = event?.detail?.title || 'Platform admin changed your permissions';
    const message = event?.detail?.message || DEFAULT_ERROR_MESSAGE;
    const signature = `${title}: ${message}`;
    if (deduper.shouldSuppress(signature)) return;
    toastApi.error(title, { description: message, duration: 7000 });
  };

  targetWindow.addEventListener('api:error', onApiError);
  targetWindow.addEventListener('api:server-error', onLegacyServerError);
  targetWindow.addEventListener('tenant:capability-blocked', onCapabilityBlocked);

  return () => {
    targetWindow.removeEventListener('api:error', onApiError);
    targetWindow.removeEventListener('api:server-error', onLegacyServerError);
    targetWindow.removeEventListener('tenant:capability-blocked', onCapabilityBlocked);
  };
};

export default function GlobalApiErrorListener() {
  const deduperRef = useRef(createErrorToastDeduper());

  useEffect(() => {
    return setupGlobalApiErrorListeners({
      toastApi: posToast,
      deduper: deduperRef.current
    });
  }, []);

  return null;
}
