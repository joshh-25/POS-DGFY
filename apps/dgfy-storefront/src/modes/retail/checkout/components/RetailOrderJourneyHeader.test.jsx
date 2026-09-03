/* @vitest-environment jsdom */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RetailOrderJourneyHeader } from './RetailOrderJourneyHeader.jsx';

afterEach(cleanup);

describe('RetailOrderJourneyHeader', () => {
  it('keeps the journey header focused on the order steps without cart metadata badges', () => {
    render(
      <RetailOrderJourneyHeader
        activeStep={2}
        cartHasItems
        cartCount={19}
        displayFont="Avenir Next"
        isDeliveryOrder
        isMobileViewport={false}
        onStepChange={() => {}}
      />
    );

    expect(screen.getByRole('heading', { name: 'Complete Your Product Order' })).toBeTruthy();
    expect(screen.getByText('Order Journey')).toBeTruthy();
    expect(screen.queryByText('19 items')).toBeNull();
    expect(screen.queryByText('Delivery order flow')).toBeNull();
  });
});
