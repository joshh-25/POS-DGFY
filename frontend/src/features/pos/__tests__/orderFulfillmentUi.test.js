import { describe, expect, it } from 'vitest';
import {
  getFulfillmentActionLabel,
  getIncomingOrderUtilityActions,
  ORDER_METHOD_LABELS,
  PAYMENT_TYPE_LABELS
} from '../components/orderFulfillmentUi.js';

describe('orderFulfillmentUi queue action mapping', () => {
  it('keeps active online orders on open/print actions instead of history', () => {
    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'placed',
      order_method: 'pickup'
    })).toEqual(['open_order', 'print_order']);

    expect(getIncomingOrderUtilityActions({
      fulfillment_status: 'ready_for_pickup',
      order_method: 'pickup'
    })).toEqual(['open_order', 'print_order']);
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
});
