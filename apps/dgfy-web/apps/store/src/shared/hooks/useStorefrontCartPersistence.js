import { useCallback, useEffect, useMemo, useRef } from 'react';

import {
  clearStorefrontCartSnapshot,
  readStorefrontCartSnapshot,
  writeStorefrontCartSnapshot
} from '../model/storefrontCartStorage.js';

const toSlug = (value) => String(value || '').trim().toLowerCase();

export function useStorefrontCartPersistence({
  cart,
  enabled = false,
  mode = '',
  setCart,
  storeSlug
}) {
  const normalizedMode = useMemo(() => String(mode || '').trim().toLowerCase(), [mode]);
  const normalizedStoreSlug = useMemo(() => toSlug(storeSlug), [storeSlug]);
  const persistenceKey = useMemo(() => (
    normalizedStoreSlug && normalizedMode ? `${normalizedMode}:${normalizedStoreSlug}` : ''
  ), [normalizedMode, normalizedStoreSlug]);
  const hydratedKeyRef = useRef('');
  const skipNextWriteKeyRef = useRef('');

  useEffect(() => {
    if (!enabled || !persistenceKey || typeof setCart !== 'function') return;
    if (hydratedKeyRef.current === persistenceKey) return;

    hydratedKeyRef.current = persistenceKey;
    skipNextWriteKeyRef.current = persistenceKey;

    const snapshot = readStorefrontCartSnapshot(normalizedStoreSlug, { mode: normalizedMode });
    if (!snapshot?.cart?.length) return;

    setCart((currentCart) => {
      if (Array.isArray(currentCart) && currentCart.length > 0) return currentCart;
      return snapshot.cart;
    });
  }, [enabled, normalizedMode, normalizedStoreSlug, persistenceKey, setCart]);

  useEffect(() => {
    if (!enabled || !persistenceKey || hydratedKeyRef.current !== persistenceKey) return;

    if (skipNextWriteKeyRef.current === persistenceKey) {
      skipNextWriteKeyRef.current = '';
      return;
    }

    if (Array.isArray(cart) && cart.length > 0) {
      writeStorefrontCartSnapshot({
        cart,
        mode: normalizedMode,
        storeSlug: normalizedStoreSlug
      });
      return;
    }

    clearStorefrontCartSnapshot(normalizedStoreSlug);
  }, [cart, enabled, normalizedMode, normalizedStoreSlug, persistenceKey]);

  return useCallback(() => {
    clearStorefrontCartSnapshot(normalizedStoreSlug);
  }, [normalizedStoreSlug]);
}
