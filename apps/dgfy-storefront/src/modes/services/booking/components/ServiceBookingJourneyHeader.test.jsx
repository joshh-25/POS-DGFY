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
        accentBorder="rgba(26,78,141,0.2)"
        accentColor="#1A4E8D"
        accentSoft="#EEF6FD"
        activeStep={1}
        bookingSummaryQuantity={2}
        completeColor="#1A4E8D"
        displayFont="Inter, sans-serif"
        accountStepComplete={false}
        fulfillmentStepComplete={false}
        isMobileViewport={false}
        onStepChange={vi.fn()}
        serviceOrderMethod="delivery"
      />
    );

    expect(screen.queryByText('Four clear steps')).toBeNull();
    expect(screen.getByText('Complete your service booking')).toBeTruthy();
    expect(screen.getByRole('button', { name: /1 Customer/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /2 Add-ons/ }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /4 Payment & review/ }).disabled).toBe(true);
    expect(screen.getByText('2 services')).toBeTruthy();
    expect(screen.getByText('Delivery booking')).toBeTruthy();
  });

  it('keeps all four reference steps fluid on narrow mobile layouts', () => {
    const { container } = render(
      <ServiceBookingJourneyHeader
        accentBorder="rgba(26,78,141,0.2)"
        accentColor="#1A4E8D"
        accentSoft="#EEF6FD"
        activeStep={3}
        bookingSummaryQuantity={1}
        completeColor="#1A4E8D"
        displayFont="Lexend, sans-serif"
        accountStepComplete
        fulfillmentStepComplete
        isMobileViewport
        onStepChange={vi.fn()}
        serviceOrderMethod="pickup"
      />
    );

    const stepButtons = [
      screen.getByRole('button', { name: /1 Customer/ }),
      screen.getByRole('button', { name: /2 Add-ons/ }),
      screen.getByRole('button', { name: /3 Fulfillment/ }),
      screen.getByRole('button', { name: /4 Payment & review/ })
    ];

    expect(stepButtons).toHaveLength(4);
    const paymentLabel = screen.getByText('Payment & review', { exact: true });
    expect(paymentLabel.style.overflowWrap).toBe('normal');
    expect(paymentLabel.style.wordBreak).toBe('normal');
    stepButtons.forEach((button) => {
      expect(button.style.minWidth).toBe('0px');
      expect(button.style.flex).toContain('1 1 0%');
    });
    expect(container.querySelectorAll('[data-checkout-step-connector="true"]').length).toBe(3);
  });

  it('does not imply a delivery booking before fulfillment is selected', () => {
    render(
      <ServiceBookingJourneyHeader
        accentBorder="rgba(26,78,141,0.2)"
        accentColor="#1A4E8D"
        accentSoft="#EEF6FD"
        activeStep={3}
        bookingSummaryQuantity={1}
        completeColor="#1A4E8D"
        displayFont="Inter, sans-serif"
        accountStepComplete
        fulfillmentStepComplete={false}
        isMobileViewport
        onStepChange={vi.fn()}
        serviceOrderMethod=""
      />
    );

    expect(screen.getByText('Not selected yet')).toBeTruthy();
    expect(screen.queryByText('Delivery booking')).toBeNull();
  });

  it('keeps the Services progress accent blue even when legacy teal props are passed', () => {
    render(
      <ServiceBookingJourneyHeader
        accentBorder="#99f6e4"
        accentColor="#0f766e"
        accentSoft="#ecfeff"
        activeStep={3}
        bookingSummaryQuantity={1}
        completeColor="#0f766e"
        displayFont="Inter, sans-serif"
        accountStepComplete
        fulfillmentStepComplete={false}
        isMobileViewport
        onStepChange={vi.fn()}
        serviceOrderMethod=""
      />
    );

    const activeStep = screen.getByRole('button', { name: /3 Fulfillment/ });
    const activeCircle = Array.from(activeStep.querySelectorAll('span')).find((element) => element.style.background);
    expect(activeCircle).toBeTruthy();
    expect(activeCircle.style.background).toBe('rgb(26, 78, 141)');
    expect(activeStep.style.color).toBe('rgb(26, 78, 141)');
  });
});
