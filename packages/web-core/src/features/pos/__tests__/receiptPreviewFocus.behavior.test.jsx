// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POSCheckoutTerminalReceiptDialogs } from '../components/POSCheckoutTerminalReceiptDialogs.jsx';

afterEach(cleanup);

const renderReceiptPreview = () => render(
  <POSCheckoutTerminalReceiptDialogs
    splitPaymentCancelModalOpen={false}
    splitPaymentCancelLoading={false}
    setSplitPaymentCancelModalOpen={vi.fn()}
    handleKeepSplitPaymentAndClose={vi.fn()}
    handleReverseSplitPaymentAndStartNew={vi.fn()}
    receiptPreviewModalOpen
    closeReceiptPreviewModal={vi.fn()}
    receiptPreviewSource="order_preview"
    lastReceiptPendingSync={false}
    lastReceipt={{ pos_transaction_id: 1 }}
    historyDetailLoading={false}
    receiptSettings={{}}
    lastReceiptContract={null}
    receiptPaperWidth="80mm"
    setReceiptPaperWidth={vi.fn()}
    setReceiptPreviewSource={vi.fn()}
    posActionsBlocked={false}
    receiptPrinting={false}
    isPrinterAvailable
    isOrderPrinterAvailable
    handlePrintReceipt={vi.fn()}
    handlePrintOrder={vi.fn()}
    OrderPreviewView={() => <div>Order preview content</div>}
  />
);

describe('POS receipt preview focus behavior', () => {
  it('focuses the order-preview title when the dialog opens', () => {
    renderReceiptPreview();

    const title = screen.getByRole('heading', { name: 'Order Preview' });
    expect(document.activeElement).toBe(title);
  });
});
