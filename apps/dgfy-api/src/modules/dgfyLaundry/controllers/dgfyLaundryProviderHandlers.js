import { dgfyLaundryProviderUseCases } from '../index.js';
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

export const getLaundryIntent = (req, res, next) => run(
    dgfyLaundryProviderUseCases.getIntent,
    { id: req.params.intentId },
    res,
    next
);

export const createLaundryMapping = (req, res, next) => run(
    dgfyLaundryProviderUseCases.createMapping,
    { body: req.body, partner: req.partnerIdentity },
    res,
    next
);
