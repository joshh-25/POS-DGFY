import { describe, expect, it } from 'vitest';
import {
  getFulfillmentActionLabel,
  getDeliveryJobActionLabel,
  getIncomingOrderUtilityActions,
  getNextStatusActions,
  isCompletionPaymentPending,
  hasCompleteDeliveryAssignment,
  getNextDeliveryJobStatus,
  isManualDeliveryJob,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS
} from '../components/orderFulfillmentUi.js';

describe('orderFulfillmentUi queue action mapping', () => {
  it('keeps the initial and confirmed actions focused on the next useful step', () => {
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'placed',
      order_method: 'pickup'
    })).toEqual(['open_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'confirmed',
      order_method: 'pickup'
    })).toEqual(['print_order', 'open_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup'
    })).toEqual(['open_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'preparing',
      order_method: 'pickup'
    })).toEqual(['print_receipt', 'open_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'preparing',
      order_method: 'delivery'
    })).toEqual(['print_order', 'open_order']);
  });

  it('does not expose completed orders in the active incoming queue', () => {
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'completed',
      order_method: 'pickup'
    })).toEqual([]);
  });

  it('uses fulfillment-specific action wording', () => {
    expect(getFulfillmentActionLabel('out_for_delivery', { order_method: 'delivery' })).toBe('Out for Delivery');
    expect(getFulfillmentActionLabel('ready_for_pickup', { order_method: 'pickup' })).toBe('Ready for Pickup');
    expect(getFulfillmentActionLabel('ready_for_pickup', { order_method: 'takeout' })).toBe('Ready for Collection');
    expect(getFulfillmentActionLabel('ready_for_pickup', { order_method: 'dine_in' })).toBe('Ready to Serve');
    expect(getFulfillmentActionLabel('completed', { order_method: 'pickup' })).toBe('Pickup');
    expect(getFulfillmentActionLabel('completed', { order_method: 'delivery' })).toBe('Delivered');
    expect(getFulfillmentActionLabel('completed', { order_method: 'takeout' })).toBe('Collected');
    expect(getFulfillmentActionLabel('completed', { order_method: 'dine_in' })).toBe('Served');
  });

  it('gates pickup completion until cash collection is recorded', () => {
    expect(getNextStatusActions({
      fulfillment_status: 'placed',
      order_method: 'pickup'
    })).toEqual(['confirmed', 'rejected']);
    expect(getNextStatusActions({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup',
      payment_status: 'unpaid'
    })).toEqual(['completed']);
    expect(isCompletionPaymentPending({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup',
      payment_status: 'unpaid'
    })).toBe(true);
    expect(isCompletionPaymentPending({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup',
      payment_status: 'paid'
    })).toBe(false);
  });

  it('offers reject alongside start-preparing from confirmed (Phase 210, #1179)', () => {
    expect(getNextStatusActions({
      fulfillment_status: 'confirmed',
      order_method: 'pickup'
    })).toEqual(['preparing', 'rejected']);
    expect(getNextStatusActions({
      fulfillment_status: 'confirmed',
      order_method: 'delivery'
    })).toEqual(['preparing', 'rejected']);
  });

  it('offers packed alongside the existing handoff only for retail workflow mode (Phase 211, #1180)', () => {
    // The existing next step is ALWAYS still offered -- packed is additive, not a replacement.
    expect(getNextStatusActions({
      fulfillment_status: 'preparing',
      order_method: 'delivery'
    }, 'retail')).toEqual(['packed', 'out_for_delivery']);
    expect(getNextStatusActions({
      fulfillment_status: 'preparing',
      order_method: 'pickup'
    }, 'retail')).toEqual(['packed', 'ready_for_pickup']);

    // Backward-compat pin: workflowMode omitted entirely (the un-updated TerminalSidebarPanel call
    // site) must keep behaving exactly as before this phase -- no packed action offered.
    expect(getNextStatusActions({
      fulfillment_status: 'preparing',
      order_method: 'delivery'
    })).toEqual(['out_for_delivery']);
    expect(getNextStatusActions({
      fulfillment_status: 'preparing',
      order_method: 'delivery'
    }, 'fnb')).toEqual(['out_for_delivery']);
    expect(getNextStatusActions({
      fulfillment_status: 'preparing',
      order_method: 'delivery'
    }, '')).toEqual(['out_for_delivery']);
  });

  it('offers the single onward edge from packed, matching order method (Phase 211, #1180)', () => {
    expect(getNextStatusActions({
      fulfillment_status: 'packed',
      order_method: 'delivery'
    })).toEqual(['out_for_delivery']);
    expect(getNextStatusActions({
      fulfillment_status: 'packed',
      order_method: 'pickup'
    })).toEqual(['ready_for_pickup']);
  });

  it('shares packed\'s utility actions and label with preparing (Phase 211, #1180)', () => {
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'packed',
      order_method: 'delivery'
    })).toEqual(['print_order', 'open_order']);
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'packed',
      order_method: 'pickup'
    })).toEqual(['print_receipt', 'open_order']);
    expect(getFulfillmentActionLabel('packed', { order_method: 'delivery' })).toBe('Mark Packed');
  });

  it('keeps delivery completion behind delivery-job tracking', () => {
    expect(getNextStatusActions({
      fulfillment_status: 'out_for_delivery',
      order_method: 'delivery',
      deliveryJob: { status: 'picked_up' }
    })).toEqual([]);
    expect(getNextStatusActions({
      fulfillment_status: 'out_for_delivery',
      order_method: 'delivery',
      deliveryJob: { status: 'delivered' }
    })).toEqual(['completed']);
  });

  it('uses readable appointment and QR Ph labels', () => {
    expect(ORDER_METHOD_LABELS.appointment).toBe('Appointment');
    expect(PAYMENT_TYPE_LABELS.qrph).toBe('QR Ph');
  });

  it('maps manual delivery jobs through the guarded operational lifecycle', () => {
    expect(getNextDeliveryJobStatus({
      order_method: 'delivery',
      fulfillment_status: 'out_for_delivery',
      deliveryJob: { status: 'pending_dispatch' }
    })).toBe('assigned');
    expect(getNextDeliveryJobStatus({
      order_method: 'delivery',
      fulfillment_status: 'out_for_delivery',
      deliveryJob: { status: 'assigned' }
    })).toBe('picked_up');
    expect(getNextDeliveryJobStatus({
      order_method: 'delivery',
      fulfillment_status: 'out_for_delivery',
      deliveryJob: { status: 'picked_up' }
    })).toBe('delivered');
    expect(getNextDeliveryJobStatus({
      order_method: 'delivery',
      fulfillment_status: 'preparing',
      deliveryJob: { status: 'pending_dispatch' }
    })).toBe(null);
    expect(getDeliveryJobActionLabel('delivered')).toBe('Mark Delivered');
  });

  it('identifies the assignment evidence required before lifecycle actions', () => {
    expect(isManualDeliveryJob({ provider: 'manual' })).toBe(true);
    expect(isManualDeliveryJob({ provider: 'provider_x' })).toBe(false);
    expect(hasCompleteDeliveryAssignment({
      delivery_personnel_id: 4,
      assigned_by: 7,
      assigned_shift_id: 11,
      assigned_at: '2026-08-08T08:00:00.000Z'
    })).toBe(true);
    expect(hasCompleteDeliveryAssignment({
      delivery_personnel_name: 'Third Party Courier',
      assigned_by: 7,
      assigned_shift_id: 11,
      assigned_at: '2026-08-08T08:00:00.000Z'
    })).toBe(true);
    expect(hasCompleteDeliveryAssignment({ delivery_personnel_id: 4 })).toBe(false);
  });
});
