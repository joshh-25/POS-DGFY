/** @vitest-environment jsdom */

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePosDrawerOpen } from '../../services/posService.js';
import { usePosReceiptHardwareWorkflow } from '../usePosReceiptHardwareWorkflow.js';

vi.mock('../../services/posService.js', () => ({
    authorizePosDrawerOpen: vi.fn()
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
    posToast: {
        error: vi.fn(),
        info: vi.fn(),
        message: vi.fn(),
        success: vi.fn()
    }
}));

const createHardware = () => ({
    printReceipt: vi.fn().mockResolvedValue({ success: true, message: 'Receipt printed.' }),
    printOrderTicket: vi.fn().mockResolvedValue({ success: true, message: 'Order ticket sent.' }),
    openDrawer: vi.fn().mockResolvedValue({ success: true, message: 'Cash drawer opened.' })
});

const createBaseProps = (overrides = {}) => ({
    activeShiftId: 4,
    terminalUser: { user_id: 9, role: 'cashier' },
    normalizedTerminalId: 'COUNTER-01',
    receiptSettings: { pos_business_name: 'DGFY Cafe' },
    lastReceipt: null,
    posHardware: createHardware(),
    safeCart: [{
        line_key: 'line-7',
        item_id: 7,
        item_name: 'Coffee',
        quantity: 1,
        sale_price: 100
    }],
    cartTotal: 100,
    orderMethod: 'dine_in',
    normalizedFnbContext: null,
    tableNumber: '',
    kitchenNotes: '',
    isFnbWorkflow: false,
    setCheckoutConfirmModalOpen: vi.fn(),
    onExternalReceiptClosed: vi.fn(),
    ...overrides
});

const renderWorkflow = (overrides = {}) => {
    const props = createBaseProps(overrides);
    return { ...renderHook(() => usePosReceiptHardwareWorkflow(props)), props };
};

describe('usePosReceiptHardwareWorkflow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        authorizePosDrawerOpen.mockResolvedValue({ authorization_token: 'drawer-token-1' });
    });

    it('prints a saved receipt without silently opening the cash drawer', async () => {
        const transaction = { pos_transaction_id: 17, total_amount: 100 };
        const { result, props } = renderWorkflow({ lastReceipt: transaction });

        await act(async () => {
            await result.current.handlePrintReceipt(transaction, 'receipt_preview');
        });

        expect(props.posHardware.printReceipt).toHaveBeenCalledWith(expect.objectContaining({
            transaction,
            shiftId: 4,
            transactionId: 17,
            terminalId: 'COUNTER-01',
            reason: 'receipt_preview',
            openDrawerAfterPrint: false,
            idempotencyKey: expect.any(String)
        }));
        expect(result.current.receiptPrinting).toBe(false);
    });

    it('creates a bill draft and preserves the F&B print context', async () => {
        const { result, props } = renderWorkflow({
            isFnbWorkflow: true,
            tableNumber: 'Table 4',
            kitchenNotes: 'No onions',
            normalizedFnbContext: { fnb_check_id: 88 }
        });

        await act(async () => {
            await result.current.handleBillRequest();
        });

        expect(props.setCheckoutConfirmModalOpen).toHaveBeenCalledWith(false);
        expect(result.current.billRequestDraft).toEqual({
            lines: [{ lineKey: 'line-7', itemId: 7, itemName: 'Coffee', quantity: 1, unitPrice: 100 }],
            total: 100
        });
        expect(props.posHardware.printOrderTicket).toHaveBeenCalledWith(expect.objectContaining({
            cart: props.safeCart,
            orderMethod: 'dine_in',
            billRequest: true,
            billTotal: 100,
            orderNotes: 'No onions'
        }));
        expect(result.current.billRequestPrinting).toBe(false);
    });

    it('prints the selected historical order instead of the active cart', async () => {
        const transaction = {
            pos_transaction_id: 19,
            order_method: 'dine_in',
            fnb_table_label_snapshot: 'T-04',
            special_instructions: 'No onions',
            lines: [{
                line_id: 23,
                item_id: 12,
                item_name_snapshot: 'Burger Meal',
                quantity: 2,
                sale_price: 150,
                fnb_special_instructions: 'Extra sauce'
            }]
        };
        const { result, props } = renderWorkflow({
            safeCart: [{ line_key: 'active-line', item_id: 99, item_name: 'Active item', quantity: 1, sale_price: 10 }]
        });

        await act(async () => {
            await result.current.handlePrintOrder(transaction);
        });

        expect(props.posHardware.printOrderTicket).toHaveBeenCalledWith(expect.objectContaining({
            cart: [expect.objectContaining({
                line_id: 23,
                item_id: 12,
                item_name: 'Burger Meal',
                quantity: 2,
                sale_price: 150,
                fnb_special_instructions: 'Extra sauce'
            })],
            orderMethod: 'dine_in',
            fnbContext: { table_label: 'T-04', fnb_table_label_snapshot: 'T-04' },
            orderNotes: 'No onions'
        }));
    });

    it('uses the active cart when a click event is passed to the print handler', async () => {
        const { result, props } = renderWorkflow();

        await act(async () => {
            await result.current.handlePrintOrder({
                preventDefault: vi.fn(),
                nativeEvent: {}
            });
        });

        expect(props.posHardware.printOrderTicket).toHaveBeenCalledWith(expect.objectContaining({
            cart: props.safeCart,
            orderMethod: 'dine_in'
        }));
    });

    it('authorizes a cashier drawer opening with the same idempotency key as the hardware command', async () => {
        const { result, props } = renderWorkflow();

        act(() => {
            result.current.handleOpenDrawer({ transactionId: 17 });
            result.current.setDrawerAuthorizationReason('Cash change');
            result.current.setDrawerAuthorizationPin('1234');
        });

        await act(async () => {
            await result.current.submitDrawerAuthorization();
        });

        const authorizationPayload = authorizePosDrawerOpen.mock.calls[0][0];
        const hardwarePayload = props.posHardware.openDrawer.mock.calls[0][0];
        expect(authorizationPayload).toEqual(expect.objectContaining({
            shift_id: 4,
            transaction_id: 17,
            terminal_id: 'COUNTER-01',
            reason: 'Cash change',
            authorization_pin: '1234',
            idempotency_key: expect.any(String)
        }));
        expect(hardwarePayload).toEqual(expect.objectContaining({
            shiftId: 4,
            transactionId: 17,
            drawerAuthorizationToken: 'drawer-token-1',
            idempotencyKey: authorizationPayload.idempotency_key
        }));
        expect(result.current.drawerAuthorizationModalOpen).toBe(false);
        expect(result.current.drawerOpening).toBe(false);
    });

    it('closes the preview, resets its source, and notifies an external receipt owner', () => {
        const { result, props } = renderWorkflow();

        act(() => {
            result.current.setReceiptPreviewSource('order_preview');
            result.current.setReceiptPreviewModalOpen(true);
            result.current.setExternalReceiptModalActive(true);
        });
        act(() => {
            result.current.closeReceiptPreviewModal();
        });

        expect(result.current.receiptPreviewModalOpen).toBe(false);
        expect(result.current.receiptPreviewSource).toBe('receipt_preview');
        expect(result.current.externalReceiptModalActive).toBe(false);
        expect(props.onExternalReceiptClosed).toHaveBeenCalledTimes(1);
    });
});
