/** @vitest-environment node */

// Phase 229 (#1289), §5. Pure unit coverage for the split view's drag-to-assign decision, kept
// entirely out of jsdom/pointer-drag simulation per the plan's own risk table ("dnd-kit pointer
// drag is awkward to test in jsdom -- logic lives in a pure util with its own unit test").

import { describe, expect, it } from 'vitest';
import { resolveRunDropAssignment } from '../queueRunDropAssignment.js';

const buildOrder = (overrides = {}) => ({
  pos_transaction_id: 9001,
  order_method: 'delivery',
  location_id: 10,
  deliveryJob: {
    provider: 'manual',
    status: 'pending_dispatch',
    delivery_run_id: null
  },
  ...overrides
});

describe('resolveRunDropAssignment', () => {
  it('drags just the single card when it is not part of the current selection', () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const orderB = buildOrder({ pos_transaction_id: 9002 });
    const result = resolveRunDropAssignment({
      activeOrderId: 9002,
      overRunId: 501,
      selectedOrderIds: new Set([9001]), // 9002 (the dragged card) is not selected
      orders: [orderA, orderB]
    });

    expect(result).toEqual({ targetRunId: 501, orderIds: [9002] });
  });

  it('drags the whole eligible selection when the dragged card is part of it', () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const orderB = buildOrder({ pos_transaction_id: 9002 });
    const orderC = buildOrder({ pos_transaction_id: 9003 });
    const result = resolveRunDropAssignment({
      activeOrderId: 9002,
      overRunId: 501,
      selectedOrderIds: new Set([9001, 9002, 9003]),
      orders: [orderA, orderB, orderC]
    });

    expect(result).toEqual({ targetRunId: 501, orderIds: [9001, 9002, 9003] });
  });

  it('does NOT multi-drag when the dragged card is the only one selected', () => {
    const orderA = buildOrder({ pos_transaction_id: 9001 });
    const orderB = buildOrder({ pos_transaction_id: 9002 });
    const result = resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: 501,
      selectedOrderIds: new Set([9001]), // size 1 -- not a multi-drag by ItemsPage.jsx's own rule
      orders: [orderA, orderB]
    });

    expect(result).toEqual({ targetRunId: 501, orderIds: [9001] });
  });

  it('drops an ineligible order out of a multi-drag selection, keeping the eligible ones', () => {
    const eligible = buildOrder({ pos_transaction_id: 9001 });
    const ineligible = buildOrder({ pos_transaction_id: 9002, order_method: 'pickup' });
    const result = resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: 501,
      selectedOrderIds: new Set([9001, 9002]),
      orders: [eligible, ineligible]
    });

    expect(result).toEqual({ targetRunId: 501, orderIds: [9001] });
  });

  it('yields null when the single dragged card is ineligible', () => {
    const ineligible = buildOrder({ pos_transaction_id: 9001, order_method: 'pickup' });
    const result = resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: 501,
      selectedOrderIds: new Set(),
      orders: [ineligible]
    });

    expect(result).toBeNull();
  });

  it('yields null when every candidate in a multi-drag selection is ineligible', () => {
    const ineligibleA = buildOrder({ pos_transaction_id: 9001, order_method: 'pickup' });
    const ineligibleB = buildOrder({ pos_transaction_id: 9002, order_method: 'pickup' });
    const result = resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: 501,
      selectedOrderIds: new Set([9001, 9002]),
      orders: [ineligibleA, ineligibleB]
    });

    expect(result).toBeNull();
  });

  it('yields null when there is no picked target run (dropped outside a valid droppable)', () => {
    const order = buildOrder({ pos_transaction_id: 9001 });
    expect(resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: undefined,
      selectedOrderIds: new Set(),
      orders: [order]
    })).toBeNull();

    expect(resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: null,
      selectedOrderIds: new Set(),
      orders: [order]
    })).toBeNull();

    // DeliveryRunDropPanel's own sentinel id for "no run picked yet".
    expect(resolveRunDropAssignment({
      activeOrderId: 9001,
      overRunId: 'no-run-selected',
      selectedOrderIds: new Set(),
      orders: [order]
    })).toBeNull();
  });

  it('yields null when the active drag id cannot be resolved to a number', () => {
    const order = buildOrder({ pos_transaction_id: 9001 });
    expect(resolveRunDropAssignment({
      activeOrderId: 'not-a-number',
      overRunId: 501,
      selectedOrderIds: new Set(),
      orders: [order]
    })).toBeNull();
  });

  it('always returns numeric ids, never array indices, sorted ascending', () => {
    const orderA = buildOrder({ pos_transaction_id: 9003 });
    const orderB = buildOrder({ pos_transaction_id: 9001 });
    const orderC = buildOrder({ pos_transaction_id: 9002 });
    const result = resolveRunDropAssignment({
      activeOrderId: '9003', // dnd-kit ids can arrive as strings depending on how they were set
      overRunId: '501',
      selectedOrderIds: new Set([9001, 9002, 9003]),
      orders: [orderA, orderB, orderC]
    });

    expect(result.targetRunId).toBe(501);
    expect(typeof result.targetRunId).toBe('number');
    result.orderIds.forEach((id) => expect(typeof id).toBe('number'));
    expect(result.orderIds).toEqual([9001, 9002, 9003]);
  });
});
