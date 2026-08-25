import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, it } from 'vitest';

const webCoreRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const componentPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminal.jsx');
const componentViewPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutTerminalView.jsx');
const componentDialogPath = path.resolve(webCoreRoot, 'src/features/pos/components/POSCheckoutConfirmDialog.jsx');
const componentSource = [componentPath, componentViewPath, componentDialogPath]
    .map((sourcePath) => fs.readFileSync(sourcePath, 'utf8'))
    .join('\n');
const workflowSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/hooks/usePosCheckoutWorkflow.js'),
    'utf8'
);
const actionComponentSource = fs.readFileSync(
    path.resolve(webCoreRoot, 'src/features/pos/components/PosCurrentSaleActions.jsx'),
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
        expect(workflowSource).toContain('createPosParkedSale');
    });

    it('updates a resumed parked sale instead of creating another parked record', () => {
        expect(workflowSource).toContain('setActiveParkedSale({');
        expect(workflowSource).toContain('reparkPosParkedSale(activeParkedSale.pos_parked_sale_id');
        expect(workflowSource).toContain('expected_revision: Number(activeParkedSale.revision)');
        expect(workflowSource).toContain('parked_sale_id: activeParkedSale?.pos_parked_sale_id || undefined');
        expect(componentSource).toContain('parkedSaleId={activeParkedSale?.pos_parked_sale_id || null}');
        expect(workflowSource).toContain('Reconnect before parking this resumed sale again. Your cart is still open.');
        expect(workflowSource).toContain('const parkedSaleName = String(nameOverride ?? parkSaleNameInput).trim();');
    });

    it('opens payment immediately for Pay while Resume stays edit-only', () => {
        const payBranch = workflowSource.indexOf("if (normalizedAction === 'pay') {");
        const paymentModalOpen = workflowSource.indexOf('setCheckoutConfirmModalOpen(true);', payBranch);
        const paymentAmountReset = workflowSource.indexOf('setCustomerPaymentAmountInput(round4(cartTotal).toFixed(2));', payBranch);
        const resumeToast = workflowSource.indexOf('Resumed ${formatParkedSaleDisplayName(claimedSale)}', payBranch);

        expect(payBranch).toBeGreaterThan(-1);
        expect(paymentAmountReset).toBeGreaterThan(payBranch);
        expect(paymentModalOpen).toBeGreaterThan(paymentAmountReset);
        expect(workflowSource).toContain('setMobileCheckoutPanelOpen(false);');
        expect(resumeToast).toBeGreaterThan(paymentModalOpen);
    });

    it('only clears the current cart after the parked-sale request succeeds', () => {
        const requestStart = workflowSource.indexOf('const parkedSale = activeParkedSale?.pos_parked_sale_id');
        const clearDraft = workflowSource.indexOf('clearPosCartDraft(offlineSnapshotScope, activeShiftId);', requestStart);
        const resetSale = workflowSource.indexOf('resetCurrentSaleForNewSale();', requestStart);
        const catchStart = workflowSource.indexOf('} catch (error) {', requestStart);

        expect(requestStart).toBeGreaterThan(-1);
        expect(clearDraft).toBeGreaterThan(requestStart);
        expect(resetSale).toBeGreaterThan(clearDraft);
        expect(catchStart).toBeGreaterThan(resetSale);
        expect(workflowSource).toContain('Your current cart is still open.');
        expect(workflowSource).toContain("operation: 'parked_sale'");
        expect(workflowSource).toContain('onQueueOfflineOperation');
    });

    it('exits parked-sale editing when the final item is removed without cancelling the parked sale', () => {
        expect(workflowSource).toContain('const cancelActiveParkedSaleEditingAfterCartEmpty = useCallback(async () =>');
        expect(componentSource).toContain('parkedSaleEmptyCartHandlerRef.current = cancelActiveParkedSaleEditingAfterCartEmpty;');
        expect(workflowSource).toContain('await reparkPosParkedSale(parkedSaleId, {');
        expect(workflowSource).toContain('snapshot,');
        expect(workflowSource).toContain('The parked sale is still claimed and the current items were kept.');
        expect(workflowSource).toContain('remains available for the next cashier.');
        expect(workflowSource).toContain('setActiveParkedSale(null);');
        expect(workflowSource).toContain('Editing was cancelled because all items were removed.');
        expect(workflowSource).not.toContain('cancelPosParkedSale');
        expect(workflowSource).not.toContain('PARKED_SALE_EMPTY_CART_CANCEL_REASON');

        const editingCancelStart = workflowSource.indexOf('const cancelActiveParkedSaleEditingAfterCartEmpty');
        const reparkRequest = workflowSource.indexOf('await reparkPosParkedSale(parkedSaleId, {', editingCancelStart);
        const clearDraft = workflowSource.indexOf('clearPosCartDraft(offlineSnapshotScope, activeShiftId);', editingCancelStart);
        expect(reparkRequest).toBeGreaterThan(editingCancelStart);
        expect(clearDraft).toBeGreaterThan(reparkRequest);
    });

    it('cancels Pay checkout by returning the claimed parked sale to the queue and clearing current sale', () => {
        expect(componentSource).toContain('const [parkedSalePayContext, setParkedSalePayContext] = useState(null);');
        expect(workflowSource).toContain('setParkedSalePayContext(normalizedAction === \'pay\'');
        expect(workflowSource).toContain('const releaseClaimedParkedSaleAfterPayCancel = useCallback(async () =>');
        expect(workflowSource).toContain('await reparkPosParkedSale(parkedSaleId, {');
        expect(workflowSource).toContain('The parked sale is available again.');
        expect(workflowSource).toContain('if (parkedSalePayContext && activeParkedSale?.pos_parked_sale_id)');
        expect(componentSource).toContain('onClick={handleCancelCheckout}');
    });

    it('does not retrieve parked sales or auto-replace the new cart automatically', () => {
        expect(componentSource).not.toContain('fetchPosParkedSales');
        expect(componentSource).not.toContain('claimPosParkedSale');
        expect(componentSource).not.toContain('listPosParkedSales');
    });

    it('provides header parked-sale actions and a guarded clear-current-sale action', () => {
        expect(componentSource).toContain('data-testid="pos-header-parked-sales-history-button"');
        expect(workflowSource).toContain('setParkedSalesDialogOpen(true);');
        expect(actionComponentSource).toContain('data-testid="pos-park-sale-button"');
        expect(componentSource).toContain('data-testid="pos-clear-current-sale"');
        expect(componentSource.match(/data-testid="pos-clear-current-sale"/g)).toHaveLength(1);
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
