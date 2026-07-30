import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

// `pages_total`/`truncated` are here so the client can tell the operator that a
// long scanned PDF was only partly read (the page/vision-call caps keep
// whatever was extracted rather than failing the file — surfacing the gap is
// the whole point, so it must survive this projection).
const PUBLIC_FILE_FIELDS = ['file_id', 'original_name', 'mime_type', 'status', 'error_code', 'error_message', 'kind', 'pages', 'pages_total', 'truncated'];

// Strips extracted `items` and the on-disk `path` before a job record ever
// reaches the client — those are server-side-only (items go through the
// merge/preview use case, path is a local filesystem detail).
const toPublicFile = (file) => {
    const publicFile = {};
    for (const key of PUBLIC_FILE_FIELDS) {
        publicFile[key] = file[key] ?? null;
    }
    publicFile.item_count = Array.isArray(file.items) ? file.items.length : null;
    return publicFile;
};

/**
 * Reads a batch menu import job's current status for polling. Returns a
 * distinguishable JOB_EXPIRED_OR_NOT_FOUND error (rather than a bare 404)
 * when the job hash is gone, since jobs expire after 1 hour and a client
 * that's been polling for a while needs to tell "never existed" from
 * "existed and finished/expired" apart in its UI copy.
 */
export const buildGetMenuImportJobUseCase = ({ menuImportJobRepository }) => {
    return async ({ tenantId, jobId }) => {
        if (typeof jobId !== 'string' || !jobId.trim()) {
            return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'jobId is required.', { statusCode: 400 }));
        }

        const job = await menuImportJobRepository.readJob({ tenantId, jobId });
        if (!job) {
            return fail(new DomainError(
                DomainErrorCode.RESOURCE_NOT_FOUND,
                "This import job wasn't found — it may have expired (jobs are kept for 1 hour). Start a new import.",
                { statusCode: 404, details: { code: 'JOB_EXPIRED_OR_NOT_FOUND' } }
            ));
        }

        return ok({
            job_id: job.job_id,
            status: job.status,
            created_at: job.created_at,
            totals: job.totals,
            files: job.files.map(toPublicFile)
        });
    };
};

export default buildGetMenuImportJobUseCase;
