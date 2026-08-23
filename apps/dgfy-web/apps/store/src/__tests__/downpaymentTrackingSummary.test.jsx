/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { DownpaymentTrackingSummary } from '../shared/components/tracking/DownpaymentTrackingSummary.jsx';

const money = (value) => `PHP ${Number(value || 0).toFixed(2)}`;

afterEach(cleanup);

// Phase 151 (#826): the single shared row replacing five hand-rolled copies across the Retail/F&B
// active+completed views and Simple's route page -- previously each rendered only balanceDue, with
// amountPaid parsed and carried by every tracking payload model since Phase 142 (#823) but never
// displayed anywhere.
describe('DownpaymentTrackingSummary', () => {
  it('renders both the downpayment paid and the balance due for a partially_paid order', () => {
    render(
      <DownpaymentTrackingSummary
        trackingResult={{ paymentStatus: 'partially_paid', amountPaid: 200, balanceDue: 800 }}
        money={money}
        orderMethod="delivery"
      />
    );

    expect(screen.getByText('Downpayment paid')).toBeTruthy();
    expect(screen.getByText('PHP 200.00')).toBeTruthy();
    expect(screen.getByText('Balance due on delivery')).toBeTruthy();
    expect(screen.getByText('PHP 800.00')).toBeTruthy();
  });

  it('follows the pickup label when orderMethod is pickup', () => {
    render(
      <DownpaymentTrackingSummary
        trackingResult={{ paymentStatus: 'partially_paid', amountPaid: 200, balanceDue: 800 }}
        money={money}
        orderMethod="pickup"
      />
    );

    expect(screen.getByText('Balance due at pickup')).toBeTruthy();
  });

  it('renders nothing for a fully-paid order', () => {
    const { container } = render(
      <DownpaymentTrackingSummary
        trackingResult={{ paymentStatus: 'paid', amountPaid: 0, balanceDue: 0 }}
        money={money}
        orderMethod="delivery"
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when trackingResult is missing entirely', () => {
    const { container } = render(
      <DownpaymentTrackingSummary trackingResult={undefined} money={money} orderMethod="delivery" />
    );

    expect(container.firstChild).toBeNull();
  });
});
