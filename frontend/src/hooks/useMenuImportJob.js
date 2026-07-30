import { useEffect, useRef, useState } from 'react';
import {
    confirmMenuImport,
    createMenuImportJob,
    getMenuImportJob,
    isMenuImportTerminalStatus,
    previewMenuImportJob
} from '../services/menuImportService.js';

/**
 * Drives a batch menu import job end to end: upload -> poll -> merged preview.
 *
 * Extraction runs in a backend worker (one OpenAI call per photo, one per
 * rendered page for a scanned PDF), so a 20-file batch can take minutes. The
 * job is polled rather than held open on a request, which is why every
 * backend request in this flow stays sub-second and the shared 60s axios
 * timeout needed no change.
 *
 * Phases: idle -> uploading -> processing -> previewing -> ready -> confirming
 * -> done, with `error` reachable from any of them. `reset()` returns to idle
 * and abandons any in-flight poll.
 */

export const MENU_IMPORT_POLL_INTERVAL_MS = 2000;
// Ceiling on a single job's polling. The server keeps a job for 1 hour, but a
// batch that hasn't settled in 10 minutes means the worker is wedged or gone,
// and the user needs to be told that rather than watching a spinner forever.
export const MENU_IMPORT_POLL_TIMEOUT_MS = 10 * 60 * 1000;

const readApiError = (err, fallback) => ({
    message: err?.response?.data?.message || err?.message || fallback,
    code: err?.response?.data?.error_code || null
});

const emptyProgress = { total: 0, completed: 0, failed: 0, pending: 0, settled: 0, percent: 0 };

/**
 * Polls a job until it reaches a terminal status, the deadline passes, or the
 * caller's `isCurrent()` says the run was abandoned. Lives at module scope
 * (rather than inside the hook) because it reads the clock — that is a
 * side effect a hook body is not allowed to perform.
 */
const runJobPoll = ({ jobId, timerRef, isCurrent, onJob, onSettled, onTimeout, onError }) => {
    const startedAt = Date.now();

    const tick = async () => {
        try {
            const current = await getMenuImportJob(jobId);
            if (!isCurrent()) return;
            onJob(current);

            if (isMenuImportTerminalStatus(current.status)) {
                await onSettled();
                return;
            }

            if (Date.now() - startedAt > MENU_IMPORT_POLL_TIMEOUT_MS) {
                onTimeout();
                return;
            }

            timerRef.current = setTimeout(tick, MENU_IMPORT_POLL_INTERVAL_MS);
        } catch (err) {
            if (isCurrent()) onError(err);
        }
    };

    tick();
};

export const deriveMenuImportProgress = (job) => {
    const totals = job?.totals;
    if (!totals || !totals.files) return emptyProgress;
    const settled = (totals.completed || 0) + (totals.failed || 0);
    return {
        total: totals.files,
        completed: totals.completed || 0,
        failed: totals.failed || 0,
        pending: totals.pending ?? Math.max(totals.files - settled, 0),
        settled,
        percent: Math.round((settled / totals.files) * 100)
    };
};

export const useMenuImportJob = () => {
    const [phase, setPhase] = useState('idle');
    const [job, setJob] = useState(null);
    const [previewData, setPreviewData] = useState(null);
    const [error, setError] = useState(null);
    const [errorCode, setErrorCode] = useState(null);

    // Every start/reset bumps runId; async continuations compare against it so
    // a poll or preview belonging to an abandoned run can never write state
    // over a newer one (or after unmount).
    const runIdRef = useRef(0);
    const timerRef = useRef(null);
    const mountedRef = useRef(true);
    // Per-run "the merged preview landed" callback. The transition into the
    // review step happens deep inside the poll continuation, so the consumer
    // hands its handler to startJob rather than watching for the phase change
    // from an effect.
    const onReadyRef = useRef(null);

    const clearPollTimer = () => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    };

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            runIdRef.current += 1;
            clearPollTimer();
        };
    }, []);

    const isCurrentRun = (runId) => mountedRef.current && runIdRef.current === runId;

    const failRun = (runId, err, fallback) => {
        if (!isCurrentRun(runId)) return null;
        const failure = readApiError(err, fallback);
        setError(failure.message);
        setErrorCode(failure.code);
        setPhase('error');
        return failure;
    };

    const loadPreview = async (runId, jobId) => {
        setPhase('previewing');
        try {
            const data = await previewMenuImportJob(jobId);
            if (!isCurrentRun(runId)) return;
            setPreviewData(data);
            setPhase('ready');
            if (typeof onReadyRef.current === 'function') onReadyRef.current(data);
        } catch (err) {
            failRun(runId, err, 'Failed to build a preview for this import.');
        }
    };

    const pollJob = (runId, jobId) => runJobPoll({
        jobId,
        timerRef,
        isCurrent: () => isCurrentRun(runId),
        onJob: setJob,
        onSettled: () => loadPreview(runId, jobId),
        onTimeout: () => {
            setError('This import is taking longer than expected. Start over, or try again with fewer files.');
            setErrorCode('POLL_TIMEOUT');
            setPhase('error');
        },
        onError: (err) => failRun(runId, err, 'Failed to check import progress.')
    });

    /**
     * Uploads the batch and starts polling. Resolves once the upload itself
     * settles — extraction progress arrives through `job`/`phase` afterwards,
     * and `onReady` fires once with the merged preview payload.
     */
    const startJob = async (files, { onReady = null } = {}) => {
        clearPollTimer();
        const runId = runIdRef.current + 1;
        runIdRef.current = runId;
        onReadyRef.current = onReady;

        setPhase('uploading');
        setJob(null);
        setPreviewData(null);
        setError(null);
        setErrorCode(null);

        let created;
        try {
            created = await createMenuImportJob(files);
        } catch (err) {
            const failure = failRun(runId, err, 'Failed to start the menu import.');
            return { success: false, error: failure?.message, errorCode: failure?.code };
        }

        if (!isCurrentRun(runId)) return { success: false, cancelled: true };

        // Seed a synthetic job record so the progress UI has totals to render
        // before the first poll comes back.
        setJob({
            job_id: created.job_id,
            status: 'queued',
            totals: { files: created.total_files, completed: 0, failed: 0, pending: created.total_files },
            files: []
        });
        setPhase('processing');
        pollJob(runId, created.job_id);

        return { success: true, data: created };
    };

    const confirmImport = async (rows) => {
        const runId = runIdRef.current;
        setPhase('confirming');
        setError(null);
        setErrorCode(null);
        try {
            const data = await confirmMenuImport(rows);
            if (!isCurrentRun(runId)) return { success: false, cancelled: true };
            setPhase('done');
            return { success: true, data };
        } catch (err) {
            const failure = failRun(runId, err, 'Failed to import menu items.');
            return { success: false, error: failure?.message, errorCode: failure?.code };
        }
    };

    const reset = () => {
        clearPollTimer();
        runIdRef.current += 1;
        onReadyRef.current = null;
        setPhase('idle');
        setJob(null);
        setPreviewData(null);
        setError(null);
        setErrorCode(null);
    };

    return {
        phase,
        job,
        previewData,
        error,
        errorCode,
        progress: deriveMenuImportProgress(job),
        busy: phase === 'uploading' || phase === 'processing' || phase === 'previewing' || phase === 'confirming',
        startJob,
        confirmImport,
        reset
    };
};

export default useMenuImportJob;
