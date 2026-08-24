import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import {
    addPosPaymentAllocation,
    cancelPosPaymentAllocation,
    cancelPosPaymentSession,
    completePosPaymentSession,
    createPosPaymentSession,
    fetchPosPaymentSession
} from '../posService.js';

describe('POS split-payment service', () => {
    beforeEach(() => {
        apiMock.get.mockReset();
        apiMock.post.mockReset();
    });

    it('creates a scoped payment session with the registered terminal header', async () => {
        apiMock.post.mockResolvedValue({ data: { data: { pos_payment_session_id: 501 } } });
        const payload = {
            idempotency_key: 'split-session-001',
            shift_id: 41,
            terminal_id: 'counter-01',
            location_id: 3,
            snapshot: { lines: [{ item_id: 7, quantity: 1, sale_price: 125 }] },
            total_amount: 125
        };

        await expect(createPosPaymentSession(payload)).resolves.toEqual({ pos_payment_session_id: 501 });
        expect(apiMock.post).toHaveBeenCalledWith('/pos/payment-sessions', payload, {
            headers: { 'x-pos-terminal-id': 'COUNTER-01' }
        });
    });

    it('maps session reads and allocation mutations to the server transport', async () => {
        apiMock.get.mockResolvedValue({ data: { data: { pos_payment_session_id: 501, remaining_amount: 125 } } });
        apiMock.post.mockResolvedValue({ data: { data: { session: { pos_payment_session_id: 501 } } } });

        await expect(fetchPosPaymentSession(501)).resolves.toEqual({ pos_payment_session_id: 501, remaining_amount: 125 });
        await addPosPaymentAllocation(501, { terminal_id: 'counter-01', amount: 50 });
        await cancelPosPaymentAllocation(501, 701, { terminal_id: 'counter-01', reason: 'Tender changed' });
        await cancelPosPaymentSession(501, { terminal_id: 'counter-01', reason: 'Customer left' });
        await completePosPaymentSession(501, { terminal_id: 'counter-01', idempotency_key: 'split-complete-001', shift_id: 41 });

        expect(apiMock.get).toHaveBeenCalledWith('/pos/payment-sessions/501', {
            params: {},
            headers: undefined
        });
        expect(apiMock.post).toHaveBeenNthCalledWith(1, '/pos/payment-sessions/501/allocations', { terminal_id: 'counter-01', amount: 50 }, {
            headers: { 'x-pos-terminal-id': 'COUNTER-01' }
        });
        expect(apiMock.post).toHaveBeenNthCalledWith(2, '/pos/payment-sessions/501/allocations/701/cancel', { terminal_id: 'counter-01', reason: 'Tender changed' }, {
            headers: { 'x-pos-terminal-id': 'COUNTER-01' }
        });
        expect(apiMock.post).toHaveBeenNthCalledWith(3, '/pos/payment-sessions/501/cancel', { terminal_id: 'counter-01', reason: 'Customer left' }, {
            headers: { 'x-pos-terminal-id': 'COUNTER-01' }
        });
        expect(apiMock.post).toHaveBeenNthCalledWith(4, '/pos/payment-sessions/501/complete', { terminal_id: 'counter-01', idempotency_key: 'split-complete-001', shift_id: 41 }, {
            headers: { 'x-pos-terminal-id': 'COUNTER-01' }
        });
    });
});
