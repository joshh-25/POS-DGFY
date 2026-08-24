/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ServiceBookingConfirmation } from './ServiceBookingConfirmation.jsx';

describe('ServiceBookingConfirmation', () => {
  afterEach(cleanup);

  it('connects a confirmed booking to the Services tracking route', () => {
    const onTrackBooking = vi.fn();

    render(
      <ServiceBookingConfirmation
        confirmationAmount={350}
        confirmationReference="SVC-ABC123"
        confirmationServiceName="Wash and Fold"
        checkoutResult={{ booking: { public_reference: 'SVC-ABC123' } }}
        isMobileViewport={false}
        money={(amount) => `₱${amount}`}
        onResetAndBackToServices={vi.fn()}
        onTrackBooking={onTrackBooking}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Track booking' }));

    expect(onTrackBooking).toHaveBeenCalledTimes(1);
  });

  it('does not render a tracking action without a booking reference', () => {
    render(
      <ServiceBookingConfirmation
        confirmationAmount={0}
        confirmationReference=""
        confirmationServiceName="Wash and Fold"
        checkoutResult={{}}
        isMobileViewport={false}
        money={(amount) => `₱${amount}`}
        onResetAndBackToServices={vi.fn()}
        onTrackBooking={vi.fn()}
      />
    );

    expect(screen.queryByRole('button', { name: 'Track booking' })).toBeNull();
  });
});
