import { useMemo } from 'react';

/**
 * Assembles product-detail route props outside the app shell. Simple mode still
 * uses this route contract until it has a fully owned detail-route container.
 */
export function useFnbProductDetailsRouteProps({
  actions,
  detailRuntime,
  isMobileViewport,
  isItemAvailable,
  onToggleModifier,
  onModifierQuantityChange,
  navigation,
  reviewProps,
  selectedLocation,
  selectedStore,
  withAssetOrigin
}) {
  return useMemo(() => {
    const item = detailRuntime?.detailPageFnbItem || null;

    return {
      ...reviewProps,
      allergens: detailRuntime?.detailPageFnbAllergens || [],
      available: item ? isItemAvailable(item) : false,
      branchLabel: selectedLocation?.name || selectedStore?.location_name || 'Main Branch',
      isMobileViewport,
      item,
      modifierCounts: detailRuntime?.detailPageFnbModifierCounts || {},
      modifierGroups: detailRuntime?.detailPageFnbModifierGroups || [],
      nutritionCards: detailRuntime?.detailPageFnbNutritionCards || [],
      onAddToCart: actions?.addDetailToCart,
      onBack: navigation?.onBack,
      onBuyNow: actions?.buyDetailNow,
      onQuickAdd: actions?.quickAddRelatedItem,
      onSelectRelatedItem: navigation?.onSelectRelatedItem,
      onToggleModifier,
      onModifierQuantityChange,
      quantity: detailRuntime?.selectedFnbDetailQuantity,
      relatedItems: detailRuntime?.detailPageFnbRelatedItems || [],
      selectedModifiers: detailRuntime?.selectedFnbLineModifiers || [],
      setQuantity: detailRuntime?.setSelectedFnbDetailQuantity,
      storeLogoUrl: withAssetOrigin(selectedStore?.storefront_profile_image_url),
      storeName: selectedStore?.tenant_name || 'Storefront',
      totalPrice: actions?.detailTotalPrice,
      unitPrice: actions?.detailUnitPrice
    };
  }, [
    actions,
    detailRuntime,
    isItemAvailable,
    isMobileViewport,
    navigation,
    onToggleModifier,
    onModifierQuantityChange,
    reviewProps,
    selectedLocation,
    selectedStore,
    withAssetOrigin
  ]);
}
