import { v4 as uuidv4 } from 'uuid';
import { fail, ok } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { assertDgfyStorefrontRegistrationLegalConsents } from '../../shared/utils/dgfyLegalTerms.js';
import {
  REGISTRATION_DRAFT_STATUSES,
  REGISTRATION_MAX_GALLERY_UPLOADS,
  REGISTRATION_MAX_MENU_UPLOADS,
  REGISTRATION_MAX_UPLOADS,
  extractDraftPayload,
  getAllowedUploadMimeTypes,
  normalizeDraftPayload,
  normalizeRegistrationStep,
  normalizeUploadCategory,
  validateRegistrationFileSignature,
  validateRegistrationSubmission
} from '../contracts/companyRegistrationDraftContract.js';

const authError = () => new DomainError(
  DomainErrorCode.AUTHENTICATION_FAILED,
  'DGFY account authentication is required.',
  { statusCode: 401 }
);

const notFoundError = () => new DomainError(
  DomainErrorCode.RESOURCE_NOT_FOUND,
  'Registration draft not found.',
  { statusCode: 404 }
);

const conflictError = (message) => new DomainError(
  DomainErrorCode.CONFLICT,
  message,
  { statusCode: 409 }
);

const internalError = (message, cause) => new DomainError(
  DomainErrorCode.INTERNAL_ERROR,
  message,
  { statusCode: 500, cause }
);

const cloneJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const mergeJsonValues = (existingValue, incomingValue) => {
  const canMerge = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  if (canMerge(existingValue) && canMerge(incomingValue)) {
    const merged = { ...existingValue };
    for (const [key, value] of Object.entries(incomingValue)) {
      merged[key] = mergeJsonValues(existingValue[key], value);
    }
    return merged;
  }
  return cloneJson(incomingValue);
};

const serializeUpload = (upload) => ({
  id: upload.id,
  category: upload.category,
  original_name: upload.original_name,
  sanitized_name: upload.sanitized_name,
  mime_type: upload.mime_type,
  file_size: Number(upload.file_size),
  upload_status: upload.upload_status,
  validation_status: upload.validation_status,
  extraction_status: upload.extraction_status,
  error_message: upload.error_message || null,
  position: upload.position,
  uploaded_at: upload.uploaded_at,
  removed_at: upload.removed_at || null
});

export const serializeCompanyRegistrationDraft = (draft) => {
  const plain = typeof draft?.get === 'function' ? draft.get({ plain: true }) : draft;
  return {
    id: plain.id,
    status: plain.status,
    current_step: plain.current_step,
    version: plain.optimistic_version,
    payload: plain.draft_payload || {},
    registration_email: plain.registration_email_snapshot,
    created_at: plain.createdAt || plain.created_at,
    updated_at: plain.updatedAt || plain.updated_at,
    submitted_at: plain.submitted_at || null,
    reviewed_at: plain.reviewed_at || null,
    materialization_status: plain.materialization_status || 'not_started',
    materialization_error: plain.materialization_error || null,
    materialized_at: plain.materialized_at || null,
    uploads: (plain.uploads || []).map(serializeUpload)
  };
};

const resultForDraft = (draft, statusCode = 200, message = null) => ok({
  statusCode,
  payload: {
    success: true,
    data: serializeCompanyRegistrationDraft(draft),
    ...(message ? { message } : {})
  }
});

const toFailure = (error, fallbackMessage) => {
  if (error instanceof DomainError) return fail(error);
  return fail(internalError(fallbackMessage, error));
};

const resolveExpectedVersion = (body, draft) => {
  const raw = body.version ?? body.optimistic_version ?? draft.optimistic_version;
  const version = Number(raw);
  if (!Number.isInteger(version) || version < 1) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'A valid registration draft version is required.',
      { statusCode: 422, details: { error_code: 'REGISTRATION_DRAFT_VERSION_INVALID' } }
    );
  }
  return version;
};

const mergePayload = (existingPayload, incomingPayload) => normalizeDraftPayload(
  mergeJsonValues(existingPayload || {}, incomingPayload || {})
);

const validateCategoryCount = (category, uploads) => {
  const activeUploads = uploads.filter((upload) => upload.upload_status !== 'removed' && !upload.removed_at);
  if (activeUploads.length >= REGISTRATION_MAX_UPLOADS) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'The registration upload limit has been reached.',
      { statusCode: 422, details: { error_code: 'REGISTRATION_UPLOAD_LIMIT_REACHED' } }
    );
  }

  const categoryCount = activeUploads.filter((upload) => upload.category === category).length;
  const categoryLimit = category === 'profile_image' || category === 'cover_image'
    ? 1
    : category === 'gallery_image'
      ? REGISTRATION_MAX_GALLERY_UPLOADS
      : REGISTRATION_MAX_MENU_UPLOADS;
  if (categoryCount >= categoryLimit) {
    throw new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'The upload limit for this registration category has been reached.',
      {
        statusCode: 422,
        details: {
          error_code: 'REGISTRATION_CATEGORY_UPLOAD_LIMIT_REACHED',
          category,
          limit: categoryLimit
        }
      }
    );
  }
};

