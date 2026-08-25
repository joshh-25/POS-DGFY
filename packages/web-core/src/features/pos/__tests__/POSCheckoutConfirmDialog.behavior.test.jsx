/** @vitest-environment jsdom */

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { POSCheckoutConfirmDialog } from '../components/POSCheckoutConfirmDialog.jsx';

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, children }) => (open ? <div>{children}</div> : null),
    DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogFooter: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }) => <h2 {...props}>{children}</h2>
}));

vi.mock('../components/PosCheckoutDetailsSlot.jsx', () => ({
    PosCheckoutDetailsSlot: ({ paymentTypeField }) => <div>{paymentTypeField}</div>
}));

vi.mock('../components/EmployeeCreditPaymentPanel.jsx', () => ({
    default: () => <div>Employee credit payment</div>
}));

const createViewModel = (overrides = {}) => ({
    billRequestPrinting: false,
    calculatedDiscountAmount: 0,
    cartSubtotal: 100,
    cartTotal: 100,
    checkoutConfirmModalOpen: true,
    checkoutDiscountLabel: '',
    checkoutLoading: false,
    clearAppliedDiscount: vi.fn(),
    customerPaymentAmountAutoFilled: true,
    customerPaymentAmountInput: '100.00',
    customerPaymentFieldLabel: 'Total Payment',
    governedDiscountTotals: { vatRemoved: 0 },
    handleBillRequest: vi.fn(),
    handleCancelCheckout: vi.fn(),
    handleCheckout: vi.fn(),
    handleCompletePreparedSplitPayment: vi.fn(),
    handlePrintOrder: vi.fn(),
    hasSplitPaymentSummary: false,
    isCashPayment: true,
    isCheckoutWorkflowValid: true,
    isCustomerPaymentSufficient: true,
    isEmployeeCreditPayment: false,
    isMsmeMode: false,
    isPrinterAvailable: false,
    openDiscountModal: vi.fn(),
    parkedSaleReleaseLoading: false,
    paymentType: 'cash',
    posActionsBlocked: false,
    resetEmployeeCredit: vi.fn(),
    safeCart: [{ item_id: 7 }],
    setCheckoutConfirmModalOpen: vi.fn(),
    setCustomerPaymentAmountAutoFilled: vi.fn(),
    setCustomerPaymentAmountInput: vi.fn(),
    setPaymentType: vi.fn(),
    splitPaymentCancelLoading: false,
    splitPaymentDialogOpen: false,
    splitPaymentReady: false,
    ...overrides
});

describe('POSCheckoutConfirmDialog payment draft', () => {
    it('keeps keystrokes local and confirms with the validated payment snapshot', async () => {
        const viewModel = createViewModel();
        let terminalRenderCount = 0;

        function TerminalHarness() {
            terminalRenderCount += 1;
            return <POSCheckoutConfirmDialog viewModel={viewModel} />;
        }

        render(<TerminalHarness />);

        const paymentInput = await screen.findByLabelText('Total Payment');
        const confirmButton = screen.getByRole('button', { name: 'Confirm' });
        const paymentSummary = screen.getByTestId('pos-checkout-payment-summary');

        fireEvent.focus(paymentInput);
        fireEvent.change(paymentInput, { target: { value: '50' } });

        expect(paymentInput.value).toBe('50');
        expect(confirmButton.disabled).toBe(true);
        expect(within(paymentSummary).getByText('PHP 50.00').textContent).toBe('PHP 50.00');
        expect(terminalRenderCount).toBe(1);
        expect(viewModel.setCustomerPaymentAmountInput).not.toHaveBeenCalled();
        expect(viewModel.setCustomerPaymentAmountAutoFilled).not.toHaveBeenCalled();

        fireEvent.change(paymentInput, { target: { value: '150' } });
        expect(confirmButton.disabled).toBe(false);
        expect(within(paymentSummary).getByText('PHP 50.00').textContent).toBe('PHP 50.00');
        expect(terminalRenderCount).toBe(1);

        fireEvent.click(confirmButton);

        expect(viewModel.handleCheckout).toHaveBeenCalledWith({
            customerPaymentAmount: 150,
            customerPaymentChange: 50,
            isCustomerPaymentSufficient: true
        });
    });
});
