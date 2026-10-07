import { dgfyLaundryOrderUseCases } from '../index.js';

const run = (useCase, input, res, next, statusCode = 200) => Promise.resolve(useCase(input))
  .then((data) => res.status(data?.statusCode || statusCode).json({ success: true, data, timestamp: new Date().toISOString() }))
  .catch(next);

const scopeFor = (req, locationId) => ({
  // Tenant context is resolved by requireTenantContext. Never accept companyId
  // from the browser for this storefront surface.
  companyId: req.tenant?.id,
  locationId
});

const accountIdFor = (req) => String(req.storeCustomer?.dgfy_account_id || '').trim() || null;

export const getPublicLaundryCatalog = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getStoreCatalog,
  scopeFor(req, req.validatedLaundryQuery.location_id),
  res,
  next
);

export const getPublicLaundryAvailability = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getStoreAvailability,
  scopeFor(req, req.validatedLaundryQuery.location_id),
  res,
  next
);

export const createPublicLaundryQuote = (req, res, next) => run(
  dgfyLaundryOrderUseCases.quote,
  {
    payload: { ...req.validatedLaundryBody, ...scopeFor(req, req.validatedLaundryBody.location_id) },
    idempotencyKey: req.headers['idempotency-key']
  },
  res,
  next,
  201
);

export const submitPublicLaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.submitOrder,
  {
    payload: { ...req.validatedLaundryBody, ...scopeFor(req, req.validatedLaundryBody.location_id) },
    accountId: accountIdFor(req),
    idempotencyKey: req.headers['idempotency-key']
  },
  res,
  next,
  202
);

export const getPublicLaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.getOrder,
  {
    ...scopeFor(req, req.validatedLaundryQuery.location_id),
    externalOrderReference: req.validatedLaundryParams.externalOrderReference,
    externalTrackingReference: req.validatedLaundryQuery.external_tracking_reference,
    accountId: accountIdFor(req)
  },
  res,
  next
);

export const updatePublicLaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.updateOrder,
  {
    payload: {
      ...req.validatedLaundryBody,
      ...scopeFor(req, req.validatedLaundryBody.location_id),
      externalOrderReference: req.validatedLaundryParams.externalOrderReference
    },
    accountId: accountIdFor(req),
    idempotencyKey: req.headers['idempotency-key']
  },
  res,
  next,
  202
);

export const cancelPublicLaundryOrder = (req, res, next) => run(
  dgfyLaundryOrderUseCases.cancelOrder,
  {
    payload: {
      ...req.validatedLaundryBody,
      ...scopeFor(req, req.validatedLaundryBody.location_id),
      externalOrderReference: req.validatedLaundryParams.externalOrderReference
    },
    accountId: accountIdFor(req),
    idempotencyKey: req.headers['idempotency-key']
  },
  res,
  next,
  202
);
