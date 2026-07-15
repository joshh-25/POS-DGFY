import { useEffect, useState } from 'react';

/**
 * Keeps F&B product-detail selection synchronized with the existing item route.
 * Navigation remains owned by the storefront route shell during this slice.
 */
export function useFnbProductDetailsRoute({ catalog, isFnbMode, routeItemId }) {
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
    const matchedItem = catalog.find((entry) => String(entry?.item_id) === String(routeItemId)) || null;
    setSelectedFnbDetail(matchedItem);
    setSelectedFnbDetailQuantity(1);
    setSelectedFnbLineModifiers([]);
  }, [catalog, isFnbMode, routeItemId]);

  return {
    selectedFnbDetail,
    selectedFnbDetailQuantity,
    selectedFnbLineModifiers,
    setSelectedFnbDetail,
    setSelectedFnbDetailQuantity,
    setSelectedFnbLineModifiers
  };
}
