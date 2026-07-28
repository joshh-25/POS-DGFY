import {
  CompanyRegistrationApplication,
  CompanyRegistrationAttempt,
  CompanyRegistrationEmailDelivery,
  CompanyRegistrationEvent,
  Tenant
} from '../../../models/index.js';

const transactionOptions = (transaction) => transaction ? { transaction } : {};

export const companyRegistrationRepository = {
  createInitial({ tenant, dgfyAccount, legalAcknowledgement, workflowMode, industryTag, transaction }) {
    const options = transactionOptions(transaction);
    return CompanyRegistrationApplication.create({
      tenant_id: tenant.id, dgfy_account_id: dgfyAccount.id,
      registration_email_snapshot: dgfyAccount.email, current_attempt_no: 1,
      review_status: 'pending', provisioning_status: 'not_started'
    }, options).then(async (application) => {
      await CompanyRegistrationAttempt.create({
        application_id: application.id, attempt_no: 1,
        submission_snapshot: { company_name: tenant.name, workflow_mode: workflowMode, industry_tag: industryTag },
        legal_terms_snapshot: legalAcknowledgement, decision: 'pending'
      }, options);
      await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'submitted', actor_type: 'applicant', actor_id: dgfyAccount.id }, options);
      await CompanyRegistrationEmailDelivery.create({ application_id: application.id, event_type: 'submission_received', recipient_email_snapshot: dgfyAccount.email }, options);
      return application;
    });
  },
  findOwned(applicationId, dgfyAccountId) {
    return CompanyRegistrationApplication.findOne({
      where: { id: applicationId, dgfy_account_id: dgfyAccountId },
      include: [
        { model: Tenant, as: 'tenant', attributes: ['id', 'name', 'status', 'rejection_reason', 'owner_dgfy_account_id', 'createdAt', 'settings'] },
        { model: CompanyRegistrationAttempt, as: 'attempts', order: [['attempt_no', 'DESC']], limit: 1 }
      ]
    });
  },
  findOwnedForUpdate(applicationId, dgfyAccountId, transaction) {
    return CompanyRegistrationApplication.findOne({
      where: { id: applicationId, dgfy_account_id: dgfyAccountId },
      transaction,
      lock: transaction?.LOCK?.UPDATE,
      include: [
        { model: Tenant, as: 'tenant' },
        { model: CompanyRegistrationAttempt, as: 'attempts', order: [['attempt_no', 'DESC']], limit: 1 }
      ]
    });
  },
  async markRejected({ tenantId, actor, reason, transaction }) {
    const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId }, ...transactionOptions(transaction) });
    if (!application) return null;
    await application.update({ review_status: 'rejected', optimistic_version: application.optimistic_version + 1 }, transactionOptions(transaction));
    await CompanyRegistrationAttempt.update({ decision: 'rejected', denial_reason: reason, actor_admin_id: actor?.id || null, actor_username_snapshot: actor?.username || null, decided_at: new Date() }, { where: { application_id: application.id, attempt_no: application.current_attempt_no }, ...transactionOptions(transaction) });
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'rejected', actor_type: 'platform_admin', actor_id: actor?.id || null, details: { reason } }, transactionOptions(transaction));
    return application;
  },
  async markProvisioningStarted({ tenantId, actor, retry = false }) {
    const expected = retry ? { review_status: 'approved', provisioning_status: 'failed' } : { review_status: 'pending', provisioning_status: 'not_started' };
    const [changed] = await CompanyRegistrationApplication.update({
      review_status: 'approved', provisioning_status: 'in_progress', optimistic_version: CompanyRegistrationApplication.sequelize.literal('optimistic_version + 1')
    }, { where: { tenant_id: tenantId, ...expected } });
    if (changed !== 1) return null;
    const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId } });
    await CompanyRegistrationAttempt.update({ decision: 'approved', actor_admin_id: actor?.id || null, actor_username_snapshot: actor?.username || null, decided_at: new Date() }, { where: { application_id: application.id, attempt_no: application.current_attempt_no } });
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: retry ? 'provisioning_retry_started' : 'approved', actor_type: 'platform_admin', actor_id: actor?.id || null });
    return application;
  },
  async markProvisioningOutcome({ tenantId, succeeded, details = null }) {
    const application = await CompanyRegistrationApplication.findOne({ where: { tenant_id: tenantId } });
    if (!application) return null;
    await application.update({ provisioning_status: succeeded ? 'succeeded' : 'failed', optimistic_version: application.optimistic_version + 1 });
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: succeeded ? 'provisioning_succeeded' : 'provisioning_failed', actor_type: 'system', details });
    return application;
  },
  async resubmit({ application, tenant, legalAcknowledgement, workflowMode, industryTag, transaction }) {
    const options = transactionOptions(transaction);
    const attemptNo = application.current_attempt_no + 1;
    await application.update({ review_status: 'pending', provisioning_status: 'not_started', current_attempt_no: attemptNo, optimistic_version: application.optimistic_version + 1 }, options);
    await CompanyRegistrationAttempt.create({ application_id: application.id, attempt_no: attemptNo, submission_snapshot: { company_name: tenant.name, workflow_mode: workflowMode, industry_tag: industryTag }, legal_terms_snapshot: legalAcknowledgement, decision: 'pending' }, options);
    await CompanyRegistrationEvent.create({ application_id: application.id, event_type: 'resubmitted', actor_type: 'applicant', actor_id: application.dgfy_account_id, details: { attempt_no: attemptNo } }, options);
    return application.reload(options);
  }
};
