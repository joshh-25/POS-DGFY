import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const checkoutSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx'),
    'utf8'
);
const splitDialogSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSSplitPaymentDialog.jsx'),
    'utf8'
);
const splitWorkflowSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/POSSplitPaymentWorkflow.jsx'),
    'utf8'
);

describe('POS split-payment UI contract', () => {
    it('offers split payment from the existing checkout confirmation without changing single-tender checkout', () => {
        expect(checkoutSource).toContain('data-testid="pos-open-split-payment"');
        expect(checkoutSource).toContain('<POSSplitPaymentWorkflow');
        expect(splitDialogSource).toContain('parked_sale_id: parkedSaleId || undefined');
        expect(checkoutSource).toContain('setSplitPaymentDialogOpen(true)');
        expect(checkoutSource).toContain('onClick={handleCheckout}');
    });

    it('builds the split-payment checkout snapshot only after every render dependency is initialized', () => {
        const snapshotContextIndex = checkoutSource.indexOf('checkoutContext={{');
        const requiredDependencyDeclarations = [
            'const safeCart = toArray(cart)',
            'const selectedDiscount = useMemo',
            'const manualDiscountRate = useMemo',
            'const manualDiscountAmount = useMemo',
            'const calculatedDiscountAmount = appliedDiscount',
            'const normalizedFnbContext = useMemo'
        ];

        expect(snapshotContextIndex).toBeGreaterThan(-1);
        expect(splitWorkflowSource).toContain('const buildCheckoutSnapshot = (context = {}) => ({');
        expect(splitWorkflowSource).toContain('const checkoutSnapshot = useMemo');
        requiredDependencyDeclarations.forEach((declaration) => {
            const dependencyIndex = checkoutSource.indexOf(declaration);
            expect(dependencyIndex).toBeGreaterThan(-1);
            expect(snapshotContextIndex).toBeGreaterThan(dependencyIndex);
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
        expect(splitDialogSource).toContain('data-testid={`pos-payment-received-${index + 1}`}');
        expect(splitDialogSource).toContain('data-testid="pos-payment-rows-preview"');
        expect(splitDialogSource).toContain('data-testid="pos-add-payment-row"');
        expect(splitDialogSource).toContain('data-testid="pos-complete-payment-rows"');
        expect(splitDialogSource).toContain('Method of Payment');
        expect(splitDialogSource).toContain('Amount');
        expect(splitDialogSource).toContain('Add Another Payment');
        expect(splitDialogSource).toContain('createDefaultPaymentRows');
        expect(splitDialogSource).toContain("createPaymentRow('payment-row-1', 'gcash')");
        expect(splitDialogSource).toContain("createPaymentRow('payment-row-2', 'cash')");
        expect(splitDialogSource).toContain('Use each payment method only once.');
        expect(splitDialogSource).toContain('activeNonCashRows, ...activeCashRows');
        expect(splitDialogSource).toContain('Non-cash applied');
        expect(splitDialogSource).toContain('Cash applied');
        expect(splitDialogSource).toContain('Change due');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-cancel-session"');
        expect(splitDialogSource).toContain('fetchPosPaymentSession');
        expect(splitDialogSource).toContain('readPosSplitPaymentSessionPointer');
        expect(splitDialogSource).toContain('remaining_amount');
        expect(splitDialogSource).toContain('manual_payment_received: true');
        expect(splitDialogSource).toContain("payment_provider: 'merchant_owned'");
        expect(splitDialogSource).toContain('This does not use PayMongo.');
        expect(splitDialogSource).toContain('completePosPaymentSession');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-retry-completion"');
        expect(splitDialogSource).toContain('The POS automatically posts one sale and one inventory movement when the balance reaches zero.');
        expect(splitDialogSource).not.toContain('Complete Sale');
        expect(splitDialogSource).not.toContain('Keep session open');
        expect(splitDialogSource).toContain('data-testid="pos-split-payment-saved-sale"');
        expect(splitDialogSource).toContain('Sale awaiting completion');
        expect(splitDialogSource).toContain('This is the server-saved sale. It is read-only while payment is in progress.');
        expect(splitWorkflowSource).toContain('data-testid="pos-current-sale-payment-in-progress"');
        expect(splitWorkflowSource).toContain('data-testid="pos-resume-split-payment"');
        expect(splitWorkflowSource).toContain('data-testid="pos-discard-unpaid-split-payment"');
        expect(splitWorkflowSource).toContain('fetchPosPaymentSession(stored.sessionId, {');
        expect(splitWorkflowSource).toContain('fetchActivePosPaymentSession({');
        expect(splitWorkflowSource).toContain('await cancelPosPaymentSession(sessionId');
        expect(splitWorkflowSource).toContain("reason: 'Cashier discarded unpaid split-payment draft.'");
        expect(splitWorkflowSource).toContain('No money is recorded. Resume this payment or discard the unpaid draft.');
        expect(checkoutSource).not.toContain('setSplitPaymentDialogOpen(true);\n            return;');
        expect(checkoutSource).not.toContain('paymentSessionBlockedReason');
        expect(checkoutSource).toContain('const posActionsBlocked = Boolean(checkoutBlockedReason);');
    });
});
