import { Op, literal } from 'sequelize';
import {
  CompanyRegistrationDraft,
  CompanyRegistrationUpload,
  sequelize
} from '../../../models/index.js';

const transactionOptions = (transaction) => transaction ? { transaction } : {};

const uploadInclude = {
  model: CompanyRegistrationUpload,
  as: 'uploads',
  separate: true,
  order: [['position', 'ASC'], ['created_at', 'ASC']]
};

const ownerWhere = (draftId, dgfyAccountId) => ({
  id: draftId,
  dgfy_account_id: dgfyAccountId
});

const findDraftOptions = (transaction, lock = false) => ({
  include: [uploadInclude],
  ...(transaction ? { transaction } : {}),
  ...(lock && transaction ? { lock: transaction.LOCK.UPDATE } : {})
});

export const companyRegistrationDraftRepository = {
  transaction(callback) {
    return sequelize.transaction(callback);
  },

  findLatestEditable(dgfyAccountId, transaction) {
    return CompanyRegistrationDraft.findOne({
      where: {
        dgfy_account_id: dgfyAccountId,
        status: 'draft'
      },
      order: [['updated_at', 'DESC']],
      ...transactionOptions(transaction)
    });
  },

  findOwned(draftId, dgfyAccountId, transaction) {
    return CompanyRegistrationDraft.findOne({
      where: ownerWhere(draftId, dgfyAccountId),
      ...findDraftOptions(transaction)
    });
  },

  findOwnedForUpdate(draftId, dgfyAccountId, transaction) {
    return CompanyRegistrationDraft.findOne({
      where: ownerWhere(draftId, dgfyAccountId),
      ...findDraftOptions(transaction, true)
    });
  },

  findForAdminForUpdate(draftId, transaction) {
    return CompanyRegistrationDraft.findByPk(draftId, {
      include: [uploadInclude],
      ...(transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {})
    });
  },

  findForAdmin(draftId) {
    return CompanyRegistrationDraft.findByPk(draftId, {
      include: [uploadInclude]
    });
  },

  listForAdmin({ status = null, limit = 100 } = {}) {
    const where = status ? { status } : {};
    return CompanyRegistrationDraft.findAll({
      where,
      include: [uploadInclude],
      order: [['submitted_at', 'DESC'], ['updated_at', 'DESC']],
      limit: Math.min(Math.max(Number.parseInt(limit, 10) || 100, 1), 100)
    });
  },

  listAdminUploads(draftId) {
    return CompanyRegistrationUpload.findAll({
      where: {
        registration_draft_id: draftId,
        upload_status: { [Op.ne]: 'removed' },
        removed_at: null
      },
      order: [['category', 'ASC'], ['position', 'ASC'], ['created_at', 'ASC']]
    });
  },

  findAdminUpload(uploadId, draftId) {
    return CompanyRegistrationUpload.findOne({
      where: {
        id: uploadId,
        registration_draft_id: draftId,
        upload_status: { [Op.ne]: 'removed' },
        removed_at: null
      }
    });
  },

  create({ id, dgfyAccountId, registrationEmail, transaction }) {
    return CompanyRegistrationDraft.create({
      id,
      dgfy_account_id: dgfyAccountId,
      registration_email_snapshot: registrationEmail,
      status: 'draft',
      current_step: 1,
      draft_payload: {},
      optimistic_version: 1
    }, transactionOptions(transaction));
  },

  async updateDraft({
    draftId,
    dgfyAccountId,
    expectedVersion,
    currentStep,
    draftPayload,
    transaction
  }) {
    const [changed] = await CompanyRegistrationDraft.update({
      current_step: currentStep,
      draft_payload: draftPayload,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: {
        ...ownerWhere(draftId, dgfyAccountId),
        status: 'draft',
        optimistic_version: expectedVersion
      },
      ...transactionOptions(transaction)
    });

    if (changed !== 1) return null;
    return this.findOwned(draftId, dgfyAccountId, transaction);
  },

  async submitDraft({
    draftId,
    dgfyAccountId,
    expectedVersion,
    currentStep,
    submissionSnapshot,
    legalTermsSnapshot,
    submittedAt,
    transaction
  }) {
    const [changed] = await CompanyRegistrationDraft.update({
      current_step: currentStep,
      status: 'pending_review',
      submission_snapshot: submissionSnapshot,
      legal_terms_snapshot: legalTermsSnapshot,
      submitted_at: submittedAt,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: {
        ...ownerWhere(draftId, dgfyAccountId),
        status: 'draft',
        optimistic_version: expectedVersion
      },
      ...transactionOptions(transaction)
    });

    if (changed !== 1) return null;
    return this.findOwned(draftId, dgfyAccountId, transaction);
  },

  async markApprovedForMaterialization({
    draftId,
    reviewedAt,
    materializedTenantId,
    materializedApplicationId,
    materializationSnapshot,
    transaction
  }) {
    const [changed] = await CompanyRegistrationDraft.update({
      status: 'approved',
      reviewed_at: reviewedAt,
      materialization_status: 'in_progress',
      materialization_error: null,
      materialization_snapshot: materializationSnapshot,
      materialized_tenant_id: materializedTenantId,
      materialized_application_id: materializedApplicationId,
      materialized_at: null,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: {
        id: draftId,
        status: 'pending_review',
        materialization_status: 'not_started'
      },
      ...transactionOptions(transaction)
    });

    if (changed !== 1) return null;
    return CompanyRegistrationDraft.findByPk(draftId, {
      ...findDraftOptions(transaction)
    });
  },

  async claimRetryForMaterialization({
    draftId,
    reviewedAt,
    transaction
  }) {
    const [changed] = await CompanyRegistrationDraft.update({
      status: 'approved',
      reviewed_at: reviewedAt,
      materialization_status: 'in_progress',
      materialization_error: null,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: {
        id: draftId,
        status: 'approved',
        materialization_status: 'failed',
        materialized_tenant_id: { [Op.ne]: null }
      },
      ...transactionOptions(transaction)
    });

    if (changed !== 1) return null;
    return CompanyRegistrationDraft.findByPk(draftId, {
      ...findDraftOptions(transaction)
    });
  },

  updateMaterializationSnapshot({ draftId, materializationSnapshot, transaction }) {
    return CompanyRegistrationDraft.update({
      materialization_snapshot: materializationSnapshot,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: { id: draftId },
      ...transactionOptions(transaction)
    });
  },

  async markMaterializationOutcome({
    draftId,
    succeeded,
    materializationError = null,
    materializationSnapshot = null,
    materializedAt = null,
    transaction
  }) {
    const [changed] = await CompanyRegistrationDraft.update({
      materialization_status: succeeded ? 'succeeded' : 'failed',
      materialization_error: succeeded ? null : String(materializationError || 'Materialization failed.').slice(0, 1000),
      materialization_snapshot: materializationSnapshot,
      materialized_at: succeeded ? materializedAt : null,
      optimistic_version: literal('optimistic_version + 1')
    }, {
      where: {
        id: draftId,
        materialization_status: 'in_progress'
      },
      ...transactionOptions(transaction)
    });

    if (changed !== 1) return null;
    return CompanyRegistrationDraft.findByPk(draftId, {
      ...findDraftOptions(transaction)
    });
  },

  updateUploadMaterializationStates({
    draftId,
    imageUploadIds = [],
    menuUploadIds = [],
    transaction
  }) {
    const updates = [];
    if (imageUploadIds.length > 0) {
      updates.push(CompanyRegistrationUpload.update({
        upload_status: 'processed',
        error_message: null
      }, {
        where: {
          id: { [Op.in]: imageUploadIds },
          registration_draft_id: draftId,
          upload_status: { [Op.ne]: 'removed' },
          removed_at: null
        },
        ...transactionOptions(transaction)
      }));
    }
    if (menuUploadIds.length > 0) {
      updates.push(CompanyRegistrationUpload.update({
        upload_status: 'ready_for_review',
        extraction_status: 'pending',
        error_message: null
      }, {
        where: {
          id: { [Op.in]: menuUploadIds },
          registration_draft_id: draftId,
          upload_status: { [Op.ne]: 'removed' },
          removed_at: null
        },
        ...transactionOptions(transaction)
      }));
    }
    return Promise.all(updates);
  },

  listActiveUploads(draftId, dgfyAccountId, transaction) {
    return CompanyRegistrationUpload.findAll({
      where: {
        registration_draft_id: draftId,
        dgfy_account_id: dgfyAccountId,
        upload_status: { [Op.ne]: 'removed' },
        removed_at: null
      },
      order: [['position', 'ASC'], ['created_at', 'ASC']],
      ...transactionOptions(transaction)
    });
  },

  createUpload({
    id,
    draftId,
    dgfyAccountId,
    category,
    originalName,
    sanitizedName,
    mimeType,
    fileSize,
    storageKey,
    sha256,
    position,
    extractionStatus,
    transaction
  }) {
    return CompanyRegistrationUpload.create({
      id,
      registration_draft_id: draftId,
      dgfy_account_id: dgfyAccountId,
      category,
      original_name: originalName,
      sanitized_name: sanitizedName,
      mime_type: mimeType,
      file_size: fileSize,
      storage_key: storageKey,
      sha256,
      upload_status: 'ready_for_review',
      validation_status: 'passed',
      extraction_status: extractionStatus,
      error_message: null,
      position,
      uploaded_at: new Date()
    }, transactionOptions(transaction));
  },

  findOwnedUpload(uploadId, draftId, dgfyAccountId, transaction) {
    return CompanyRegistrationUpload.findOne({
      where: {
        id: uploadId,
        registration_draft_id: draftId,
        dgfy_account_id: dgfyAccountId
      },
      ...transactionOptions(transaction)
    });
  },

  async removeUpload({ uploadId, draftId, dgfyAccountId, removedAt, transaction }) {
    const [changed] = await CompanyRegistrationUpload.update({
      upload_status: 'removed',
      removed_at: removedAt,
      removed_by_account_id: dgfyAccountId
    }, {
      where: {
        id: uploadId,
        registration_draft_id: draftId,
        dgfy_account_id: dgfyAccountId,
        upload_status: { [Op.ne]: 'removed' },
        removed_at: null
      },
      ...transactionOptions(transaction)
    });
    return changed === 1;
  }
};
