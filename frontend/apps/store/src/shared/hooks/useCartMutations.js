import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { buildCartTotals } from '../model/storefrontCartModel.js';
import {
  buildStockExceededMessage,
  isItemAvailable,
  isServiceCatalogItem
} from '../model/storefrontCatalogModel.js';
import { withAssetOrigin } from '../../app/runtime/storefrontRuntime.js';
import { createStorefrontIdempotencyKey } from '../utils/idempotency.js';
import { ANALYTICS_EVENTS, trackFunnelEvent } from '../../../../../src/observability/analyticsEvents.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: cart-mutation handlers
 * (`addToCart`/`updateQty`/`removeCartItem`), the cart-fly-to-FAB animation
 * state, and the cart/service-cart derivations. `playCartAddedSound` was
 * moved in as a private helper (single call site, zero external deps).
 *
 * Call-site ordering note: `cartTotals`/`cartCount`/`hasServiceCart`/
 * `serviceCartLines`/etc. are read synchronously (as literal dependency-array
 * entries) by many other, still-shell-resident hooks declared immediately
 * after this block used to live (original lines ~1571-3248 in the pre-move
 * shell) — this hook's call site in `StorefrontApp.jsx` MUST stay at or
 * before that original derivation point, not down near where `addToCart`
 * itself used to be declared. `addToCart` is only read synchronously once,
 * by `useFnbProductDetailActions`, further down — calling this hook earlier
 * satisfies that too.
 */
