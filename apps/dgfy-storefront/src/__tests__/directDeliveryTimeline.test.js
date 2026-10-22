import { describe, expect, it } from 'vitest';
import { getOrderTrackingFlow, getOrderTrackingTimeline } from '../shared/tracking/directDeliveryTimeline.js';

const active = (method, status, delivery = null, retail = false) =>
  getOrderTrackingTimeline(method, status, delivery, retail).find((step) => step.state === 'active')?.label;

describe('customer order timelines', () => {
  it('shows direct-delivery stages without advancing early rider assignments past preparation', () => {
    expect(active('delivery', 'placed')).toBe('Order placed');
    expect(active('delivery', 'preparing', { stage: 'rider_assigned' })).toBe('Preparing');
    expect(active('delivery', 'ready_for_rider', { stage: 'waiting_for_rider' })).toBe('Waiting for rider');
    expect(active('delivery', 'ready_for_rider', { stage: 'rider_assigned' })).toBe('Rider assigned');
    expect(active('delivery', 'out_for_delivery', { stage: 'picked_up' })).toBe('Picked up');
    expect(active('delivery', 'completed', { stage: 'delivered' })).toBe('Delivered');
  });

  it('keeps retail packing and non-delivery handoff labels separate', () => {
    expect(getOrderTrackingFlow('delivery', true).map((step) => step.label)).toContain('Packed');
    expect(active('delivery', 'packed', null, true)).toBe('Packed');
    expect(active('pickup', 'completed')).toBe('Picked up');
    expect(active('takeout', 'completed')).toBe('Completed');
    expect(active('dine_in', 'completed')).toBe('Served');
    expect(getOrderTrackingFlow('takeout').map((step) => step.id)).not.toContain('ready_for_rider');
    expect(active('delivery', 'cancelled')).toBe('Cancelled');
  });
});
