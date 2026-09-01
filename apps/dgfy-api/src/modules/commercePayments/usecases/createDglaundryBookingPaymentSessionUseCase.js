import crypto from 'node:crypto';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { createDgfyOrderEvent, toTrimmed } from '../../dgfyLaundryOrders/contracts.js';
import { dglaundryPartnerClient } from '../../dgfyLaundryOrders/services/dglaundryPartnerClient.js';

const trim = (value, max = 255) => toTrimmed(value, max);
const publicReference = () => `DGL-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
const childReference = (reference, suffix) => `${trim(reference, 180)}:${suffix}`.slice(0, 200);
const enabled = () => String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_ENABLED || '').toLowerCase() === 'true'
  && String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_KILL_SWITCH || '').toLowerCase() !== 'true';
const branchEnabled = (locationId) => {
  const disabled = String(process.env.DGLAUNDRY_BOOKING_PAYMENTS_DISABLED_BRANCHES || '').split(',').map((value) => value.trim()).filter(Boolean);
  return !disabled.includes(String(locationId));
};

const lineMode = (line, mode) => line?.mode || (mode === 'per_kilo' ? 'per_kilo' : mode === 'fixed' ? 'fixed' : null);
const paymentSnapshot = ({ status, amountCentavos, externalReference = null, provider = 'paymongo' }) => ({ owner: 'dgfy', status, amountCentavos, externalReference, provider });

const cancelPreparedChildren = async (children, reason) => {
  await Promise.all(children.map((child) => dglaundryPartnerClient.cancelOrder(createDgfyOrderEvent({
    type: 'dgfy.laundry_order.cancelled.v1',
    data: {
      companyId: child.companyId,
      locationId: child.locationId,
      externalOrderReference: child.externalOrderReference,
      externalTrackingReference: child.externalTrackingReference,
      reservationIds: child.reservationIds || [],
      reason,
      occurredAt: new Date().toISOString()
    }
  })).catch(() => null)));
};

const serialized = (session) => ({
  payment_session_id: session.public_reference,
  public_reference: session.public_reference,
  target_type: session.target_type,
  status: session.status,
  amount_centavos: Number(session.total_amount_centavos || 0),
  currency: session.currency || 'PHP',
  checkout_url: session.checkout_url || null,
  qr_code_image_url: session.qr_code_image_url || null,
  expires_at: session.expires_at || null,
  booking_group: session.checkout_payload?.dglaundry_booking_group || null
});

export const buildCreateDglaundryBookingPaymentSessionUseCase = ({
  commercePaymentRepository,
  paymongoService,
  partnerClient = dglaundryPartnerClient
}) => async ({ payload = {} } = {}) => {
  try {
    if (!enabled()) throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'DGLaundry booking payments are dark-disabled.', { statusCode: 503 });
    const tenantId = trim(payload.tenant_id || payload.company_id, 160);
    const companyId = trim(payload.company_id || tenantId, 160);
    const locationId = trim(payload.location_id, 160);
    const mode = ['fixed', 'per_kilo', 'mixed'].includes(payload.mode) ? payload.mode : 'fixed';
    const idempotencyKey = trim(payload.idempotency_key || payload.idempotencyKey, 160);
    const externalOrderReference = trim(payload.external_order_reference, 200);
    const externalTrackingReference = trim(payload.external_tracking_reference, 200);
    if (!tenantId || !companyId || !locationId || !idempotencyKey || !externalOrderReference || !externalTrackingReference || !Array.isArray(payload.lines) || !payload.lines.length) {
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'tenant, company/location, references, lines, and idempotency_key are required.', { statusCode: 422 });
    }
    if (!branchEnabled(locationId)) throw new DomainError(DomainErrorCode.SERVICE_UNAVAILABLE, 'Online laundry booking is disabled for this branch.', { statusCode: 503 });

    const existing = await commercePaymentRepository.findSessionByIdempotency({ tenantId, targetType: 'dglaundry_booking', idempotencyKey });
    const requestHash = crypto.createHash('sha256').update(JSON.stringify({ ...payload, idempotency_key: undefined, idempotencyKey: undefined })).digest('hex');
    if (existing) {
      if (existing.request_hash !== requestHash) throw new DomainError(DomainErrorCode.CONFLICT, 'idempotency_key already used for a different booking.', { statusCode: 409 });
      return ok({ idempotent_replay: true, payment_session: serialized(existing) });
    }

    const lineModes = payload.lines.map((line) => lineMode(line, mode));
    if (mode !== 'mixed' && lineModes.some((candidate) => candidate !== mode)) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Every line must use the selected booking mode.', { statusCode: 422 });
    if (mode === 'mixed' && (!lineModes.includes('fixed') || !lineModes.includes('per_kilo'))) throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Mixed bookings require fixed and per-kilo lines.', { statusCode: 422 });
    const childModes = mode === 'mixed' ? ['fixed', 'per_kilo'] : [mode];
    const children = [];
    try {
      for (const childMode of childModes) {
        const lines = payload.lines.filter((_, index) => lineModes[index] === childMode).map(({ mode: _ignored, ...line }) => line);
        const childPayload = {
          companyId,
          locationId,
          mode: childMode,
          externalOrderReference: mode === 'mixed' ? childReference(externalOrderReference, childMode) : externalOrderReference,
          externalTrackingReference: mode === 'mixed' ? childReference(externalTrackingReference, childMode) : externalTrackingReference,
          idempotencyKey: mode === 'mixed' ? `${idempotencyKey}:${childMode}` : idempotencyKey,
          catalogVersion: trim(payload.catalog_version || 'local', 120),
          lines,
          fulfillment: payload.fulfillment
        };
        const quote = await partnerClient.prepareQuote(childPayload);
        children.push({
          mode: childMode,
          companyId,
          locationId,
          externalOrderReference: childPayload.externalOrderReference,
          externalTrackingReference: childPayload.externalTrackingReference,
          lines,
          quote,
          quoteId: quote?.quoteId || quote?.quote_id || null,
          amountCentavos: Number(quote?.totalCentavos ?? quote?.total_amount_centavos ?? quote?.subtotalCentavos ?? 0),
          reservationIds: quote?.reservationIds || quote?.reservation_ids || []
        });
      }
    } catch (error) {
      await cancelPreparedChildren(children, 'BOOKING_PREPARE_FAILED');
      throw error;
    }

    const fixedChild = children.find((child) => child.mode === 'fixed') || null;
    if (!fixedChild) {
      return ok({ idempotent_replay: false, payment_required: false, booking_group: { mode, children } });
    }
    if (!Number.isInteger(fixedChild.amountCentavos) || fixedChild.amountCentavos <= 0) {
      await cancelPreparedChildren(children, 'INVALID_FIXED_BOOKING_AMOUNT');
      throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The provider returned an invalid fixed booking amount.', { statusCode: 422 });
    }

    const publicRef = publicReference();
    const submission = {
      ...fixedChild,
      quote: undefined,
      quoteId: fixedChild.quoteId,
      reservationIds: fixedChild.reservationIds,
      payment: paymentSnapshot({ status: 'pending', amountCentavos: fixedChild.amountCentavos, externalReference: publicRef })
    };
    const checkoutPayload = {
      dglaundry_booking: true,
      company_id: companyId,
      location_id: locationId,
      external_order_reference: externalOrderReference,
      external_tracking_reference: externalTrackingReference,
      catalog_version: trim(payload.catalog_version || 'local', 120),
      customer: payload.customer || null,
      fulfillment: payload.fulfillment,
      dglaundry_booking_group: { mode, children },
      dglaundry_submission: submission
    };
    let session;
    try {
      session = await commercePaymentRepository.createSession({
        public_reference: publicRef,
        tenant_id: tenantId,
        store_slug: trim(payload.store_slug || 'tenant-store', 120),
        provider: 'paymongo',
        target_type: 'dglaundry_booking',
        status: 'created',
        idempotency_key: idempotencyKey,
        request_hash: requestHash,
        checkout_payload: checkoutPayload,
        subtotal_amount: fixedChild.amountCentavos / 100,
        delivery_fee: 0,
        service_fee_amount: 0,
        total_amount: fixedChild.amountCentavos / 100,
        currency: 'PHP',
        total_amount_centavos: fixedChild.amountCentavos,
        order_total_centavos: fixedChild.amountCentavos,
        platform_fee_centavos: 0,
        fee_policy: { collection_model: 'dgfy_collects_then_settles_tenant', split_payment_used: false, payment_authority: 'dgfy' },
        tenant_transfer_merchant_id: null,
        split_payload: null
      });
    } catch (error) {
      await cancelPreparedChildren(children, 'PAYMENT_SESSION_PERSIST_FAILED');
      throw error;
    }
    try {
      const providerResult = await paymongoService.createQrphPaymentIntent({
        amount: fixedChild.amountCentavos,
        currency: 'PHP',
        description: `DGFY DGLaundry booking ${publicRef}`,
        billing: { name: payload.customer?.displayName || payload.customer?.name || 'Storefront Customer', email: payload.customer?.email || undefined, phone: payload.customer?.phone || undefined },
        metadata: { commerce_payment_session: publicRef, tenant_id: tenantId, dglaundry_booking: 'true', external_order_reference: externalOrderReference },
        splitPayment: null,
        returnUrl: trim(payload.return_url || process.env.STOREFRONT_PAYMENT_RETURN_URL, 1000) || null
      });
      session = await commercePaymentRepository.updateSessionById(session.session_id, {
        status: 'awaiting_payment',
        provider_payment_intent_id: providerResult.paymentIntent?.id || providerResult.attachedIntent?.id || null,
        provider_payment_method_id: providerResult.paymentMethod?.id || null,
        qr_code_image_url: providerResult.qrCodeImageUrl || null,
        checkout_url: providerResult.checkoutUrl || null,
        expires_at: providerResult.expiresAt ? new Date(providerResult.expiresAt) : new Date(Date.now() + 30 * 60 * 1000),
        provider_payload: providerResult.attachedIntent || providerResult.paymentIntent || null
      });
      return ok({ idempotent_replay: false, payment_required: true, payment_session: serialized(session) });
    } catch (error) {
      await commercePaymentRepository.updateSessionById(session.session_id, { status: 'failed', failure_code: 'PROVIDER_CREATE_FAILED', failure_reason: String(error.message || 'PayMongo creation failed').slice(0, 500) });
      await cancelPreparedChildren(children, 'PAYMENT_SESSION_CREATE_FAILED');
      return ok({ idempotent_replay: false, payment_required: true, payment_session: serialized({ ...session, status: 'failed' }) });
    }
  } catch (error) {
    return fail(error instanceof DomainError ? error : new DomainError(DomainErrorCode.INTERNAL_ERROR, error.message || 'DGLaundry booking payment session could not be created', { statusCode: 500 }));
  }
};
