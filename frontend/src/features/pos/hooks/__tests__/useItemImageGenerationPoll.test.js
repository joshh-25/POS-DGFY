/** @vitest-environment jsdom */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const getStorefrontImageGenerationStatus = vi.fn();

vi.mock('../../../../services/storefrontCatalogService.js', () => ({
    getStorefrontImageGenerationStatus: (...args) => getStorefrontImageGenerationStatus(...args)
}));

let useItemImageGenerationPoll;
let ITEM_IMAGE_POLL_INTERVAL_MS;
let ITEM_IMAGE_POLL_TIMEOUT_MS;

describe('useItemImageGenerationPoll', () => {
    beforeAll(async () => {
        ({ useItemImageGenerationPoll, ITEM_IMAGE_POLL_INTERVAL_MS, ITEM_IMAGE_POLL_TIMEOUT_MS } =
            await import('../useItemImageGenerationPoll.js'));
    });

    beforeEach(() => {
        vi.useFakeTimers();
        getStorefrontImageGenerationStatus.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('resolves completed as soon as the status endpoint reports it', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'completed' });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        let outcome;
        await act(async () => {
            outcome = await result.current.pollItemImageGeneration(42);
        });

        expect(outcome).toEqual({ status: 'completed', error_message: null });
        expect(getStorefrontImageGenerationStatus).toHaveBeenCalledWith(42);
    });

    it('resolves failed with the error_message once the worker records a failure', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({
            status: 'failed',
            error_code: 'GENERATION_REQUEST_FAILED',
            error_message: 'boom'
        });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        let outcome;
        await act(async () => {
            outcome = await result.current.pollItemImageGeneration(42);
        });

        expect(outcome).toEqual({ status: 'failed', error_message: 'boom' });
    });

    it('keeps polling on the configured interval while the status is non-terminal', async () => {
        getStorefrontImageGenerationStatus
            .mockResolvedValueOnce({ status: 'queued' })
            .mockResolvedValueOnce({ status: 'processing' })
            .mockResolvedValueOnce({ status: 'completed' });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        const pollPromise = act(async () => {
            const promise = result.current.pollItemImageGeneration(42);
            await vi.advanceTimersByTimeAsync(0); // first (synchronous-ish) tick: 'queued'
            await vi.advanceTimersByTimeAsync(ITEM_IMAGE_POLL_INTERVAL_MS); // 'processing'
            await vi.advanceTimersByTimeAsync(ITEM_IMAGE_POLL_INTERVAL_MS); // 'completed'
            return promise;
        });

        expect(await pollPromise).toEqual({ status: 'completed', error_message: null });
        expect(getStorefrontImageGenerationStatus).toHaveBeenCalledTimes(3);
    });

    it('resolves timeout when the status never settles within the poll ceiling', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'processing' });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        const pollPromise = act(async () => {
            const promise = result.current.pollItemImageGeneration(42);
            await vi.advanceTimersByTimeAsync(ITEM_IMAGE_POLL_TIMEOUT_MS + ITEM_IMAGE_POLL_INTERVAL_MS);
            return promise;
        });

        expect(await pollPromise).toEqual({ status: 'timeout' });
    });

    it('resolves cancelled when cancel() is called mid-poll, so the caller\'s await never hangs', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'processing' });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        let outcome;
        await act(async () => {
            const promise = result.current.pollItemImageGeneration(42);
            await vi.advanceTimersByTimeAsync(0);
            result.current.cancel();
            outcome = await promise;
        });

        expect(outcome).toEqual({ status: 'cancelled' });
    });

    it('resolves the pending poll as cancelled on unmount instead of leaving it hanging', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'processing' });
        const { result, unmount } = renderHook(() => useItemImageGenerationPoll());

        let outcome;
        await act(async () => {
            const promise = result.current.pollItemImageGeneration(42);
            await vi.advanceTimersByTimeAsync(0);
            unmount();
            outcome = await promise;
        });

        expect(outcome).toEqual({ status: 'cancelled' });
    });

    it('a new poll supersedes an in-flight one, resolving the old promise as cancelled', async () => {
        getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'processing' });
        const { result } = renderHook(() => useItemImageGenerationPoll());

        let firstOutcome;
        let secondOutcome;
        await act(async () => {
            const firstPromise = result.current.pollItemImageGeneration(1);
            await vi.advanceTimersByTimeAsync(0);
            const secondPromise = result.current.pollItemImageGeneration(2);
            firstOutcome = await firstPromise;
            getStorefrontImageGenerationStatus.mockResolvedValue({ status: 'completed' });
            await vi.advanceTimersByTimeAsync(ITEM_IMAGE_POLL_INTERVAL_MS);
            secondOutcome = await secondPromise;
        });

        expect(firstOutcome).toEqual({ status: 'cancelled' });
        expect(secondOutcome).toEqual({ status: 'completed', error_message: null });
    });
});
