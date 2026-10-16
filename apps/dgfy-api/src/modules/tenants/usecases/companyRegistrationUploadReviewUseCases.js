import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { ZipArchive } from 'archiver';
import { fail, ok } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { REGISTRATION_DRAFT_STATUSES, sanitizeOriginalFilename } from '../contracts/companyRegistrationDraftContract.js';

const REVIEWABLE_STATUSES = new Set([
  REGISTRATION_DRAFT_STATUSES.PENDING_REVIEW,
  REGISTRATION_DRAFT_STATUSES.APPROVED,
  REGISTRATION_DRAFT_STATUSES.REJECTED
]);

const STATUS_FILTERS = new Set([
  REGISTRATION_DRAFT_STATUSES.PENDING_REVIEW,
  REGISTRATION_DRAFT_STATUSES.APPROVED,
  REGISTRATION_DRAFT_STATUSES.REJECTED,
  'all'
]);

const asPlain = (value) => (
  typeof value?.get === 'function' ? value.get({ plain: true }) : (value || {})
);

const notFound = (message) => new DomainError(
  DomainErrorCode.RESOURCE_NOT_FOUND,
  message,
  { statusCode: 404 }
);

const conflict = (message) => new DomainError(
  DomainErrorCode.CONFLICT,
  message,
  { statusCode: 409 }
);

const validation = (message, details = {}) => new DomainError(
  DomainErrorCode.VALIDATION_FAILED,
  message,
  { statusCode: 422, details }
);

const unavailable = (message, cause = null) => new DomainError(
  DomainErrorCode.SERVICE_UNAVAILABLE,
  message,
  { statusCode: 503, cause }
);

const internal = (message, cause) => new DomainError(
  DomainErrorCode.INTERNAL_ERROR,
  message,
  { statusCode: 500, cause }
);

const toFailure = (error, fallbackMessage) => (
  error instanceof DomainError ? fail(error) : fail(internal(fallbackMessage, error))
);

const isUuid = (value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());

const serializeUpload = (upload, archiveName = null) => {
  const plain = asPlain(upload);
  return {
    id: plain.id,
    category: plain.category,
    original_name: plain.original_name,
    sanitized_name: plain.sanitized_name,
    mime_type: plain.mime_type,
    file_size: Number(plain.file_size),
    upload_status: plain.upload_status,
    validation_status: plain.validation_status,
    extraction_status: plain.extraction_status,
    error_message: plain.error_message || null,
    position: plain.position,
    uploaded_at: plain.uploaded_at,
    removed_at: plain.removed_at || null,
    ...(archiveName ? { archive_name: archiveName } : {})
  };
};

const serializeDraft = (draft) => {
  const plain = asPlain(draft);
  const payload = plain.draft_payload || {};
  const business = payload.business || {};
  return {
    id: plain.id,
    status: plain.status,
    current_step: plain.current_step,
    registration_email: plain.registration_email_snapshot,
    submitted_at: plain.submitted_at || null,
    reviewed_at: plain.reviewed_at || null,
    materialization_status: plain.materialization_status || 'not_started',
    materialization_error: plain.materialization_error || null,
    materialized_tenant_id: plain.materialized_tenant_id || null,
    materialized_application_id: plain.materialized_application_id || null,
    materialized_at: plain.materialized_at || null,
    company_name: String(business.company_name || business.name || '').trim() || null,
    payload,
    legal_consents: plain.legal_terms_snapshot ? {
      accepted_company_terms: plain.legal_terms_snapshot.accepted_company_terms === true,
      accepted_marketplace_terms: plain.legal_terms_snapshot.accepted_marketplace_terms === true,
      company_terms_version: plain.legal_terms_snapshot.company_terms_version || null,
      marketplace_terms_version: plain.legal_terms_snapshot.marketplace_terms_version || null,
      accepted_at: plain.legal_terms_snapshot.accepted_at || null
    } : null,
    uploads: (plain.uploads || [])
      .filter((upload) => upload.upload_status !== 'removed' && !upload.removed_at)
      .map((upload) => serializeUpload(upload))
  };
};

