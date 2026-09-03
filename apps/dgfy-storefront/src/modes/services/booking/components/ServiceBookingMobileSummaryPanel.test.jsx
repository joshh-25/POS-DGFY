/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceBookingMobileSummaryPanel } from './ServiceBookingMobileSummaryPanel.jsx';

describe('ServiceBookingMobileSummaryPanel', () => {
  afterEach(cleanup);

  it('uses the F&B-style fixed footer and opens the Services summary sheet', () => {
    render(
      <ServiceBookingMobileSummaryPanel
        accountStepComplete
        bookingSummaryAmount={180}
        bookingSummaryQuantity={1}
        fulfillmentStepComplete={false}
        isMobileViewport
        isQuoteFlow={false}
        money={(amount) => `PHP ${amount}`}
        onBack={vi.fn()}
        onPrimary={vi.fn()}
        serviceBookingStep={1}
        serviceLineItems={[{ amount: 'PHP 180.00', imageSources: null, key: '12', quantity: 1, title: 'Comforter Care' }]}
        servicePaymentTiming="pay_later"
        servicesBodyFont="Source Sans 3, sans-serif"
        servicesDisplayFont="Lexend, sans-serif"
        servicesPrimary="#1A4E8D"
        servicesPrimaryDark="#115e59"
        servicesPrimaryShadow="rgba(26,78,141,.2)"
        summaryRows={[{ label: 'Fulfillment', value: 'Pick up and deliver' }]}
      />
    );

    expect(screen.getByRole('button', { name: /View booking summary/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
    expect(screen.queryByText('Your booking')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /View booking summary/ }));

    expect(screen.getByRole('dialog', { name: 'Booking summary' })).toBeTruthy();
    expect(screen.getByText('Comforter Care')).toBeTruthy();
    expect(screen.getByText('Pick up and deliver')).toBeTruthy();
  });
});
