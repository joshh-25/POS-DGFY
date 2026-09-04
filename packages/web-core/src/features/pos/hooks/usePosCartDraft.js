import { useEffect, useMemo, useRef } from 'react';
import { buildPosCartDraftKey, loadPosCartDraftState, savePosCartDraft } from '../services/posCartDraftStore.js';

export const usePosCartDraft = ({
  activeShiftId,
  activeParkedSale = null,
  cart,
  catalog,
  catalogReady,
  enabled,
  scope,
  setActiveParkedSale = null,
  setCart
}) => {
  const hydratedKeyRef = useRef('');
  const skipPersistKeyRef = useRef('');
  const draftKey = useMemo(
    () => buildPosCartDraftKey(scope, activeShiftId),
    [activeShiftId, scope]
  );

  useEffect(() => {
    if (!enabled || !catalogReady || !draftKey) {
      hydratedKeyRef.current = '';
      return;
    }
    if (hydratedKeyRef.current === draftKey) return;
    const restored = loadPosCartDraftState(scope, activeShiftId, catalog);
    hydratedKeyRef.current = draftKey;
    skipPersistKeyRef.current = draftKey;
    setCart(restored.cart);
    setActiveParkedSale?.(restored.activeParkedSale);
  }, [activeShiftId, catalog, catalogReady, draftKey, enabled, scope, setActiveParkedSale, setCart]);

  useEffect(() => {
    if (!enabled || !draftKey || hydratedKeyRef.current !== draftKey) return;
    if (skipPersistKeyRef.current === draftKey) {
      skipPersistKeyRef.current = '';
      return;
    }
    savePosCartDraft(scope, activeShiftId, cart, { activeParkedSale });
  }, [activeParkedSale, activeShiftId, cart, draftKey, enabled, scope]);
};
