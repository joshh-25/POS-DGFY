// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./ServiceBookingDetailsForm.jsx', () => ({
  ServiceBookingDetailsForm: ({ selectedServiceDatePart, selectedServiceTimePart }) => (
    <div>
      Booking details
      <span data-testid="forwarded-schedule">{selectedServiceDatePart}|{selectedServiceTimePart}</span>
    </div>
  )
}));

vi.mock('./ServiceBookingFulfillmentChoices.jsx', () => ({
  ServiceBookingFulfillmentChoices: () => <div>Fulfillment choices</div>
}));

import { ServiceBookingStepAccount, ServiceBookingStepFulfillment, ServiceBookingStepReviewPayment } from './ServiceBookingSteps.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

const Button = ({ children, ...props }) => <button type="button" {...props}>{children}</button>;

const normalizeCssValue = (property, value) => {
  const probe = document.createElement('div');
  probe.style[property] = value;
  return probe.style[property];
};

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
        servicesPrimary="#1A4E8D"
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

  it('forwards the selected date and time to the schedule card', () => {
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
        selectedServiceDatePart="2026-09-08"
        selectedServiceTimePart="09:00"
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    expect(screen.getByTestId('forwarded-schedule').textContent).toBe('2026-09-08|09:00');
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
        servicesPrimary="#1A4E8D"
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
    expect(screen.queryByText('Complete the required fulfillment details before continuing.')).toBeNull();
  });

  it('keeps the template handoff and location flow unchanged', () => {
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
        serviceOrderMethod="appointment"
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        renderLocationSection={() => <div>Location controls</div>}
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    expect(screen.getByText('Fulfillment')).toBeTruthy();
    expect(screen.getByText('Choose how and when the customer will receive the order, then add the service details.')).toBeTruthy();
    expect(screen.getByText('Fulfillment choices')).toBeTruthy();
    expect(screen.getByText('Location controls')).toBeTruthy();
  });

  it('keeps the Laundry handoff chooser visible for an explicit Laundry selection', () => {
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
        serviceOrderMethod="delivery"
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    expect(screen.getByText('Fulfillment choices')).toBeTruthy();
  });

  it('stacks the AC customer-address calendar above the full laundry-style location picker', () => {
    const renderLocationSection = vi.fn(({ compactLayout }) => (
      <div data-testid="location-controls">Location controls ({compactLayout ? 'compact' : 'full'})</div>
    ));

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
        serviceFlowProfileMethod="on_site"
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        renderLocationSection={renderLocationSection}
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    const sections = screen.getByTestId('on-site-fulfillment-sections');
    const bookingDetails = screen.getByText('Booking details');
    const locationControls = screen.getByTestId('location-controls');

    expect(sections.style.gridTemplateColumns).toBe('1fr');
    expect(screen.getByText('Service time and location')).toBeTruthy();
    expect(screen.getByText('Location controls (full)')).toBeTruthy();
    expect(renderLocationSection).toHaveBeenCalledWith({ compactLayout: false });
    expect(bookingDetails.compareDocumentPosition(locationControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('renders template handoff choices without a profile-selected default', () => {
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
        serviceOrderMethod=""
        serviceDraftQuantity={1}
        serviceIntakeResponses={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimaryShadow="none"
        missingScheduleAndServiceInfo={[]}
        fulfillmentStepComplete
        toast={{ error: vi.fn() }}
        syncServiceBookingDraft={syncServiceBookingDraft}
        setServiceBookingStep={setServiceBookingStep}
      />
    );

    expect(screen.getByText('Fulfillment choices')).toBeTruthy();
  });
});

describe('ServiceBookingStepReviewPayment', () => {
  afterEach(cleanup);

  it('renders payment method before fulfillment information', () => {
    render(
      <ServiceBookingStepReviewPayment
        STYLES={{ colors: { dark: '#0f172a', muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={({ value }) => <div>Payment selector: {value}</div>}
        GhostButton={Button}
        PrimaryButton={Button}
        primaryButtonProps={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimarySoft="#EEF6FD"
        servicesPrimaryBorder="rgba(26,78,141,0.2)"
        money={(value) => String(value)}
        registerBookingFieldRef={() => undefined}
        isMobileViewport={false}
        serviceOrderMethod="delivery"
        serviceLocationSummaryDraft=""
        groupedServiceLineItems={[]}
        selectedServiceDatePart="2026-08-10"
        selectedServiceTimePart="09:00"
        specialInstructions=""
        servicePaymentTiming="postpaid"
        setServicePaymentTiming={vi.fn()}
        bookingPagePaymentOptions={[{ value: 'postpaid', label: 'Pay Later' }]}
        bookingSummaryAmount={100}
        servicesDisplayFont="Arial"
        checkoutError=""
        setServiceBookingStep={vi.fn()}
        toast={{ error: vi.fn() }}
        handleCheckout={vi.fn()}
      />
    );

    const paymentSection = screen.getByText('Payment', { exact: true });
    const reviewSection = screen.getByText('Review your booking', { exact: true });
    const payment = screen.getByText('Payment method');
    const fulfillment = screen.getByText('Fulfillment Information');
    expect(screen.queryByText('Review and payment')).toBeNull();
    expect(paymentSection.compareDocumentPosition(reviewSection) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(payment.compareDocumentPosition(fulfillment) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('places each fulfillment value beneath its label in the same content column', () => {
    render(
      <ServiceBookingStepReviewPayment
        STYLES={{ colors: { dark: '#0f172a', muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={({ value }) => <div>Payment selector: {value}</div>}
        GhostButton={Button}
        PrimaryButton={Button}
        primaryButtonProps={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimarySoft="#EEF6FD"
        servicesPrimaryBorder="rgba(26,78,141,0.2)"
        money={(value) => String(value)}
        registerBookingFieldRef={() => undefined}
        isMobileViewport
        serviceOrderMethod="delivery"
        serviceLocationSummaryDraft="3 Ibarra Street, Aurora Subdivision, City Proper, Iloilo City"
        groupedServiceLineItems={[]}
        selectedServiceDatePart="2026-08-10"
        selectedServiceTimePart="09:00"
        specialInstructions=""
        servicePaymentTiming="postpaid"
        setServicePaymentTiming={vi.fn()}
        bookingPagePaymentOptions={[{ value: 'postpaid', label: 'Pay Later' }]}
        bookingSummaryAmount={100}
        servicesDisplayFont="Arial"
        checkoutError=""
        setServiceBookingStep={vi.fn()}
        toast={{ error: vi.fn() }}
        handleCheckout={vi.fn()}
      />
    );

    const label = screen.getByText('Service flow');
    const value = screen.getByText('Pick up and deliver');
    const contentColumn = label.parentElement;
    const row = contentColumn.parentElement;
    const fulfillmentSection = screen.getByText('Fulfillment information').parentElement.parentElement;

    expect(contentColumn).toBe(value.parentElement);
    expect(contentColumn.style.display).toBe('grid');
    expect(contentColumn.style.gap).toBe('4px');
    expect(row.style.alignItems).toBe('start');
    expect(fulfillmentSection.style.background).toBe(normalizeCssValue('background', SERVICES_PALETTE.primarySoft));
    expect(fulfillmentSection.style.border).toBe(normalizeCssValue('border', `1px solid ${SERVICES_PALETTE.primaryBorder}`));
    expect(row.firstElementChild.style.background).toBe(normalizeCssValue('background', SERVICES_PALETTE.surface));
    expect(row.firstElementChild.style.border).toBe(normalizeCssValue('border', `1px solid ${SERVICES_PALETTE.primaryBorder}`));
    expect(row.firstElementChild.style.color).toBe(normalizeCssValue('color', SERVICES_PALETTE.primary));
    expect(screen.getByText('3 Ibarra Street, Aurora Subdivision, City Proper, Iloilo City')).toBeTruthy();
  });

  it('shows the profile-defined AC service type when no handoff selection is required', () => {
    render(
      <ServiceBookingStepReviewPayment
        STYLES={{ colors: { dark: '#0f172a', muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={({ value }) => <div>Payment selector: {value}</div>}
        GhostButton={Button}
        PrimaryButton={Button}
        primaryButtonProps={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimarySoft="#EEF6FD"
        servicesPrimaryBorder="rgba(26,78,141,0.2)"
        money={(value) => String(value)}
        registerBookingFieldRef={() => undefined}
        isMobileViewport
        serviceOrderMethod=""
        serviceFlowProfileMethod="on_site"
        serviceLocationSummaryDraft=""
        groupedServiceLineItems={[]}
        selectedServiceDatePart="2026-09-03"
        selectedServiceTimePart="09:00"
        specialInstructions=""
        servicePaymentTiming="postpaid"
        setServicePaymentTiming={vi.fn()}
        bookingPagePaymentOptions={[{ value: 'postpaid', label: 'Pay Later' }]}
        bookingSummaryAmount={100}
        servicesDisplayFont="Arial"
        checkoutError=""
        setServiceBookingStep={vi.fn()}
        toast={{ error: vi.fn() }}
        handleCheckout={vi.fn()}
      />
    );

    expect(screen.getByText('Service type')).toBeTruthy();
    expect(screen.getByText("Service at the customer's address")).toBeTruthy();
  });

  it('keeps fulfillment information neutral when no flow is selected', () => {
    render(
      <ServiceBookingStepReviewPayment
        STYLES={{ colors: { dark: '#0f172a', muted: '#64748b' } }}
        BOOKING_FIELD_STYLE={{}}
        StorefrontDropdown={({ value }) => <div>Payment selector: {value}</div>}
        GhostButton={Button}
        PrimaryButton={Button}
        primaryButtonProps={{}}
        servicesPrimary="#1A4E8D"
        servicesPrimarySoft="#EEF6FD"
        servicesPrimaryBorder="rgba(26,78,141,0.2)"
        money={(value) => String(value)}
        registerBookingFieldRef={() => undefined}
        isMobileViewport
        serviceOrderMethod=""
        serviceLocationSummaryDraft=""
        groupedServiceLineItems={[]}
        selectedServiceDatePart=""
        selectedServiceTimePart=""
        specialInstructions=""
        servicePaymentTiming="postpaid"
        setServicePaymentTiming={vi.fn()}
        bookingPagePaymentOptions={[{ value: 'postpaid', label: 'Pay Later' }]}
        bookingSummaryAmount={100}
        servicesDisplayFont="Arial"
        checkoutError=""
        setServiceBookingStep={vi.fn()}
        toast={{ error: vi.fn() }}
        handleCheckout={vi.fn()}
      />
    );

    expect(screen.getByText('Fulfillment information')).toBeTruthy();
    expect(screen.getAllByText('Not selected yet')).toHaveLength(3);
    expect(screen.queryByText('Pickup address')).toBeNull();
  });
});
