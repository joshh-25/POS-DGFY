import { useCallback, useMemo } from 'react';

/**
 * Builds F&B product-detail action props without letting the app shell own
 * item-detail cart orchestration.
 */
export function useFnbProductDetailActions({
  addToCart,
  goStoreOrderPage,
  item,
  quantity,
  selectedModifiers
}) {
  const normalizedModifiers = useMemo(
    () => (Array.isArray(selectedModifiers) ? selectedModifiers : []),
    [selectedModifiers]
  );

  const detailUnitPrice = Number(item?.default_sale_price ?? 0);
  const modifiersTotal = useMemo(
    () => normalizedModifiers.reduce((sum, entry) => sum + Number(entry?.price_delta || 0), 0),
    [normalizedModifiers]
  );
  const detailTotalPrice = (detailUnitPrice + modifiersTotal) * Math.max(1, Number(quantity || 1));

  const addDetailToCart = useCallback(() => {
    addToCart(item, {
      quantity,
      line_modifiers: normalizedModifiers,
      openCart: true
    });
  }, [addToCart, item, normalizedModifiers, quantity]);

  const buyDetailNow = useCallback(() => {
    addToCart(item, {
      quantity,
      line_modifiers: normalizedModifiers,
      openCart: true
    });
    goStoreOrderPage({ initialTab: 'cart' });
  }, [addToCart, goStoreOrderPage, item, normalizedModifiers, quantity]);

  const quickAddRelatedItem = useCallback((relatedItem) => {
    addToCart(relatedItem, { openCart: true });
  }, [addToCart]);

  return {
    addDetailToCart,
    buyDetailNow,
    detailTotalPrice,
    detailUnitPrice,
    quickAddRelatedItem
  };
}
