import {
  CompanyRegistrationApplication,
  CompanyRegistrationAttempt,
  CompanyRegistrationEmailDelivery,
  CompanyRegistrationEvent,
  CompanyRegistrationUpload,
  Tenant
} from '../../../models/index.js';
import { Op } from 'sequelize';

const transactionOptions = (transaction) => transaction ? { transaction } : {};

export const companyRegistrationRepository = {
  createInitial({ tenant, dgfyAccount, legalAcknowledgement, workflowMode, industryTag, registrationIndustry = null, storeTemplateKey = null, registrationSnapshot = null, transaction }) {
    const options = transactionOptions(transaction);
    return CompanyRegistrationApplication.create({
      tenant_id: tenant.id, dgfy_account_id: dgfyAccount.id,
      registration_email_snapshot: dgfyAccount.email, current_attempt_no: 1,
      review_status: 'pending', provisioning_status: 'not_started'
    }, options).then(async (application) => {
      await CompanyRegistrationAttempt.create({
        application_id: application.id, attempt_no: 1,
        submission_snapshot: {
          ...(registrationSnapshot || {
            company_name: tenant.name,
            workflow_mode: workflowMode,
            industry_tag: industryTag,
            registration_industry: registrationIndustry,
            store_template_key: storeTemplateKey
          })
        },
        legal_terms_snapshot: legalAcknowledgement, decision: 'pending'
      }, options);
      await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'submitted', actor_type: 'applicant', actor_id: dgfyAccount.id }, options);
      const delivery = await CompanyRegistrationEmailDelivery.create({ application_id: application.id, event_type: 'submission_received', recipient_email_snapshot: dgfyAccount.email }, options);
      application.submissionEmailDelivery = delivery;
      return application;
    });
  },
  updateEmailDelivery(delivery, payload, transaction) {
    return delivery.update(payload, transactionOptions(transaction));
  },
  findOwned(applicationId, dgfyAccountId) {
    return CompanyRegistrationApplication.findOne({
      where: { id: applicationId, dgfy_account_id: dgfyAccountId },
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'status', 'rejection_reason', 'owner_dgfy_account_id', 'createdAt', 'settings'] },
        { model: CompanyRegistrationAttempt, as: 'attempts', separate: true, order: [['attempt_no', 'DESC']], limit: 1 },
        { model: CompanyRegistrationUpload, as: 'uploads', separate: true, order: [['created_at', 'DESC']] }
      ]
    });
  },
  findOwnedForUpdate(applicationId, dgfyAccountId, transaction) {
    return CompanyRegistrationApplication.findOne({
      where: { id: applicationId, dgfy_account_id: dgfyAccountId },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'status', 'rejection_reason', 'owner_dgfy_account_id', 'settings'] },
        { model: CompanyRegistrationAttempt, as: 'attempts', separate: true, attributes: ['id', 'attempt_no', 'submission_snapshot', 'legal_terms_snapshot', 'decision'], order: [['attempt_no', 'DESC']], limit: 1 }
      ]
    });
  },
  async findAdminReview(tenantId) {
    return CompanyRegistrationApplication.findOne({
      where: { tenant_id: tenantId },
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'status', 'rejection_reason', 'owner_dgfy_account_id', 'createdAt', 'settings'] },
        { model: CompanyRegistrationAttempt, as: 'attempts', separate: true, order: [['attempt_no', 'DESC']] },
        { model: CompanyRegistrationEvent, as: 'events', separate: true, order: [['created_at', 'DESC']] },
        { model: CompanyRegistrationUpload, as: 'uploads', separate: true, order: [['created_at', 'DESC']] }
      ]
    });
  },
  async findAdminRegistrationUpload({ tenantId, uploadId }) {
    return CompanyRegistrationUpload.findOne({
      where: { id: uploadId },
      include: [{
        model: CompanyRegistrationApplication,
        as: 'application',
        attributes: ['id', 'tenant_id'],
        required: true,
        where: { tenant_id: tenantId }
      }]
    });
  },
  listUploads(applicationId, { attemptId = null, includePurged = false } = {}) {
    const where = { application_id: applicationId };
    if (attemptId) where.attempt_id = attemptId;
    if (!includePurged) where.purged_at = null;
    return CompanyRegistrationUpload.findAll({ where, order: [['created_at', 'DESC']] });
  },
  findUploadForApplication(uploadId, applicationId, { transaction } = {}) {
    return CompanyRegistrationUpload.findOne({ where: { id: uploadId, application_id: applicationId }, transaction });
  },
  findDuplicateUpload({ applicationId, attemptId, kind, sha256, transaction }) {
    return CompanyRegistrationUpload.findOne({ where: { application_id: applicationId, attempt_id: attemptId, asset_kind: kind, sha256, purged_at: null }, transaction });
  },
  createUpload(payload, transaction) {
    return CompanyRegistrationUpload.create(payload, transactionOptions(transaction));
  },
  createEvent(payload, transaction) {
    return CompanyRegistrationEvent.create(payload, transactionOptions(transaction));
  },
  async revokeUpload({ upload, admin, reason = null, transaction }) {
    await upload.update({ review_status: 'revoked', revoked_at: new Date(), revoked_by_admin_id: admin?.id || null, metadata: { ...(upload.metadata || {}), revoke_reason: String(reason || '').slice(0, 500) } }, transactionOptions(transaction));
    await CompanyRegistrationEvent.create({ application_id: upload.application_id, event_type: 'upload_revoked', actor_type: 'platform_admin', actor_id: admin?.id || null, details: { upload_id: upload.id, reason: reason || null } }, transactionOptions(transaction));
    return upload;
  },
  async cleanupExpiredUploads({ now = new Date(), limit = 500 } = {}) {
    return CompanyRegistrationUpload.findAll({ where: { expires_at: { [Op.lte]: now }, purged_at: null, revoked_at: null }, order: [['expires_at', 'ASC']], limit });
  },
  async markUploadPurged(upload, transaction) {
    return upload.update({ storage_key: null, purged_at: new Date(), review_status: upload.review_status === 'revoked' ? 'revoked' : upload.review_status }, transactionOptions(transaction));
  },
  async markRejected({ tenantId, actor, reason, transaction }) {
    const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId }, ...transactionOptions(transaction) });
    if (!application) return null;
    await application.update({ review_status: 'rejected', optimistic_version: application.optimistic_version + 1 }, transactionOptions(transaction));
    await CompanyRegistrationAttempt.update({ decision: 'rejected', denial_reason: reason, actor_admin_id: actor?.id || null, actor_username_snapshot: actor?.username || null, decided_at: new Date() }, { where: { application_id: application.id, attempt_no: application.current_attempt_no }, ...transactionOptions(transaction) });
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'rejected', actor_type: 'platform_admin', actor_id: actor?.id || null, details: { reason } }, transactionOptions(transaction));
    await CompanyRegistrationUpload.update({ expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) }, { where: { application_id: application.id, attempt_id: { [Op.ne]: null }, purged_at: null, revoked_at: null }, ...transactionOptions(transaction) });
    return application;
  },
  async markProvisioningStarted({ tenantId, actor, retry = false }) {
    const expected = retry
      ? {
          review_status: 'approved',
          [Op.or]: [
            { provisioning_status: 'failed' },
            {
              provisioning_status: 'in_progress',
              updatedAt: { [Op.lt]: new Date(Date.now() - 10 * 60 * 1000) }
            }
          ]
        }
      : { review_status: 'pending', provisioning_status: 'not_started' };
    return CompanyRegistrationApplication.sequelize.transaction(async (transaction) => {
      const [changed] = await CompanyRegistrationApplication.update({
        review_status: 'approved', provisioning_status: 'in_progress', optimistic_version: CompanyRegistrationApplication.sequelize.literal('optimistic_version + 1')
      }, { where: { tenant_id: tenantId, ...expected }, transaction });
      if (changed !== 1) return null;
      const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId }, transaction });
      await CompanyRegistrationAttempt.update({ decision: 'approved', actor_admin_id: actor?.id || null, actor_username_snapshot: actor?.username || null, decided_at: new Date() }, { where: { application_id: application.id, attempt_no: application.current_attempt_no }, transaction });
      await CompanyRegistrationEvent.create({ application_id: application.id, event_type: retry ? 'provisioning_retry_started' : 'approved', actor_type: 'platform_admin', actor_id: actor?.id || null }, { transaction });
      await CompanyRegistrationUpload.update({ expires_at: null }, { where: { application_id: application.id, purged_at: null, revoked_at: null }, transaction });
      return application;
    });
  },
  async markProvisioningOutcome({ tenantId, succeeded, details = null }) {
    return CompanyRegistrationApplication.sequelize.transaction(async (transaction) => {
      const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId }, transaction });
      if (!application) return null;
      const [changed] = await CompanyRegistrationApplication.update({
        provisioning_status: succeeded ? 'succeeded' : 'failed',
        optimistic_version: CompanyRegistrationApplication.sequelize.literal('optimistic_version + 1')
      }, { where: { id: application.id, provisioning_status: 'in_progress' }, transaction });
      if (changed !== 1) return null;
      await CompanyRegistrationEvent.create({ application_id: application.id, event_type: succeeded ? 'provisioning_succeeded' : 'provisioning_failed', actor_type: 'system', details }, { transaction });
      return application.reload({ transaction });
    });
  },
  // Issue #1825: the same staleness window markProvisioningStarted's own CAS already treats as
  // retryable (an in_progress row untouched for 10+ minutes), surfaced here for the boot
  // reconciler to find and mark `failed` -- see tenantProvisioningReconciliationScheduler.js.
  findStaleInProgressApplications({ olderThanMs = 10 * 60 * 1000 } = {}) {
    return CompanyRegistrationApplication.findAll({
      where: {
        provisioning_status: 'in_progress',
        updatedAt: { [Op.lt]: new Date(Date.now() - olderThanMs) }
      }
    });
  },
  async resubmit({ application, tenant, legalAcknowledgement, workflowMode, industryTag, registrationSnapshot = null, transaction }) {
    const options = transactionOptions(transaction);
    const attemptNo = application.current_attempt_no + 1;
    await application.update({ review_status: 'pending', provisioning_status: 'not_started', current_attempt_no: attemptNo, optimistic_version: application.optimistic_version + 1 }, options);
    await CompanyRegistrationAttempt.create({ application_id: application.id, attempt_no: attemptNo, submission_snapshot: registrationSnapshot || { company_name: tenant.name, workflow_mode: workflowMode, industry_tag: industryTag }, legal_terms_snapshot: legalAcknowledgement, decision: 'pending' }, options);
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'resubmitted', actor_type: 'applicant', actor_id: application.dgfy_account_id, details: { attempt_no: attemptNo } }, options);
    return application.reload(options);
  }
};
