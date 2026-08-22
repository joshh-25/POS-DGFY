import { describe, expect, it } from 'vitest';
import {
    CHECKOUT_QUEUE_MAX_RETRIES,
    CHECKOUT_QUEUE_OPERATION,
    CHECKOUT_REPLAY_BATCH_SIZE,
    CHECKOUT_RETRY_BACKOFF_BASE_MS,
    computeCheckoutReplayBackoffMs,
    createIdempotencyKey,
    isCheckoutQueueEntry,
    isRetryableCheckoutReplayError,
    resolveCheckoutReplayErrorDetails
} from '../posCheckoutTerminalQueue.js';

describe('POS checkout terminal queue utilities', () => {
    it('keeps queue policy constants and entry recognition stable', () => {
        expect(CHECKOUT_QUEUE_OPERATION).toBe('checkout');
        expect(CHECKOUT_QUEUE_MAX_RETRIES).toBe(5);
        expect(CHECKOUT_REPLAY_BATCH_SIZE).toBe(20);
        expect(CHECKOUT_RETRY_BACKOFF_BASE_MS).toBe(1500);
        expect(isCheckoutQueueEntry({ operation: 'checkout' })).toBe(true);
        expect(isCheckoutQueueEntry({ operation: 'void' })).toBe(false);
    });

    it('classifies retryable failures and preserves API error details', () => {
        expect(isRetryableCheckoutReplayError(new Error('network down'))).toBe(true);
        expect(isRetryableCheckoutReplayError({ response: { status: 503 } })).toBe(true);
        expect(isRetryableCheckoutReplayError({ response: { status: 400 } })).toBe(false);
        expect(resolveCheckoutReplayErrorDetails({
            message: 'fallback',
            code: 'CLIENT',
            response: { status: 409, data: { message: 'Duplicate intent', error_code: 'DUPLICATE' } }
        })).toEqual({ message: 'Duplicate intent', code: 'DUPLICATE', status: 409 });
    });

    it('computes bounded exponential backoff and produces idempotency keys', () => {
        expect(computeCheckoutReplayBackoffMs(1, () => 0)).toBe(1500);
        expect(computeCheckoutReplayBackoffMs(2, () => 0.999)).toBe(3249);
        expect(computeCheckoutReplayBackoffMs(99, () => 0)).toBe(90000);
        expect(createIdempotencyKey()).toMatch(/^[0-9a-f-]{36}$|^pos-\d+-[0-9a-f]+$/i);
    });
});
