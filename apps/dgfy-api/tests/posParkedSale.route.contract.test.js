import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
    validateCancelPosParkedSale,
    validateClaimPosParkedSale,
    validateCreatePosParkedSale,
    validateListPosParkedSales,
    validateParkedSaleIdParam,
    validateReparkPosParkedSale,
    validatePosCheckout
} from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src/routes/pos.js'),
    'utf8'
);

const runValidator = (validator, source, value) => {
    const req = { [source]: value };
    const res = { status: () => res, json: () => res };
    let nextCalled = false;
    validator(req, res, () => { nextCalled = true; });
    return { req, nextCalled };
};

describe('parked sale POS route contract', () => {
    it('exposes POS-scoped create, list, claim, re-park, and cancel endpoints with existing permissions', () => {
        expect(routeSource).toContain("router.post('/parked-sales', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateCreatePosParkedSale, posController.requireActiveOperatorForMutation, posController.createParkedSale);");
        expect(routeSource).toContain("router.get('/parked-sales', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateListPosParkedSales, posController.listParkedSales);");
        expect(routeSource).toContain("router.post('/parked-sales/:id/claim', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateClaimPosParkedSale, posController.requireActiveOperatorForMutation, posController.claimParkedSale);");
        expect(routeSource).toContain("router.post('/parked-sales/:id/repark', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateReparkPosParkedSale, posController.requireActiveOperatorForMutation, posController.reparkParkedSale);");
        expect(routeSource).toContain("router.post('/parked-sales/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), posController.requirePairedTerminal, validateParkedSaleIdParam, validateCancelPosParkedSale, posController.requireActiveOperatorForMutation, posController.cancelParkedSale);");
        expect(routeSource).toContain("router.post('/approvals/:id/:decision', checkPermission(PERMISSIONS.POS.actions.VOID_POS_TRANSACTION), validatePosExceptionApprovalParam, validatePosExceptionApprovalBody, posController.decidePosExceptionApproval);");
    });

    it('validates the lifecycle payloads and strips unsupported top-level fields', () => {
        const create = runValidator(validateCreatePosParkedSale, 'body', {
            idempotency_key: 'park-request-001',
            shift_id: 41,
            terminal_id: 'counter-01',
            snapshot: { lines: [{ item_id: 7, quantity: 1, sale_price: 10 }] },
            unsupported: 'removed'
        });
        const list = runValidator(validateListPosParkedSales, 'query', { shift_id: '41', status: 'cancel_pending' });
        const claim = runValidator(validateClaimPosParkedSale, 'body', { shift_id: 41, terminal_id: 'counter-01' });
        const cancel = runValidator(validateCancelPosParkedSale, 'body', { shift_id: 41, terminal_id: 'counter-01', reason: 'Customer cancelled' });
        const repark = runValidator(validateReparkPosParkedSale, 'body', {
            shift_id: 41,
            terminal_id: 'counter-01',
            expected_revision: 2,
            snapshot: { lines: [{ item_id: 7, quantity: 2, sale_price: 10 }] },
            removed_line_reasons: [{
                line_ref: 'parked-line-1',
                item_id: 7,
                reason: 'Customer removed item'
            }],
            subtotal_amount: 20,
            total_amount: 20
        });
        const checkout = runValidator(validatePosCheckout, 'body', {
            idempotency_key: 'checkout-request-001',
            terminal_id: 'counter-01',
            parked_sale_id: 101,
            removed_line_reasons: [{
                line_ref: 'parked-line-1',
                item_id: 7,
                reason: 'Customer removed item'
            }],
            lines: [{ item_id: 7, quantity: 1, sale_price: 10 }]
        });
        const id = runValidator(validateParkedSaleIdParam, 'params', { id: '101' });

        expect(create.nextCalled).toBe(true);
        expect(create.req.validatedData).not.toHaveProperty('unsupported');
        expect(create.req.validatedData.terminal_id).toBe('COUNTER-01');
        expect(list.nextCalled).toBe(true);
        expect(list.req.validatedQuery.limit).toBe(100);
        expect(claim.nextCalled).toBe(true);
        expect(cancel.nextCalled).toBe(true);
        expect(repark.nextCalled).toBe(true);
        expect(repark.req.validatedData.expected_revision).toBe(2);
        expect(repark.req.validatedData.removed_line_reasons).toEqual([{
            line_ref: 'parked-line-1',
            item_id: 7,
            reason: 'Customer removed item'
        }]);
        expect(checkout.nextCalled).toBe(true);
        expect(checkout.req.validatedData.removed_line_reasons).toEqual([{
            line_ref: 'parked-line-1',
            item_id: 7,
            reason: 'Customer removed item'
        }]);
        expect(id.nextCalled).toBe(true);
        expect(id.req.validatedParams.id).toBe(101);
    });
});
