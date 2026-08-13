/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceBookingJourneyHeader } from './ServiceBookingJourneyHeader.jsx';

describe('ServiceBookingJourneyHeader', () => {
  afterEach(cleanup);

  it('uses the services reference journey while preserving real booking state', () => {
    render(
      <ServiceBookingJourneyHeader
        accentBorder="rgba(15,118,110,0.2)"
        accentColor="#0f766e"
        accentSoft="#ecfeff"
        activeStep={1}
        bookingSummaryQuantity={2}
        completeColor="#0f766e"
        displayFont="Inter, sans-serif"
        accountStepComplete={false}
        fulfillmentStepComplete={false}
        isMobileViewport={false}
        onStepChange={vi.fn()}
        serviceOrderMethod="delivery"
      />
    );

    expect(screen.getByText('Four clear steps')).toBeTruthy();
    expect(screen.getByText('Complete your service booking')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 Customer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2 Add-ons/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /4 Payment and Review/ }).disabled).toBe(true);
    expect(screen.getByText('2 services')).toBeTruthy();
    expect(screen.getByText('Delivery booking')).toBeTruthy();
  });
});
