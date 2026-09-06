import { useCallback, useEffect, useRef } from 'react';
import { getStorefrontImageGenerationStatus } from '../../../services/storefrontCatalogService.js';

/**
 * Polls an item's AI image generation status until it resolves, adapted from
 * useMenuImportJob.js's polling shape but much lighter: there's a single
 * terminal outcome to wait for here, not a multi-file phase machine, so this
 * exposes one promise-based `pollItemImageGeneration(itemId)` rather than a
 * `phase`/`job` pair of state the consumer would have to watch via effects.
 * The caller (TerminalOperationsWorkspace.jsx) already owns its own
 * in-flight UI state (generatingEditImage/pollingEditImage) around the
 * await, so there's nothing this hook needs to expose beyond the outcome.
 *
 * `timeoutMs` (default `ITEM_IMAGE_POLL_TIMEOUT_MS`, 90s) is a second,
 * optional constructor argument so a caller whose UI is blocked for the
 * full duration of the poll -- unlike `handleGenerateEditImage`'s edit-modal
 * path, which stays dismissible while its own poll runs -- can pass a
 * tighter ceiling instead of inheriting the AI-image-generation path's full
 * default. See TerminalOperationsWorkspace.jsx's create-item call site.
 */

// Matches useMenuImportJob.js's interval. A single image + watermark should
// be well under a minute, unlike a multi-file PDF batch, so the timeout
// ceiling here is far shorter than that hook's 10-minute one.
export const ITEM_IMAGE_POLL_INTERVAL_MS = 2000;
export const ITEM_IMAGE_POLL_TIMEOUT_MS = 90 * 1000;

const TERMINAL_STATUSES = ['completed', 'failed'];

/**
 * Lives at module scope (not inside the hook) because it reads the clock —
 * the same reasoning useMenuImportJob.js's runJobPoll documents for itself.
 */
const runStatusPoll = ({ itemId, timerRef, isCurrent, resolve, readStatus, timeoutMs }) => {
    const startedAt = Date.now();

    const scheduleOrTimeout = () => {
        if (!isCurrent()) return;
        if (Date.now() - startedAt > timeoutMs) {
            resolve({ status: 'timeout' });
            return;
        }
        timerRef.current = setTimeout(tick, ITEM_IMAGE_POLL_INTERVAL_MS);
    };

    const tick = async () => {
        try {
            const record = await readStatus(itemId);
            if (!isCurrent()) return;
            if (record && TERMINAL_STATUSES.includes(record.status)) {
                resolve({ status: record.status, error_message: record.error_message || null });
                return;
            }
            scheduleOrTimeout();
        } catch {
            // A transient read failure shouldn't abandon the poll — retry on
            // the same cadence rather than surfacing a spurious failure while
            // generation itself may still be fine.
            scheduleOrTimeout();
        }
    };

    tick();
};

/**
 * @param {(itemId: number) => Promise<object>} [readStatus] status reader; defaults to the
 *   AI-image-generation endpoint.
 * @param {number} [timeoutMs] poll ceiling in ms; defaults to ITEM_IMAGE_POLL_TIMEOUT_MS (90s).
 */
export const useItemImageGenerationPoll = (readStatus = getStorefrontImageGenerationStatus, timeoutMs = ITEM_IMAGE_POLL_TIMEOUT_MS) => {
    // Bumped on every new poll, cancel(), and unmount — the same staleness
    // guard useMenuImportJob.js uses, so a tick from an abandoned poll can
    // never resolve a promise a newer poll (or nothing) is now waiting on.
    const runIdRef = useRef(0);
    const timerRef = useRef(null);
    const resolveRef = useRef(null);
    const mountedRef = useRef(true);

    const settle = useCallback((result) => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
        if (resolveRef.current) {
            const resolve = resolveRef.current;
            resolveRef.current = null;
            resolve(result);
        }
    }, []);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            runIdRef.current += 1;
            // A pending promise must always settle, even on unmount —
            // otherwise the caller's `await` (and its `finally` cleanup)
            // never runs, leaving its own in-flight UI state stuck forever.
            settle({ status: 'cancelled' });
        };
    }, [settle]);

    /** Stops the current poll (if any), resolving its promise with {status: 'cancelled'}. */
    const cancel = useCallback(() => {
        runIdRef.current += 1;
        settle({ status: 'cancelled' });
    }, [settle]);

    /**
     * @param {number} itemId
     * @returns {Promise<{status: 'completed'|'failed'|'timeout'|'cancelled', error_message?: string|null}>}
     */
    const pollItemImageGeneration = useCallback((itemId) => {
        cancel(); // a new poll always supersedes whatever was running
        const runId = runIdRef.current + 1;
        runIdRef.current = runId;
        const isCurrent = () => mountedRef.current && runIdRef.current === runId;

        return new Promise((resolve) => {
            resolveRef.current = resolve;
            runStatusPoll({ itemId, timerRef, isCurrent, resolve: settle, readStatus, timeoutMs });
        });
    }, [cancel, readStatus, settle, timeoutMs]);

    return { pollItemImageGeneration, cancel };
};

export default useItemImageGenerationPoll;
