import { fail, ok } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { companyRegistrationUploadStorage } from '../repositories/companyRegistrationUploadStorage.js';
import { validateCompanyRegistrationUpload } from '../entities/companyRegistrationUploadValidation.js';

const notFound = () => new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Company registration application not found.', { statusCode: 404 });
const invalid = (message, details = {}) => new DomainError(DomainErrorCode.VALIDATION_FAILED, message, { statusCode: 422, details });

const publicUpload = (upload) => ({
    id: upload.id,
    asset_kind: upload.asset_kind,
    original_filename: upload.original_filename,
    mime_type: upload.mime_type,
    byte_size: Number(upload.byte_size),
    sha256: upload.sha256,
    extraction_status: upload.extraction_status,
    review_status: upload.review_status,
    expires_at: upload.expires_at,
    revoked_at: upload.revoked_at,
    purged_at: upload.purged_at,
    created_at: upload.createdAt || upload.created_at
});

export const toCompanyRegistrationUploadMetadata = publicUpload;

export const buildUploadCompanyRegistrationFileUseCase = ({ repository, transaction }) => async ({ applicationId, dgfyAccountId, kind, file }) => {
    const validation = validateCompanyRegistrationUpload({ file, kind });
    let stored = null;
    try {
        const result = await transaction(async (dbTransaction) => {
            const application = await repository.findOwnedForUpdate(applicationId, dgfyAccountId, dbTransaction);
            if (!application) return fail(notFound());
            if (application.review_status === 'approved' || application.provisioning_status === 'succeeded') return fail(invalid('Uploads cannot be changed after the company is approved.'));
            const attempt = application.attempts?.[0];
            if (!attempt) return fail(invalid('Registration attempt is unavailable.'));
            const duplicate = await repository.findDuplicateUpload({ applicationId, attemptId: attempt.id, kind: validation.kind, sha256: validation.sha256, transaction: dbTransaction });
            if (duplicate) return ok({ statusCode: 200, payload: { success: true, data: publicUpload(duplicate), idempotent: true } });
            stored = await companyRegistrationUploadStorage.write({ applicationId, attemptNo: attempt.attempt_no, kind: validation.kind, extension: validation.extension, buffer: file.buffer });
            const upload = await repository.createUpload({
                application_id: application.id,
                attempt_id: attempt.id,
                asset_kind: validation.kind,
                storage_key: stored.storage_key,
                original_filename: validation.original_filename,
                mime_type: validation.mime_type,
                byte_size: stored.byte_size,
                sha256: stored.sha256,
                extraction_status: validation.kind === 'menu' ? 'queued' : 'not_applicable',
                review_status: 'pending',
                expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
                metadata: { upload_source: 'applicant' }
            }, dbTransaction);
            await repository.createEvent({ application_id: application.id, event_type: 'upload_received', actor_type: 'applicant', actor_id: dgfyAccountId, details: { upload_id: upload.id, asset_kind: validation.kind, sha256: validation.sha256 } }, dbTransaction);
            return ok({ statusCode: 201, payload: { success: true, data: publicUpload(upload) } });
        });
        return result;
    } catch (error) {
        if (stored?.storage_key) await companyRegistrationUploadStorage.remove(stored.storage_key).catch(() => {});
        throw error;
    }
};

export const buildListAdminCompanyRegistrationUseCase = ({ repository }) => async ({ tenantId, admin }) => {
    if (!admin) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Platform administrator authentication is required.', { statusCode: 401 }));
    const application = await repository.findAdminReview(tenantId);
    if (!application) return fail(notFound());
    const latest = application.attempts?.[0];
    return ok({ statusCode: 200, payload: { success: true, data: {
        application_id: application.id,
        tenant_id: tenantId,
        review_status: application.review_status,
        provisioning_status: application.provisioning_status,
        current_attempt_no: application.current_attempt_no,
        company_name: application.tenant?.name,
        submission_snapshot: latest?.submission_snapshot || null,
        legal_terms_snapshot: latest?.legal_terms_snapshot || null,
        attempts: application.attempts || [],
        events: application.events || [],
        uploads: (application.uploads || []).map(publicUpload)
    } } });
};

export const buildDownloadAdminCompanyRegistrationUploadUseCase = ({ repository, storage = companyRegistrationUploadStorage }) => async ({ tenantId, uploadId, admin }) => {
    if (!admin) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Platform administrator authentication is required.', { statusCode: 401 }));
    const upload = await repository.findAdminRegistrationUpload({ tenantId, uploadId });
    const application = upload?.application;
    if (!application || !upload) return fail(notFound());
    if (!upload.storage_key || upload.purged_at || upload.revoked_at) return fail(new DomainError(DomainErrorCode.RESOURCE_NOT_FOUND, 'This registration upload is no longer available.', { statusCode: 410 }));
    await repository.createEvent({ application_id: application.id, event_type: 'upload_downloaded', actor_type: 'platform_admin', actor_id: admin.id, details: { upload_id: upload.id } });
    return ok({ statusCode: 200, data: { stream: storage.createReadStream(upload.storage_key), mimeType: upload.mime_type, filename: upload.original_filename, size: Number(upload.byte_size) } });
};

export const buildRevokeAdminCompanyRegistrationUploadUseCase = ({ repository, storage = companyRegistrationUploadStorage, transaction }) => async ({ tenantId, uploadId, admin, reason }) => {
    if (!admin) return fail(new DomainError(DomainErrorCode.AUTHENTICATION_FAILED, 'Platform administrator authentication is required.', { statusCode: 401 }));
    let storageKey = null;
    const result = await transaction(async (dbTransaction) => {
        const application = await repository.findAdminReview(tenantId);
        const upload = application ? (application.uploads || []).find((candidate) => candidate.id === uploadId) : null;
        if (!application || !upload) return fail(notFound());
        storageKey = upload.storage_key;
        await repository.revokeUpload({ upload, admin, reason, transaction: dbTransaction });
        return ok({ statusCode: 200, payload: { success: true, data: publicUpload(upload) } });
    });
    if (result?.success && storageKey) await storage.remove(storageKey).catch(() => {});
    return result;
};
