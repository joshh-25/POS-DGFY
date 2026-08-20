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
  // #768: an applied voucher/promo code previously lived only in React state, initialized
  // exclusively from a `?voucher=`/`?promo=` URL query param that applying a code never rewrites.
  // Threading it through the same read/write cycle as the cart lines is what actually survives a
  // refresh -- a second, independent persistence mechanism would just be a second place to forget.
  promoCode = '',
  setCart,
  setPromoCode,
  setVoucherCode,
  storeSlug,
  voucherCode = ''
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

    // Cart state is shared by the single-page Storefront shell. When the
    // visitor changes tenant or workflow mode, an absent snapshot means the
    // destination scope has no cart. Replace the in-memory state so a prior
    // store's lines cannot remain visible or be persisted under the new key.
    setCart(snapshot?.cart || []);
    // A voucher/promo code is scoped to this same store+mode snapshot -- an absent snapshot means
    // no code either, matching the cart's own "absent means empty" handling above rather than
    // leaving a prior store's code attached to a freshly-hydrated cart.
    if (typeof setVoucherCode === 'function') setVoucherCode(snapshot?.voucherCode || '');
    if (typeof setPromoCode === 'function') setPromoCode(snapshot?.promoCode || '');
  }, [enabled, normalizedMode, normalizedStoreSlug, persistenceKey, setCart, setPromoCode, setVoucherCode]);

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
        promoCode,
        storeSlug: normalizedStoreSlug,
        voucherCode
      });
      return;
    }

    clearStorefrontCartSnapshot(normalizedStoreSlug, { mode: normalizedMode });
  }, [cart, enabled, normalizedMode, normalizedStoreSlug, persistenceKey, promoCode, voucherCode]);

  return useCallback(() => {
    clearStorefrontCartSnapshot(normalizedStoreSlug);
  }, [normalizedStoreSlug]);
}
