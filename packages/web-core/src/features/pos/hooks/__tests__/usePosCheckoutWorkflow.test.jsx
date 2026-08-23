/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cancelPosPaymentSession,
    createPosCheckout
} from '../../services/posService';
import {
    getReplayCandidateEntries,
    listTerminalOperationQueueEntries,
    markTerminalOperationReplayed,
    markTerminalOperationReplaying
} from '../../services/terminalOperationQueueStore.js';
import { clearPosSplitPaymentSessionPointer } from '../../services/posSplitPaymentSessionStore.js';
import { usePosCheckoutWorkflow } from '../usePosCheckoutWorkflow.js';

vi.mock('../../services/posService', () => ({
    cancelPosPaymentSession: vi.fn(),
    cancelPosPaymentAllocation: vi.fn(),
    completePosPaymentSession: vi.fn(),
    createPosCheckout: vi.fn(),
    createPosParkedSale: vi.fn(),
    reparkPosParkedSale: vi.fn()
}));

vi.mock('../../services/terminalOperationQueueStore.js', () => ({
    TERMINAL_QUEUE_STATUS: {
        QUEUED: 'queued',
        REPLAYING: 'replaying',
        FAILED_MANUAL_RESOLUTION_REQUIRED: 'failed_manual_resolution_required'
    },
    enqueueTerminalOperationIntent: vi.fn(),
    getReplayCandidateEntries: vi.fn(),
    listTerminalOperationQueueEntries: vi.fn(),
    markTerminalOperationFailedManualResolution: vi.fn(),
    markTerminalOperationReplayed: vi.fn(),
    markTerminalOperationReplaying: vi.fn(),
    markTerminalOperationRetryScheduled: vi.fn()
}));

vi.mock('../../services/posSplitPaymentSessionStore.js', () => ({
    clearPosSplitPaymentSessionPointer: vi.fn()
}));

vi.mock('../../services/posCartDraftStore.js', () => ({
    clearPosCartDraft: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        error: vi.fn(),
        info: vi.fn(),
        message: vi.fn(),
        success: vi.fn()
    }
}));

const transaction = {
    pos_transaction_id: 17,
    invoice_number: 'NFS-000017',
    total_amount: 100,
    status: 'completed'
};

const createBaseProps = (overrides = {}) => ({
    activeShiftId: 4,
    selectedLocationId: 2,
    normalizedTerminalId: 'COUNTER-01',
    offlineSnapshotScope: { tenantId: 1, terminalId: 'COUNTER-01', locationId: 2, userId: 9 },
    posWorkflow: { mode: 'retail', allowedMethods: ['dine_in'] },
    orderMethod: 'dine_in',
    safeCatalog: [{ item_id: 7, current_stock: 10 }],
    catalog: [{ item_id: 7, current_stock: 10 }],
    safeCart: [{
        line_key: 'line-7',
        item_id: 7,
        item_name: 'Coffee',
        quantity: 1,
        sale_price: 100,
        vat_type: 'vatable'
    }],
    cartSubtotal: 100,
    cartTotal: 100,
    vatBreakdown: { vatableSales: 89.29, vatAmount: 10.71, vatExemptSales: 0, zeroRatedSales: 0 },
    paymentType: 'cash',
    isCashPayment: true,
    isCustomerPaymentSufficient: true,
    customerPaymentAmount: 100,
    customerPaymentChange: 0,
    isCheckoutWorkflowValid: true,
    itemDiscountTotals: { discountAmount: 0 },
    governedDiscountTotals: { vatRemoved: 0, vatExemptAmount: 0, discountAmount: 0 },
    setCart: vi.fn(),
    setCatalog: vi.fn(),
    saveCatalogSnapshot: vi.fn(),
    setActiveParkedSale: vi.fn(),
    setParkedSalePayContext: vi.fn(),
    setParkedSaleReleaseLoading: vi.fn(),
    setCheckoutLoading: vi.fn(),
    setParkLoading: vi.fn(),
    setQueuedCheckouts: vi.fn(),
    setReplayingQueuedCheckouts: vi.fn(),
    setLastReceipt: vi.fn(),
    setLastReceiptContract: vi.fn(),
    setReceiptPreviewSource: vi.fn(),
    setReceiptPreviewModalOpen: vi.fn(),
    setCheckoutConfirmModalOpen: vi.fn(),
    setSplitPaymentDialogOpen: vi.fn(),
    setSplitPaymentSession: vi.fn(),
    setSplitPaymentWorkflowVersion: vi.fn(),
    setSplitPaymentCancelModalOpen: vi.fn(),
    setSplitPaymentCancelLoading: vi.fn(),
    resetEmployeeCredit: vi.fn(),
    setSelectedDiscountProfile: vi.fn(),
    setManualDiscountMode: vi.fn(),
    setManualDiscountRateInput: vi.fn(),
    setManualDiscountAmountInput: vi.fn(),
    setAppliedDiscount: vi.fn(),
    setDiscountDraft: vi.fn(),
    setDiscountModalOpen: vi.fn(),
    setShowDiscountPin: vi.fn(),
    setAffiliateCodeInput: vi.fn(),
    setCustomerPaymentAmountInput: vi.fn(),
    setOrderMethod: vi.fn(),
    setTableNumber: vi.fn(),
    setKitchenNotes: vi.fn(),
    setServicesClientName: vi.fn(),
    setServicesDateTime: vi.fn(),
    setServicesProvider: vi.fn(),
    setServicesResource: vi.fn(),
    setServicesNotes: vi.fn(),
    setPaymentType: vi.fn(),
    setMobileCheckoutPanelOpen: vi.fn(),
    setItemOptionsLineKey: vi.fn(),
    setServiceOptionsModal: vi.fn(),
    setCurrentSaleHelpOpen: vi.fn(),
    setParkedSalesDialogOpen: vi.fn(),
    setParkSaleNameDialogOpen: vi.fn(),
    setParkSaleNameInput: vi.fn(),
    setCurrentViewMode: vi.fn(),
    itemDiscountApprovalRef: { current: new Map() },
    discountApprovalRef: { current: null },
    splitPaymentStorageScopeKey: 'tenant:1:9:COUNTER-01:4:2',
    loadCatalog: vi.fn(),
    loadHistory: vi.fn(),
    onCheckoutCompleted: vi.fn(),
    ...overrides
});

