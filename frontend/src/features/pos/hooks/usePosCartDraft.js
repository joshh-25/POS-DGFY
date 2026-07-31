import { useEffect, useMemo, useRef } from 'react';
import { buildPosCartDraftKey, loadPosCartDraft, savePosCartDraft } from '../services/posCartDraftStore.js';

export const usePosCartDraft = ({
  activeShiftId,
  cart,
  catalog,
  catalogReady,
  enabled,
  scope,
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
    const restoredCart = loadPosCartDraft(scope, activeShiftId, catalog);
    hydratedKeyRef.current = draftKey;
    skipPersistKeyRef.current = draftKey;
    setCart(restoredCart);
  }, [activeShiftId, catalog, catalogReady, draftKey, enabled, scope, setCart]);

  useEffect(() => {
    if (!enabled || !draftKey || hydratedKeyRef.current !== draftKey) return;
    if (skipPersistKeyRef.current === draftKey) {
      skipPersistKeyRef.current = '';
      return;
    }
    savePosCartDraft(scope, activeShiftId, cart);
  }, [activeShiftId, cart, draftKey, enabled, scope]);
};
