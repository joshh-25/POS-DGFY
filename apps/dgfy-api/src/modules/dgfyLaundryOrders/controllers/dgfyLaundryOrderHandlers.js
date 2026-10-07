import { dgfyLaundryOrderUseCases } from '../index.js';

const run = (useCase, input, res, next, statusCode = 200) => Promise.resolve(useCase(input))
  .then((data) => res.status(data?.statusCode || statusCode).json({ success: true, data }))
  .catch(next);

export const ingestDglaundryEvent = (req, res, next) => run(
  dgfyLaundryOrderUseCases.ingestProviderEvent,
  { event: req.body, keyId: req.dglaundrySignature?.keyId || null },
  res,
  next,
  202
);

export const getDglaundryCatalog = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getCatalog,
  { companyId: req.laundryCompany.company_id, locationId: req.query?.location_id || null },
  res,
  next
);
export const getDglaundryAvailability = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getAvailability,
  { companyId: req.laundryCompany.company_id, locationId: req.query?.location_id },
  res,
  next
);

export const getDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getOrder,
  { companyId: req.laundryCompany.company_id, locationId: req.query?.location_id, externalOrderReference: req.params.externalOrderReference, accountId: req.dgfyAccount?.id },
  res,
  next
);

export const getDglaundryOrderForPartner = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getOrderForProvider,
  {
    companyId: req.query?.company_id || req.query?.companyId || req.headers['x-dgfy-company-id'],
    locationId: req.query?.location_id || req.query?.locationId || req.headers['x-dgfy-location-id'],
    externalOrderReference: req.params.externalOrderReference
  },
  res,
  next
);

export const registerDglaundryCustomerActivity = (req, res, next) => run(
  dgfyLaundryOrderUseCases.registerCustomerActivity,
  { payload: req.body },
  res,
  next,
  201
);

export const createDglaundryQuote = (req, res, next) => run(
  dgfyLaundryOrderUseCases.quote,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id }, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  201
);

export const submitDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.submitOrder,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id }, accountId: req.dgfyAccount?.id, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const updateDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.updateOrder,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id, externalOrderReference: req.params.externalOrderReference }, accountId: req.dgfyAccount?.id, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const cancelDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.cancelOrder,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id, externalOrderReference: req.params.externalOrderReference }, accountId: req.dgfyAccount?.id, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const listDglaundryDeadLetters = (req, res, next) => run(
  dgfyLaundryOrderUseCases.listOperatorDeadLetters,
  {
    dgfyAccountId: req.dgfyAccount?.id,
    companyId: req.query?.company_id,
    locationId: req.query?.location_id,
    direction: req.query?.direction || null,
    limit: req.query?.limit === undefined ? 100 : req.query.limit
  },
  res,
  next
);

export const redriveDglaundryDeadLetter = (req, res, next) => run(
  dgfyLaundryOrderUseCases.redriveOperatorDeadLetter,
  {
    dgfyAccountId: req.dgfyAccount?.id,
    companyId: req.body?.company_id,
    locationId: req.body?.location_id,
    id: req.params.id,
    direction: req.body?.direction,
    reason: req.body?.reason
  },
  res,
  next,
  202
);
