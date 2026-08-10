import { useEffect, useMemo, useState } from 'react';
import {
  buildFnbProductDetailMetadata,
  buildDefaultFnbModifierSelections,
  buildFnbRelatedItems,
  resolveFnbProductDetailItem
} from '../model/fnbProductDetailsModel.js';
import { buildSimpleRelatedItems } from '../../../simple/storefront/model/simpleProductDetailsModel.js';

/**
 * Keeps product-detail route state and derived view metadata out of the root shell.
 * Navigation still remains owned by the storefront route shell during this slice.
 */
export function useFnbProductDetailsRoute({
  catalog,
  filteredCatalog,
  filteredFnbViewModel,
  isFnbMode,
  isSimpleMode,
  routeItemId
}) {
  const [selectedFnbDetail, setSelectedFnbDetail] = useState(null);
  const [selectedFnbDetailQuantity, setSelectedFnbDetailQuantity] = useState(1);
  const [selectedFnbLineModifiers, setSelectedFnbLineModifiers] = useState([]);

  useEffect(() => {
    if (!isFnbMode) return;
    if (!routeItemId) {
      // Route removal intentionally clears the detail-only view state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFnbDetail(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFnbDetailQuantity(1);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedFnbLineModifiers([]);
      return;
    }
    const matchedItem = (Array.isArray(catalog) ? catalog : []).find((entry) => String(entry?.item_id) === String(routeItemId)) || null;
    setSelectedFnbDetail(matchedItem);
    setSelectedFnbDetailQuantity(1);
    const groups = buildFnbProductDetailMetadata({ detailItem: matchedItem, selectedModifiers: [] }).modifierGroups;
    setSelectedFnbLineModifiers(buildDefaultFnbModifierSelections(groups));
  }, [catalog, isFnbMode, routeItemId]);

  const detailPageFnbItem = useMemo(() => resolveFnbProductDetailItem({
    selectedDetail: selectedFnbDetail,
    routeItemId,
    catalog
  }), [catalog, routeItemId, selectedFnbDetail]);

  const detailPageFnbMetadata = useMemo(() => buildFnbProductDetailMetadata({
    detailItem: detailPageFnbItem,
    selectedModifiers: selectedFnbLineModifiers
  }), [detailPageFnbItem, selectedFnbLineModifiers]);

  const detailPageFnbRelatedItems = useMemo(() => {
    if (isSimpleMode) {
      return buildSimpleRelatedItems({
        detailItem: detailPageFnbItem,
        catalog: filteredCatalog
      });
    }
    return buildFnbRelatedItems({
      detailItem: detailPageFnbItem,
      menuItems: filteredFnbViewModel?.menuItems
    });
  }, [detailPageFnbItem, filteredCatalog, filteredFnbViewModel, isSimpleMode]);

  return {
    detailPageFnbAllergens: detailPageFnbMetadata.allergens,
    detailPageFnbItem,
    detailPageFnbModifierCounts: detailPageFnbMetadata.modifierCounts,
    detailPageFnbModifierGroups: detailPageFnbMetadata.modifierGroups,
    detailPageFnbNutritionCards: detailPageFnbMetadata.nutritionCards,
    detailPageFnbRelatedItems,
    selectedFnbDetail,
    selectedFnbDetailQuantity,
    selectedFnbLineModifiers,
    setSelectedFnbDetail,
    setSelectedFnbDetailQuantity,
    setSelectedFnbLineModifiers
  };
}
