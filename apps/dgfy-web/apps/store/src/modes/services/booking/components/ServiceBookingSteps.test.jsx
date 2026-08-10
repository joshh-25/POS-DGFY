// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ServiceBookingDetailsForm.jsx', () => ({
  ServiceBookingDetailsForm: () => <div>Booking details</div>
}));

vi.mock('./ServiceBookingFulfillmentChoices.jsx', () => ({
  ServiceBookingFulfillmentChoices: () => <div>Fulfillment choices</div>
}));

import { ServiceBookingStepAccount, ServiceBookingStepFulfillment } from './ServiceBookingSteps.jsx';

const Button = ({ children, ...props }) => <button type="button" {...props}>{children}</button>;

describe('ServiceBookingStepAccount', () => {
  const baseProps = {
    GhostButton: Button,
    PrimaryButton: Button,
    activeBookingService: { item_id: 42 },
    bookingFieldPlan: {},
    canUseGuestCheckoutFlow: true,
    guestCheckoutOtpCode: '',
    guestCheckoutOtpCooldownLabel: '',
    guestCheckoutOtpError: '',
    guestCheckoutOtpLoading: false,
    isDgfyCustomerSignedIn: false,
    isGuestCheckoutOtpCooldownActive: false,
    isMobileViewport: false,
    missingCustomerInformation: [],
    onApplyGuestDetailsAndRequestOtp: vi.fn(),
    onBack: vi.fn(),
    onGuestCheckoutOtpCodeChange: vi.fn(),
    onRequestGuestCheckoutOtp: vi.fn(),
    onVerifyGuestCheckoutOtp: vi.fn(),
    renderAccountOwnedIdentitySummary: vi.fn(),
    renderGuestCheckoutEntry: vi.fn(),
    servicesBodyFont: 'Arial',
    toast: { error: vi.fn() },
  };

  afterEach(cleanup);

  it('requires guest email verification before advancing', () => {
    const renderGuestIdentityFields = vi.fn(() => <div>Guest identity fields</div>);
    const setServiceBookingStep = vi.fn();

    render(
      <ServiceBookingStepAccount
        {...baseProps}
        accountStepComplete={false}
        guestCheckoutOtpVerified={false}
        renderGuestIdentityFields={renderGuestIdentityFields}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    expect(screen.getByText('Verify your email')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue' }).disabled).toBe(true);
    expect(renderGuestIdentityFields).toHaveBeenCalledWith(expect.objectContaining({
      requireEmail: true,
      savedDetailsApplyLabel: 'Send Code and Apply Details',
      onSavedDetailsApply: baseProps.onApplyGuestDetailsAndRequestOtp,
    }));
    expect(setServiceBookingStep).not.toHaveBeenCalled();
  });

  it('advances after the guest identity and OTP gate are complete', () => {
    const setServiceBookingStep = vi.fn();

    render(
      <ServiceBookingStepAccount
        {...baseProps}
        accountStepComplete
        guestCheckoutOtpVerified
        renderGuestIdentityFields={() => <div>Guest identity fields</div>}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    expect(screen.getByText('Email verified')).toBeTruthy();
    expect(setServiceBookingStep).toHaveBeenCalledWith(2);
  });
});

describe('ServiceBookingStepFulfillment', () => {
  const activeBookingService = { item_id: 42, cart_line_id: 'service-line-42', name: '1 basket' };
  let setServiceBookingStep;
  let syncServiceBookingDraft;

  beforeEach(() => {
    setServiceBookingStep = vi.fn();
    syncServiceBookingDraft = vi.fn();
  });

  afterEach(cleanup);

  it('persists the valid appointment draft before opening review', () => {
    render(
      <ServiceBookingStepFulfillment
        STYLES={{ colors: { muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={() => null}
        GhostButton={Button}
        PrimaryButton={Button}
        activeBookingService={activeBookingService}
        bookingDateOptions={[]}
        bookingFieldPlan={{}}
        bookingStepOneAdditionalFields={[]}
        bookingTimeSlotOptions={[]}
        isMobileViewport={false}
        selectedServiceDatePart="2026-08-10"
        selectedServiceTimePart="09:00"
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#0f766e"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(syncServiceBookingDraft).toHaveBeenCalledWith(activeBookingService);
    expect(setServiceBookingStep).toHaveBeenCalledWith(4);
    expect(syncServiceBookingDraft.mock.invocationCallOrder[0]).toBeLessThan(setServiceBookingStep.mock.invocationCallOrder[0]);
  });

  it('does not persist or advance when fulfillment is incomplete', () => {
    const toast = { error: vi.fn() };
    render(
      <ServiceBookingStepFulfillment
        STYLES={{ colors: { muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={() => null}
        GhostButton={Button}
        PrimaryButton={Button}
        activeBookingService={activeBookingService}
        bookingDateOptions={[]}
        bookingFieldPlan={{}}
        bookingStepOneAdditionalFields={[]}
        bookingTimeSlotOptions={[]}
        isMobileViewport={false}
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#0f766e"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={['Preferred Date']}
        fulfillmentStepComplete={false}
        toast={toast}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(syncServiceBookingDraft).not.toHaveBeenCalled();
    expect(setServiceBookingStep).not.toHaveBeenCalledWith(4);
    expect(toast.error).toHaveBeenCalledWith('Complete "Preferred Date" before continuing.');
  });
});