const resolveSafeContentType = (mimeType) => {
  const normalized = String(mimeType || '').trim().toLowerCase();
  return /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(normalized) ? normalized : 'application/octet-stream';
};

const resolveDownloadName = (upload) => sanitizeOriginalFilename(
  upload?.sanitized_name || upload?.original_name || 'registration-file'
);

const resolveDraftIdForTenant = async ({
  tenantId,
  tenantAdminRepository,
  companyRegistrationRepository
}) => {
  if (!isUuid(tenantId)) throw validation('The tenant identifier is invalid.', { error_code: 'TENANT_ID_INVALID' });
  const tenant = await tenantAdminRepository.findTenantById(tenantId);
  if (!tenant) throw notFound('Tenant not found.');

  const plainTenant = asPlain(tenant);
  const tenantSettings = plainTenant.settings && typeof plainTenant.settings === 'object'
    ? plainTenant.settings
    : {};
  let draftId = tenantSettings.registration_draft_id || null;

  if (!draftId) {
    const application = await tenantAdminRepository.findCompanyRegistrationApplicationForTenant(tenantId);
    if (application && typeof companyRegistrationRepository.findLatestAttempt === 'function') {
      const attempt = await companyRegistrationRepository.findLatestAttempt(application.id);
      draftId = asPlain(attempt).submission_snapshot?.registration_draft_id || null;
    }
  }

  if (!draftId || !isUuid(draftId)) {
    throw notFound('No Storefront registration draft is linked to this tenant.');
  }

  return { tenant: plainTenant, draftId };
};

const resolveContext = async ({
  draftId,
  tenantId,
  repository,
  tenantAdminRepository,
  companyRegistrationRepository
}) => {
  let resolvedTenant = null;
  let resolvedDraftId = draftId;
  if (tenantId) {
    const resolved = await resolveDraftIdForTenant({
      tenantId,
      tenantAdminRepository,
      companyRegistrationRepository
    });
    resolvedTenant = resolved.tenant;
    resolvedDraftId = resolved.draftId;
  }

  if (!isUuid(resolvedDraftId)) {
    throw validation('The registration draft identifier is invalid.', { error_code: 'REGISTRATION_DRAFT_ID_INVALID' });
  }

  const draft = await repository.findForAdmin(resolvedDraftId);
  if (!draft) throw notFound('Registration draft not found.');
  const plainDraft = asPlain(draft);
  if (!REVIEWABLE_STATUSES.has(plainDraft.status)) {
    throw conflict('Only submitted registration drafts can be reviewed.');
  }
  if (
    tenantId
    && plainDraft.materialized_tenant_id
    && String(plainDraft.materialized_tenant_id) !== String(tenantId)
  ) {
    throw notFound('The registration upload is not linked to this tenant.');
  }

  return {
    draft,
    plainDraft,
    tenant: resolvedTenant,
    tenantId: plainDraft.materialized_tenant_id || tenantId || null
  };
};

const recordDownloadAudit = async ({
  draft,
  tenantId,
  uploadId = null,
  uploadIds = [],
  action,
  actor,
  requestMetadata,
  tenantAdminRepository,
  companyRegistrationDownloadAuditRepository
}) => {
  const plainDraft = asPlain(draft);
  const actorId = actor?.id || actor?.admin_id || null;
  const actorUsername = String(actor?.username || 'platform_admin').slice(0, 120);
  const metadata = {
    registration_draft_id: plainDraft.id,
    upload_ids: uploadIds,
    file_count: uploadIds.length,
    request_id: requestMetadata?.request_id || null,
    ip_address: requestMetadata?.ip_address || null,
    user_agent: requestMetadata?.user_agent || null
  };

  if (tenantId) {
    await tenantAdminRepository.createTenantAdminAuditLog({
      tenant_id: tenantId,
      action: 'registration_upload_download',
      actor_username: actorUsername,
      reason: action === 'archive_download' ? 'Downloaded registration menu originals.' : 'Downloaded a registration upload.',
      request_id: requestMetadata?.request_id || null,
      ip_address: requestMetadata?.ip_address || null,
      user_agent: requestMetadata?.user_agent || null,
      metadata: {
        ...metadata,
        action,
        upload_id: uploadId
      }
    });
    return;
  }

  await companyRegistrationDownloadAuditRepository.create({
    registration_draft_id: plainDraft.id,
    tenant_id: null,
    upload_id: uploadId,
    actor_admin_id: actorId,
    actor_username: actorUsername,
    action,
    file_count: uploadIds.length,
    metadata
  });
};

