/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clearPosCartDraft } from '../services/posCartDraftStore.js';
import { posToast } from '@/src/utils/iminRuntimeFeedback.js';
import { usePosCheckoutLifecycle } from '../hooks/usePosCheckoutLifecycle.js';

vi.mock('../services/posCartDraftStore.js', () => ({
    clearPosCartDraft: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        info: vi.fn(),
        success: vi.fn()
    }
}));

const createProps = (overrides = {}) => ({
    activeShiftId: 12,
    offlineSnapshotScope: { tenantId: 3, terminalId: 'POS-01', locationId: 4, userId: 9 },
    onCheckoutLifecycleChange: vi.fn(),
    onViewModeChange: vi.fn(),
    resetCurrentSaleForNewSale: vi.fn(),
    safeCartLength: 1,
    setActiveParkedSale: vi.fn(),
    setClearSaleConfirmOpen: vi.fn(),
    setCurrentSaleHelpOpen: vi.fn(),
    ...overrides
});

describe('usePosCheckoutLifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('requires confirmation before leaving checkout with an unsaved sale', () => {
        const props = createProps();
        const { result } = renderHook(() => usePosCheckoutLifecycle(props));
        const lifecycle = props.onCheckoutLifecycleChange.mock.calls[0][0];

        let mayLeave;
        act(() => {
            mayLeave = lifecycle.requestViewModeChange('items');
        });

        expect(mayLeave).toBe(false);
        expect(props.setClearSaleConfirmOpen).toHaveBeenCalledWith(true);

        act(() => {
            result.current.confirmClearCurrentSale();
        });

        expect(clearPosCartDraft).toHaveBeenCalledWith(props.offlineSnapshotScope, props.activeShiftId);
        expect(props.resetCurrentSaleForNewSale).toHaveBeenCalledTimes(1);
        expect(props.onViewModeChange).toHaveBeenCalledWith('items');
        expect(posToast.info).toHaveBeenCalledWith('Current sale cleared before leaving checkout.');
    });

    it('releases an active parked sale and clears local checkout state when ending the session', async () => {
        const releaseActiveParkedSaleForSessionEnd = vi.fn().mockResolvedValue(true);
        const props = createProps({
            activeParkedSale: { pos_parked_sale_id: 44 },
            releaseActiveParkedSaleForSessionEnd,
            onCheckoutLifecycleChange: vi.fn()
        });
        renderHook(() => usePosCheckoutLifecycle(props));
        const lifecycle = props.onCheckoutLifecycleChange.mock.calls[0][0];

        await act(async () => {
            await lifecycle.clearTransientSaleForSessionEnd();
        });

        expect(releaseActiveParkedSaleForSessionEnd).toHaveBeenCalledWith({ sessionEnd: true });
        expect(clearPosCartDraft).not.toHaveBeenCalled();
        expect(props.resetCurrentSaleForNewSale).not.toHaveBeenCalled();
    });

    it('always clears local checkout state when a parked sale cannot be released during logout', async () => {
        const releaseActiveParkedSaleForSessionEnd = vi.fn().mockResolvedValue(false);
        const props = createProps({
            activeParkedSale: { pos_parked_sale_id: 44 },
            releaseActiveParkedSaleForSessionEnd,
            onCheckoutLifecycleChange: vi.fn()
        });
        renderHook(() => usePosCheckoutLifecycle(props));
        const lifecycle = props.onCheckoutLifecycleChange.mock.calls[0][0];

        await act(async () => {
            await lifecycle.clearTransientSaleForSessionEnd();
        });

        expect(clearPosCartDraft).toHaveBeenCalledWith(props.offlineSnapshotScope, props.activeShiftId);
        expect(props.setActiveParkedSale).toHaveBeenCalledWith(null);
        expect(props.resetCurrentSaleForNewSale).toHaveBeenCalledTimes(1);
    });
});
