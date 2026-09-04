/** @vitest-environment jsdom */

import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    cancelPosPaymentSession,
    completePosPaymentSession,
    createPosCheckout,
    fetchPosCatalog
} from '../../services/posService';
import {
    enqueueTerminalOperationIntent,
    getReplayCandidateEntries,
    listTerminalOperationQueueEntries,
    markTerminalOperationReplayed,
    markTerminalOperationReplaying
} from '../../services/terminalOperationQueueStore.js';
import { clearPosSplitPaymentSessionPointer } from '../../services/posSplitPaymentSessionStore.js';
import { posToast } from '@/src/utils/iminRuntimeFeedback.js';
import { usePosCheckoutWorkflow } from '../usePosCheckoutWorkflow.js';
import { POS_HARDWARE_CAPABILITIES } from '../../hardware/posHardwareContract.js';

vi.mock('../../services/posService', () => ({
    cancelPosPaymentSession: vi.fn(),
    cancelPosPaymentAllocation: vi.fn(),
    completePosPaymentSession: vi.fn(),
    createPosCheckout: vi.fn(),
    createPosParkedSale: vi.fn(),
    fetchPosCatalog: vi.fn(),
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

const createDeferred = () => {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, reject, resolve };
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
    setCustomerPaymentAmountAutoFilled: vi.fn(),
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
        completePosPaymentSession.mockResolvedValue({ transaction });
        fetchPosCatalog.mockResolvedValue([]);
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
                line_ref: 'line-7',
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
        await waitFor(() => {
            expect(markTerminalOperationReplayed).toHaveBeenCalledWith(
                createPosCheckout.mock.calls[0][0].idempotency_key,
                expect.objectContaining({ resolution_source: 'network_success' })
            );
        });
    });

    it('blocks checkout and explains when a changed price has no override reason', async () => {
        const validationMessage = 'Enter a price override reason of at least 3 characters for Coffee before checkout.';
        const { result, props } = renderCheckout({
            checkoutWorkflowValidationMessage: validationMessage
        });

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(createPosCheckout).not.toHaveBeenCalled();
        expect(posToast.error).toHaveBeenCalledWith(validationMessage);
        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
    });

    it('does not open the checkout dialog while a price override reason is missing', async () => {
        const validationMessage = 'Enter a price override reason of at least 3 characters for Coffee before checkout.';
        const { result, props } = renderCheckout({
            checkoutWorkflowValidationMessage: validationMessage
        });

        await act(async () => {
            await result.current.openCheckoutConfirmModal();
        });

        expect(posToast.error).toHaveBeenCalledWith(validationMessage);
        expect(props.setCheckoutConfirmModalOpen).not.toHaveBeenCalled();
    });

    it('maps a stale backend price-override error to the cashier-facing message', async () => {
        createPosCheckout.mockRejectedValueOnce({
            response: {
                status: 422,
                data: { message: 'Price override reason is required for item 7' }
            }
        });
        const { result } = renderCheckout();

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(posToast.error).toHaveBeenCalledWith(
            'Enter a price override reason of at least 3 characters before checkout.'
        );
        expect(posToast.error).not.toHaveBeenCalledWith('Price override reason is required for item 7');
    });

    it('clears only discount state when a discount is removed', () => {
        const { result, props } = renderCheckout();

        act(() => {
            result.current.resetDiscountState();
        });

        expect(props.setAppliedDiscount).toHaveBeenCalledWith(null);
        expect(props.setSelectedDiscountProfile).toHaveBeenCalledWith('');
        expect(props.setDiscountModalOpen).toHaveBeenCalledWith(false);
        expect(props.setOrderMethod).not.toHaveBeenCalled();
        expect(props.setTableNumber).not.toHaveBeenCalled();
        expect(props.setKitchenNotes).not.toHaveBeenCalled();
        expect(props.setPaymentType).not.toHaveBeenCalled();
        expect(props.resetEmployeeCredit).not.toHaveBeenCalled();
        expect(props.setAffiliateCodeInput).not.toHaveBeenCalled();
        expect(props.setCustomerPaymentAmountInput).not.toHaveBeenCalled();
        expect(props.setCheckoutConfirmModalOpen).not.toHaveBeenCalled();
    });

    it('uses the confirmed dialog payment snapshot instead of stale shell payment state', async () => {
        const { result } = renderCheckout({
            customerPaymentAmount: 0,
            customerPaymentChange: 0,
            isCustomerPaymentSufficient: false
        });

        await act(async () => {
            await result.current.handleCheckout({
                customerPaymentAmount: 150,
                customerPaymentChange: 50,
                isCustomerPaymentSufficient: true
            });
        });

        expect(createPosCheckout).toHaveBeenCalledWith(expect.objectContaining({
            payment_type: 'cash',
            cash_received: 150,
            change_amount: 50
        }));
        await waitFor(() => expect(markTerminalOperationReplayed).toHaveBeenCalledTimes(1));
    });

    it('reveals payment completion before capability-driven printing and audit work finishes', async () => {
        const printDeferred = createDeferred();
        const posHardware = {
            driverId: 'future_vendor_driver',
            supportsCapability: (capability) => capability === POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT,
            printReceipt: vi.fn(() => printDeferred.promise),
            openDrawer: vi.fn()
        };
        const { result, props } = renderCheckout({ posHardware });

        await act(async () => {
            await result.current.handleCheckout();
        });

        expect(props.setCheckoutLoading.mock.calls).toEqual([[true], [false]]);
        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
        expect(props.setReceiptPreviewModalOpen).toHaveBeenCalledWith(true);
        expect(props.setLastReceipt).toHaveBeenCalledWith(transaction);

        await waitFor(() => expect(posHardware.printReceipt).toHaveBeenCalledTimes(1));
        expect(markTerminalOperationReplayed).not.toHaveBeenCalled();

        await act(async () => {
            printDeferred.resolve({ success: true, message: 'Receipt printed.' });
            await printDeferred.promise;
        });
        await waitFor(() => expect(markTerminalOperationReplayed).toHaveBeenCalledTimes(1));
    });

    it('starts a later receipt without waiting for an earlier checkout audit chain', async () => {
        const firstPrint = createDeferred();
        const posHardware = {
            driverId: 'imin_native',
            supportsCapability: (capability) => capability === POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT,
            printReceipt: vi.fn()
                .mockImplementationOnce(() => firstPrint.promise)
                .mockResolvedValueOnce({ success: true, message: 'Second receipt printed.' }),
            openDrawer: vi.fn()
        };
        const { result } = renderCheckout({ posHardware });

        await act(async () => {
            await result.current.handleCheckout();
            await result.current.handleCheckout();
        });

        await waitFor(() => expect(posHardware.printReceipt).toHaveBeenCalledTimes(2));

        await act(async () => {
            firstPrint.resolve({ success: true, message: 'First receipt printed.' });
            await firstPrint.promise;
        });
    });

    it('does not pulse the drawer again after an uncertain native timeout', async () => {
        const posHardware = {
            driverId: 'imin_native',
            supportsCapability: (capability) => capability === POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT,
            printReceipt: vi.fn().mockResolvedValue({
                success: false,
                message: 'Check the printer before retrying.',
                reasonCode: 'IMIN_COMMAND_TIMEOUT',
                raw: null
            }),
            openDrawer: vi.fn()
        };
        const { result } = renderCheckout({ posHardware });

        await act(async () => {
            await result.current.handleCheckout();
        });

        await waitFor(() => expect(posToast.error).toHaveBeenCalledWith('Check the printer before retrying.'));
        expect(posHardware.openDrawer).not.toHaveBeenCalled();
    });

    it('prints a completed split payment and opens the drawer when its breakdown includes cash', async () => {
        const splitTransaction = {
            ...transaction,
            total_amount: 300,
            payment_type: 'cash',
            payment_breakdown: [
                { payment_type: 'gcash', amount: 250 },
                { payment_type: 'cash', amount: 50 }
            ]
        };
        completePosPaymentSession.mockResolvedValueOnce({ transaction: splitTransaction });
        const posHardware = {
            supportsCapability: (capability) => capability === POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT,
            printReceipt: vi.fn().mockResolvedValue({ success: true }),
            openDrawer: vi.fn()
        };
        const { result } = renderCheckout({
            posHardware,
            splitPaymentSession: { pos_payment_session_id: 91, remaining_amount: 0 }
        });

        await act(async () => {
            await result.current.handleCompletePreparedSplitPayment();
        });

        await waitFor(() => expect(posHardware.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
            transaction: splitTransaction,
            openDrawerAfterPrint: true,
            reason: 'split_checkout_auto_print'
        })));
        expect(posHardware.openDrawer).not.toHaveBeenCalled();
    });

    it('prints a non-cash split payment without opening the drawer', async () => {
        const splitTransaction = {
            ...transaction,
            total_amount: 300,
            payment_type: 'gcash',
            payment_breakdown: JSON.stringify([
                { payment_type: 'gcash', amount: 250 },
                { payment_type: 'card', amount: 50 }
            ])
        };
        completePosPaymentSession.mockResolvedValueOnce({ transaction: splitTransaction });
        const posHardware = {
            supportsCapability: (capability) => capability === POS_HARDWARE_CAPABILITIES.AUTO_PRINT_CHECKOUT,
            printReceipt: vi.fn().mockResolvedValue({ success: true }),
            openDrawer: vi.fn()
        };
        const { result } = renderCheckout({
            posHardware,
            splitPaymentSession: { pos_payment_session_id: 92, remaining_amount: 0 }
        });

        await act(async () => {
            await result.current.handleCompletePreparedSplitPayment();
        });

        await waitFor(() => expect(posHardware.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
            transaction: splitTransaction,
            openDrawerAfterPrint: false,
            reason: 'split_checkout_auto_print'
        })));
        expect(posHardware.openDrawer).not.toHaveBeenCalled();
    });

    it('never queues a duplicate checkout when post-commit bookkeeping fails', async () => {
        markTerminalOperationReplayed.mockRejectedValueOnce(new Error('IndexedDB unavailable'));
        const { result, props } = renderCheckout();

        await act(async () => {
            await result.current.handleCheckout();
        });

        await waitFor(() => {
            expect(posToast.error).toHaveBeenCalledWith(
                'Payment completed, but the local checkout queue status could not refresh.'
            );
        });
        expect(createPosCheckout).toHaveBeenCalledTimes(1);
        expect(enqueueTerminalOperationIntent).not.toHaveBeenCalled();
        expect(props.setCart).toHaveBeenCalledWith([]);
        expect(props.setReceiptPreviewModalOpen).toHaveBeenCalledWith(true);
    });

    it('refreshes parked item state before resume validation even when the loaded record is stale', async () => {
        fetchPosCatalog.mockResolvedValueOnce([{
            item_id: 7,
            name: 'Coffee',
            sku_code: 'COF-01',
            default_sale_price: 125,
            current_stock: 4
        }]);
        const { result, props } = renderCheckout({
            safeCart: [],
            safeCatalog: [{
                item_id: 7,
                name: 'Coffee',
                sku_code: 'COF-01',
                default_sale_price: 125,
                current_stock: 0,
                pos_always_available: false
            }]
        });
        const parkedSale = {
            pos_parked_sale_id: 27,
            snapshot: {
                order_method: 'dine_in',
                lines: [{
                    item_id: 7,
                    item_name: 'Coffee',
                    sku_code: 'COF-01',
                    quantity: 1,
                    base_sale_price: 125,
                    sale_price: 125
                }]
            }
        };

        let validation;
        await act(async () => {
            validation = await result.current.validateParkedSaleForResume(parkedSale, 'resume');
        });

        expect(fetchPosCatalog).toHaveBeenCalledWith({
            search: 'COF-01',
            limit: 200,
            location_id: 2
        });
        expect(validation).toEqual({
            ok: true,
            resumeContext: {
                parkedSaleId: 27,
                catalog: expect.any(Array)
            }
        });

        await act(async () => {
            await result.current.handleParkedSaleClaimed(parkedSale, 'resume', validation.resumeContext);
        });
        expect(props.setCart).toHaveBeenCalledWith([
            expect.objectContaining({ item_id: 7, item_name: 'Coffee', quantity: 1 })
        ]);
    });

    it('rejects local parked-sale blockers before fetching the catalog', async () => {
        const { result } = renderCheckout();

        let validation;
        await act(async () => {
            validation = await result.current.validateParkedSaleForResume({
                pos_parked_sale_id: 27,
                snapshot: {
                    order_method: 'dine_in',
                    lines: [{ item_id: 7, item_name: 'Coffee', quantity: 1 }]
                }
            }, 'resume');
        });

        expect(validation).toEqual({
            ok: false,
            message: 'Resume requires an empty current sale. Park or clear the current sale first.'
        });
        expect(fetchPosCatalog).not.toHaveBeenCalled();
    });

    it('refuses to hydrate a claimed parked sale without matching validation context', async () => {
        const { result, props } = renderCheckout({ safeCart: [] });

        await expect(result.current.handleParkedSaleClaimed({
            pos_parked_sale_id: 28,
            snapshot: { lines: [{ item_id: 7, item_name: 'Coffee', quantity: 1 }] }
        }, 'resume', {
            parkedSaleId: 27,
            catalog: []
        })).rejects.toThrow('This parked sale must be revalidated before it can be resumed.');
        expect(props.setCart).not.toHaveBeenCalled();
    });

    it('reports a catalog refresh failure instead of claiming a parked item was removed', async () => {
        fetchPosCatalog.mockRejectedValue(new Error('Network unavailable'));
        const { result } = renderCheckout({ safeCart: [] });

        let validation;
        await act(async () => {
            validation = await result.current.validateParkedSaleForResume({
                pos_parked_sale_id: 27,
                snapshot: {
                    order_method: 'dine_in',
                    lines: [{ item_id: 8, item_name: 'Tapsilog', quantity: 1 }]
                }
            }, 'resume');
        });

        expect(validation).toEqual({
            ok: false,
            message: 'Unable to refresh the catalog items required by this parked sale. Check the connection and try again.'
        });
    });

    it('does not fall back to stale catalog data when a refreshed parked item is no longer returned', async () => {
        fetchPosCatalog.mockResolvedValue([]);
        const { result } = renderCheckout({
            safeCart: [],
            safeCatalog: [{
                item_id: 7,
                name: 'Coffee',
                sku_code: 'COF-01',
                default_sale_price: 125,
                current_stock: 10
            }]
        });

        let validation;
        await act(async () => {
            validation = await result.current.validateParkedSaleForResume({
                pos_parked_sale_id: 27,
                snapshot: {
                    order_method: 'dine_in',
                    lines: [{
                        item_id: 7,
                        item_name: 'Coffee',
                        sku_code: 'COF-01',
                        quantity: 1,
                        base_sale_price: 125,
                        sale_price: 125
                    }]
                }
            }, 'resume');
        });

        expect(validation.ok).toBe(false);
        expect(validation.message).toContain('Coffee is no longer available');
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

    it('clears the checkout modal draft on cancel without clearing the current cart', async () => {
        const { result, props } = renderCheckout({
            appliedDiscount: { type: 'employee', employee_directory_id: 44 },
            paymentType: 'employee_credit',
            customerPaymentAmountInput: '148.75'
        });

        await act(async () => {
            await result.current.handleCancelCheckout();
        });

        expect(props.setCart).not.toHaveBeenCalled();
        expect(props.setOrderMethod).toHaveBeenCalledWith('dine_in');
        expect(props.setTableNumber).toHaveBeenCalledWith('');
        expect(props.setPaymentType).toHaveBeenCalledWith('cash');
        expect(props.resetEmployeeCredit).toHaveBeenCalledTimes(1);
        expect(props.setAppliedDiscount).toHaveBeenCalledWith(null);
        expect(props.setCustomerPaymentAmountInput).toHaveBeenCalledWith('');
        expect(props.setCustomerPaymentAmountAutoFilled).toHaveBeenCalledWith(false);
        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
    });
});
