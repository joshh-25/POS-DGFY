import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { requestJson } from '../../services/requestJson.js';
import {
  clearDgfyAuthToken,
  clearStoreAuthToken,
  hasDgfyExplicitSignOut,
  readDgfyAuthToken,
  readStoreAuthToken,
  writeDgfyAuthToken
} from '../../auth/storefrontSessionStorage.js';
import { markDgfySessionActive } from '../../../../../src/services/dgfyAuthService.js';
import { getOrCreateStorefrontVisitorId } from '../model/storefrontCustomerStorage.js';
import {
  identifyAnalyticsUser,
  resetAnalyticsIdentity
} from '../../../../../src/observability/analyticsClient.js';

/**
 * Stateful hook that owns the DGFY customer session bootstrap.
 * Moved verbatim from `StorefrontApp.jsx`: the DGFY auth token/session
 * account `useState` declarations, the storefront visitor id memo, the
 * cookie-session bootstrap effect (handoff-token exchange, explicit
 * sign-out short-circuit, cookie/legacy-token session resolution), and
 * the derived auth/session booleans that are read across the rest of the
 * shell (`isDgfyCustomerSignedIn` alone has 50+ call sites). The async
 * flow, its error handling, and the derived-value formulas are unchanged
 * from the shell.
 */
export function useStorefrontSession({ setIsAccountDrawerOpen }) {
  const [dgfyAuthTokenState, setDgfyAuthTokenState] = useState(() => readDgfyAuthToken());
  const [dgfySessionAccount, setDgfySessionAccount] = useState(null);
  const storefrontVisitorId = useMemo(() => getOrCreateStorefrontVisitorId(), []);

  useEffect(() => {
    let cancelled = false;

    const bootstrapDgfyCookieSession = async () => {
      let consumedHandoff = false;
      if (typeof window !== 'undefined') {
        const currentUrl = new URL(window.location.href);
        const handoffToken = String(currentUrl.searchParams.get('handoff_token') || '').trim();
        if (handoffToken) {
          currentUrl.searchParams.delete('handoff_token');
          window.history.replaceState({}, '', currentUrl.toString());
          try {
            const handoffPayload = await requestJson('/api/v1/dgfy/auth/handoff/exchange', {
              method: 'POST',
              cache: 'no-store',
              body: {
                handoff_token: handoffToken,
                soft_fail: true
              }
            });
            consumedHandoff = handoffPayload?.status !== 'invalid';
            if (consumedHandoff) {
              const handoffTokenValue = String(handoffPayload?.token || '').trim();
              const handoffAccount = handoffPayload?.account && typeof handoffPayload.account === 'object'
                ? handoffPayload.account
                : null;
              if (handoffTokenValue) {
                writeDgfyAuthToken(handoffTokenValue);
                setDgfyAuthTokenState(handoffTokenValue);
              } else {
                clearDgfyAuthToken();
                setDgfyAuthTokenState('');
              }
              if (handoffAccount) {
                setDgfySessionAccount(handoffAccount);
              }
              markDgfySessionActive();
            } else {
              clearDgfyAuthToken();
              setDgfyAuthTokenState('');
            }
          } catch {
            clearDgfyAuthToken();
            setDgfyAuthTokenState('');
          }
          if (cancelled) return;
        }
      }

      if (!consumedHandoff && hasDgfyExplicitSignOut()) {
        clearDgfyAuthToken();
        clearStoreAuthToken();
        setDgfyAuthTokenState('');
        setDgfySessionAccount(null);
        return;
      }

      const legacyToken = readDgfyAuthToken();
      try {
        const payload = await requestJson('/api/v1/dgfy/auth/me', { cache: 'no-store' });
        if (cancelled) return;
        const account = payload?.account || payload || null;
        setDgfySessionAccount(account && typeof account === 'object' ? account : null);
        if (account && typeof account === 'object') {
          clearDgfyAuthToken();
          setDgfyAuthTokenState('');
          markDgfySessionActive();
        }
      } catch {
        if (cancelled) return;
        if (legacyToken && !consumedHandoff) {
          try {
            const payload = await requestJson('/api/v1/dgfy/auth/me', {
              authToken: legacyToken,
              cache: 'no-store'
            });
            if (cancelled) return;
            const account = payload?.account || payload || null;
            setDgfySessionAccount(account && typeof account === 'object' ? account : null);
            if (account && typeof account === 'object') markDgfySessionActive();
            return;
          } catch {
            if (cancelled) return;
          }
        }
        clearDgfyAuthToken();
        setDgfyAuthTokenState('');
        if (cancelled) return;
        setDgfySessionAccount(null);
      }
    };

    bootstrapDgfyCookieSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const storeAuthToken = readStoreAuthToken();
  const dgfyAuthToken = String(dgfyAuthTokenState || '').trim();
  const isDgfyCustomerSignedIn = Boolean(dgfyAuthToken || dgfySessionAccount?.id);
  const isStorefrontAccountAuthenticated = Boolean(storeAuthToken || dgfyAuthToken || dgfySessionAccount?.id);

  // Keep PostHog identity in step with the resolved session, wherever it
  // came from (handoff exchange, cookie session, or legacy token). This
  // covers every sign-in path through one place rather than patching each
  // of the setDgfySessionAccount() call sites above.
  const identifiedAccountIdRef = useRef(null);
  useEffect(() => {
    const accountId = dgfySessionAccount?.id || null;
    if (accountId && identifiedAccountIdRef.current !== accountId) {
      identifiedAccountIdRef.current = accountId;
      identifyAnalyticsUser({ id: accountId, account_type: dgfySessionAccount?.account_type });
    } else if (!accountId && !dgfyAuthToken && identifiedAccountIdRef.current) {
      identifiedAccountIdRef.current = null;
      resetAnalyticsIdentity();
    }
  }, [dgfySessionAccount, dgfyAuthToken]);

  const closeAccountDrawer = useCallback(() => {
    setIsAccountDrawerOpen(false);
  }, [setIsAccountDrawerOpen]);

  return {
    dgfyAuthTokenState,
    setDgfyAuthTokenState,
    dgfySessionAccount,
    setDgfySessionAccount,
    storefrontVisitorId,
    storeAuthToken,
    dgfyAuthToken,
    isDgfyCustomerSignedIn,
    isStorefrontAccountAuthenticated,
    closeAccountDrawer
  };
}
