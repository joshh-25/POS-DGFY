import { describe, expect, it } from 'vitest';
import { getPosIncomingOrderCount, resolvePosIncomingOrders } from '../incomingOrderCount.js';

describe('POS incoming order count', () => {
  it('uses the active shift queue for an operator with an open shift', () => {
    const options = {
      canViewPos: true,
      hasActiveShift: true,
      incomingOrdersState: {
        orders: [
          { pos_transaction_id: 11, order_method: 'pickup' },
          { pos_transaction_id: 12, order_method: 'dine_in' }
        ]
      },
      adminLocationMonitorState: {
        orders: [{ pos_transaction_id: 99, order_method: 'pickup' }]
      }
    };

    expect(resolvePosIncomingOrders(options)).toEqual([
      { pos_transaction_id: 11, order_method: 'pickup' },
      { pos_transaction_id: 12, order_method: 'dine_in' }
    ]);
    expect(getPosIncomingOrderCount(options)).toBe(2);
  });

  it('uses the admin branch monitor when no shift is open', () => {
    expect(getPosIncomingOrderCount({
      canViewPos: true,
      hasActiveShift: false,
      canViewAdminLocationMonitor: true,
      incomingOrdersState: { orders: [{ pos_transaction_id: 1 }] },
      adminLocationMonitorState: { orders: [{ pos_transaction_id: 2 }, { pos_transaction_id: 3 }] }
    })).toBe(2);
  });

  it('returns zero when the incoming queue is hidden or inaccessible', () => {
    expect(getPosIncomingOrderCount({
      showIncomingQueue: false,
      canViewPos: true,
      incomingOrdersState: { orders: [{ pos_transaction_id: 1 }] }
    })).toBe(0);
    expect(getPosIncomingOrderCount({
      canViewPos: false,
      incomingOrdersState: { orders: [{ pos_transaction_id: 1 }] }
    })).toBe(0);
  });
});
