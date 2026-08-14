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
    it('renders an explicit add-only park action', () => {
        expect(actionComponentSource).toContain('data-testid="pos-park-sale-button"');
        expect(actionComponentSource).toContain('Park & New Sale');
        expect(componentSource).toContain('createPosParkedSale');
    });

    it('updates a resumed parked sale instead of creating another parked record', () => {
        expect(componentSource).toContain('setActiveParkedSale({');
        expect(componentSource).toContain('reparkPosParkedSale(activeParkedSale.pos_parked_sale_id');
        expect(componentSource).toContain('expected_revision: Number(activeParkedSale.revision)');
        expect(actionComponentSource).toContain("activeParkedSale ? 'Update Park & New' : 'Park & New Sale'");
        expect(componentSource).toContain('parked_sale_id: activeParkedSale?.pos_parked_sale_id || undefined');
        expect(componentSource).toContain('parkedSaleId={activeParkedSale?.pos_parked_sale_id || null}');
        expect(componentSource).toContain('Reconnect before parking this resumed sale again. Your cart is still open.');
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

    it('does not retrieve parked sales or auto-replace the new cart automatically', () => {
        expect(componentSource).not.toContain('fetchPosParkedSales');
        expect(componentSource).not.toContain('claimPosParkedSale');
        expect(componentSource).not.toContain('listPosParkedSales');
    });
});
