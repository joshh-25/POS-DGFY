/** @vitest-environment jsdom */
// Regression coverage for DGFY-POS-B: the iMin POS WebView (Chrome 80-84) has no
// String.prototype.replaceAll (ES2021 / Chrome 85+). TerminalOperationsPanels.jsx's
// IncomingQueueWorkspace crashed rendering every incoming order because of it; the
// same free-text status formatting pattern also lived in OnlineOrderDetailsModal.jsx
// and OnlineOrderReceiptModal.jsx. All three were converted to .replace(/x/g, ...).
//
// Modelled on the existing WebView compat case in
// receiptContractConformance.contract.test.js ("renders and formats receipts when
// Android WebView does not provide replaceAll").
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { IncomingQueueWorkspace } from '../components/TerminalOperationsPanels.jsx';
import OnlineOrderDetailsModal from '../components/OnlineOrderDetailsModal.jsx';
import OnlineOrderReceiptModal from '../components/OnlineOrderReceiptModal.jsx';

afterEach(() => {
  cleanup();
});

const withoutReplaceAll = (run) => {
  const original = String.prototype.replaceAll;
  Object.defineProperty(String.prototype, 'replaceAll', {
    configurable: true,
    value: undefined
  });
  try {
    run();
  } finally {
    Object.defineProperty(String.prototype, 'replaceAll', {
      configurable: true,
      value: original
    });
  }
};

const buildIncomingOrder = (overrides = {}) => ({
  pos_transaction_id: 501,
  customer_name: 'Test Customer',
  tracking_pin: 'PIN-501',
  order_method: 'delivery',
  payment_type: 'gcash',
  payment_status: 'awaiting_payment',
  fulfillment_status: 'confirmed',
  created_at: '2026-08-05T11:00:00.000Z',
  ...overrides
});

describe('DGFY-POS-B: status text renders without String.prototype.replaceAll', () => {
  it('IncomingQueueWorkspace renders the payment status badge (the reported crash site)', () => {
    withoutReplaceAll(() => {
      render(
        <IncomingQueueWorkspace
          canViewPos
          canTransactPos
          incomingOrdersState={{
            orders: [buildIncomingOrder()],
            loading: false,
            accessState: 'idle',
            errorMessage: ''
          }}
          locationsState={{ locations: [] }}
          queueLocationScopeId={null}
          incomingReceiptOpeningId={null}
          locked={false}
        />
      );
    });

    expect(screen.getByText('awaiting payment')).toBeDefined();
  });

  it('OnlineOrderDetailsModal renders normalized payment status and discount type', () => {
    withoutReplaceAll(() => {
      render(
        <OnlineOrderDetailsModal
          open
          order={{
            pos_transaction_id: 601,
            invoice_number: 'NFS-000601',
            payment_status: 'awaiting_payment',
            order_method: 'pickup',
            fulfillment_status: 'preparing',
            discount: { discount_type: 'senior_pwd' },
            lines: []
          }}
        />
      );
    });

    expect(screen.getByText('Awaiting Payment')).toBeDefined();
    expect(screen.getByText('Senior Pwd')).toBeDefined();
  });

  it('OnlineOrderReceiptModal renders formatted payment status in the receipt', () => {
    withoutReplaceAll(() => {
      render(
        <OnlineOrderReceiptModal
          open
          order={{
            pos_transaction_id: 701,
            invoice_number: 'NFS-000701',
            payment_status: 'awaiting_payment',
            order_method: 'pickup',
            fulfillment_status: 'preparing',
            lines: []
          }}
        />
      );
    });

    expect(screen.getByText('Awaiting Payment')).toBeDefined();
  });
});
