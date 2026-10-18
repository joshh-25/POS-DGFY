import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    BACKEND_RETRYABLE_STATUS_CODES,
    BACKEND_UNREACHABLE_STATUS_CODES,
    GATEWAY_FAILURE_STATUS_CODES,
    createUnreachablePollScheduler,
    computeUnreachableBackoffMs,
    isBackendUnreachable,
    isRetryableBackendFailure
} from '../backendReachability.js';

describe('backend reachability classification', () => {
    it('treats transport failures, timeouts, and gateway responses as unreachable', () => {
        expect(isBackendUnreachable({ request: {} })).toBe(true);
        expect(isBackendUnreachable({ code: 'ERR_NETWORK' })).toBe(true);
        expect(isBackendUnreachable({ code: 'ECONNABORTED' })).toBe(true);
        expect(isBackendUnreachable({ code: 'ETIMEDOUT' })).toBe(true);

        [408, 502, 503, 504].forEach((status) => {
            expect(isBackendUnreachable({ response: { status } })).toBe(true);
        });
    });

    it('keeps rate limits and application errors retryable without marking the backend unreachable', () => {
        [429, 500].forEach((status) => {
            const error = { response: { status } };
            expect(isRetryableBackendFailure(error)).toBe(true);
            expect(isBackendUnreachable(error)).toBe(false);
        });

        [400, 401, 403, 404, 422].forEach((status) => {
            const error = { response: { status } };
            expect(isRetryableBackendFailure(error)).toBe(false);
            expect(isBackendUnreachable(error)).toBe(false);
        });
    });

    it('excludes cancelled requests and local errors without a dispatched request', () => {
        expect(isBackendUnreachable({ code: 'ERR_CANCELED', request: {} })).toBe(false);
        expect(isRetryableBackendFailure({ code: 'ERR_CANCELED', request: {} })).toBe(false);
        expect(isBackendUnreachable({ name: 'CanceledError', request: {} })).toBe(false);
        expect(isBackendUnreachable({ name: 'AbortError', request: {} })).toBe(false);
        expect(isBackendUnreachable(new Error('local validation failed'))).toBe(false);
    });

    it('exports one shared status policy for reachability, retries, and gateway failures', () => {
        expect(Array.from(GATEWAY_FAILURE_STATUS_CODES)).toEqual([502, 503, 504]);
        expect(Array.from(BACKEND_UNREACHABLE_STATUS_CODES)).toEqual([408, 502, 503, 504]);
        expect(Array.from(BACKEND_RETRYABLE_STATUS_CODES)).toEqual([408, 502, 503, 504, 429, 500]);
    });
});

describe('unreachable polling backoff', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('doubles from the base delay, caps the result, and resets when failures clear', () => {
        const options = { baseMs: 1000, capMs: 5000, random: () => 0.5 };

        expect(computeUnreachableBackoffMs({ ...options, consecutiveFailures: 0 })).toBe(1000);
        expect(computeUnreachableBackoffMs({ ...options, consecutiveFailures: 1 })).toBe(1000);
        expect(computeUnreachableBackoffMs({ ...options, consecutiveFailures: 2 })).toBe(2000);
        expect(computeUnreachableBackoffMs({ ...options, consecutiveFailures: 4 })).toBe(5000);
    });

    it('keeps jitter within the requested range and below the hard cap', () => {
        expect(computeUnreachableBackoffMs({
            baseMs: 1000,
            consecutiveFailures: 1,
            capMs: 5000,
            jitter: 0.2,
            random: () => 0
        })).toBe(800);
        expect(computeUnreachableBackoffMs({
            baseMs: 1000,
            consecutiveFailures: 1,
            capMs: 5000,
            jitter: 0.2,
            random: () => 1
        })).toBe(1200);
        expect(computeUnreachableBackoffMs({
            baseMs: 1000,
            consecutiveFailures: 8,
            capMs: 5000,
            jitter: 0.2,
            random: () => 1
        })).toBe(5000);
    });

    it('skips automatic ticks while a request is in flight but leaves manual refresh unguarded', async () => {
        vi.useFakeTimers();
        let inFlight = true;
        const run = vi.fn();
        const scheduler = createUnreachablePollScheduler({
            run,
            isInFlight: () => inFlight,
            baseMs: 1000,
            capMs: 5000,
            jitter: 0,
            random: () => 0.5
        });

        await vi.advanceTimersByTimeAsync(1000);
        expect(run).not.toHaveBeenCalled();

        inFlight = false;
        await vi.advanceTimersByTimeAsync(1000);
        expect(run).toHaveBeenCalledTimes(1);

        scheduler.refresh();
        expect(run).toHaveBeenCalledTimes(2);
        scheduler.stop();
    });
});
