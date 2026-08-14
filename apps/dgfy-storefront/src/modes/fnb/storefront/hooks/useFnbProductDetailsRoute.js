import { useEffect, useMemo, useRef, useState } from 'react';
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
  editingCartLine = null,
  isFnbMode,
  isSimpleMode,
  routeItemId
}) {
  const [selectedFnbDetail, setSelectedFnbDetail] = useState(null);
  const [selectedFnbDetailQuantity, setSelectedFnbDetailQuantity] = useState(1);
  const [selectedFnbLineModifiers, setSelectedFnbLineModifiers] = useState([]);
  const appliedEditKeyRef = useRef('');

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
      appliedEditKeyRef.current = '';
      return;
    }
    const matchedItem = (Array.isArray(catalog) ? catalog : []).find((entry) => String(entry?.item_id) === String(routeItemId)) || null;
    setSelectedFnbDetail(matchedItem);
    const isEditingThisLine = editingCartLine
      && String(editingCartLine.item_id) === String(routeItemId)
      && String(editingCartLine.cart_line_id || '').trim();
    if (isEditingThisLine) {
      const editKey = `${editingCartLine.cart_line_id}:${routeItemId}`;
      if (appliedEditKeyRef.current !== editKey) {
        setSelectedFnbDetailQuantity(Math.max(1, Number(editingCartLine.quantity || 1)));
        setSelectedFnbLineModifiers(Array.isArray(editingCartLine.line_modifiers) ? editingCartLine.line_modifiers : []);
        appliedEditKeyRef.current = editKey;
      }
      return;
    }
    appliedEditKeyRef.current = '';
    setSelectedFnbDetailQuantity(1);
    const groups = buildFnbProductDetailMetadata({ detailItem: matchedItem, selectedModifiers: [] }).modifierGroups;
    setSelectedFnbLineModifiers(buildDefaultFnbModifierSelections(groups));
  }, [catalog, editingCartLine, isFnbMode, routeItemId]);

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
    editingFnbCartLine: editingCartLine,
    selectedFnbDetailQuantity,
    selectedFnbLineModifiers,
    setSelectedFnbDetail,
    setSelectedFnbDetailQuantity,
    setSelectedFnbLineModifiers
  };
}
