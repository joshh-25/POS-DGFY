/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POSCheckoutConfirmDialog } from '../components/POSCheckoutConfirmDialog.jsx';
import { isIminWrapperRuntime } from '../../../utils/iminRuntimeFeedback.js';

vi.mock('../../../utils/iminRuntimeFeedback.js', () => ({
    isIminWrapperRuntime: vi.fn(() => false)
}));

vi.mock('@/components/ui/dialog', () => ({
    Dialog: ({ open, overlayClassName, children }) => (open ? <div data-testid="checkout-dialog-root" data-overlay-class={overlayClassName || ''}>{children}</div> : null),
    DialogContent: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogFooter: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogHeader: ({ children, ...props }) => <div {...props}>{children}</div>,
    DialogTitle: ({ children, ...props }) => <h2 {...props}>{children}</h2>
}));

beforeEach(() => {
    vi.clearAllMocks();
    isIminWrapperRuntime.mockReturnValue(false);
});

afterEach(cleanup);

vi.mock('../components/PosCheckoutDetailsSlot.jsx', () => ({
    PosCheckoutDetailsSlot: ({ paymentTypeField }) => <div>{paymentTypeField}</div>
}));

vi.mock('../components/EmployeeCreditPaymentPanel.jsx', () => ({
    default: ({ preferredEmployeeId, prefillBlockedReason }) => (
        <div
            data-testid="employee-credit-payment-panel"
            data-preferred-employee-id={preferredEmployeeId || ''}
            data-prefill-blocked-reason={prefillBlockedReason || ''}
        >Employee credit payment</div>
    )
}));