const readStoredUpload = async ({ upload, storage }) => {
  const plainUpload = asPlain(upload);
  let filePath;
  try {
    filePath = storage.pathForKey(plainUpload.storage_key);
    const stat = await fs.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Stored registration upload is not a regular file.');
    }
    const buffer = await fs.readFile(filePath);
    if (Number(plainUpload.file_size) !== buffer.length) {
      throw new Error('Stored registration upload size does not match its recorded metadata.');
    }
    if (plainUpload.sha256) {
      const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
      if (checksum !== plainUpload.sha256) {
        throw new Error('Stored registration upload checksum does not match its recorded metadata.');
      }
    }
    return {
      buffer,
      filename: resolveDownloadName(plainUpload),
      contentType: resolveSafeContentType(plainUpload.mime_type),
      upload: plainUpload
    };
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw unavailable('The registration file is unavailable or failed integrity validation.', error);
  }
};

const archiveEntryName = (upload, index, usedNames) => {
  const plain = asPlain(upload);
  const prefix = String(index + 1).padStart(2, '0');
  const baseName = `${prefix}-${resolveDownloadName(plain)}`;
  if (!usedNames.has(baseName)) {
    usedNames.add(baseName);
    return `menu/${baseName}`;
  }
  const fallback = `${prefix}-${String(plain.id).slice(0, 8)}-${resolveDownloadName(plain)}`;
  usedNames.add(fallback);
  return `menu/${fallback}`;
};

const createZipBuffer = async ({ files, manifest }) => new Promise((resolve, reject) => {
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const passThrough = new PassThrough();
  const chunks = [];
  let settled = false;
  const failArchive = (error) => {
    if (settled) return;
    settled = true;
    reject(error);
  };

  passThrough.on('data', (chunk) => chunks.push(chunk));
  passThrough.on('end', () => {
    if (settled) return;
    settled = true;
    resolve(Buffer.concat(chunks));
  });
  passThrough.on('error', failArchive);
  archive.on('error', failArchive);
  archive.pipe(passThrough);

  files.forEach(({ buffer, archiveName }) => archive.append(buffer, { name: archiveName }));
  archive.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  Promise.resolve(archive.finalize()).catch(failArchive);
});

