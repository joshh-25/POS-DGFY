import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const componentPath = path.resolve(process.cwd(), 'src/features/pos/components/POSCheckoutTerminal.jsx');
const componentSource = fs.readFileSync(componentPath, 'utf8');
const actionComponentSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/features/pos/components/PosCurrentSaleActions.jsx'),
    'utf8'
);

describe('POS Park & New Sale cashier flow', () => {
    it('separates parked-sales history from the explicit add-only park action', () => {
        expect(componentSource).toContain('data-testid="pos-header-parked-sales-history-button"');
        expect(componentSource).toContain('CarTaxiFront');
        expect(componentSource).toContain("currentViewMode === 'checkout'");
        expect(componentSource).toContain('onClick={openParkedSalesHistory}');
        expect(componentSource).not.toContain('data-testid="pos-header-open-parked-sales"');
        expect(actionComponentSource).toContain('data-testid="pos-park-sale-button"');
        expect(componentSource).toContain('createPosParkedSale');
    });

    it('updates a resumed parked sale instead of creating another parked record', () => {
        expect(componentSource).toContain('setActiveParkedSale({');
        expect(componentSource).toContain('reparkPosParkedSale(activeParkedSale.pos_parked_sale_id');
        expect(componentSource).toContain('expected_revision: Number(activeParkedSale.revision)');
        expect(componentSource).toContain('parked_sale_id: activeParkedSale?.pos_parked_sale_id || undefined');
        expect(componentSource).toContain('parkedSaleId={activeParkedSale?.pos_parked_sale_id || null}');
        expect(componentSource).toContain('Reconnect before parking this resumed sale again. Your cart is still open.');
        expect(componentSource).toContain('void handleParkAndNewSale(activeParkedSale.parked_sale_name || formatParkedSaleDisplayName(activeParkedSale));');
        expect(componentSource).toContain('const parkedSaleName = String(nameOverride ?? parkSaleNameInput).trim();');
    });

    it('opens payment immediately for Pay while Resume stays edit-only', () => {
        const payBranch = componentSource.indexOf("if (normalizedAction === 'pay') {");
        const paymentModalOpen = componentSource.indexOf('setCheckoutConfirmModalOpen(true);', payBranch);
        const paymentAmountReset = componentSource.indexOf("setCustomerPaymentAmountInput('0');", payBranch);
        const resumeToast = componentSource.indexOf('Resumed ${formatParkedSaleDisplayName(claimedSale)}', payBranch);

        expect(payBranch).toBeGreaterThan(-1);
        expect(paymentAmountReset).toBeGreaterThan(payBranch);
        expect(paymentModalOpen).toBeGreaterThan(paymentAmountReset);
        expect(componentSource).toContain('setMobileCheckoutPanelOpen(false);');
        expect(resumeToast).toBeGreaterThan(paymentModalOpen);
    });

    it('only clears the current cart after the parked-sale request succeeds', () => {
        const requestStart = componentSource.indexOf('const parkedSale = activeParkedSale?.pos_parked_sale_id');
        const clearDraft = componentSource.indexOf('clearPosCartDraft(offlineSnapshotScope, activeShiftId);', requestStart);
        const resetSale = componentSource.indexOf('resetCurrentSaleForNewSale();', requestStart);
        const catchStart = componentSource.indexOf('} catch (error) {', requestStart);

        expect(requestStart).toBeGreaterThan(-1);
        expect(clearDraft).toBeGreaterThan(requestStart);
        expect(resetSale).toBeGreaterThan(clearDraft);
        expect(catchStart).toBeGreaterThan(resetSale);
        expect(componentSource).toContain('Your current cart is still open.');
        expect(componentSource).toContain("operation: 'parked_sale'");
        expect(componentSource).toContain('onQueueOfflineOperation');
    });

    it('exits parked-sale editing when the final item is removed without cancelling the parked sale', () => {
        expect(componentSource).toContain('const cancelActiveParkedSaleEditingAfterCartEmpty = useCallback(() =>');
        expect(componentSource).toContain('cancelActiveParkedSaleEditingAfterCartEmpty();');
        expect(componentSource).toContain('setActiveParkedSale(null);');
        expect(componentSource).toContain('Editing was cancelled because all items were removed.');
        expect(componentSource).not.toContain('cancelPosParkedSale');
        expect(componentSource).not.toContain('PARKED_SALE_EMPTY_CART_CANCEL_REASON');
    });

    it('cancels Pay checkout by returning the claimed parked sale to the queue and clearing current sale', () => {
        expect(componentSource).toContain('const [parkedSalePayContext, setParkedSalePayContext] = useState(null);');
        expect(componentSource).toContain('setParkedSalePayContext(normalizedAction === \'pay\'');
        expect(componentSource).toContain('const releaseClaimedParkedSaleAfterPayCancel = useCallback(async () =>');
        expect(componentSource).toContain('await reparkPosParkedSale(parkedSaleId, {');
        expect(componentSource).toContain('The parked sale is available again.');
        expect(componentSource).toContain('if (parkedSalePayContext && activeParkedSale?.pos_parked_sale_id)');
        expect(componentSource).toContain('void handleCancelCheckout();');
    });

    it('does not retrieve parked sales or auto-replace the new cart automatically', () => {
        expect(componentSource).not.toContain('fetchPosParkedSales');
        expect(componentSource).not.toContain('claimPosParkedSale');
        expect(componentSource).not.toContain('listPosParkedSales');
    });

    it('provides header parked-sale actions and a guarded clear-current-sale action', () => {
        expect(componentSource).toContain('data-testid="pos-header-parked-sales-history-button"');
        expect(componentSource).toContain('setParkedSalesDialogOpen(true);');
        expect(actionComponentSource).toContain('data-testid="pos-park-sale-button"');
        expect(componentSource).toContain('data-testid="pos-clear-current-sale"');
        expect(componentSource).toContain('data-testid="pos-clear-current-sale-dialog"');
        expect(componentSource).toContain('data-testid="pos-confirm-clear-current-sale"');
        expect(componentSource).toContain('clearPosCartDraft(offlineSnapshotScope, activeShiftId);');
        expect(componentSource).toContain('setClearSaleConfirmOpen(true);');
        expect(componentSource).toContain('Boolean(activeParkedSale?.pos_parked_sale_id)');
    });

    it('submits the park name dialog from Enter using the same park handler', () => {
        expect(componentSource).toContain('onSubmit={(event) => {');
        expect(componentSource).toContain('event.preventDefault();');
        expect(componentSource).toContain('type="submit"');
        expect(componentSource).toContain('handleParkAndNewSale();');
        expect(componentSource).toContain("'Park'");
    });
});
