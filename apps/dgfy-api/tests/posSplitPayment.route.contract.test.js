import fs from 'fs';
import path from 'path';
import { describe, expect, it } from '@jest/globals';
import {
    validateAddPosPaymentAllocation,
    validateCancelPosPayment,
    validateCompletePosPayment,
    validateConfirmPosPaymentAllocation,
    validateReconcilePosPaymentAllocation,
    validateCreatePosPaymentSession,
    validateSplitPaymentAllocationIdParam,
    validateSplitPaymentSessionIdParam,
    validateSplitPaymentSessionScopeQuery
} from '../src/validators/posValidator.js';

const routeSource = fs.readFileSync(path.resolve(process.cwd(), 'src/routes/pos.js'), 'utf8');

const runValidator = (validator, source, value) => {
    const req = { [source]: value };
    const res = { status: () => res, json: () => res };
    let nextCalled = false;
    validator(req, res, () => { nextCalled = true; });
    return { req, nextCalled };
};

describe('POS split-payment route contract', () => {
    it('exposes scoped session, allocation, and cancellation endpoints', () => {
        expect(routeSource).toContain("router.post('/payment-sessions', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateCreatePosPaymentSession, posController.createPaymentSession);");
        expect(routeSource).toContain("router.get('/payment-sessions/active', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionScopeQuery, posController.getActivePaymentSession);");
        expect(routeSource).toContain("router.get('/payment-sessions/:id', checkPermission(PERMISSIONS.POS.actions.VIEW_POS), validateSplitPaymentSessionIdParam, validateSplitPaymentSessionScopeQuery, posController.getPaymentSession);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/allocations', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateAddPosPaymentAllocation, posController.addPaymentAllocation);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/allocations/:allocation_id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateCancelPosPayment, posController.cancelPaymentAllocation);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/allocations/:allocation_id/confirm', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateConfirmPosPaymentAllocation, posController.confirmPaymentAllocation);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/allocations/:allocation_id/reconcile', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentAllocationIdParam, validateReconcilePosPaymentAllocation, posController.reconcilePaymentAllocation);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/cancel', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateCancelPosPayment, posController.cancelPaymentSession);");
        expect(routeSource).toContain("router.post('/payment-sessions/:id/complete', checkPermission(PERMISSIONS.POS.actions.TRANSACT_POS), validateSplitPaymentSessionIdParam, validateCompletePosPayment, posController.completePaymentSession);");
    });

    it('validates payment payloads and strips unsupported fields', () => {
        const session = runValidator(validateCreatePosPaymentSession, 'body', {
            idempotency_key: 'split-session-001', shift_id: 41, terminal_id: 'counter-01', total_amount: 1250,
            snapshot: { lines: [{ item_id: 7, quantity: 1 }] }, unsupported: 'removed'
        });
        const allocation = runValidator(validateAddPosPaymentAllocation, 'body', {
            idempotency_key: 'split-allocation-001', shift_id: 41, terminal_id: 'counter-01',
            payment_method: 'gcash', amount: 500, manual_payment_received: true, unsupported: 'removed'
        });
        const cancel = runValidator(validateCancelPosPayment, 'body', {
            shift_id: 41, terminal_id: 'counter-01', reason: 'Customer changed tender'
        });
        const complete = runValidator(validateCompletePosPayment, 'body', {
            idempotency_key: 'split-complete-001', shift_id: 41, terminal_id: 'counter-01', unsupported: 'removed'
        });
        const confirm = runValidator(validateConfirmPosPaymentAllocation, 'body', {
            shift_id: 41,
            terminal_id: 'counter-01',
            provider_event_id: 'provider-event-001',
            provider_confirmed_at: '2026-08-12T10:00:00.000Z',
            provider_signature: 'a'.repeat(64),
            unsupported: 'removed'
        });
        const reconcile = runValidator(validateReconcilePosPaymentAllocation, 'body', {
            shift_id: 41,
            terminal_id: 'counter-01',
            unsupported: 'removed'
        });
        const sessionId = runValidator(validateSplitPaymentSessionIdParam, 'params', { id: '501' });
        const sessionScope = runValidator(validateSplitPaymentSessionScopeQuery, 'query', {
            shift_id: '41', terminal_id: 'counter-01', location_id: '3'
        });
        const allocationId = runValidator(validateSplitPaymentAllocationIdParam, 'params', { id: '501', allocation_id: '701' });

        expect(session.nextCalled).toBe(true);
        expect(session.req.validatedData).not.toHaveProperty('unsupported');
        expect(session.req.validatedData.terminal_id).toBe('COUNTER-01');
        expect(allocation.nextCalled).toBe(true);
        expect(allocation.req.validatedData).not.toHaveProperty('unsupported');
        expect(allocation.req.validatedData.manual_payment_received).toBe(true);
        expect(cancel.nextCalled).toBe(true);
        expect(complete.nextCalled).toBe(true);
        expect(complete.req.validatedData).not.toHaveProperty('unsupported');
        expect(complete.req.validatedData.idempotency_key).toBe('split-complete-001');
        expect(confirm.nextCalled).toBe(true);
        expect(confirm.req.validatedData).not.toHaveProperty('unsupported');
        expect(reconcile.nextCalled).toBe(true);
        expect(reconcile.req.validatedData).not.toHaveProperty('unsupported');
        expect(sessionId.req.validatedParams.id).toBe(501);
        expect(sessionScope.nextCalled).toBe(true);
        expect(sessionScope.req.validatedQuery).toEqual({ shift_id: 41, terminal_id: 'COUNTER-01', location_id: 3 });
        expect(allocationId.req.validatedParams.allocation_id).toBe(701);
    });
});
