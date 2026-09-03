import { describe, expect, it, vi } from 'vitest';
import { buildIncomingQueueOrderActions } from '../utils/incomingQueueOrderActions.js';

// #1319: the print/reprint receipt action for the in-progress delivery window is wired through
// this one shared builder (Phase 230/#1288), consumed by both the card and table queue views --
// asserting against it once covers both render sites without duplicating a full page render.

const outForDeliveryOrder = {
  pos_transaction_id: 777,
  order_method: 'delivery',
  fulfillment_status: 'out_for_delivery',
  payment_type: 'gcash',
  payment_status: 'unpaid',
  deliveryJob: { status: 'picked_up' }
};

describe('buildIncomingQueueOrderActions delivery handoff print action (#1319)', () => {
  it('renders a print/reprint receipt button for an in-progress delivery order', () => {
    const buttons = buildIncomingQueueOrderActions(outForDeliveryOrder, {
      canViewPos: true,
      isOnline: true
    });
    const printButton = buttons.find((button) => button.key === 'print_receipt');
    expect(printButton).toBeDefined();
  });

  it('dispatches the existing non-mutating print pipeline, not a status-change handler', () => {
    const handleOpenIncomingOrderReceipt = vi.fn();
    const handleIncomingOrderStatusChange = vi.fn();
    const handleDeliveryJobStatusChange = vi.fn();

    const buttons = buildIncomingQueueOrderActions(outForDeliveryOrder, {
      canViewPos: true,
      isOnline: true,
      handleOpenIncomingOrderReceipt,
      handleIncomingOrderStatusChange,
      handleDeliveryJobStatusChange
    });
    const printButton = buttons.find((button) => button.key === 'print_receipt');

    printButton.props.onClick();
    printButton.props.onClick(); // repeat print -- must succeed independently, no skip/rejection

    expect(handleOpenIncomingOrderReceipt).toHaveBeenCalledTimes(2);
    expect(handleOpenIncomingOrderReceipt).toHaveBeenCalledWith(777, {
      printMode: true,
      retryPrint: false
    });
    // Structurally incapable of advancing the order -- the print click never reaches either
    // status-change handler.
    expect(handleIncomingOrderStatusChange).not.toHaveBeenCalled();
    expect(handleDeliveryJobStatusChange).not.toHaveBeenCalled();
  });

  it('offers the action across every deliveryJob sub-state, including before assignment', () => {
    ['pending_dispatch', 'assigned', 'picked_up', 'delivered'].forEach((status) => {
      const buttons = buildIncomingQueueOrderActions(
        { ...outForDeliveryOrder, deliveryJob: { status } },
        { canViewPos: true, isOnline: true }
      );
      expect(buttons.some((button) => button.key === 'print_receipt')).toBe(true);
    });
  });

  it('requests a retry when the last print attempt failed', () => {
    const handleOpenIncomingOrderReceipt = vi.fn();
    const buttons = buildIncomingQueueOrderActions(
      { ...outForDeliveryOrder, receipt_print_status: 'failed' },
      { canViewPos: true, isOnline: true, handleOpenIncomingOrderReceipt }
    );
    const printButton = buttons.find((button) => button.key === 'print_receipt');

    printButton.props.onClick();

    expect(handleOpenIncomingOrderReceipt).toHaveBeenCalledWith(777, {
      printMode: true,
      retryPrint: true
    });
  });
});
