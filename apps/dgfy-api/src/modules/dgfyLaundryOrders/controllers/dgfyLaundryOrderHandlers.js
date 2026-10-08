import { dgfyLaundryOrderUseCases } from '../index.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';

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

export const getDglaundryOrderForPartner = (req, res, next) => {
  let scope;
  try {
    scope = resolvePartnerOrderScope(req);
  } catch (error) {
    return next(error);
  }
  return run(
    dgfyLaundryOrderUseCases.getOrderForProvider,
    scope,
    res,
    next
  );
};

function resolvePartnerOrderScope(req) {
  const companyId = resolveScopedQuery(req, 'company_id', 'companyId', 'x-dgfy-company-id');
  const locationId = resolveScopedQuery(req, 'location_id', 'locationId', 'x-dgfy-location-id');
  return { companyId, locationId, externalOrderReference: req.params.externalOrderReference };
}

function resolveScopedQuery(req, canonicalName, compatibilityName, unsignedHeaderName) {
  const canonicalValue = normalizedQueryValue(req.query?.[canonicalName], canonicalName);
  const compatibilityValue = normalizedQueryValue(req.query?.[compatibilityName], compatibilityName);
  const unsignedHeaderValue = String(req.headers?.[unsignedHeaderName] || '').trim();
  if (canonicalValue && compatibilityValue && canonicalValue !== compatibilityValue) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Conflicting ${canonicalName} and ${compatibilityName} values are not allowed.`);
  }
  if (unsignedHeaderValue) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `Use the signed ${canonicalName} query parameter instead of ${unsignedHeaderName}.`);
  }
  return canonicalValue || compatibilityValue;
}

function normalizedQueryValue(value, name) {
  if (value === undefined) return '';
  if (typeof value !== 'string') {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, `${name} must be supplied once as a string query value.`);
  }
  return value.trim();
}

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
