import { describe, expect, it } from 'vitest';
import {
  getFulfillmentActionLabel,
  getDeliveryJobActionLabel,
  getIncomingOrderUtilityActions,
  hasCompleteDeliveryAssignment,
  getNextDeliveryJobStatus,
  isManualDeliveryJob,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS
} from '../components/orderFulfillmentUi.js';

describe('orderFulfillmentUi queue action mapping', () => {
  it('keeps active online orders on open/print actions instead of history', () => {
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'placed',
      order_method: 'pickup'
    })).toEqual(['open_order', 'print_receipt', 'print_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup'
    })).toEqual(['open_order', 'print_receipt', 'print_order']);
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
    expect(getFulfillmentActionLabel('completed', { order_method: 'pickup' })).toBe('Picked Up');
    expect(getFulfillmentActionLabel('completed', { order_method: 'delivery' })).toBe('Delivered');
    expect(getFulfillmentActionLabel('completed', { order_method: 'takeout' })).toBe('Collected');
    expect(getFulfillmentActionLabel('completed', { order_method: 'dine_in' })).toBe('Served');
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