const renderCheckout = (overrides = {}) => {
    const props = createBaseProps(overrides);
    return { ...renderHook(() => usePosCheckoutWorkflow(props)), props };
};

describe('usePosCheckoutWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        listTerminalOperationQueueEntries.mockResolvedValue([]);
        getReplayCandidateEntries.mockResolvedValue([]);
        markTerminalOperationReplaying.mockResolvedValue(undefined);
        markTerminalOperationReplayed.mockResolvedValue(undefined);
        cancelPosPaymentSession.mockResolvedValue({});
        createPosCheckout.mockResolvedValue({ transaction });
    });

    it('submits the existing checkout payload contract and resets the cart only after success', async () => {
        const { result, props } = renderCheckout();

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(createPosCheckout).toHaveBeenCalledWith(expect.objectContaining({
            terminal_id: 'COUNTER-01',
            location_id: 2,
            shift_id: 4,
            payment_type: 'cash',
            lines: [{
                item_id: 7,
                quantity: 1,
                sale_price: 100,
                scan_metadata: undefined
            }]
        }));
        expect(createPosCheckout.mock.calls[0][0].idempotency_key).toEqual(expect.any(String));
        expect(props.setCart).toHaveBeenCalledWith([]);
        expect(props.setLastReceipt).toHaveBeenCalledWith(transaction);
        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
        expect(props.onCheckoutCompleted).toHaveBeenCalledWith(transaction);
        expect(markTerminalOperationReplayed).toHaveBeenCalledWith(
            createPosCheckout.mock.calls[0][0].idempotency_key,
            expect.objectContaining({ resolution_source: 'network_success' })
        );
    });

    it('replays a queued checkout with its original idempotency key and marks it resolved', async () => {
        const queuedPayload = {
            idempotency_key: 'offline-checkout-17',
            terminal_id: 'COUNTER-01',
            payment_type: 'cash',
            lines: [{ item_id: 7, quantity: 1, sale_price: 100 }]
        };
        getReplayCandidateEntries.mockResolvedValue([{
            intent_id: 'offline-checkout-17',
            operation: 'checkout',
            payload: queuedPayload,
            attempt_count: 0
        }]);
        const { result } = renderCheckout();

        await act(async () => {
            await result.current.replayQueuedCheckouts();
        });

        expect(markTerminalOperationReplaying).toHaveBeenCalledWith('offline-checkout-17');
        expect(createPosCheckout).toHaveBeenCalledWith(queuedPayload);
        expect(markTerminalOperationReplayed).toHaveBeenCalledWith('offline-checkout-17');
    });

    it('cancels a split-payment session through the service and clears the local pointer', async () => {
        const { result, props } = renderCheckout({
            splitPaymentSession: { pos_payment_session_id: 22 },
            splitPaymentSuccessfulAllocations: []
        });

        await act(async () => {
            await result.current.handleCancelCheckout();
        });

        expect(cancelPosPaymentSession).toHaveBeenCalledWith(22, {
            shift_id: 4,
            terminal_id: 'COUNTER-01',
            location_id: 2,
            reason: 'Cashier cancelled split-payment checkout before payment was recorded.'
        });
        expect(clearPosSplitPaymentSessionPointer).toHaveBeenCalledWith('tenant:1:9:COUNTER-01:4:2');
        expect(props.setSplitPaymentSession).toHaveBeenCalledWith(null);
        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
    });
});
