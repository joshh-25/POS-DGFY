import crypto from 'node:crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { requestHash } from '../contracts.js';

const MAX_ATTEMPTS = Math.max(1, Math.min(20, Number(process.env.DGLAUNDRY_OUTBOX_MAX_ATTEMPTS) || 8));
const TIMEOUT_MS = Math.max(1000, Math.min(30000, Number(process.env.DGLAUNDRY_OUTBOX_TIMEOUT_MS) || 10000));
const RETRY_BASE_MS = 1000;
const RETRY_MAX_MS = 5 * 60 * 1000;
const retryable = (error) => !error?.statusCode || error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
const identityPayload = (payload) => {
  if (!payload || payload.specversion !== '1.0' || !payload.data) return payload;
  const stableEnvelope = { ...payload };
  delete stableEnvelope.time;
  return stableEnvelope;
};
const retryAfter = (error) => {
  const seconds = Number(error?.retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(5 * 60_000, seconds * 1000);
  const date = Date.parse(error?.retryAfter || '');
  return Number.isFinite(date) ? Math.max(0, Math.min(5 * 60_000, date - Date.now())) : null;
};
const nextDelay = (attempt, error, random = Math.random) => {
  const instructed = retryAfter(error);
  if (instructed !== null) return instructed;
  const ceiling = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * (2 ** Math.max(0, attempt - 1)));
  return Math.floor(ceiling * (0.5 + random() * 0.5));
};
const pendingError = (row) => new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE,
  'DGLaundry delivery is durably queued and will be retried.', {
    statusCode: 503,
    details: { delivery_status: row.status, operation_id: row.id, retry_after: row.next_attempt_at }
  });

const bookingEnabled = (locationId) => {
  if (String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED || '').toLowerCase() !== 'true'
      || String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH || '').toLowerCase() === 'true') return false;
  const disabled = String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES || '').split(',').map((value) => value.trim()).filter(Boolean);
  return !disabled.includes(String(locationId));
};