export const buildCompanyRegistrationUploadReviewUseCases = ({
  repository,
  tenantAdminRepository,
  companyRegistrationRepository,
  companyRegistrationDownloadAuditRepository,
  storage,
  logger
}) => {
  const listDrafts = async ({ status = 'pending_review', limit = 100 } = {}) => {
    try {
      const normalizedStatus = String(status || 'pending_review').trim().toLowerCase();
      if (!STATUS_FILTERS.has(normalizedStatus)) {
        return fail(validation('The registration status filter is invalid.', { error_code: 'REGISTRATION_STATUS_INVALID' }));
      }
      const drafts = await repository.listForAdmin({
        status: normalizedStatus === 'all' ? null : normalizedStatus,
        limit
      });
      return ok({
        statusCode: 200,
        payload: {
          success: true,
          data: drafts.map((draft) => serializeDraft(draft))
        }
      });
    } catch (error) {
      logger?.error?.('[RegistrationReview] Failed to list registration drafts', { error: error.message });
      return toFailure(error, 'Unable to list registration drafts.');
    }
  };

  const listUploads = async ({ draftId, tenantId } = {}) => {
    try {
      const context = await resolveContext({
        draftId,
        tenantId,
        repository,
        tenantAdminRepository,
        companyRegistrationRepository
      });
      const uploads = await repository.listAdminUploads(context.plainDraft.id);
      return ok({
        statusCode: 200,
        payload: {
          success: true,
          data: {
            draft: serializeDraft(context.draft),
            tenant_id: context.tenantId,
            uploads: uploads.map((upload) => serializeUpload(upload))
          }
        }
      });
    } catch (error) {
      logger?.error?.('[RegistrationReview] Failed to list registration uploads', {
        error: error.message,
        draftId,
        tenantId
      });
      return toFailure(error, 'Unable to list registration uploads.');
    }
  };

  const downloadUpload = async ({ draftId, tenantId, uploadId, actor, requestMetadata = {} } = {}) => {
    try {
      if (!isUuid(uploadId)) throw validation('The upload identifier is invalid.', { error_code: 'REGISTRATION_UPLOAD_ID_INVALID' });
      const context = await resolveContext({
        draftId,
        tenantId,
        repository,
        tenantAdminRepository,
        companyRegistrationRepository
      });
      const upload = await repository.findAdminUpload(uploadId, context.plainDraft.id);
      if (!upload) throw notFound('Registration upload not found.');
      const file = await readStoredUpload({ upload, storage });
      await recordDownloadAudit({
        draft: context.draft,
        tenantId: context.tenantId,
        uploadId,
        uploadIds: [uploadId],
        action: 'individual_download',
        actor,
        requestMetadata,
        tenantAdminRepository,
        companyRegistrationDownloadAuditRepository
      });
      return ok({
        statusCode: 200,
        file,
        draft: serializeDraft(context.draft),
        tenantId: context.tenantId
      });
    } catch (error) {
      logger?.error?.('[RegistrationReview] Failed to download registration upload', {
        error: error.message,
        draftId,
        tenantId,
        uploadId
      });
      return toFailure(error, 'Unable to download the registration upload.');
    }
  };

  const downloadMenuArchive = async ({ draftId, tenantId, actor, requestMetadata = {} } = {}) => {
    try {
      const context = await resolveContext({
        draftId,
        tenantId,
        repository,
        tenantAdminRepository,
        companyRegistrationRepository
      });
      const uploads = await repository.listAdminUploads(context.plainDraft.id);
      const menuUploads = uploads.filter((upload) => asPlain(upload).category === 'menu_upload');
      if (menuUploads.length === 0) throw notFound('No menu originals are available for this registration.');

      const usedNames = new Set();
      const files = [];
      const manifestFiles = [];
      for (let index = 0; index < menuUploads.length; index += 1) {
        const upload = menuUploads[index];
        const file = await readStoredUpload({ upload, storage });
        const archiveName = archiveEntryName(upload, index, usedNames);
        files.push({ buffer: file.buffer, archiveName });
        const plainUpload = asPlain(upload);
        manifestFiles.push({
          ...serializeUpload(upload, archiveName),
          sha256: plainUpload.sha256
        });
      }

      const archiveBuffer = await createZipBuffer({
        files,
        manifest: {
          schema_version: 1,
          generated_at: new Date().toISOString(),
          registration_draft_id: context.plainDraft.id,
          tenant_id: context.tenantId,
          files: manifestFiles
        }
      });
      await recordDownloadAudit({
        draft: context.draft,
        tenantId: context.tenantId,
        uploadIds: menuUploads.map((upload) => asPlain(upload).id),
        action: 'archive_download',
        actor,
        requestMetadata,
        tenantAdminRepository,
        companyRegistrationDownloadAuditRepository
      });
      const companyName = sanitizeOriginalFilename(
        serializeDraft(context.draft).company_name || context.tenantId || context.plainDraft.id
      ).replace(/\s+/g, '-').toLowerCase();
      return ok({
        statusCode: 200,
        file: {
          buffer: archiveBuffer,
          filename: `${companyName}-registration-menu-originals.zip`,
          contentType: 'application/zip'
        },
        tenantId: context.tenantId
      });
    } catch (error) {
      logger?.error?.('[RegistrationReview] Failed to create menu archive', {
        error: error.message,
        draftId,
        tenantId
      });
      return toFailure(error, 'Unable to create the registration menu archive.');
    }
  };

  return {
    listDrafts,
    listUploads,
    downloadUpload,
    downloadMenuArchive
  };
};
