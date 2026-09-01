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
  { companyId: req.laundryCompany.company_id, locationId: req.query?.location_id, externalOrderReference: req.params.externalOrderReference },
  res,
  next
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
  { payload: { ...req.body, companyId: req.laundryCompany.company_id }, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const updateDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.updateOrder,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id, externalOrderReference: req.params.externalOrderReference }, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const cancelDglaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.cancelOrder,
  { payload: { ...req.body, companyId: req.laundryCompany.company_id, externalOrderReference: req.params.externalOrderReference }, idempotencyKey: req.headers['idempotency-key'] },
  res,
  next,
  202
);

export const listDglaundryDeadLetters = (req, res, next) => run(
  dgfyLaundryOrderUseCases.listDeadLetters,
  { limit: req.query?.limit },
  res,
  next
);

