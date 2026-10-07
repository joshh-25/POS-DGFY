import crypto from 'node:crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  DGLAUNDRY_EVENT_TYPES,
  ORDER_EVENT_TYPES,
  createDgfyOrderEvent,
  requestHash,
  sanitizeAvailability,
  sanitizeCatalog,
  sanitizeCustomerActivity,
  sanitizeOrderProjection,
  toTrimmed,
  validateEventEnvelope
} from '../contracts.js';

const fail = (message, statusCode = 422, code = DomainErrorCode.VALIDATION_FAILED) => {
  throw new DomainError(code, message, { statusCode });
};

const requireScope = (payload) => {
  const companyId = toTrimmed(payload?.companyId || payload?.company_id, 160);
  const locationId = toTrimmed(payload?.locationId || payload?.location_id, 160);
  if (!companyId || !locationId) fail('companyId and locationId are required.');
  return { companyId, locationId };
};

const requireActiveMapping = async (repository, scope) => {
  if (typeof repository.findActiveMapping !== 'function') {
    throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Laundry company/location mapping lookup is unavailable.', { statusCode: 503 });
  }
  const mapping = await repository.findActiveMapping(scope);
  if (!mapping) {
    throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The DGFY company/location is not actively mapped to DGLaundry.', { statusCode: 403 });
  }
  return mapping;
};

const orderNotFound = () => fail('The requested laundry order was not found.', 404, DomainErrorCode.RESOURCE_NOT_FOUND);

const withoutClientIdentity = (payload = {}) => {
  const safePayload = { ...payload };
  for (const key of ['customerReference', 'customerReferenceKind', 'customer_reference', 'customer_reference_kind', 'dgfyAccountId', 'dgfy_account_id']) {
    delete safePayload[key];
  }
  return safePayload;
};

const requireOwnedOrder = async ({ repository, companyId, locationId, externalOrderReference, accountId }) => {
  const row = await repository.getOrderForAccount({
    companyId,
    locationId,
    externalOrderReference,
    dgfyAccountId: accountId
  });
  // Deliberately use the same non-enumerating 404 for a missing order and an
  // order owned by another account (including another member of this company).
  if (!row) orderNotFound();
  return row;
};

const requireGuestOrder = async ({ repository, companyId, locationId, externalOrderReference, externalTrackingReference }) => {
  const trackingReference = toTrimmed(externalTrackingReference, 200);
  if (!trackingReference) orderNotFound();
  const row = await repository.getOrderByTrackingReference({
    companyId,
    locationId,
    externalOrderReference,
    externalTrackingReference: trackingReference
  });
  if (!row || row.dgfy_account_id) orderNotFound();
  return row;
};

const requireCustomerOwnedOrder = async ({ repository, scope, externalOrderReference, externalTrackingReference, accountId }) => {
  const dgfyAccountId = toTrimmed(accountId, 160);
  return dgfyAccountId
    ? requireOwnedOrder({ repository, ...scope, externalOrderReference, accountId: dgfyAccountId })
    : requireGuestOrder({ repository, ...scope, externalOrderReference, externalTrackingReference });
};

const requireOrderReferences = (payload, { requireLines = false, requireTrackingReference = true } = {}) => {
  const scope = requireScope(payload);
  const externalOrderReference = toTrimmed(payload?.externalOrderReference || payload?.external_order_reference, 200);
  const externalTrackingReference = toTrimmed(payload?.externalTrackingReference || payload?.external_tracking_reference, 200);
  if (!externalOrderReference || (requireTrackingReference && !externalTrackingReference)) fail('externalOrderReference and externalTrackingReference are required.');
  if (requireLines && (!Array.isArray(payload?.lines) || payload.lines.length < 1)) fail('At least one order line is required.');
  return { ...scope, externalOrderReference, externalTrackingReference };
};

const orderVersion = (event) => Number(event.aggregateVersion || event.data?.aggregateVersion || 0);
const catalogVersion = (event) => toTrimmed(event.data?.catalogVersion || event.data?.version || event.aggregateVersion, 120);
const availabilityVersion = (event) => toTrimmed(event.data?.availabilityVersion || event.data?.version || event.aggregateVersion, 120);
const numericVersion = (value) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : 0;
};

