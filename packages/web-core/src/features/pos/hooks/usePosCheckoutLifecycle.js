import { useCallback, useEffect, useState } from 'react';
import { posToast as toast } from '@/src/utils/iminRuntimeFeedback.js';
import { clearPosCartDraft } from '../services/posCartDraftStore.js';

export const usePosCheckoutLifecycle = ({
    activeParkedSale = null,
    activeShiftId = null,
    offlineSnapshotScope = {},
    onCheckoutLifecycleChange = null,
    onViewModeChange = null,
    posActionsBlocked = false,
    releaseActiveParkedSaleForSessionEnd = null,
    resetCurrentSaleForNewSale,
    safeCartLength = 0,
    setActiveParkedSale,
    setClearSaleConfirmOpen,
    setCurrentSaleHelpOpen
}) => {
    const [pendingViewModeAfterSaleClear, setPendingViewModeAfterSaleClear] = useState(null);
    const clearTransientSale = useCallback(() => {
        if (activeParkedSale?.pos_parked_sale_id) return false;
        clearPosCartDraft(offlineSnapshotScope, activeShiftId);
        setActiveParkedSale(null);
        resetCurrentSaleForNewSale();
        return true;
    }, [activeParkedSale?.pos_parked_sale_id, activeShiftId, offlineSnapshotScope, resetCurrentSaleForNewSale, setActiveParkedSale]);

    const clearTransientSaleForSessionEnd = useCallback(async () => {
        if (activeParkedSale?.pos_parked_sale_id && typeof releaseActiveParkedSaleForSessionEnd === 'function') {
            const released = await releaseActiveParkedSaleForSessionEnd({ sessionEnd: true });
            if (released) return true;
        }
        clearPosCartDraft(offlineSnapshotScope, activeShiftId);
        setActiveParkedSale(null);
        resetCurrentSaleForNewSale();
        return true;
    }, [activeParkedSale?.pos_parked_sale_id, activeShiftId, offlineSnapshotScope, releaseActiveParkedSaleForSessionEnd, resetCurrentSaleForNewSale, setActiveParkedSale]);

    const requestViewModeChange = useCallback((nextMode) => {
        if (safeCartLength === 0) return true;
        if (activeParkedSale?.pos_parked_sale_id) {
            toast.info('Finish or update the active parked sale before leaving checkout.');
            return false;
        }
        setCurrentSaleHelpOpen(false);
        setPendingViewModeAfterSaleClear(String(nextMode || '').trim() || null);
        setClearSaleConfirmOpen(true);
        return false;
    }, [activeParkedSale?.pos_parked_sale_id, safeCartLength, setClearSaleConfirmOpen, setCurrentSaleHelpOpen]);

    const confirmClearCurrentSale = useCallback(() => {
        const nextViewMode = pendingViewModeAfterSaleClear;
        if (posActionsBlocked || safeCartLength === 0 || activeParkedSale?.pos_parked_sale_id) {
            setClearSaleConfirmOpen(false);
            return;
        }
        clearTransientSale();
        setPendingViewModeAfterSaleClear(null);
        setClearSaleConfirmOpen(false);
        if (nextViewMode) {
            toast.info('Current sale cleared before leaving checkout.');
            onViewModeChange?.(nextViewMode);
        } else {
            toast.success('Current sale cleared.');
        }
    }, [activeParkedSale?.pos_parked_sale_id, clearTransientSale, onViewModeChange, pendingViewModeAfterSaleClear, posActionsBlocked, safeCartLength, setClearSaleConfirmOpen]);

    const handleClearSaleDialogOpenChange = useCallback((open) => {
        setClearSaleConfirmOpen(open);
        if (!open) setPendingViewModeAfterSaleClear(null);
    }, [setClearSaleConfirmOpen]);

    useEffect(() => {
        if (typeof onCheckoutLifecycleChange !== 'function') return undefined;
        onCheckoutLifecycleChange({
            clearTransientSaleForSessionEnd,
            requestViewModeChange
        });
        return () => onCheckoutLifecycleChange(null);
    }, [clearTransientSaleForSessionEnd, onCheckoutLifecycleChange, requestViewModeChange]);

    return { clearTransientSale, confirmClearCurrentSale, handleClearSaleDialogOpenChange, pendingViewModeAfterSaleClear };
};

export default usePosCheckoutLifecycle;
