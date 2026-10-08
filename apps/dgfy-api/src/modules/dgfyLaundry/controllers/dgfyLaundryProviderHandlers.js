import { dgfyLaundryProviderUseCases } from '../index.js';
import { dglaundryQualificationProbeUseCase } from '../../dgfyLaundryOrders/qualificationProbe.js';
const run = (useCase, input, res, next) => Promise.resolve(useCase(input))
    .then((data) => res.status(data?.statusCode || 200).json({ success: true, data }))
    .catch(next);

export const listLaundryCompanies = (req, res, next) => run(
    dgfyLaundryProviderUseCases.listCompanies,
    { dgfyAccount: req.dgfyAccount },
    res,
    next
);

export const launchLaundryOperations = (req, res, next) => run(
    dgfyLaundryProviderUseCases.launch,
    { dgfyAccount: req.dgfyAccount, companyId: req.body?.company_id || req.body?.tenant_id, branchId: req.body?.branch_id },
    res,
    next
);

export const getLaundrySessionContext = (req, res, next) => run(
    dgfyLaundryProviderUseCases.sessionContext,
    { dgfyAccount: req.dgfyAccount, companyId: req.query?.company_id || req.headers['x-dglaundry-company-id'] },
    res,
    next
);

export const getLaundryHealth = (req, res, next) => run(
    dgfyLaundryProviderUseCases.health,
    {},
    res,
    next
);

export const getLaundryCapabilities = (req, res, next) => run(
    dgfyLaundryProviderUseCases.capabilities,
    {},
    res,
    next
);

export const getLaundryRuntimeAttestation = (req, res, next) => run(
    dgfyLaundryProviderUseCases.runtimeAttestation,
    {},
    res,
    next
);

const runQualificationProbe = (kind) => (req, res, next) => Promise.resolve(dglaundryQualificationProbeUseCase({
    kind,
    externalOrderReference: req.params.externalOrderReference,
    idempotencyKey: req.headers['idempotency-key']
})).then((data) => res.status(200).json(data)).catch(next);

export const cancelLaundryQualificationOrder = runQualificationProbe('cancel');
export const expireLaundryQualificationOrder = runQualificationProbe('expire');
export const refundLaundryQualificationOrder = runQualificationProbe('refund');
export const confirmLaundryQualificationReceipt = runQualificationProbe('receipt');

export const getLaundryCompanyById = (req, res, next) => run(
    dgfyLaundryProviderUseCases.getCompanyById,
    { companyId: req.params.companyId },
    res,
    next
);

export const createLaundryRegistrationIntent = (req, res, next) => run(
    dgfyLaundryProviderUseCases.createIntent,
    { intentType: 'registration', body: req.body, idempotencyKey: req.headers['idempotency-key'], dgfyAccount: req.dgfyAccount || null },
    res,
    next
);

export const createLaundryLocationIntent = (req, res, next) => run(
    dgfyLaundryProviderUseCases.createIntent,
    { intentType: 'location', body: req.body, idempotencyKey: req.headers['idempotency-key'], dgfyAccount: req.dgfyAccount || null },
    res,
    next
);

export const createLaundryStaffInvitationIntent = (req, res, next) => run(
    dgfyLaundryProviderUseCases.createIntent,
    { intentType: 'staff_invitation', body: req.body, idempotencyKey: req.headers['idempotency-key'], dgfyAccount: req.dgfyAccount || null },
    res,
    next
);

const getLaundryIntentByType = (expectedIntentType) => (req, res, next) => run(
    dgfyLaundryProviderUseCases.getIntent,
    { id: req.params.intentId, expectedIntentType },
    res,
    next
);

export const getLaundryRegistrationIntent = getLaundryIntentByType('registration');
export const getLaundryLocationIntent = getLaundryIntentByType('location');
export const getLaundryStaffInvitationIntent = getLaundryIntentByType('staff_invitation');

export const createLaundryMapping = (req, res, next) => run(
    dgfyLaundryProviderUseCases.createMapping,
    { body: req.body, partner: req.partnerIdentity },
    res,
    next
);
