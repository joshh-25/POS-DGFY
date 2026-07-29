import { fail, ok } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { assertDgfyLegalAcknowledgement, DGFY_LEGAL_TERM_FLOWS } from '../../shared/utils/dgfyLegalTerms.js';
import { isWorkflowMode } from '../../shared/constants/workflowModes.js';

const maskEmail = (email) => {
  const [local, domain] = String(email || '').split('@');
  return local && domain ? `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}` : '';
};
export const toCompanyRegistrationPublicStatus = (application) => {
  const tenant = application.tenant;
  const status = application.review_status === 'rejected' ? 'rejected'
    : application.provisioning_status === 'succeeded' ? 'ready'
      : application.provisioning_status === 'failed' ? 'setup_delayed'
        : application.provisioning_status === 'in_progress' ? 'setting_up_company'
          : 'pending_review';
  const latestSubmission = application.attempts?.[0]?.submission_snapshot || {};
  return { application_id: application.id, ...(status === 'ready' ? { tenant_id: tenant.id } : {}), company_name: tenant.name, status, review_status: application.review_status, provisioning_status: application.provisioning_status, submitted_at: application.createdAt, registration_email_masked: maskEmail(application.registration_email_snapshot), rejection_reason: application.review_status === 'rejected' ? tenant.rejection_reason : null, editable_submission: { company_name: latestSubmission.company_name || tenant.name, workflow_mode: latestSubmission.workflow_mode || tenant.settings?.workflow_mode || '', industry_tag: latestSubmission.industry_tag || tenant.settings?.industry_tag || '' } };
};

export const buildGetCompanyRegistrationStatusUseCase = ({ repository }) => async ({ applicationId, dgfyAccountId }) => {
  const application = await repository.findOwned(applicationId, dgfyAccountId);
  if (!application) return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Company registration application not found.', { statusCode: 404 }));
  return ok({ statusCode: 200, payload: { success: true, data: toCompanyRegistrationPublicStatus(application) } });
};

export const buildResubmitCompanyRegistrationUseCase = ({ repository, transaction, emailService, logger }) => async ({ applicationId, dgfyAccountId, body = {} }) => {
  let notification = null;
  const result = await transaction(async (dbTransaction) => {
    const application = await repository.findOwnedForUpdate(applicationId, dgfyAccountId, dbTransaction);
    if (!application) return fail(new DomainError(DomainErrorCode.TENANT_NOT_FOUND, 'Company registration application not found.', { statusCode: 404 }));
    if (application.review_status !== 'rejected' || application.tenant?.status !== 'rejected') {
      return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Only a rejected registration can be resubmitted.', { statusCode: 422 }));
    }
    const companyName = String(body.name || body.company_name || '').trim().slice(0, 255);
    const workflowMode = String(body.workflowMode || body.workflow_mode || '').trim();
    const industryTag = String(body.industryTag || body.industry_tag || '').trim().slice(0, 120) || null;
    if (!companyName || !isWorkflowMode(workflowMode)) return fail(new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Provide a company name and valid Business Industry before resubmitting.', { statusCode: 422 }));
    let legalAcknowledgement;
    try { legalAcknowledgement = assertDgfyLegalAcknowledgement({ flow: DGFY_LEGAL_TERM_FLOWS.COMPANY_REGISTRATION, body }); }
    catch (error) { return fail(error); }
    await application.tenant.update({ status: 'pending', rejection_reason: null }, { transaction: dbTransaction });
    await application.tenant.update({ name: companyName, settings: { ...application.tenant.settings, workflow_mode: workflowMode, industry_tag: industryTag } }, { transaction: dbTransaction });
    const resubmitted = await repository.resubmit({
      application,
      tenant: application.tenant,
      legalAcknowledgement,
      workflowMode,
      industryTag,
      transaction: dbTransaction
    });
    notification = { email: application.registration_email_snapshot, companyName: application.tenant.name };
    return ok({ statusCode: 200, payload: { success: true, data: { application_id: resubmitted.id, status: 'pending_review' }, message: 'Your registration has been resubmitted for review.' } });
  });
  if (result?.success && notification && emailService?.isEmailConfigured?.()) {
    emailService.sendResubmissionConfirmationEmail(notification).catch((error) => logger?.warn?.('Registration resubmission email failed', { error: error.message, application_id: applicationId }));
  }
  return result;
};
