import { useCallback, useMemo } from 'react';
import { validateFnbModifierSelections } from '../model/fnbProductDetailsModel.js';

/**
 * Builds F&B product-detail action props without letting the app shell own
 * item-detail cart orchestration.
 */
export function useFnbProductDetailActions({
  addToCart,
  goStoreOrderPage,
  item,
  modifierGroups,
  quantity,
  selectedModifiers,
  toast
}) {
  const normalizedModifiers = useMemo(
    () => (Array.isArray(selectedModifiers) ? selectedModifiers : []),
    [selectedModifiers]
  );

  const detailUnitPrice = Number(item?.default_sale_price ?? 0);
  const modifiersTotal = useMemo(
    () => normalizedModifiers.reduce((sum, entry) => sum + (Number(entry?.price_delta || 0) * Number(entry?.quantity || 1)), 0),
    [normalizedModifiers]
  );
  const detailTotalPrice = (detailUnitPrice + modifiersTotal) * Math.max(1, Number(quantity || 1));

  const addDetailToCart = useCallback(() => {
    const validation = validateFnbModifierSelections(modifierGroups, normalizedModifiers);
    if (!validation.valid) {
      toast?.error(validation.message);
      return false;
    }
    addToCart(item, {
      quantity,
      line_modifiers: normalizedModifiers,
      openCart: true
    });
    return true;
  }, [addToCart, item, modifierGroups, normalizedModifiers, quantity, toast]);

  const buyDetailNow = useCallback(() => {
    const validation = validateFnbModifierSelections(modifierGroups, normalizedModifiers);
    if (!validation.valid) {
      toast?.error(validation.message);
      return false;
    }
    addToCart(item, {
      quantity,
      line_modifiers: normalizedModifiers,
      openCart: true
    });
    goStoreOrderPage({ initialTab: 'cart' });
    return true;
  }, [addToCart, goStoreOrderPage, item, modifierGroups, normalizedModifiers, quantity, toast]);

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
