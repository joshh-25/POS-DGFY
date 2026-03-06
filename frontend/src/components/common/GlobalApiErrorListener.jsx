import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { createErrorToastDeduper } from '../../utils/errorToastDedupe.js';

const DEFAULT_ERROR_MESSAGE = 'Server error. Please try again.';

export const setupGlobalApiErrorListeners = ({
  windowObj,
  toastApi = toast,
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

  targetWindow.addEventListener('api:error', onApiError);
  targetWindow.addEventListener('api:server-error', onLegacyServerError);

  return () => {
    targetWindow.removeEventListener('api:error', onApiError);
    targetWindow.removeEventListener('api:server-error', onLegacyServerError);
  };
};

export default function GlobalApiErrorListener() {
  const deduperRef = useRef(createErrorToastDeduper());

  useEffect(() => {
    return setupGlobalApiErrorListeners({
      toastApi: toast,
      deduper: deduperRef.current
    });
  }, []);

  return null;
}