export function useCartMutations({
  bookingPermitted,
  cart,
  isFnbMode,
  isServicesMode,
  productCartPermitted,
  serviceCartFabRef,
  servicePaymentTiming,
  setCart,
  setCartImageErrors,
  setCheckoutTab,
  setIsCheckoutOpen
}) {
  const [serviceCartFlyAnimations, setServiceCartFlyAnimations] = useState([]);

  const cartTotals = useMemo(() => buildCartTotals(cart), [cart]);
  const cartSubtotal = cartTotals.subtotal;
  const cartAddOnsTotal = cartTotals.addOnsTotal;
  const cartTotal = cartTotals.total;
  const cartCount = cartTotals.count;

  const serviceCartLines = useMemo(() => cart.filter((line) => line.category === 'service'), [cart]);
  const productCartLines = useMemo(() => cart.filter((line) => line.category !== 'service'), [cart]);
  const serviceCartCount = useMemo(() => serviceCartLines.reduce((sum, line) => sum + Number(line.quantity || 0), 0), [serviceCartLines]);
  const serviceCartTotal = useMemo(() => serviceCartLines.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.price || 0)), 0), [serviceCartLines]);
  const hasServiceCart = serviceCartLines.length > 0;
  const hasMixedServiceCart = hasServiceCart && serviceCartLines.length !== cart.length;

  const playCartAddedSound = () => {
    if (typeof window === 'undefined') return;
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const audioContext = new AudioContextCtor();
      const gainNode = audioContext.createGain();
      gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime);
      gainNode.connect(audioContext.destination);

      const notes = [
        { frequency: 523.25, start: 0, duration: 0.09 },
        { frequency: 659.25, start: 0.1, duration: 0.12 }
      ];

      notes.forEach((note) => {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(note.frequency, audioContext.currentTime + note.start);
        oscillator.connect(gainNode);
        gainNode.gain.setValueAtTime(0.0001, audioContext.currentTime + note.start);
        gainNode.gain.exponentialRampToValueAtTime(0.05, audioContext.currentTime + note.start + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + note.start + note.duration);
        oscillator.start(audioContext.currentTime + note.start);
        oscillator.stop(audioContext.currentTime + note.start + note.duration);
      });

      window.setTimeout(() => {
        try {
          audioContext.close();
        } catch {
          // Ignore close failures.
        }
      }, 320);
    } catch {
      // Ignore sound failures and keep cart interaction silent.
    }
  };

  const getCartFlySourceRect = (event) => {
    const trigger = event?.currentTarget?.closest?.('[data-cart-fly-origin="true"]') || event?.currentTarget || null;
    const rect = trigger?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    };
  };

  const animateCartCardToFab = (sourceRect) => {
    if (!(isServicesMode || isFnbMode) || !sourceRect || !serviceCartFabRef.current || typeof window === 'undefined') return;
    const targetRect = serviceCartFabRef.current.getBoundingClientRect();
    const animationId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const size = Math.max(40, Math.min(84, Math.round(Math.min(sourceRect.width, sourceRect.height))));
    const startX = sourceRect.left + (sourceRect.width / 2) - (size / 2);
    const startY = sourceRect.top + (sourceRect.height / 2) - (size / 2);
    const endX = targetRect.left + (targetRect.width / 2) - (size / 2);
    const endY = targetRect.top + (targetRect.height / 2) - (size / 2);
    setServiceCartFlyAnimations((prev) => [...prev, {
      id: animationId,
      startX,
      startY,
      deltaX: endX - startX,
      deltaY: endY - startY,
      size
    }]);
    window.setTimeout(() => {
      setServiceCartFlyAnimations((prev) => prev.filter((entry) => entry.id !== animationId));
    }, 650);
  };

  const addToCart = (item, options = {}) => {
    if (isServiceCatalogItem(item) ? !bookingPermitted : !productCartPermitted) {
      toast.error('This storefront is not accepting online checkout right now.');
      return;
    }
    const requestedQuantity = Math.max(1, Number(options?.quantity || 1));
    const lineModifiers = (Array.isArray(options?.line_modifiers) ? options.line_modifiers : [])
      .map((entry) => ({
        modifier_group_id: entry?.modifier_group_id,
        modifier_option_id: entry?.modifier_option_id,
        option_name: String(entry?.option_name || '').trim(),
        price_delta: Number(entry?.price_delta || 0) || 0
      }))
      .filter((entry) => entry.modifier_group_id != null && entry.modifier_option_id != null);
    const modifierKey = JSON.stringify(lineModifiers.map((entry) => ({
      modifier_group_id: entry.modifier_group_id,
      modifier_option_id: entry.modifier_option_id
    })));
    let stockWarning = '';
    const normalizedItemId = Number(item?.item_id);
    if (Number.isFinite(normalizedItemId)) {
      setCartImageErrors((prev) => {
        if (!prev.has(normalizedItemId)) return prev;
        const next = new Set(prev);
        next.delete(normalizedItemId);
        return next;
      });
    }
    const price = Number(item.default_sale_price ?? 0);
    const maxStock = isItemAvailable(item) ? Number.POSITIVE_INFINITY : 0;
    const baseLine = {
      item_id: item.item_id,
      cart_line_id: options?.cart_line_id || `${item.item_id}:${modifierKey || 'default'}`,
      name: item.name,
      variantName: item.variantName || '',
      category: isServiceCatalogItem(item) ? 'service' : String(item.category || '').trim().toLowerCase(),
      service_detail: item.service_detail || null,
      quantity: requestedQuantity,
      price,
      image_url: withAssetOrigin(item.image_url) || null,
      unit_of_measure: item.unit_of_measure || '',
      max_stock: maxStock,
      serviceAreaLabel: item.serviceAreaLabel || '',
      durationLabel: item.durationLabel || '',
      line_modifiers: lineModifiers
    };
    setCart((prev) => {
      if (isServiceCatalogItem(item)) {
        const serviceCartLineId = options?.cart_line_id || createStorefrontIdempotencyKey(`service-line-${item.item_id}`);
        return [...prev, {
          ...baseLine,
          cart_line_id: serviceCartLineId,
          quantity: requestedQuantity,
          service_notes: String(options?.service_notes || '').trim(),
          service_schedule_at: String(options?.service_schedule_at || ''),
          payment_timing: String(options?.payment_timing || servicePaymentTiming || 'postpaid'),
          intake_responses: options?.intake_responses && typeof options.intake_responses === 'object'
            ? options.intake_responses
            : null
        }];
      }
      const found = prev.find((l) => (
        Number(l.item_id) === Number(item.item_id)
        && JSON.stringify((Array.isArray(l.line_modifiers) ? l.line_modifiers : []).map((entry) => ({
          modifier_group_id: entry?.modifier_group_id,
          modifier_option_id: entry?.modifier_option_id
        }))) === modifierKey
      ));
      if (found) {
        const requestedQty = Number(found.quantity) + requestedQuantity;
        const safeQty = Math.max(0, Math.min(requestedQty, maxStock));
        if (requestedQty > maxStock) {
          stockWarning = buildStockExceededMessage({
            item_name: item.name,
            requested_qty: requestedQty,
            available_stock: maxStock,
            unit_of_measure: item.unit_of_measure || ''
          });
        }
        return prev.map((line) => Number(line.item_id) === Number(item.item_id)
          ? (
            line.cart_line_id === found.cart_line_id
              ? { ...line, quantity: safeQty, max_stock: maxStock }
              : line
          )
          : line);
      }
      return [...prev, {
        ...baseLine,
        quantity: maxStock > 0 ? requestedQuantity : 0
      }];
    });
    if (isServiceCatalogItem(item)) {
      setCheckoutTab('review');
      setIsCheckoutOpen(false);
      animateCartCardToFab(options?.sourceRect || null);
    } else {
      setCheckoutTab(isFnbMode ? 'cart' : 'review');
      const shouldOpenCartDrawer = Boolean(options?.openCart) || !isFnbMode;
      setIsCheckoutOpen(shouldOpenCartDrawer);
      if (isFnbMode && !shouldOpenCartDrawer) {
        animateCartCardToFab(options?.sourceRect || null);
      }
    }
    playCartAddedSound();
    toast.success(`${item?.variantName || item?.name || 'Item'} added successfully!`);
    if (stockWarning) {
      toast.error(stockWarning);
    }
    trackFunnelEvent(ANALYTICS_EVENTS.CART_ITEM_ADDED, {
      item_id: item?.item_id,
      item_name: item?.name,
      price,
      quantity: requestedQuantity,
      category: isServiceCatalogItem(item) ? 'service' : item?.category
    });
  };

  const removeCartItem = (itemId, cartLineId = '') => {
    // `cart` (closure var, not the setCart updater arg) still holds the
    // pre-removal lines, so the removed line's name/price/qty can be read
    // off it before the filter runs -- removeCartItem's own args only carry
    // ids, not item details.
    const removedLine = cart.find((line) => (
      cartLineId
        ? String(line.cart_line_id || '') === String(cartLineId)
        : Number(line.item_id) === Number(itemId)
    ));
    setCart((prev) => prev.filter((line) => (
      cartLineId
        ? String(line.cart_line_id || '') !== String(cartLineId)
        : Number(line.item_id) !== Number(itemId)
    )));
    if (removedLine) {
      trackFunnelEvent(ANALYTICS_EVENTS.CART_ITEM_REMOVED, {
        item_id: removedLine.item_id,
        item_name: removedLine.name,
        price: removedLine.price,
        quantity: removedLine.quantity,
        category: removedLine.category
      });
    }
  };

  const updateQty = (itemId, qty, cartLineId = '') => {
    const parsed = Number(qty);
    if (!Number.isFinite(parsed)) return;
    if (parsed <= 0) {
      const removedLine = cart.find((line) => (
        cartLineId
          ? String(line.cart_line_id || '') === String(cartLineId)
          : Number(line.item_id) === Number(itemId)
      ));
      setCart((prev) => prev.filter((line) => (
        cartLineId
          ? String(line.cart_line_id || '') !== String(cartLineId)
          : Number(line.item_id) !== Number(itemId)
      )));
      if (removedLine) {
        trackFunnelEvent(ANALYTICS_EVENTS.CART_ITEM_REMOVED, {
          item_id: removedLine.item_id,
          item_name: removedLine.name,
          price: removedLine.price,
          quantity: removedLine.quantity,
          category: removedLine.category
        });
      }
      return;
    }
    let stockWarning = '';
    setCart((prev) => prev.map((line) => {
      const isTargetLine = cartLineId
        ? String(line.cart_line_id || '') === String(cartLineId)
        : Number(line.item_id) === Number(itemId);
      if (!isTargetLine) return line;
      const maxStock = Number.isFinite(Number(line.max_stock)) ? Number(line.max_stock) : Number.POSITIVE_INFINITY;
      const safeQty = Math.min(parsed, maxStock);
      if (parsed > maxStock) {
        stockWarning = buildStockExceededMessage({
          item_name: line.name,
          requested_qty: parsed,
          available_stock: maxStock,
          unit_of_measure: line.unit_of_measure || ''
        });
      }
      return { ...line, quantity: safeQty };
    }));
    if (stockWarning) {
      toast.error(stockWarning);
    }
  };

  return {
    addToCart,
    cartAddOnsTotal,
    cartCount,
    cartSubtotal,
    cartTotal,
    cartTotals,
    getCartFlySourceRect,
    hasMixedServiceCart,
    hasServiceCart,
    productCartLines,
    removeCartItem,
    serviceCartCount,
    serviceCartFlyAnimations,
    serviceCartLines,
    serviceCartTotal,
    updateQty
  };
}
