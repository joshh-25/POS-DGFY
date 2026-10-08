// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  review: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn()
}));

vi.mock('../services/posService.js', () => ({
  fetchMerchantTenderReconciliation: mocks.fetch,
  reviewMerchantTenderReconciliation: mocks.review
}));

vi.mock('@/src/utils/iminRuntimeFeedback.js', () => ({
  posToast: { error: mocks.toastError, success: mocks.toastSuccess }
}));

import MerchantTenderReconciliationPanel from '../components/MerchantTenderReconciliationPanel.jsx';

afterEach(() => cleanup());

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({
    expected: {
      breakdown: {
        gcash: { amount: 10 },
        maya: { amount: 20 },
        card: { amount: 30 },
        bank_transfer: { amount: 40 }
      },
      total: 100
    },
    latest_reconciliation: null,
    is_stale: false
  });
});

describe('MerchantTenderReconciliationPanel', () => {
  it('shows the responsive tender channels and keeps Employee Credit read-only', async () => {
    render(
      <MerchantTenderReconciliationPanel
        shiftId={52}
        salesSummary={{ payment_breakdown: [{ payment_type: 'employee_credit', amount: 15, count: 2 }] }}
      />
    );

    const mobileView = await screen.findByTestId('merchant-tender-reconciliation-mobile-view');
    expect(await within(mobileView).findByLabelText('GCash observed total')).toBeTruthy();
    expect(within(mobileView).getByLabelText('Maya observed total')).toBeTruthy();
    expect(within(mobileView).getByLabelText('Card terminal observed total')).toBeTruthy();
    expect(within(mobileView).getByLabelText('Bank transfer observed total')).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Store-owned tender reconciliation' })).toBeTruthy();
    expect(screen.getByTestId('employee-credit-reconciliation-row').textContent).toContain('System locked');
    expect(screen.getByTestId('employee-credit-reconciliation-row').textContent).toContain('2 transactions');
    expect(within(mobileView).getByText('Employee Credit')).toBeTruthy();
    expect(within(mobileView).getByText('Internal receivable · 2 transactions')).toBeTruthy();
  });

  it('requires a manager note for variances and records the observed tender amounts', async () => {
    mocks.review.mockResolvedValue({
      expected: { breakdown: { gcash: { amount: 10 }, maya: { amount: 20 }, card: { amount: 30 }, bank_transfer: { amount: 40 } }, total: 100 },
      latest_reconciliation: {
        status: 'variance_reviewed',
        observed_breakdown: { gcash: 10, maya: 25, card: 30, bank_transfer: 40 },
        review_note: 'Settlement differs',
        reviewed_at: '2026-10-07T08:00:00.000Z'
      },
      is_stale: false
    });

    render(<MerchantTenderReconciliationPanel shiftId={52} />);
    const mobileView = await screen.findByTestId('merchant-tender-reconciliation-mobile-view');
    const mayaInput = await within(mobileView).findByLabelText('Maya observed total');
    fireEvent.change(mayaInput, { target: { value: '25' } });
    const recordButton = screen.getByRole('button', { name: 'Record Manager Review' });
    expect(recordButton.disabled).toBe(true);
    expect(screen.getByText('Enter at least 8 characters to record a variance review.')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Manager review note (required)'), { target: { value: 'Settlement differs' } });
    expect(recordButton.disabled).toBe(false);
    fireEvent.click(recordButton);

    await waitFor(() => expect(mocks.review).toHaveBeenCalledOnce());
    const [shiftId, payload] = mocks.review.mock.calls[0];
    expect(shiftId).toBe(52);
    expect(payload.observed_breakdown).toEqual({ gcash: 10, maya: 25, card: 30, bank_transfer: 40 });
    expect(payload.review_note).toBe('Settlement differs');
    expect((await screen.findAllByText('Variance reviewed')).length).toBeGreaterThan(0);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Tender variance reviewed and recorded.');
  });

  it('surfaces fetch errors with an explicit retry action', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Network unavailable'));
    render(<MerchantTenderReconciliationPanel shiftId={52} />);

    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load merchant tender totals.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    const mobileView = await screen.findByTestId('merchant-tender-reconciliation-mobile-view');
    expect(await within(mobileView).findByLabelText('GCash observed total')).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });
});