export const buildCreateCompanyRegistrationDraftUseCase = ({
  repository,
  idGenerator = uuidv4,
  logger
}) => async ({ dgfyAccount }) => {
  if (!dgfyAccount?.id) return fail(authError());

  try {
    const existing = await repository.findLatestEditable(dgfyAccount.id);
    if (existing) return resultForDraft(existing);

    const draft = await repository.create({
      id: idGenerator(),
      dgfyAccountId: dgfyAccount.id,
      registrationEmail: String(dgfyAccount.email || '').trim().toLowerCase() || 'unknown',
      transaction: null
    });
    return resultForDraft(draft, 201);
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to create draft', { error: error.message });
    return toFailure(error, 'Unable to create the registration draft.');
  }
};

export const buildGetCompanyRegistrationDraftUseCase = ({
  repository,
  logger
}) => async ({ draftId, dgfyAccount }) => {
  if (!dgfyAccount?.id) return fail(authError());

  try {
    const draft = await repository.findOwned(draftId, dgfyAccount.id);
    if (!draft) return fail(notFoundError());
    return resultForDraft(draft);
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to load draft', { error: error.message, draftId });
    return toFailure(error, 'Unable to load the registration draft.');
  }
};

export const buildUpdateCompanyRegistrationDraftUseCase = ({
  repository,
  logger
}) => async ({ draftId, dgfyAccount, body = {} }) => {
  if (!dgfyAccount?.id) return fail(authError());

  try {
    const draft = await repository.findOwned(draftId, dgfyAccount.id);
    if (!draft) return fail(notFoundError());
    if (draft.status !== REGISTRATION_DRAFT_STATUSES.DRAFT) {
      return fail(conflictError('This registration has already been submitted and can no longer be edited.'));
    }

    const expectedVersion = resolveExpectedVersion(body, draft);
    const incomingPayload = normalizeDraftPayload(extractDraftPayload(body));
    const payload = mergePayload(draft.draft_payload || {}, incomingPayload);
    const requestedStep = normalizeRegistrationStep(
      body.current_step ?? body.currentStep ?? body.step,
      draft.current_step
    );
    const currentStep = Math.max(Number(draft.current_step) || 1, requestedStep);
    const updated = await repository.updateDraft({
      draftId,
      dgfyAccountId: dgfyAccount.id,
      expectedVersion,
      currentStep,
      draftPayload: payload,
      transaction: null
    });
    if (!updated) return fail(conflictError('This registration draft changed. Reload it before saving again.'));
    return resultForDraft(updated);
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to update draft', { error: error.message, draftId });
    return toFailure(error, 'Unable to save the registration draft.');
  }
};

export const buildUploadCompanyRegistrationFileUseCase = ({
  repository,
  storage,
  idGenerator = uuidv4,
  logger
}) => async ({ draftId, dgfyAccount, body = {}, file }) => {
  if (!dgfyAccount?.id) return fail(authError());
  if (!file?.buffer) {
    return fail(new DomainError(
      DomainErrorCode.VALIDATION_FAILED,
      'Attach a registration file before uploading.',
      { statusCode: 422, details: { error_code: 'REGISTRATION_FILE_REQUIRED' } }
    ));
  }

  try {
    const draft = await repository.findOwned(draftId, dgfyAccount.id);
    if (!draft) return fail(notFoundError());
    if (draft.status !== REGISTRATION_DRAFT_STATUSES.DRAFT) {
      return fail(conflictError('Files cannot be changed after registration submission.'));
    }

    const category = normalizeUploadCategory(body.category);
    const mimeType = String(file.mimetype || '').trim().toLowerCase();
    if (!getAllowedUploadMimeTypes(category).includes(mimeType)) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'The selected file type is not supported for this upload category.',
        { statusCode: 422, details: { error_code: 'REGISTRATION_FILE_TYPE_INVALID', category, mime_type: mimeType } }
      ));
    }
    validateCategoryCount(category, draft.uploads || []);
    validateRegistrationFileSignature({
      buffer: file.buffer,
      mimeType,
      category
    });

    const uploadId = idGenerator();
    const stored = await storage.persist({
      draftId,
      uploadId,
      originalName: file.originalname,
      mimeType,
      buffer: file.buffer
    });

    try {
      const existingCategoryUploads = (draft.uploads || []).filter((upload) => upload.category === category && upload.upload_status !== 'removed');
      const upload = await repository.createUpload({
        id: uploadId,
        draftId,
        dgfyAccountId: dgfyAccount.id,
        category,
        originalName: String(file.originalname || 'file').slice(0, 255),
        sanitizedName: stored.sanitizedName,
        mimeType,
        fileSize: stored.fileSize,
        storageKey: stored.storageKey,
        sha256: stored.sha256,
        position: existingCategoryUploads.length,
        extractionStatus: category === 'menu_upload' ? 'pending' : 'not_applicable',
        transaction: null
      });
      return ok({
        statusCode: 201,
        payload: {
          success: true,
          data: serializeUpload(upload)
        }
      });
    } catch (error) {
      await storage.remove(stored.storageKey).catch((cleanupError) => {
        logger?.error?.('[RegistrationDraft] Failed to clean up orphaned upload', {
          error: cleanupError.message,
          storage_key: stored.storageKey
        });
      });
      throw error;
    }
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to upload file', { error: error.message, draftId });
    return toFailure(error, 'Unable to save the registration file.');
  }
};