const operation = async ({ repository, partnerClient, operationName, idempotencyKey, payload, buildEnvelope }) => {
  const key = toTrimmed(idempotencyKey || payload?.idempotencyKey || payload?.idempotency_key, 160);
  if (!key) fail('A bounded idempotency key is required.', 400);
  const hash = requestHash(payload);
  const existing = await repository.findIdempotency(key);
  if (existing) {
    if (existing.request_hash !== hash) fail('The idempotency key was already used for a different request.', 409, DomainErrorCode.CONFLICT);
    return { idempotent_replay: true, response: existing.payload || existing.response || null };
  }
  const eventId = `dgfy-laundry-${operationName}-${crypto.createHash('sha256').update(key).digest('hex').slice(0, 48)}`;
  const envelope = buildEnvelope(eventId);
  const response = await partnerClient[operationName](envelope);
  await repository.saveIdempotency({ key, requestHash: hash, operation: operationName, response });
  return { idempotent_replay: false, response, event: envelope };
};

const deliverSubmissionIntent = async ({ repository, partnerClient, scope, dgfyAccountId, key, intent }) => {
  const envelope = intent?.envelope;
  const externalOrderReference = toTrimmed(intent?.externalOrderReference, 200);
  const externalTrackingReference = toTrimmed(intent?.externalTrackingReference, 200);
  if (!envelope?.id || !externalOrderReference || !externalTrackingReference) {
    fail('The persisted DGLaundry submission intent is invalid and requires recovery.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
  }
  const ownership = await repository.bindOrderOwnership({
    ...scope,
    externalOrderReference,
    externalTrackingReference,
    dgfyAccountId
  });
  if (!ownership) orderNotFound();
  const response = await partnerClient.submitOrder(envelope, { callerIdempotencyKey: key });
  const result = { response, externalOrderReference, externalTrackingReference };
  await repository.updateIdempotencyResponse(key, result);
  await partnerClient.completeCallerReconciliation?.(envelope.id);
  return { idempotent_replay: false, ...result, event: envelope };
};

export const buildDgfyLaundryOrderUseCases = ({ repository, partnerClient, operatorRepository = null }) => ({
  async ingestProviderEvent({ event, keyId = null, redrive = false }) {
    let normalized;
    try {
      normalized = validateEventEnvelope(event);
    } catch (error) {
      if (event?.id) {
        await repository.recordEvent({ eventId: toTrimmed(event.id, 200), eventType: toTrimmed(event.type, 200) || 'unknown', payload: event, keyId });
        await repository.updateEvent(event.id, { status: 'quarantined', failureCode: error.message, failureReason: 'Provider event failed envelope validation.' });
      }
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, error.message, { statusCode: 422 });
    }

    const data = normalized.data;
    const companyId = toTrimmed(data.companyId, 160) || null;
    const locationId = toTrimmed(data.locationId, 160) || null;
    if (companyId && typeof repository.findActiveMapping === 'function') {
      const mapping = await repository.findActiveMapping({ companyId, locationId });
      if (!mapping) {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The provider event does not match an active company/location mapping.', { statusCode: 409 });
      }
    }
    if (redrive) {
      const prior = await repository.findEvent(normalized.id);
      if (!prior || prior.status !== 'redriving' || !prior.key_id
        || prior.company_id !== normalized.data.companyId || prior.location_id !== normalized.data.locationId) {
        throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The stored event is not eligible for operator recovery.', { statusCode: 409 });
      }
      await requireActiveMapping(repository, { companyId: prior.company_id, locationId: prior.location_id });
    }
    const recorded = redrive ? { row: await repository.findEvent(normalized.id), duplicate: false } : await repository.recordEvent({
      eventId: normalized.id,
      eventType: normalized.type,
      companyId,
      locationId,
      aggregateVersion: normalized.aggregateVersion,
      payload: normalized,
      keyId
    });
    if (recorded.duplicate) return { eventId: normalized.id, status: recorded.row.status, duplicate: true };

    try {
      if (normalized.type === DGLAUNDRY_EVENT_TYPES.CATALOG) {
        const payload = sanitizeCatalog(data);
        if (!payload.companyId || !payload.catalogVersion) fail('A catalog publication requires companyId and catalogVersion.');
        const result = await repository.upsertCatalog({ companyId: payload.companyId, locationId: locationId || '', version: catalogVersion(normalized), payload });
        await repository.updateEvent(normalized.id, { status: result.stale ? 'ignored' : 'applied' });
        return { eventId: normalized.id, status: result.stale ? 'ignored' : 'applied', duplicate: false, stale: result.stale, projection: result.row };
      }
      if (normalized.type === DGLAUNDRY_EVENT_TYPES.AVAILABILITY) {
        const payload = sanitizeAvailability(data);
        if (!payload.companyId || !payload.locationId || !payload.availabilityVersion) fail('An availability publication requires companyId, locationId, and availabilityVersion.');
        const result = await repository.upsertAvailability({ companyId: payload.companyId, locationId: payload.locationId, version: availabilityVersion(normalized), payload });
        await repository.updateEvent(normalized.id, { status: result.stale ? 'ignored' : 'applied' });
        return { eventId: normalized.id, status: result.stale ? 'ignored' : 'applied', duplicate: false, stale: result.stale, projection: result.row };
      }

      if (normalized.type === DGLAUNDRY_EVENT_TYPES.COUNTER_ACTIVITY) {
        const payload = sanitizeCustomerActivity(data);
        if (!payload.companyId || !payload.locationId || !payload.activityReference) fail('A counter activity requires explicit companyId, locationId, and activityReference.');
        const version = orderVersion(normalized) || 1;
        if (typeof repository.upsertCustomerActivity !== 'function') fail('Customer activity projection persistence is unavailable.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
        const result = await repository.upsertCustomerActivity({ companyId: payload.companyId, locationId: payload.locationId, activityReference: payload.activityReference, version, payload });
        await repository.updateEvent(normalized.id, { status: result.stale ? 'ignored' : 'applied' });
        return { eventId: normalized.id, status: result.stale ? 'ignored' : 'applied', duplicate: false, stale: result.stale, projection: result.row };
      }

      if (!ORDER_EVENT_TYPES.has(normalized.type)) fail('The provider event type is not supported.', 422, DomainErrorCode.VALIDATION_FAILED);
      const payload = sanitizeOrderProjection(data);
      if (!payload.companyId || !payload.locationId || !payload.externalOrderReference) fail('An order projection requires explicit companyId, locationId, and externalOrderReference.');
      const version = orderVersion(normalized);
      const current = await repository.getOrder({ companyId: payload.companyId, locationId: payload.locationId, externalOrderReference: payload.externalOrderReference });
      const currentVersion = Number(current?.aggregate_version || 0);
      if (version > currentVersion + 1) {
        await repository.updateEvent(normalized.id, { status: 'quarantined', failureCode: 'DGLAUNDRY_EVENT_VERSION_GAP', failureReason: `Expected ${currentVersion + 1}, received ${version}.` });
        return { eventId: normalized.id, status: 'quarantined', duplicate: false, retryable: true, currentVersion };
      }
      const status = normalized.type === DGLAUNDRY_EVENT_TYPES.REJECTED ? 'cancelled' : payload.status || (normalized.type === DGLAUNDRY_EVENT_TYPES.ACCEPTED ? 'received' : null);
      const result = await repository.upsertOrder({ companyId: payload.companyId, locationId: payload.locationId, externalOrderReference: payload.externalOrderReference, trackingReference: payload.externalTrackingReference, version, status, payload });
      await repository.updateEvent(normalized.id, { status: result.stale ? 'ignored' : 'applied' });
      return { eventId: normalized.id, status: result.stale ? 'ignored' : 'applied', duplicate: false, stale: result.stale, projection: result.row };
    } catch (error) {
      await repository.updateEvent(normalized.id, { status: 'dead_letter', failureCode: error.code || error.message, failureReason: error.message, attempts: 1 });
      throw error;
    }
  },

  async getCatalog({ companyId, locationId = null }) {
    return repository.getCatalog({ companyId: toTrimmed(companyId, 160), locationId: toTrimmed(locationId, 160) || null });
  },

  async getStoreCatalog({ companyId, locationId }) {
    const scope = requireScope({ companyId, locationId });
    await requireActiveMapping(repository, scope);
    return repository.getCatalog(scope);
  },

  async getAvailability({ companyId, locationId }) {
    const scope = requireScope({ companyId, locationId });
    return repository.getAvailability(scope);
  },

  async getStoreAvailability({ companyId, locationId }) {
    const scope = requireScope({ companyId, locationId });
    await requireActiveMapping(repository, scope);
    return repository.getAvailability(scope);
  },

  async getOrder({ companyId, locationId, externalOrderReference, externalTrackingReference, accountId }) {
    const scope = requireScope({ companyId, locationId });
    const reference = toTrimmed(externalOrderReference, 200);
    if (!reference) fail('externalOrderReference is required.');
    return requireCustomerOwnedOrder({ repository, scope, externalOrderReference: reference, externalTrackingReference, accountId });
  },

  async getOrderForProvider({ companyId, locationId, externalOrderReference }) {
    const scope = requireScope({ companyId, locationId });
    await requireActiveMapping(repository, scope);
    const reference = toTrimmed(externalOrderReference, 200);
    if (!reference) fail('externalOrderReference is required.');
    const row = await repository.getOrder({ ...scope, externalOrderReference: reference });
    if (!row) orderNotFound();
    return row;
  },

  async registerCustomerActivity({ payload }) {
    const sanitized = sanitizeCustomerActivity(payload);
    const scope = requireScope(sanitized);
    if (!sanitized.activityReference) fail('A counter activity requires an activityReference.');
    await requireActiveMapping(repository, scope);
    if (typeof repository.upsertCustomerActivity !== 'function') {
      fail('Customer activity projection persistence is unavailable.', 503, DomainErrorCode.SERVICE_UNAVAILABLE);
    }
    const version = numericVersion(payload?.activityVersion || payload?.version || 1) || 1;
    const result = await repository.upsertCustomerActivity({
      ...scope,
      activityReference: sanitized.activityReference,
      version,
      payload: sanitized
    });
    return { activityReference: sanitized.activityReference, stale: result.stale, projection: result.row };
  },

  async quote({ payload, idempotencyKey }) {
    const scope = requireScope(payload);
    await requireActiveMapping(repository, scope);
    if (!Array.isArray(payload?.lines) || payload.lines.length < 1) fail('At least one quote line is required.');
    const key = toTrimmed(idempotencyKey || payload.idempotencyKey || payload.idempotency_key, 160);
    if (!key) fail('A bounded idempotency key is required.', 400);
    const hash = requestHash(payload);
    const existing = await repository.findIdempotency(key);
    if (existing) {
      if (existing.request_hash !== hash) fail('The idempotency key was already used for a different request.', 409, DomainErrorCode.CONFLICT);
      return { idempotent_replay: true, quote: existing.response };
    }
    const quote = await partnerClient.prepareQuote({ ...payload, ...scope, idempotencyKey: key });
    await repository.saveIdempotency({ key, requestHash: hash, operation: 'prepareQuote', response: quote });
    return { idempotent_replay: false, quote };
  },

  async submitOrder({ payload, idempotencyKey, accountId }) {
    const scope = requireScope(payload);
    if (!Array.isArray(payload?.lines) || payload.lines.length < 1) fail('At least one order line is required.');
    const hasNonPerKiloLine = payload.lines.some((line) => (
      toTrimmed(line?.mode || line?.pricingMode || line?.pricing_mode, 40).toLowerCase() !== 'per_kilo'
    ));
    if (hasNonPerKiloLine || toTrimmed(payload?.mode, 40).toLowerCase() && toTrimmed(payload?.mode, 40).toLowerCase() !== 'per_kilo') {
      fail('Fixed-price and mixed laundry orders must use the booking payment-session flow.', 422);
    }
    await requireActiveMapping(repository, scope);
    const key = toTrimmed(idempotencyKey || payload?.idempotencyKey || payload?.idempotency_key, 160);
    if (key.length < 16) fail('A high-entropy idempotency key is required.', 400);

    const dgfyAccountId = toTrimmed(accountId, 160) || null;
    const customerPayload = withoutClientIdentity(payload);
    delete customerPayload.externalOrderReference;
    delete customerPayload.external_order_reference;
    delete customerPayload.externalTrackingReference;
    delete customerPayload.external_tracking_reference;
    const submissionHash = requestHash({ ...scope, payload: customerPayload, dgfyAccountId });
    const existing = await repository.findIdempotency(key);
    if (existing) {
      if (existing.request_hash !== submissionHash) fail('The idempotency key was already used for a different request.', 409, DomainErrorCode.CONFLICT);
      if (!existing.response?.delivery_intent) return { idempotent_replay: true, ...(existing.response || {}) };
      return deliverSubmissionIntent({
        repository, partnerClient, scope, dgfyAccountId, key,
        intent: existing.response.delivery_intent
      });
    }

    const eventId = `dgfy-laundry-submit-${crypto.createHash('sha256').update(`${scope.companyId}\0${scope.locationId}\0${key}`).digest('hex').slice(0, 48)}`;
    const externalOrderReference = `DGL-${crypto.randomBytes(24).toString('hex').toUpperCase()}`;
    const externalTrackingReference = crypto.randomBytes(32).toString('base64url');
    const ownedPayload = {
      ...customerPayload,
      ...scope,
      externalOrderReference,
      externalTrackingReference,
      customerReference: dgfyAccountId || externalTrackingReference,
      customerReferenceKind: dgfyAccountId ? 'dgfy_account' : 'dgfy_guest'
    };
    const envelope = createDgfyOrderEvent({
      id: eventId,
      type: 'dgfy.laundry_order.submitted.v1',
      data: ownedPayload
    });
    const reservation = await repository.saveIdempotency({
      key,
      requestHash: submissionHash,
      operation: 'submitOrder',
      response: { delivery_intent: { envelope, externalOrderReference, externalTrackingReference } }
    });
    if (reservation.request_hash !== submissionHash) fail('The idempotency key was already used for a different request.', 409, DomainErrorCode.CONFLICT);
    if (!reservation.response?.delivery_intent) return { idempotent_replay: true, ...(reservation.response || {}) };
    return deliverSubmissionIntent({
      repository, partnerClient, scope, dgfyAccountId, key,
      intent: reservation.response.delivery_intent
    });
  },

  async updateOrder({ payload, idempotencyKey, accountId }) {
    const scope = requireOrderReferences(payload, { requireTrackingReference: false });
    const row = await requireCustomerOwnedOrder({ repository, scope, externalOrderReference: scope.externalOrderReference, externalTrackingReference: scope.externalTrackingReference, accountId });
    const ownedPayload = { ...payload, ...scope, externalTrackingReference: row.external_tracking_reference };
    return operation({ repository, partnerClient, operationName: 'updateOrder', idempotencyKey, payload: ownedPayload, buildEnvelope: (id) => createDgfyOrderEvent({ id, type: 'dgfy.laundry_order.updated.v1', data: ownedPayload }) });
  },

  async cancelOrder({ payload, idempotencyKey, accountId }) {
    const scope = requireOrderReferences(payload, { requireTrackingReference: false });
    const row = await requireCustomerOwnedOrder({ repository, scope, externalOrderReference: scope.externalOrderReference, externalTrackingReference: scope.externalTrackingReference, accountId });
    const ownedPayload = { ...payload, ...scope, externalTrackingReference: row.external_tracking_reference };
    return operation({ repository, partnerClient, operationName: 'cancelOrder', idempotencyKey, payload: ownedPayload, buildEnvelope: (id) => createDgfyOrderEvent({ id, type: 'dgfy.laundry_order.cancelled.v1', data: ownedPayload }) });
  },

  async listDeadLetters({ limit }) {
    return repository.listDeadLetters({ limit });
  },

  async listOperatorDeadLetters({ dgfyAccountId, companyId, locationId, direction = null, limit = 100 }) {
    const scope = await authorizeOperator({ operatorRepository, repository, dgfyAccountId, companyId, locationId });
    if (direction && !['inbound', 'outbound'].includes(direction)) fail('direction must be inbound or outbound.', 400);
    const parsedLimit = Number(limit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) fail('limit must be an integer from 1 to 500.', 400);
    return repository.listDeadLetters({ ...scope, direction, limit: parsedLimit });
  },

  async redriveOperatorDeadLetter({ dgfyAccountId, companyId, locationId, id, direction, reason }) {
    const scope = await authorizeOperator({ operatorRepository, repository, dgfyAccountId, companyId, locationId });
    const normalizedId = toTrimmed(id, 200);
    const normalizedReason = toTrimmed(reason, 500);
    if (!normalizedId || !normalizedReason) fail('id and a recovery reason are required.', 400);
    if (!['inbound', 'outbound'].includes(direction)) fail('direction must be inbound or outbound.', 400);
    const row = await repository.findDeadLetter({ id: normalizedId, ...scope, direction });
    if (!row) fail('The dead letter was not found or is not recoverable.', 404, DomainErrorCode.RESOURCE_NOT_FOUND);
    await operatorRepository.audit({
      action: 'dglaundry_dead_letter_redrive', dgfyAccountId, companyId: scope.companyId,
      metadata: { id: normalizedId, direction, old_status: row.status, prior_attempts: Number(row.attempts || 0), reason: normalizedReason, requested_at: new Date().toISOString() }
    });
    let requeued;
    let disposition;
    if (direction === 'outbound') {
      if (row.completion_status === 'failed') {
        requeued = await repository.redriveOutboundCompletion({ id: normalizedId, ...scope });
        disposition = 'completion_requeued';
      } else {
        requeued = await repository.redriveOutbound({ id: normalizedId, ...scope, maxAttempts: partnerClient.limits?.maxAttempts || 8 });
        disposition = 'requeued';
      }
    } else {
      if (!row.key_id || !row.payload || typeof row.payload !== 'object') fail('The stored inbound event is not eligible for recovery.', 409);
      requeued = await repository.claimInboundRedrive({ eventId: row.event_id, ...scope });
    }
    if (!requeued) fail('This dead letter is already being recovered or is no longer eligible.', 409, DomainErrorCode.CONFLICT);
    if (direction === 'inbound') await this.ingestProviderEvent({ event: row.payload, keyId: row.key_id, redrive: true });
    return { id: normalizedId, direction, disposition: direction === 'outbound' ? disposition : 'reprocessed' };
  },

  async reconcileOutboxCallerResult({ callerIdempotencyKey, response, externalOrderReference, externalTrackingReference }) {
    if (!callerIdempotencyKey || !externalOrderReference || !externalTrackingReference) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The durable DGLaundry caller linkage is incomplete.', { statusCode: 409 });
    }
    return repository.updateIdempotencyResponse(callerIdempotencyKey, { response, externalOrderReference, externalTrackingReference });
  },

  constants: { DGLAUNDRY_EVENT_TYPES, numericVersion }
});

const authorizeOperator = async ({ operatorRepository, repository, dgfyAccountId, companyId, locationId }) => {
  const accountId = toTrimmed(dgfyAccountId, 160);
  const scope = requireScope({ companyId, locationId });
  if (!accountId || typeof operatorRepository?.findLaundryCompany !== 'function') {
    fail('An authenticated laundry company administrator is required.', 403, DomainErrorCode.AUTHORIZATION_FAILED);
  }
  const company = await operatorRepository.findLaundryCompany({ dgfyAccountId: accountId, companyId: scope.companyId });
  if (!company || !['owner', 'admin'].includes(String(company.role || '').toLowerCase())) {
    fail('An accepted owner or admin membership is required for this laundry company.', 403, DomainErrorCode.AUTHORIZATION_FAILED);
  }
  await requireActiveMapping(repository, scope);
  return scope;
};