vi.mock('../components/POSDiscountWorkspace.jsx', () => ({
    default: ({ onCancel, embedded }) => (
        <div data-testid="mock-inline-discount" data-embedded={String(embedded)}>
            <button type="button" onClick={onCancel}>Cancel discount</button>
        </div>
    )
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
    closeDiscountModal: vi.fn(),
    customerPaymentAmountAutoFilled: true,
    customerPaymentAmountInput: '100.00',
    customerPaymentFieldLabel: 'Total Payment',
    discountDraft: { type: 'employee' },
    discountModalOpen: false,
    discountPreviewTotals: { vatRemoved: 0 },
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
    isOrderPrinterAvailable: false,
    isPrinterAvailable: false,
    isTabletViewport: false,
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
    it('does not inspect cart data while checkout is closed', () => {
        const guardedCart = new Proxy([], {
            get() {
                throw new Error('Closed checkout must not inspect cart data');
            }
        });

        expect(() => render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            checkoutConfirmModalOpen: false,
            safeCart: guardedCart
        })} />)).not.toThrow();
        expect(screen.queryByTestId('checkout-dialog-root')).toBeNull();
    });

    it('does not build order-summary rows until the summary is opened', () => {
        let itemNameReads = 0;
        const cartLine = { item_id: 7, quantity: 2, sale_price: 90 };
        Object.defineProperty(cartLine, 'item_name', {
            get() {
                itemNameReads += 1;
                return 'Brewed Coffee';
            }
        });

        render(<POSCheckoutConfirmDialog viewModel={createViewModel({ safeCart: [cartLine] })} />);

        expect(itemNameReads).toBe(0);
        fireEvent.click(screen.getByTestId('pos-checkout-view-order-summary'));
        expect(itemNameReads).toBeGreaterThan(0);
        expect(screen.getByTestId('pos-checkout-order-summary-panel').textContent).toContain('Brewed Coffee');
    });

    it('prints the active cart without forwarding the React click event', () => {
        const handlePrintOrder = vi.fn();
        render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            handlePrintOrder,
            isOrderPrinterAvailable: true
        })} />);

        fireEvent.click(screen.getByRole('button', { name: 'Print Order' }));

        expect(handlePrintOrder).toHaveBeenCalledOnce();
        expect(handlePrintOrder).toHaveBeenCalledWith();
    });

    it('passes the saved item-discount employee to Employee Credit and blocks ambiguous matches', async () => {
        const { rerender } = render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            isCashPayment: false,
            isEmployeeCreditPayment: true,
            paymentType: 'employee_credit',
            safeCart: [{
                item_id: 7,
                item_discount: { discount_type: 'employee', employee_directory_id: 44 }
            }]
        })} />);

        const paymentPanel = await screen.findByTestId('employee-credit-payment-panel');
        const orderSettings = screen.getByTestId('pos-checkout-order-settings');
        const employeeCreditSection = screen.getByTestId('pos-checkout-employee-credit');
        const discountControls = screen.getByTestId('pos-checkout-discount-type-buttons').closest('fieldset');
        expect(paymentPanel.getAttribute('data-preferred-employee-id')).toBe('44');
        expect(paymentPanel.getAttribute('data-prefill-blocked-reason')).toBe('');
        expect(orderSettings.compareDocumentPosition(employeeCreditSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(employeeCreditSection.compareDocumentPosition(discountControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

        rerender(<POSCheckoutConfirmDialog viewModel={createViewModel({
            isCashPayment: false,
            isEmployeeCreditPayment: true,
            paymentType: 'employee_credit',
            safeCart: [
                { item_id: 7, item_discount: { discount_type: 'employee', employee_directory_id: 44 } },
                { item_id: 8, item_discount: { discount_type: 'employee', employee_directory_id: 45 } }
            ]
        })} />);

        expect(paymentPanel.getAttribute('data-preferred-employee-id')).toBe('');
        expect(paymentPanel.getAttribute('data-prefill-blocked-reason')).toContain('Different employees');
    });

    it('disables backdrop blur only inside the iMin wrapper', () => {
        const { unmount } = render(<POSCheckoutConfirmDialog viewModel={createViewModel()} />);

        expect(screen.getByTestId('checkout-dialog-root').getAttribute('data-overlay-class')).toBe('');
        expect(isIminWrapperRuntime).toHaveBeenCalledTimes(1);

        unmount();
        isIminWrapperRuntime.mockReturnValue(true);
        render(<POSCheckoutConfirmDialog viewModel={createViewModel()} />);

        expect(screen.getByTestId('checkout-dialog-root').getAttribute('data-overlay-class')).toBe('backdrop-blur-none');
        expect(isIminWrapperRuntime).toHaveBeenCalledTimes(2);
    });

    it('keeps keystrokes local and confirms with the validated payment snapshot', async () => {
        const viewModel = createViewModel();
        const terminalRender = vi.fn();

        function TerminalHarness() {
            terminalRender();
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
        expect(terminalRender).toHaveBeenCalledTimes(1);
        expect(viewModel.setCustomerPaymentAmountInput).not.toHaveBeenCalled();
        expect(viewModel.setCustomerPaymentAmountAutoFilled).not.toHaveBeenCalled();
        expect(isIminWrapperRuntime).toHaveBeenCalledTimes(1);

        fireEvent.change(paymentInput, { target: { value: '150' } });
        expect(confirmButton.disabled).toBe(false);
        expect(within(paymentSummary).getByText('PHP 50.00').textContent).toBe('PHP 50.00');
        expect(terminalRender).toHaveBeenCalledTimes(1);
        expect(isIminWrapperRuntime).toHaveBeenCalledTimes(1);

        fireEvent.click(confirmButton);

        expect(viewModel.handleCheckout).toHaveBeenCalledWith({
            customerPaymentAmount: 150,
            customerPaymentChange: 50,
            isCustomerPaymentSufficient: true
        });
    });

    it('uses readable inactive labels and highlights only the selected payment method', () => {
        const { rerender } = render(<POSCheckoutConfirmDialog viewModel={createViewModel()} />);

        const paymentButtons = screen.getByTestId('pos-checkout-payment-method-buttons');
        const cashButton = screen.getByRole('button', { name: 'Cash' });
        const gcashButton = screen.getByRole('button', { name: 'GCash' });
        expect(paymentButtons.querySelectorAll('button')).toHaveLength(6);
        expect(paymentButtons.className).toContain('grid-cols-6');
        expect(paymentButtons.className).toContain('min-w-[720px]');
        expect(cashButton.className).toContain('bg-amber-100');
        expect(cashButton.getAttribute('aria-pressed')).toBe('true');
        expect(gcashButton.className).toContain('text-[#0F172A]');
        expect(gcashButton.className).toContain('bg-white');
        expect(gcashButton.getAttribute('aria-pressed')).toBe('false');

        rerender(<POSCheckoutConfirmDialog viewModel={createViewModel({
            isCashPayment: false,
            paymentType: 'gcash'
        })} />);

        expect(screen.getByRole('button', { name: 'Cash' }).className).toContain('bg-white');
        expect(screen.getByRole('button', { name: 'Cash' }).getAttribute('aria-pressed')).toBe('false');
        expect(screen.getByRole('button', { name: 'GCash' }).className).toContain('bg-blue-100');
        expect(screen.getByRole('button', { name: 'GCash' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('keeps every tablet payment method color visible and strengthens only the selected button', () => {
        const initialViewModel = createViewModel({ isTabletViewport: true });
        const { rerender } = render(<POSCheckoutConfirmDialog viewModel={initialViewModel} />);

        const cashButton = screen.getByRole('button', { name: 'Cash' });
        const gcashButton = screen.getByRole('button', { name: 'GCash' });
        const mayaButton = screen.getByRole('button', { name: 'Maya' });
        const cardButton = screen.getByRole('button', { name: 'Card' });
        const bankButton = screen.getByRole('button', { name: 'Bank Transfer' });
        const employeeCreditButton = screen.getByRole('button', { name: 'Employee Credit' });

        expect(screen.getByTestId('pos-checkout-payment-method-buttons').parentElement.className).toContain('p-1');
        expect(cashButton.className).toContain('bg-amber-100');
        expect(cashButton.className).toContain('ring-amber-300');
        expect(gcashButton.className).toContain('bg-blue-50');
        expect(mayaButton.className).toContain('bg-emerald-50');
        expect(cardButton.className).toContain('bg-[#FAF3ED]');
        expect(bankButton.className).toContain('bg-violet-50');
        expect(employeeCreditButton.className).toContain('bg-[#EFF6FF]');
        expect(gcashButton.className).not.toContain('ring-blue-300');

        fireEvent.click(gcashButton);
        expect(initialViewModel.setPaymentType).toHaveBeenCalledWith('gcash');

        rerender(<POSCheckoutConfirmDialog viewModel={createViewModel({
            isCashPayment: false,
            isTabletViewport: true,
            paymentType: 'gcash'
        })} />);

        expect(screen.getByRole('button', { name: 'Cash' }).className).toContain('bg-amber-50');
        expect(screen.getByRole('button', { name: 'Cash' }).className).not.toContain('ring-amber-300');
        expect(screen.getByRole('button', { name: 'GCash' }).className).toContain('bg-blue-100');
        expect(screen.getByRole('button', { name: 'GCash' }).className).toContain('ring-blue-300');
        expect(screen.getByRole('button', { name: 'GCash' }).getAttribute('aria-pressed')).toBe('true');
    });

    it('uses one amount row with five additive cash suggestions and no separate exact-amount button', () => {
        render(<POSCheckoutConfirmDialog viewModel={createViewModel()} />);

        const paymentRow = screen.getByTestId('pos-cash-payment-suggestions');
        const paymentInput = screen.getByLabelText('Total Payment');
        const suggestionButtons = within(paymentRow).getAllByRole('button');

        expect(paymentRow.contains(paymentInput)).toBe(true);
        expect(suggestionButtons).toHaveLength(5);
        expect(screen.queryByTestId('pos-cash-payment-exact')).toBeNull();
        expect(screen.queryByTestId('pos-cash-payment-suggestion-2000')).toBeNull();

        const thousandSuggestion = screen.getByTestId('pos-cash-payment-suggestion-1000');
        fireEvent.click(thousandSuggestion);
        expect(paymentInput.value).toBe('1000');

        fireEvent.click(thousandSuggestion);
        expect(paymentInput.value).toBe('2000');
    });

    it('orders Order Details, Total Payment, then Apply Discount', () => {
        render(<POSCheckoutConfirmDialog viewModel={createViewModel()} />);

        const orderSettings = screen.getByTestId('pos-checkout-order-settings');
        const paymentEntry = screen.getByTestId('pos-checkout-payment-entry');
        const discountControls = screen.getByTestId('pos-checkout-discount-type-buttons').closest('fieldset');

        expect(orderSettings.compareDocumentPosition(paymentEntry) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(paymentEntry.compareDocumentPosition(discountControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('shows the compact financial summary flush below the checkout header', () => {
        render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            calculatedDiscountAmount: 20,
            cartSubtotal: 120,
            cartTotal: 100,
            customerPaymentAmountAutoFilled: false,
            customerPaymentAmountInput: '150.00',
            isTabletViewport: true
        })} />);

        const paymentSummary = screen.getByTestId('pos-checkout-payment-summary');
        const orderSettings = screen.getByTestId('pos-checkout-order-settings');
        const summarySection = paymentSummary.closest('section');

        expect(paymentSummary.compareDocumentPosition(orderSettings) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(summarySection.className).toContain('shrink-0');
        expect(summarySection.className).toContain('bg-white');
        expect(summarySection.className).toContain('border-b');
        expect(summarySection.className).not.toContain('sticky');
        expect(summarySection.className).not.toContain('pb-3');
        expect(paymentSummary.className).toContain('rounded-none');
        expect(paymentSummary.className).toContain('border-x-0');
        expect(paymentSummary.className).toContain('border-t-0');
        expect(screen.queryByText('Payment Summary')).toBeNull();
        expect(within(paymentSummary).getByText('Order Total')).toBeDefined();
        expect(within(paymentSummary).getByText('- PHP 20.00')).toBeDefined();
        expect(within(paymentSummary).getByText('Payment Received')).toBeDefined();
        expect(within(paymentSummary).getByText('PHP 150.00')).toBeDefined();
        expect(within(paymentSummary).getByText('Change')).toBeDefined();
        expect(within(paymentSummary).getByText('PHP 50.00')).toBeDefined();
    });

    it('shows VAT Removed in the totals only for Senior Citizen or PWD', () => {
        const { rerender } = render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            discountDraft: { type: 'senior' },
            discountModalOpen: true,
            discountPreviewTotals: { vatRemoved: 12 }
        })} />);

        const vatRemoved = screen.getByTestId('pos-checkout-vat-removed');
        expect(within(vatRemoved).getByText('VAT Removed')).toBeDefined();
        expect(within(vatRemoved).getByText('PHP 12.00')).toBeDefined();

        rerender(<POSCheckoutConfirmDialog viewModel={createViewModel({
            discountDraft: { type: 'employee' },
            discountModalOpen: true,
            discountPreviewTotals: { vatRemoved: 12 }
        })} />);

        expect(screen.queryByTestId('pos-checkout-vat-removed')).toBeNull();
    });

    it('opens the existing discount workspace with the selected governed type', () => {
        const viewModel = createViewModel();

        render(<POSCheckoutConfirmDialog viewModel={viewModel} />);

        const discountButtons = screen.getByTestId('pos-checkout-discount-type-buttons');
        expect(discountButtons.querySelectorAll('button')).toHaveLength(6);
        expect(discountButtons.className).toContain('grid-cols-6');
        expect(discountButtons.className).toContain('min-w-[720px]');
        fireEvent.click(screen.getByTestId('pos-checkout-discount-type-pwd'));

        expect(viewModel.openDiscountModal).toHaveBeenCalledWith({
            initialType: 'pwd'
        });
    });

    it('shows the discount workspace inline and blocks checkout until it is applied or cancelled', async () => {
        const viewModel = createViewModel({ discountModalOpen: true });

        render(<POSCheckoutConfirmDialog viewModel={viewModel} />);

        expect(await screen.findByTestId('mock-inline-discount')).toBeDefined();
        expect(screen.getByRole('button', { name: 'Confirm' }).disabled).toBe(true);

        fireEvent.click(screen.getByRole('button', { name: 'Cancel discount' }));
        expect(viewModel.closeDiscountModal).toHaveBeenCalledTimes(1);
    });

    it('opens the order summary as a popup and closes it without leaving checkout', () => {
        render(<POSCheckoutConfirmDialog viewModel={createViewModel({
            safeCart: [{ item_id: 7, item_name: 'Brewed Coffee', quantity: 2, sale_price: 90 }],
            cartSubtotal: 180,
            cartTotal: 180,
            restaurantServiceChargeAmount: 12,
            customerPaymentAmountInput: '180.00'
        })} />);

        expect(screen.queryByTestId('pos-checkout-order-summary-panel')).toBeNull();
        fireEvent.click(screen.getByTestId('pos-checkout-view-order-summary'));
        expect(screen.getByTestId('pos-checkout-order-summary-modal')).toBeDefined();
        expect(screen.getByTestId('pos-checkout-order-summary-panel').textContent).toContain('Brewed Coffee');
        expect(screen.getByTestId('pos-checkout-order-summary-panel').textContent).toContain('PHP 180.00');
        expect(screen.getByTestId('pos-checkout-order-summary-modal').textContent).toContain('Service ChargePHP 12.00');
        expect(screen.getByTestId('pos-checkout-order-summary-modal').textContent).toContain('Total AmountPHP 180.00');
        expect(screen.getByRole('heading', { name: 'Checkout Tab' })).toBeDefined();

        fireEvent.click(screen.getByRole('button', { name: 'Close Order Summary' }));
        expect(screen.queryByTestId('pos-checkout-order-summary-panel')).toBeNull();
        expect(screen.getByRole('heading', { name: 'Checkout Tab' })).toBeDefined();
    });

    it('removes the applied checkout discount from the sale summary', () => {
        const viewModel = createViewModel({
            calculatedDiscountAmount: 25,
            checkoutDiscountLabel: 'Employee Discount'
        });

        render(<POSCheckoutConfirmDialog viewModel={viewModel} />);

        fireEvent.click(screen.getByTestId('pos-remove-checkout-discount'));

        expect(viewModel.clearAppliedDiscount).toHaveBeenCalledTimes(1);
    });

    it('delegates the close action to checkout cancellation', () => {
        const viewModel = createViewModel();

        render(<POSCheckoutConfirmDialog viewModel={viewModel} />);

        fireEvent.click(screen.getByRole('button', { name: 'Close checkout confirmation' }));

        expect(viewModel.handleCancelCheckout).toHaveBeenCalledTimes(1);
    });
});
