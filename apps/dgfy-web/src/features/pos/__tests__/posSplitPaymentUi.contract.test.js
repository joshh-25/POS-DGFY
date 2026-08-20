import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const checkoutSource = [
    fs.readFileSync(
        path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminal.jsx'),
        'utf8'
    ),
    fs.readFileSync(
        path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminalView.jsx'),
        'utf8'
    ),
    fs.readFileSync(
        path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminalReceiptDialogs.jsx'),
        'utf8'
    ),
].join('\n');
const checkoutWorkflowSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/hooks/usePosCheckoutWorkflow.js'),
    'utf8'
);
const financialWorkflowSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/hooks/usePosFinancialWorkflow.js'),
    'utf8'
);
const splitDialogSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSSplitPaymentDialog.jsx'),
    'utf8'
);
const splitWorkflowSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/POSSplitPaymentWorkflow.jsx'),
    'utf8'
);
const currentSaleActionsSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/PosCurrentSaleActions.jsx'),
    'utf8'
);

describe('POS split-payment UI contract', () => {
    it('keeps split payment independent from the checkout confirmation modal', () => {
        expect(checkoutSource).not.toContain('data-testid="pos-open-split-payment"');
        expect(checkoutSource).not.toContain('Edit Split Payment');
        expect(checkoutSource).toContain('<POSSplitPaymentWorkflow');
        expect(splitDialogSource).toContain('parked_sale_id: parkedSaleId || undefined');
        expect(checkoutWorkflowSource).toContain('handleSplitPaymentOpenChange(true);');
        expect(checkoutSource).toContain('onClick={splitPaymentReady ? () => handleCompletePreparedSplitPayment() : handleCheckout}');
        expect(checkoutWorkflowSource).toContain('completePosPaymentSession');
        expect(checkoutWorkflowSource).toContain('const splitPaymentCheckoutContext = useMemo');
        expect(checkoutSource).toContain('checkoutContext={splitPaymentCheckoutContext}');
        expect(splitDialogSource).toContain('sessionOpenAttemptRef');
        expect(checkoutSource).toContain('data-testid="pos-split-payment-cancel-dialog"');
        expect(checkoutSource).toContain('handleCancelCheckout');
        expect(checkoutWorkflowSource).toContain('cancelPosPaymentAllocation');
        expect(checkoutWorkflowSource).toContain('cancelPosPaymentSession');
        expect(checkoutSource).toContain('Reverse & Start New');
    });

    it('opens split payment directly from Current Sale and returns the canonical Order Overview after completion', () => {
        expect(currentSaleActionsSource).toContain('data-testid="pos-current-sale-split-payment"');
        expect(currentSaleActionsSource).toContain('Split Payment');
        expect(checkoutSource).toContain('onSplitPayment={openSplitPaymentModal}');
        expect(checkoutSource).toContain('onReadyToComplete={handleCompletePreparedSplitPayment}');
        expect(checkoutWorkflowSource).toContain('const isReady = round4(sessionToComplete?.remaining_amount) === 0;');
        expect(checkoutWorkflowSource).toContain("setReceiptPreviewSource('order_preview')");
        expect(checkoutWorkflowSource).toContain('setReceiptPreviewModalOpen(true)');
        expect(checkoutWorkflowSource).toContain('splitPaymentReturnToCheckoutRef.current = false');
    });

    it('prefills exact payment, clears it only on first focus, and preserves explicit selections', () => {
        expect(financialWorkflowSource).toContain('const [customerPaymentAmountAutoFilled, setCustomerPaymentAmountAutoFilled] = useState(false);');
        expect(financialWorkflowSource).toContain('setCustomerPaymentAmountInput(round4(cartTotal).toFixed(2));');
        expect(checkoutSource).toContain('setCustomerPaymentAmountAutoFilled(true);');
        expect(checkoutSource).toContain('if (customerPaymentAmountAutoFilled) {');
        expect(checkoutSource).toContain('data-testid="pos-cash-payment-exact"');
        expect(checkoutSource).toContain('Exact Amount · PHP {money(cartTotal)}');
        expect(checkoutSource).toContain('setCustomerPaymentAmountInput(String(amount));');
        expect(checkoutSource).toContain('setCustomerPaymentAmountAutoFilled(false);');
        expect(splitDialogSource).toContain("if (event.currentTarget.value === '0') updatePaymentRow(row.id, { amount: '' });");
    });

    it('renders the saved split-payment summary in checkout without removing the confirm guard', () => {
        expect(checkoutSource).toContain('data-testid="pos-checkout-split-payment-summary"');
        expect(checkoutSource).toContain('data-testid="pos-checkout-split-payment-methods"');
        expect(checkoutSource).toContain('data-testid="pos-checkout-split-payment-change"');
        expect(checkoutSource).toContain('formatSplitPaymentMethod(paymentMethod)');
        expect(checkoutSource).toContain('splitPaymentSummaryChangeAmount');
        expect(checkoutSource).toContain('splitPaymentSummaryPaidAmount');
        expect(checkoutSource).toContain('splitPaymentSummaryRemainingAmount');
        expect(checkoutSource).not.toContain('Split payment in progress');
        expect(checkoutSource).not.toContain('The sale is not paid yet. Press Confirm below to finish it.');
        expect(checkoutSource).not.toContain('must be at least PHP');
        expect(checkoutSource).toContain('!isCustomerPaymentSufficient');
        expect(checkoutSource).toContain('disabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || !isCheckoutWorkflowValid || (!splitPaymentReady && !isCustomerPaymentSufficient)}');
    });

    it('shows the applied discount in checkout without coupling discount state to split tender', () => {
        expect(checkoutSource).toContain('data-testid="pos-checkout-sale-summary"');
        expect(checkoutSource).toContain('data-testid="pos-checkout-discount-summary"');
        expect(checkoutSource).toContain('Total Sales (before discount)');
        expect(checkoutSource).toContain('Total Due');
        expect(checkoutSource).toContain('data-testid="pos-checkout-payment-summary"');
        expect(checkoutSource).toContain('Payment Summary');
        expect(checkoutSource).toContain('Payment Method');
        expect(checkoutSource).toContain('formatSplitPaymentMethod(paymentType)');
        expect(checkoutSource).toContain('Remaining Balance');
        expect(checkoutSource).not.toContain('Review the items and enter the customer payment before finalizing this sale.');
        expect(checkoutSource).toContain('data-testid="pos-checkout-add-discount"');
        expect(checkoutSource).toContain('data-testid="pos-edit-checkout-discount"');
        expect(checkoutSource).toContain('data-testid="pos-remove-checkout-discount"');
        expect(checkoutSource).toContain('onClick={() => openDiscountModal({ returnToCheckout: true })}');
        expect(checkoutSource).toContain('onClick={clearAppliedDiscount}');
        expect(checkoutSource).toContain('const discountReturnToCheckoutRef = useRef(false);');
        expect(checkoutSource).toContain('setCheckoutConfirmModalOpen(false);');
        expect(checkoutSource).toContain('setCheckoutConfirmModalOpen(true);');
        expect(checkoutSource).toContain('onOpenChange={(nextOpen) => (nextOpen ? setDiscountModalOpen(true) : closeDiscountModal())}');
        expect(checkoutSource).not.toContain('splitPaymentDiscountBlocked');
        expect(checkoutSource).toContain('splitPaymentDisabled={posActionsBlocked || checkoutLoading || safeCart.length === 0 || isEmployeeCreditPayment}');
    });

    it('shows cash payment suggestions above the payment amount field', () => {
        expect(checkoutSource).toContain('const CASH_PAYMENT_SUGGESTIONS = [50, 100, 200, 500, 1000, 2000];');
        expect(checkoutSource).toContain('data-testid="pos-cash-payment-suggestions"');
        expect(checkoutSource).toContain('isCashPayment && (');
        expect(checkoutSource).toContain('setCustomerPaymentAmountInput(String(amount));');
        expect(checkoutSource).toContain('data-testid={`pos-cash-payment-suggestion-${amount}`}');
        expect(checkoutSource).toContain('id="pos-customer-payment-amount"');
    });

    it('does not auto-focus Total Payment when checkout confirmation opens', () => {
        const checkoutDialogIndex = checkoutSource.indexOf('open={checkoutConfirmModalOpen}');
        const totalPaymentIndex = checkoutSource.indexOf('customerPaymentFieldLabel', checkoutDialogIndex);
        const paymentInputIndex = checkoutSource.indexOf('id="pos-customer-payment-amount"', totalPaymentIndex);
        const paymentInputSection = checkoutSource.slice(paymentInputIndex, checkoutSource.indexOf('/>', paymentInputIndex));

        expect(checkoutDialogIndex).toBeGreaterThan(-1);
        expect(totalPaymentIndex).toBeGreaterThan(checkoutDialogIndex);
        expect(paymentInputIndex).toBeGreaterThan(totalPaymentIndex);
        expect(paymentInputSection).toContain('value={customerPaymentAmountInput}');
        expect(paymentInputSection).not.toContain('autoFocus');
    });

    it('hosts split payment outside the Current Sale item list', () => {
        const currentSaleItemsIndex = checkoutSource.indexOf('data-testid="pos-current-sale-items"');
        const splitPaymentHostIndex = checkoutSource.indexOf('data-testid="pos-split-payment-modal-host"');

        expect(currentSaleItemsIndex).toBeGreaterThanOrEqual(0);
        expect(splitPaymentHostIndex).toBeGreaterThan(currentSaleItemsIndex);
        expect(checkoutSource).toContain('<div data-testid="pos-split-payment-modal-host">');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-dialog"');
    });

    it('builds the split-payment checkout snapshot only after every render dependency is initialized', () => {
        const snapshotContextIndex = checkoutWorkflowSource.indexOf('const splitPaymentCheckoutContext = useMemo');
        const financialWorkflowCallIndex = checkoutSource.indexOf('usePosFinancialWorkflow({');
        const requiredFinancialDeclarations = [
            'const safeCart = getSafeRows(cart)',
            'const selectedDiscount = safeDiscountProfiles.find',
            'const manualDiscountRate = (() =>',
            'const manualDiscountAmount = (() =>',
            'const calculatedDiscountAmount = appliedDiscount',
            'normalizedFnbContext = null'
        ];

        expect(snapshotContextIndex).toBeGreaterThan(-1);
        expect(financialWorkflowCallIndex).toBeGreaterThan(-1);
        expect(checkoutSource.indexOf('} = usePosCheckoutWorkflow({')).toBeGreaterThan(financialWorkflowCallIndex);
        expect(splitWorkflowSource).toContain('const buildCheckoutSnapshot = (context = {}) => ({');
        expect(splitWorkflowSource).toContain('const checkoutSnapshot = useMemo');
        requiredFinancialDeclarations.forEach((declaration) => {
            expect(financialWorkflowSource).toContain(declaration);
        });
    });

    it('renders configurable payment rows with server-owned recovery', () => {
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-dialog"');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-allocations"');
        expect(splitDialogSource).not.toContain('data-testid="pos-quick-two-way-split"');
        expect(splitDialogSource).not.toContain('Quick two-way split');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-add-form"');
        expect(splitDialogSource).toContain('data-testid="pos-payment-rows-form"');
        expect(splitDialogSource).toContain('data-testid="pos-payment-rows"');
        expect(splitDialogSource).toContain('data-testid={`pos-payment-method-${index + 1}`}');
        expect(splitDialogSource).toContain('data-testid={`pos-payment-amount-${index + 1}`}');
        expect(splitDialogSource).not.toContain('data-testid={`pos-payment-received-${index + 1}`}');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-summary"');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-paid"');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-remaining"');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-change"');
        expect(splitDialogSource).toContain('data-testid="pos-add-payment-row"');
        expect(splitDialogSource).toContain('data-testid="pos-complete-payment-rows"');
        expect(splitDialogSource).toContain('Record Payment');
        expect(splitDialogSource).toContain('Method of Payment');
        expect(splitDialogSource).toContain('Amount');
        expect(splitDialogSource).toContain('Add Another Payment');
        expect(splitDialogSource).toContain('createDefaultPaymentRows');
        expect(splitDialogSource).toContain("createPaymentRow('payment-row-1', 'gcash')");
        expect(splitDialogSource).toContain("createPaymentRow('payment-row-2', 'cash')");
        expect(splitDialogSource).toContain('Use each payment method only once.');
        expect(splitDialogSource).toContain('activeNonCashRows, ...activeCashRows');
        expect(splitDialogSource).not.toContain('data-testid="pos-payment-rows-preview"');
        expect(splitDialogSource).not.toContain('Non-cash applied');
        expect(splitDialogSource).not.toContain('Cash applied');
        expect(splitDialogSource).not.toContain('Change due');
        expect(splitDialogSource).not.toContain('data-testid="pos-split-payment-cancel-session"');
        expect(splitDialogSource).toContain('fetchPosPaymentSession');
        expect(splitDialogSource).toContain('readPosSplitPaymentSessionPointer');
        expect(splitDialogSource).toContain('remaining_amount');
        expect(splitDialogSource).toContain('manual_payment_received: true');
        expect(splitDialogSource).toContain("payment_provider: 'merchant_owned'");
        expect(splitDialogSource).not.toContain('This does not use PayMongo.');
        expect(splitDialogSource).not.toContain('Refresh balance');
        expect(splitDialogSource).not.toContain('completePosPaymentSession');
        expect(splitDialogSource).toContain('onReadyToComplete(readySession)');
        expect(splitDialogSource).not.toContain('data-testid="pos-retry-finish-split-sale"');
        expect(splitDialogSource).not.toContain('Retry Finish Sale');
        expect(splitDialogSource).not.toContain('The payment is safely saved.');
        expect(splitDialogSource).not.toContain('Complete Sale');
        expect(splitDialogSource).not.toContain('Keep session open');
        expect(splitDialogSource).not.toContain('data-testid="pos-split-payment-saved-sale"');
        expect(splitDialogSource).not.toContain('Sale awaiting completion');
        expect(splitDialogSource).not.toContain('This is the server-saved sale. It is read-only while payment is in progress.');
        expect(splitWorkflowSource).toContain('data-testid="pos-current-sale-payment-in-progress"');
        expect(splitWorkflowSource).toContain('data-testid="pos-resume-split-payment"');
        expect(splitWorkflowSource).toContain('data-testid="pos-discard-unpaid-split-payment"');
        expect(splitWorkflowSource).toContain('fetchPosPaymentSession(stored.sessionId, {');
        expect(splitWorkflowSource).toContain('fetchActivePosPaymentSession({');
        expect(splitWorkflowSource).toContain('await cancelPosPaymentSession(sessionId');
        expect(splitWorkflowSource).toContain('onSessionStateChange');
        expect(splitWorkflowSource).toContain("reason: 'Cashier discarded unpaid split-payment draft.'");
        expect(splitWorkflowSource).toContain('No money is recorded. Resume this payment or discard the unpaid draft.');
        expect(checkoutSource).not.toContain('setSplitPaymentDialogOpen(true);\n            return;');
        expect(checkoutSource).not.toContain('paymentSessionBlockedReason');
        expect(checkoutSource).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason) || parkedSaleReleaseLoading;');
    });
});