export const buildDglaundryDurableDelivery = ({ repository, transportClient, mappingRepository = null, random = Math.random }) => {
  const deliverClaim = async ({ row, token }) => {
    try {
      if (row.operation === 'prepareBookingGroup' && await repository.hasCancellationIntent?.(row.order_reference, row.company_id, row.location_id)) {
        await repository.acknowledge({ id: row.id, token, status: 'cancelled', failureCode: 'DGLAUNDRY_BOOKING_ABANDONED', failureReason: 'A durable cancellation intent superseded this pending booking preparation.' });
        throw new DomainError(DomainErrorCode.CONFLICT, 'This booking preparation was abandoned and cannot be resumed.', { statusCode: 409, details: { operation_id: row.id, delivery_status: 'cancelled' } });
      }
      if (row.operation === 'prepareBookingGroup' && !bookingEnabled(row.location_id)) {
        await repository.acknowledge({ id: row.id, token, status: 'blocked', failureCode: 'DGLAUNDRY_BOOKING_DISABLED', failureReason: 'Booking delivery is disabled by the feature flag, kill switch, or branch configuration.' });
        throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'DGLaundry booking delivery is disabled.', { statusCode: 503, details: { operation_id: row.id, delivery_status: 'blocked' } });
      }
      if (mappingRepository?.findActiveMapping) {
        const mapping = await mappingRepository.findActiveMapping({ companyId: row.company_id, locationId: row.location_id });
        if (!mapping) {
          await repository.acknowledge({ id: row.id, token, status: 'blocked', failureCode: 'DGLAUNDRY_MAPPING_INACTIVE', failureReason: 'The company/location mapping is no longer active.' });
          throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED, 'The DGFY company/location mapping is no longer active.', { statusCode: 403, details: { operation_id: row.id, delivery_status: 'blocked' } });
        }
      }
      const response = await transportClient[row.operation](row.payload, { timeoutMs: TIMEOUT_MS });
      await repository.acknowledge({ id: row.id, token, status: 'delivered', response });
      return response;
    } catch (error) {
      if (['blocked', 'cancelled'].includes(error?.details?.delivery_status)) throw error;
      const willRetry = retryable(error) && Number(row.attempts) < Number(row.max_attempts);
      const state = willRetry ? 'retry_wait' : 'dead_letter';
      const delay = nextDelay(row.attempts, error, random);
      await repository.acknowledge({
        id: row.id,
        token,
        status: state,
        failureCode: error.code || (error.name === 'AbortError' ? 'DGLAUNDRY_TIMEOUT' : `HTTP_${error.statusCode || 0}`),
        failureReason: String(error.message || 'DGLaundry delivery failed').slice(0, 1000),
        nextAttemptAt: willRetry ? new Date(Date.now() + delay) : null
      });
      if (!willRetry) throw error;
      throw pendingError({ ...row, status: state, next_attempt_at: new Date(Date.now() + delay) });
    }
  };

  const enqueueAndDeliver = async (operation, payload, { idempotencyKey = null, eventId = null, completion = null, callerIdempotencyKey = null } = {}) => {
    const data = payload?.data || payload;
    const companyId = String(data?.companyId || data?.company_id || '');
    const locationId = String(data?.locationId || data?.location_id || '');
    if (!companyId || !locationId) throw new DomainError(DomainErrorCode.VALIDATION_FAILED,
      'A mapped company and location are required before queueing DGLaundry delivery.', { statusCode: 422 });
    if (operation === 'prepareBookingGroup' && !bookingEnabled(locationId)) {
      throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'DGLaundry booking delivery is disabled.', { statusCode: 503 });
    }
    if (mappingRepository?.findActiveMapping) {
      const mapping = await mappingRepository.findActiveMapping({ companyId, locationId });
      if (!mapping) throw new DomainError(DomainErrorCode.AUTHORIZATION_FAILED,
        'The DGFY company/location is not actively mapped to DGLaundry.', { statusCode: 403 });
    }
    const key = String(idempotencyKey || eventId || crypto.createHash('sha256').update(requestHash(payload)).digest('hex'));
    const body = structuredClone(payload);
    const hash = requestHash(identityPayload(body));
    const orderReference = data.externalOrderReference || data.external_order_reference || null;
    const groupReference = data.externalOrderGroupReference || data.external_order_group_reference || data.group?.externalOrderGroupReference || null;
    const { row, created } = await repository.enqueue({
      companyId, locationId, operation, idempotencyKey: key, requestHash: hash, payload: body,
      eventId: eventId || body.id || null, callerIdempotencyKey, orderReference, groupReference, maxAttempts: MAX_ATTEMPTS, completion
    });
    if (operation === 'prepareBookingGroup' && await repository.hasCancellationIntent(orderReference, companyId, locationId)) {
      throw new DomainError(DomainErrorCode.CONFLICT,
        'This booking preparation was abandoned and cannot be resumed.', { statusCode: 409, details: { operation_id: row.id } });
    }
    if (row.request_hash !== hash) throw new DomainError(DomainErrorCode.CONFLICT,
      'The DGLaundry idempotency key was already used for a different operation payload.', { statusCode: 409 });
    if (row.status === 'delivered') return row.response;
    if (row.status === 'dead_letter' || row.status === 'blocked' || row.status === 'cancelled') {
      throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'This DGLaundry operation requires operator recovery.', {
        statusCode: 503, details: { delivery_status: row.status, operation_id: row.id }
      });
    }
    if (!created) throw pendingError(row);
    const claim = await repository.claim(row.id);
    if (!claim) throw pendingError(row);
    return deliverClaim(claim);
  };

  return {
    prepareQuote: (payload) => enqueueAndDeliver('prepareQuote', payload, { idempotencyKey: payload?.idempotencyKey || payload?.idempotency_key }),
    prepareBookingGroup: (payload) => enqueueAndDeliver('prepareBookingGroup', payload, { idempotencyKey: payload?.idempotencyKey || payload?.idempotency_key }),
    submitOrder: (envelope, options = {}) => enqueueAndDeliver('submitOrder', envelope, {
      idempotencyKey: envelope?.id,
      eventId: envelope?.id,
      completion: options.completion || (options.callerIdempotencyKey ? { type: 'dglaundry_order_idempotency', reference: options.callerIdempotencyKey } : null),
      callerIdempotencyKey: options.callerIdempotencyKey || null
    }),
    updateOrder: (envelope) => enqueueAndDeliver('updateOrder', envelope, { idempotencyKey: envelope?.id, eventId: envelope?.id }),
    cancelOrder: (envelope) => enqueueAndDeliver('cancelOrder', envelope, { idempotencyKey: envelope?.id, eventId: envelope?.id }),
    resolveOrder: (payload) => enqueueAndDeliver('resolveOrder', payload, { idempotencyKey: payload?.idempotencyKey || `resolve-${requestHash(payload)}` }),
    health: (...args) => transportClient.health(...args),
    processClaim: deliverClaim,
    completeCallerReconciliation: (eventId) => repository.completeCallerReconciliation(eventId),
    limits: { maxAttempts: MAX_ATTEMPTS, timeoutMs: TIMEOUT_MS }
  };
};
