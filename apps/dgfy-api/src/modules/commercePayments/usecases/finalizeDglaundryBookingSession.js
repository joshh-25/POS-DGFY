import { createDgfyOrderEvent } from '../../dgfyLaundryOrders/contracts.js';
import { dglaundryPartnerClient } from '../../dgfyLaundryOrders/services/dglaundryPartnerClient.js';

const parseObject = (value) => {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  try { const parsed = JSON.parse(value || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; } catch { return {}; }
};

const paymentId = (resource = {}) => {
  const attributes = resource?.attributes || resource;
  const candidate = resource?.id || attributes?.payment_id || attributes?.payment?.id || '';
  return String(candidate).startsWith('pay_') ? candidate : null;
};

const submissionFor = (session) => {
  const payload = parseObject(session.checkout_payload);
  const submission = parseObject(payload.dglaundry_submission);
  const children = Array.isArray(payload.dglaundry_booking_group?.children) ? payload.dglaundry_booking_group.children : [];
  const fixed = children.find((child) => child.mode === 'fixed') || submission;
  return {
    companyId: submission.companyId || payload.company_id,
    locationId: submission.locationId || payload.location_id,
    externalOrderReference: submission.externalOrderReference || fixed.externalOrderReference || payload.external_order_reference,
    externalTrackingReference: submission.externalTrackingReference || fixed.externalTrackingReference || payload.external_tracking_reference,
    quoteId: submission.quoteId || fixed.quoteId || null,
    reservationIds: submission.reservationIds || fixed.reservationIds || [],
    catalogVersion: payload.catalog_version || 'local',
    lines: submission.lines || fixed.lines || [],
    fulfillment: submission.fulfillment || payload.fulfillment,
    customerReference: payload.customer?.id || null,
    customerReferenceKind: payload.customer?.id ? 'dgfy_account' : 'dgfy_guest'
  };
};

export const submitPaidDglaundryBooking = async ({ session, resource, providerEventId, commercePaymentRepository, partnerClient = dglaundryPartnerClient }) => {
  const plain = session?.get ? session.get({ plain: true }) : session;
  if (!plain || plain.target_type !== 'dglaundry_booking') return null;
  if (plain.status === 'finalized') return plain;
  const paymentReference = paymentId(resource) || plain.provider_payment_id || plain.provider_payment_intent_id || null;
  const submission = submissionFor(plain);
  const envelope = createDgfyOrderEvent({
    id: `dglaundry-submit-${plain.public_reference}-${providerEventId || 'reconcile'}`,
    type: 'dgfy.laundry_order.submitted.v1',
    data: {
      ...submission,
      aggregateVersion: 1,
      payment: { owner: 'dgfy', status: 'paid', amountCentavos: Number(plain.total_amount_centavos || 0), externalReference: paymentReference, provider: 'paymongo' }
    }
  });
  const providerResponse = await partnerClient.submitOrder(envelope);
  return commercePaymentRepository.updateSessionById(plain.session_id, {
    status: 'finalized',
    finalized_at: new Date(),
    provider_event_id: providerEventId || plain.provider_event_id,
    provider_payment_id: paymentReference,
    tracking_pin: submission.externalTrackingReference || plain.tracking_pin || null,
    provider_payload: resource || plain.provider_payload || null,
    failure_code: null,
    failure_reason: null
  }).then((updated) => ({ ...updated, dglaundry_provider_response: providerResponse }));
};

export const cancelDglaundryBookingReservations = async ({ session, reason, providerEventId = null, commercePaymentRepository, partnerClient = dglaundryPartnerClient }) => {
  const plain = session?.get ? session.get({ plain: true }) : session;
  if (!plain || plain.target_type !== 'dglaundry_booking') return null;
  const payload = parseObject(plain.checkout_payload);
  const children = Array.isArray(payload.dglaundry_booking_group?.children) ? payload.dglaundry_booking_group.children : [];
  const submission = submissionFor(plain);
  const targets = children.length ? children : [submission];
  await Promise.all(targets.map((child) => partnerClient.cancelOrder(createDgfyOrderEvent({
    id: `dglaundry-cancel-${plain.public_reference}-${child.externalOrderReference || submission.externalOrderReference}-${providerEventId || reason}`.slice(0, 200),
    type: 'dgfy.laundry_order.cancelled.v1',
    data: {
      companyId: child.companyId || submission.companyId,
      locationId: child.locationId || submission.locationId,
      externalOrderReference: child.externalOrderReference || submission.externalOrderReference,
      externalTrackingReference: child.externalTrackingReference || submission.externalTrackingReference,
      reservationIds: child.reservationIds || submission.reservationIds || [],
      reason,
      occurredAt: new Date().toISOString()
    }
  })).catch(() => null)));
  return commercePaymentRepository.updateSessionById(plain.session_id, {
    status: plain.status === 'paid' ? 'paid_manual_resolution_required' : plain.status,
    provider_event_id: providerEventId || plain.provider_event_id,
    failure_code: reason === 'PAYMENT_FAILED' ? 'PAYMENT_FAILED' : 'QRPH_EXPIRED',
    failure_reason: reason
  });
};

export const notifyDglaundryBookingRefund = async ({ session, refund, providerEventId = null, partnerClient = dglaundryPartnerClient }) => {
  const plain = session?.get ? session.get({ plain: true }) : session;
  if (!plain || plain.target_type !== 'dglaundry_booking') return null;
  const submission = submissionFor(plain);
  return partnerClient.updateOrder(createDgfyOrderEvent({
    id: `dglaundry-refund-${plain.public_reference}-${providerEventId || refund?.refund_id || 'event'}`.slice(0, 200),
    type: 'dgfy.laundry_order.payment_status_changed.v1',
    data: {
      ...submission,
      payment: { owner: 'dgfy', status: 'refunded', amountCentavos: Number(refund?.amount_centavos || plain.total_amount_centavos || 0), externalReference: refund?.public_reference || null, provider: 'paymongo' }
    }
  }));
};
