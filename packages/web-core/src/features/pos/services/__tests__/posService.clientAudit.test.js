import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn()
}));

vi.mock('@/services/api', () => ({ default: apiMock }));

import { reportPosDeviceClientResult } from '../posService.js';

describe('POS client hardware audit reporting', () => {
    beforeEach(() => {
        Object.values(apiMock).forEach((method) => method.mockReset());
    });

    it('retries transient failures with the same idempotency key and returns the confirmed audit', async () => {
        const transientError = Object.assign(new Error('network unavailable'), { response: undefined });
        apiMock.post
            .mockRejectedValueOnce(transientError)
            .mockRejectedValueOnce(transientError)
            .mockResolvedValueOnce({ data: { data: { audit_id: 77 } } });

        const result = await reportPosDeviceClientResult({
            operation: 'print_receipt',
            transactionId: 41,
            terminalId: 'COUNTER-01',
            idempotencyKey: 'receipt-audit-41',
            driverId: 'imin_native',
            result: { success: true }
        });

        expect(result).toEqual({ audit_id: 77 });
        expect(apiMock.post).toHaveBeenCalledTimes(3);
        apiMock.post.mock.calls.forEach(([, payload, config]) => {
            expect(payload.idempotency_key).toBe('receipt-audit-41');
            expect(payload.transaction_id).toBe(41);
            expect(payload.client_driver_id).toBe('imin_native');
            expect(config.timeout).toBe(5_000);
        });
    });

    it('does not retry a deterministic client or authorization rejection', async () => {
        const rejected = Object.assign(new Error('forbidden'), { response: { status: 403 } });
        apiMock.post.mockRejectedValue(rejected);

        await expect(reportPosDeviceClientResult({
            operation: 'open_drawer',
            shiftId: 12,
            idempotencyKey: 'drawer-audit-12',
            driverId: 'imin_native',
            result: { success: true }
        })).rejects.toBe(rejected);

        expect(apiMock.post).toHaveBeenCalledTimes(1);
    });
});
