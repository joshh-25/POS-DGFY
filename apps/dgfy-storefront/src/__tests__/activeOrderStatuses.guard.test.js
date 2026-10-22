import { describe, expect, it } from 'vitest';
import { ACTIVE_FULFILLMENT_STATUSES, TERMINAL_FULFILLMENT_STATUSES } from '@sieitzz/shared-constants/orderFulfillmentStatuses';
import { ACTIVE_CUSTOMER_ORDER_STATUSES } from '../customer-dashboard/model/customerOrderStatus.js';
import { ACTIVE_CUSTOMER_TRACKING_STATUSES, dedupeActiveCustomerOrders, resolveSelectedTrackingPollMs } from '../tracking/customerTrackingRefresh.js';

describe('customer active fulfillment status guard', () => {
  it('retains every active POS status and drops terminal states', () => {
    ACTIVE_FULFILLMENT_STATUSES.forEach((status) => {
      expect(ACTIVE_CUSTOMER_ORDER_STATUSES.has(status)).toBe(true);
      expect(ACTIVE_CUSTOMER_TRACKING_STATUSES.has(status)).toBe(true);
    });
    TERMINAL_FULFILLMENT_STATUSES.forEach((status) => {
      expect(ACTIVE_CUSTOMER_ORDER_STATUSES.has(status)).toBe(false);
      expect(ACTIVE_CUSTOMER_TRACKING_STATUSES.has(status)).toBe(false);
    });
  });

  it('keeps waiting-for-rider visible at the normal active poll interval', () => {
    expect(dedupeActiveCustomerOrders([{ reference: 'SK-1234', status: 'ready_for_rider', updated_at: '2026-10-22T00:00:00Z' }])).toHaveLength(1);
    expect(resolveSelectedTrackingPollMs({ status: 'ready_for_rider' })).toBe(15000);
  });
});