export const buildRemoveCompanyRegistrationFileUseCase = ({
  repository,
  logger,
  now = () => new Date()
}) => async ({ draftId, uploadId, dgfyAccount }) => {
  if (!dgfyAccount?.id) return fail(authError());

  try {
    const draft = await repository.findOwned(draftId, dgfyAccount.id);
    if (!draft) return fail(notFoundError());
    if (draft.status !== REGISTRATION_DRAFT_STATUSES.DRAFT) {
      return fail(conflictError('Files cannot be changed after registration submission.'));
    }
    const upload = await repository.findOwnedUpload(uploadId, draftId, dgfyAccount.id);
    if (!upload || upload.upload_status === 'removed') {
      return fail(new DomainError(
        DomainErrorCode.RESOURCE_NOT_FOUND,
        'Registration upload not found.',
        { statusCode: 404 }
      ));
    }
    const removed = await repository.removeUpload({
      uploadId,
      draftId,
      dgfyAccountId: dgfyAccount.id,
      removedAt: now(),
      transaction: null
    });
    if (!removed) return fail(conflictError('This registration upload was already changed.'));
    return ok({
      statusCode: 200,
      payload: {
        success: true,
        data: { id: uploadId, status: 'removed' }
      }
    });
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to remove upload', { error: error.message, draftId, uploadId });
    return toFailure(error, 'Unable to remove the registration file.');
  }
};

export const buildSubmitCompanyRegistrationDraftUseCase = ({
  repository,
  now = () => new Date(),
  logger
}) => async ({ draftId, dgfyAccount, body = {}, metadata = {} }) => {
  if (!dgfyAccount?.id) return fail(authError());

  try {
    const submit = async (transaction) => {
      const draft = await repository.findOwnedForUpdate(draftId, dgfyAccount.id, transaction);
      if (!draft) return fail(notFoundError());
      if (draft.status !== REGISTRATION_DRAFT_STATUSES.DRAFT) {
        return fail(conflictError('This registration has already been submitted.'));
      }

      const expectedVersion = resolveExpectedVersion(body, draft);
      const incomingPayload = normalizeDraftPayload(extractDraftPayload(body));
      const payload = mergePayload(draft.draft_payload || {}, incomingPayload);
      const uploads = await repository.listActiveUploads(draftId, dgfyAccount.id, transaction);
      validateRegistrationSubmission({ payload, uploads });

      let legalTermsSnapshot;
      try {
        legalTermsSnapshot = assertDgfyStorefrontRegistrationLegalConsents({ body });
      } catch (error) {
        return fail(error);
      }

      const submittedAt = now();
      const legalSnapshot = {
        ...legalTermsSnapshot,
        dgfy_account_id: dgfyAccount.id,
        accepted_at: submittedAt.toISOString(),
        ip_address: metadata.ip_address || null,
        user_agent: metadata.user_agent || null,
        request_id: metadata.request_id || null
      };
      const submissionSnapshot = {
        schema_version: 1,
        dgfy_account_id: dgfyAccount.id,
        submitted_at: submittedAt.toISOString(),
        payload: cloneJson(payload),
        uploads: uploads.map((upload) => ({
          id: upload.id,
          category: upload.category,
          original_name: upload.original_name,
          sanitized_name: upload.sanitized_name,
          mime_type: upload.mime_type,
          file_size: Number(upload.file_size),
          storage_key: upload.storage_key,
          sha256: upload.sha256,
          upload_status: upload.upload_status,
          validation_status: upload.validation_status,
          extraction_status: upload.extraction_status,
          position: upload.position
        }))
      };

      const updated = await repository.submitDraft({
        draftId,
        dgfyAccountId: dgfyAccount.id,
        expectedVersion,
        currentStep: 3,
        submissionSnapshot,
        legalTermsSnapshot: legalSnapshot,
        submittedAt,
        transaction
      });
      if (!updated) return fail(conflictError('This registration draft changed. Reload it before submitting again.'));

      return ok({
        statusCode: 200,
        payload: {
          success: true,
          data: {
            registration_id: updated.id,
            status: updated.status,
            submitted_at: updated.submitted_at
          },
          message: 'Registration submitted for admin review.'
        }
      });
    };

    return repository.transaction
      ? repository.transaction(submit)
      : submit(null);
  } catch (error) {
    logger?.error?.('[RegistrationDraft] Failed to submit draft', { error: error.message, draftId });
    return toFailure(error, 'Unable to submit the registration for review.');
  }
};
