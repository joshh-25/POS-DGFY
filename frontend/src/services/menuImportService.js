import api from './api.js';

/**
 * Batch menu import API client (multi-file PDFs/photos).
 *
 * The batch path is asynchronous: uploading returns a job id immediately and
 * extraction happens in a backend worker, so the client uploads -> polls the
 * job -> asks for a merged preview -> confirms. Confirm is the same endpoint
 * shape the single-file path uses (there is nothing batch-specific about
 * persisting already-previewed rows).
 *
 * Gated by VITE_MENU_IMPORT_BATCH_ENABLED, separate from the single-file
 * VITE_MENU_PDF_IMPORT_ENABLED flag — the batch path adds a worker, a Redis
 * dependency, and materially more AI spend, so it must be killable on its own.
 */
export const isMenuImportBatchEnabled = () => import.meta.env.VITE_MENU_IMPORT_BATCH_ENABLED === 'true';

// UI hint only — the server (MENU_IMPORT_MAX_FILES_PER_BATCH) is the authority
// and rejects an over-cap batch with TOO_MANY_FILES regardless of this value.
export const MENU_IMPORT_MAX_FILES_HINT = 20;

export const MENU_IMPORT_ACCEPTED_FILE_PATTERN = /\.(pdf|png|jpe?g)$/i;
export const MENU_IMPORT_FILE_ACCEPT_ATTRIBUTE = '.pdf,application/pdf,.png,image/png,.jpg,.jpeg,image/jpeg';

// Job status is derived server-side from the per-file statuses; these three
// are the ones that mean "stop polling".
export const MENU_IMPORT_TERMINAL_STATUSES = Object.freeze(['completed', 'completed_with_errors', 'failed']);

export const isMenuImportTerminalStatus = (status) => MENU_IMPORT_TERMINAL_STATUSES.includes(status);

/**
 * Uploads the batch and creates the extraction job. Resolves as soon as the
 * job is queued (HTTP 202) — extraction has not run yet at this point.
 * @param {File[]} files
 * @returns {Promise<{job_id: string, total_files: number}>}
 */
export const createMenuImportJob = async (files) => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const response = await api.post('/items/import/menu/jobs', formData);
    return response.data.data;
};

/**
 * Reads a job's derived status and per-file progress for polling.
 * @returns {Promise<{job_id: string, status: string, totals: Object, files: Array}>}
 */
export const getMenuImportJob = async (jobId) => {
    const response = await api.get(`/items/import/menu/jobs/${jobId}`);
    return response.data.data;
};

/**
 * Merges every completed file's extracted items and runs them through the
 * same validation pipeline CSV/single-file imports use. Only valid once the
 * job has reached a terminal status (409 JOB_NOT_READY otherwise).
 * @returns {Promise<Object>} standard preview payload plus a `merge` summary
 */
export const previewMenuImportJob = async (jobId) => {
    const response = await api.post(`/items/import/menu/jobs/${jobId}/preview`);
    return response.data.data;
};

/**
 * Persists the (possibly edited) preview rows. Rows are re-validated
 * server-side — client-side `valid` flags are never trusted.
 */
export const confirmMenuImport = async (rows) => {
    const response = await api.post('/items/import/menu/confirm', { rows });
    return response.data.data;
};

export default {
    isMenuImportBatchEnabled,
    createMenuImportJob,
    getMenuImportJob,
    previewMenuImportJob,
    confirmMenuImport
};
