import React from 'react';
import { CalendarDays, CheckCircle2, Clock3, MapPin, MessageSquare, Truck } from 'lucide-react';
import { ServiceBookingDetailsForm } from './ServiceBookingDetailsForm.jsx';
import { ServiceBookingFulfillmentChoices } from './ServiceBookingFulfillmentChoices.jsx';
import { ServiceBookingGuestEmailVerification } from './ServiceBookingGuestEmailVerification.jsx';
import { ServiceImage } from '../../ServiceImage.jsx';
import { formatTimeSlotLabel } from '../model/serviceBookingSchedule.js';
import { getServicesLocalFlowDefinition, isServicesQuoteFlow } from '../model/servicesLocalFlow.js';

const formatShortDateWithYear = (dateString) => {
  if (!dateString) return '';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ServiceBookingStepAccount({
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  renderAccountOwnedIdentitySummary,
  renderGuestIdentityFields,
  renderGuestCheckoutEntry,
  activeBookingService,
  isMobileViewport,
  isDgfyCustomerSignedIn,
  canUseGuestCheckoutFlow,
  guestCheckoutAllowed = true,
  missingCustomerInformation,
  accountStepComplete,
  bookingFieldPlan,
  guestCheckoutOtpCode,
  guestCheckoutOtpCooldownLabel,
  guestCheckoutOtpError,
  guestCheckoutOtpLoading,
  guestCheckoutOtpVerified,
  isGuestCheckoutOtpCooldownActive,
  onApplyGuestDetailsAndRequestOtp,
  onGuestCheckoutOtpCodeChange,
  onRequestGuestCheckoutOtp,
  onVerifyGuestCheckoutOtp,
  servicesBodyFont,
  servicesDisplayFont,
  referenceStyle = false,
  toast,
  onBack,
  setServiceBookingStep,
}) {
  const panelStyle = referenceStyle
    ? { border: '1px solid #e2e8f0', borderRadius: 18, background: '#fff', padding: isMobileViewport ? 22 : 32, display: 'grid', gap: 24 }
    : { border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 };
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
        <section style={panelStyle}>
          <div style={{ fontSize: referenceStyle ? 20 : 18, fontWeight: referenceStyle ? 700 : 800, color: '#101010', fontFamily: referenceStyle ? servicesDisplayFont : undefined }}>Customer details</div>
          <div style={{ marginTop: -12, fontSize: referenceStyle ? 14.4 : 12, lineHeight: referenceStyle ? 1.6 : undefined, color: referenceStyle ? '#58717a' : '#64748b' }}>
            {isDgfyCustomerSignedIn ? 'Your account details are already linked. Review them here before continuing.' : 'Use your details for this booking. No account is needed to continue.'}
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({
              title: 'Customer Details',
              subtitle: 'We will use your signed-in DGFY account for this booking.',
              layoutVariant: referenceStyle ? 'services-reference' : 'default',
            }) : renderGuestIdentityFields({
              title: referenceStyle ? 'Who is this booking for?' : 'Customer Details',
              subtitle: referenceStyle ? 'Use your details. They are only used to complete this booking.' : 'We will use these details for your booking.',
              requireEmail: bookingFieldPlan?.emailField
                ? bookingFieldPlan.emailField.required === true
                : true,
              includeAddress: false,
              addressLabel: 'Service Address',
              addressPlaceholder: 'Use the map and saved-location picker in the next step.',
              addressRequired: false,
              showSingleNameField: !referenceStyle,
              layoutVariant: referenceStyle ? 'servicesCheckout' : 'fnbGuest',
              savedDetailsApplyLabel: 'Send Code and Apply Details',
              onSavedDetailsApply: onApplyGuestDetailsAndRequestOtp,
            })}
          </div>

          {!isDgfyCustomerSignedIn && (
            <ServiceBookingGuestEmailVerification
              bodyFont={servicesBodyFont}
              code={guestCheckoutOtpCode}
              cooldownActive={isGuestCheckoutOtpCooldownActive}
              cooldownLabel={guestCheckoutOtpCooldownLabel}
              error={guestCheckoutOtpError}
              isMobileViewport={isMobileViewport}
              loading={guestCheckoutOtpLoading}
              onCodeChange={onGuestCheckoutOtpCodeChange}
              onRequestCode={onRequestGuestCheckoutOtp}
              onVerifyCode={onVerifyGuestCheckoutOtp}
              verified={guestCheckoutOtpVerified}
            />
          )}

          {missingCustomerInformation.length > 0 && (
            <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px', lineHeight: 1.6 }}>
              Complete the required customer details before continuing.
            </div>
          )}
          {!referenceStyle || !isMobileViewport ? <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
            <GhostButton onClick={onBack} style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}>Back</GhostButton>
            <PrimaryButton
              {...primaryButtonProps}
              disabled={!accountStepComplete || Boolean(primaryButtonProps?.disabled)}
              onClick={() => {
                if (!accountStepComplete) {
                  toast.error(missingCustomerInformation[0]
                    ? `Complete "${missingCustomerInformation[0]}" before continuing.`
                    : 'Verify your email before continuing.');
                  return;
                }
                setServiceBookingStep(2);
              }}
              style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}
            >
              Continue
            </PrimaryButton>
          </div> : null}
        </section>
      ) : renderGuestCheckoutEntry({
        title: referenceStyle ? 'How would you like to continue?' : 'Continue to your booking',
        // #622: the referenceStyle copy "No account is needed" is actively wrong once the
        // merchant disables guest checkout -- branch both variants on guestCheckoutAllowed the
        // same way the "Continue as Guest" button itself is gated (PR #1095 RF-3, caught by
        // rendered-UI proof).
        description: guestCheckoutAllowed
          ? (referenceStyle ? 'No account is needed to complete this booking.' : 'Create an account or continue as guest to continue this booking.')
          : 'This store requires a DGFY account to complete a booking. Create one or log in to continue.',
        layoutVariant: referenceStyle ? 'services-reference' : 'default',
        resumeTarget: {
          checkoutTab: 'checkout',
          serviceBookingStep: 1,
          selectedServiceItemId: activeBookingService?.item_id ?? null,
        },
      })}
    </div>
  );
}

export function ServiceBookingStepFulfillment({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  activeBookingService,
  bookingCalendarDateOptions,
  bookingDateOptions,
  bookingFieldPlan,
  bookingPreferredDateInputRef,
  bookingStepOneAdditionalFields,
  bookingTimeSlotOptions,
  combineDateAndTimeParts,
  formatLongDateLabel,
  getPreferredBookingTimeForDate,
  openPreferredBookingDatePicker,
  registerBookingFieldRef,
  isMobileViewport,
  selectedServiceDatePart,
  selectedServiceTimePart,
  serviceScheduleMode,
  serviceDraftQuantity,
  serviceIntakeResponses,
  serviceUnitType,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesPrimaryShadow,
  servicesDisplayFont,
  setServiceAppointmentAt,
  setServiceScheduleMode,
  setServiceDraftQuantity,
  setServiceIntakeResponses,
  setServiceUnitType,
  shouldBookingFieldSpanFullWidth,
  serviceOrderMethod,
  onOrderMethodChange,
  renderLocationSection,
  missingScheduleAndServiceInfo,
  fulfillmentStepComplete,
  referenceStyle = false,
  toast,
  syncServiceBookingDraft,
  setServiceBookingStep,
}) {
  const panelStyle = referenceStyle
    ? { border: '1px solid #e2e8f0', borderRadius: 18, background: '#fff', padding: isMobileViewport ? 22 : 32, display: 'grid', gap: 24 }
    : { border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 };
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={panelStyle}>
        <div style={{ fontSize: referenceStyle ? 20 : 18, fontWeight: referenceStyle ? 700 : 800, color: '#101010', fontFamily: referenceStyle ? servicesDisplayFont : undefined }}>Fulfillment</div>
        <div style={{ marginTop: -4, fontSize: 12, color: STYLES.colors.muted }}>
          Choose how and when the customer will receive the order, then add the service details.
        </div>

        <ServiceBookingFulfillmentChoices
          isMobileViewport={isMobileViewport}
          onOrderMethodChange={onOrderMethodChange}
          serviceOrderMethod={serviceOrderMethod}
          servicesPrimary={servicesPrimary}
          servicesPrimaryBorder={servicesPrimaryBorder}
          servicesPrimaryShadow={servicesPrimaryShadow}
        />

        <ServiceBookingDetailsForm
          STYLES={STYLES}
          BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
          StorefrontDropdown={StorefrontDropdown}
          activeBookingService={activeBookingService}
          bookingCalendarDateOptions={bookingCalendarDateOptions}
          bookingDateOptions={bookingDateOptions}
          bookingFieldPlan={bookingFieldPlan}
          bookingPreferredDateInputRef={bookingPreferredDateInputRef}
          bookingStepOneAdditionalFields={bookingStepOneAdditionalFields}
          bookingTimeSlotOptions={bookingTimeSlotOptions}
          combineDateAndTimeParts={combineDateAndTimeParts}
          formatLongDateLabel={formatLongDateLabel}
          getPreferredBookingTimeForDate={getPreferredBookingTimeForDate}
          isMobileViewport={isMobileViewport}
          openPreferredBookingDatePicker={openPreferredBookingDatePicker}
          registerBookingFieldRef={registerBookingFieldRef}
          selectedServiceDatePart={selectedServiceDatePart}
          selectedServiceTimePart={selectedServiceTimePart}
          serviceScheduleMode={serviceScheduleMode}
          serviceDraftQuantity={serviceDraftQuantity}
          serviceIntakeResponses={serviceIntakeResponses}
          serviceUnitType={serviceUnitType}
          servicesPrimary={servicesPrimary}
          servicesPrimarySoft={servicesPrimarySoft}
          servicesPrimaryShadow={servicesPrimaryShadow}
          setServiceAppointmentAt={setServiceAppointmentAt}
          setServiceScheduleMode={setServiceScheduleMode}
          setServiceDraftQuantity={setServiceDraftQuantity}
          setServiceIntakeResponses={setServiceIntakeResponses}
          setServiceUnitType={setServiceUnitType}
          shouldBookingFieldSpanFullWidth={shouldBookingFieldSpanFullWidth}
        />

        {typeof renderLocationSection === 'function' ? renderLocationSection() : null}

        {missingScheduleAndServiceInfo.length > 0 && (
          <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px', lineHeight: 1.6 }}>
            Complete the required fulfillment details before continuing.
          </div>
        )}
        {!referenceStyle || !isMobileViewport ? <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
          <GhostButton onClick={() => setServiceBookingStep(2)} style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}>Back</GhostButton>
          <PrimaryButton
            {...primaryButtonProps}
            onClick={() => {
              if (!fulfillmentStepComplete) {
                toast.error(missingScheduleAndServiceInfo[0] ? `Complete "${missingScheduleAndServiceInfo[0]}" before continuing.` : 'Complete the required fulfillment details before continuing.');
                return;
              }
              syncServiceBookingDraft(activeBookingService);
              setServiceBookingStep(4);
            }}
            style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}
          >
            Continue
          </PrimaryButton>
        </div> : null}
      </section>
    </div>
  );
}

export function ServiceBookingStepReviewPayment({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  GhostButton,
  PrimaryButton,
  primaryButtonProps,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  money,
  registerBookingFieldRef,
  isMobileViewport,
  serviceOrderMethod,
  serviceLocationSummaryDraft,
  groupedServiceLineItems = [],
  selectedServiceDatePart,
  selectedServiceTimePart,
  specialInstructions,
  servicePaymentTiming,
  setServicePaymentTiming,
  bookingPagePaymentOptions,
  bookingSummaryAmount,
  servicesDisplayFont,
  checkoutError,
  storefrontClosedByHours = false,
  storefrontClosedTitle = 'This storefront is currently closed.',
  storefrontClosedMessageBody = '',
  setServiceBookingStep,
  toast,
  handleCheckout,
  referenceStyle = false,
}) {
  const [showOnlinePaymentNotice, setShowOnlinePaymentNotice] = React.useState(false);
  const previousPaymentTimingRef = React.useRef(servicePaymentTiming);
  const hasShownOnlinePaymentNoticeRef = React.useRef(false);
  const isQuoteFlow = isServicesQuoteFlow(serviceOrderMethod);
  const paymentStepComplete = isQuoteFlow || Boolean(servicePaymentTiming);
  const onlinePaymentSelected = servicePaymentTiming === 'prepaid' || servicePaymentTiming === 'deposit';

  React.useEffect(() => {
    if (
      onlinePaymentSelected &&
      previousPaymentTimingRef.current !== servicePaymentTiming &&
      !hasShownOnlinePaymentNoticeRef.current
    ) {
      setShowOnlinePaymentNotice(true);
      hasShownOnlinePaymentNoticeRef.current = true;
    }
    if (!onlinePaymentSelected && showOnlinePaymentNotice) {
      setShowOnlinePaymentNotice(false);
    }
    previousPaymentTimingRef.current = servicePaymentTiming;
  }, [onlinePaymentSelected, servicePaymentTiming, showOnlinePaymentNotice]);

  const serviceFlow = getServicesLocalFlowDefinition(serviceOrderMethod);
  const handoffLabel = serviceFlow.label;
  const fulfillmentRows = [
    { icon: Truck, label: 'Service flow', value: handoffLabel },
    { icon: CalendarDays, label: 'Preferred date', value: selectedServiceDatePart ? formatShortDateWithYear(selectedServiceDatePart) : 'Not selected' },
    { icon: Clock3, label: 'Preferred time', value: selectedServiceTimePart ? formatTimeSlotLabel(selectedServiceTimePart) : 'Not selected' },
    ...(serviceFlow.requiresAddress ? [{ icon: MapPin, label: 'Pickup Address', value: serviceLocationSummaryDraft || 'Not selected' }] : []),
  ];
  const editSectionButtonStyle = { fontSize: 12, fontWeight: 700, color: servicesPrimary, background: '#fff', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <>
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: referenceStyle ? 18 : 16, background: '#fff', padding: referenceStyle ? (isMobileViewport ? 22 : 32) : (isMobileViewport ? 14 : 18), display: 'grid', gap: referenceStyle ? 24 : 14 }}>
      <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark, fontFamily: referenceStyle ? servicesDisplayFont : undefined }}>
        Payment
      </div>
      {!isQuoteFlow ? <div style={{ display: 'grid', gap: 16 }}>
        <label ref={registerBookingFieldRef('payment_timing')} style={{ display: 'block', fontSize: 12, color: '#475569', minWidth: 0, maxWidth: isMobileViewport ? '100%' : 360 }}>
          Payment Method
          <StorefrontDropdown
            value={servicePaymentTiming}
            onChange={setServicePaymentTiming}
            options={bookingPagePaymentOptions.map((option) => ({
              value: option.value,
              label: option.label,
            }))}
            triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, minHeight: isMobileViewport ? 40 : 42, padding: isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px' }}
            menuStyle={{ borderRadius: 18 }}
          />
        </label>

        {!onlinePaymentSelected ? (
          <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: servicesPrimary }}>
              Pay later selected
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
              Payment will be collected during or after the scheduled service based on the merchant setup.
            </div>
          </div>
        ) : null}
      </div> : (
        <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: servicesPrimary }}>Quote request</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>No payment is collected in this local preview. The business can review the request and provide a price.</div>
        </div>
      )}
      </div>

      <div style={{ display: 'grid', gap: 14, paddingTop: 8, borderTop: '1px solid #eef2f7' }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark, fontFamily: referenceStyle ? servicesDisplayFont : undefined }}>
        Review
      </div>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: STYLES.colors.dark }}>Selected services</div>
        {groupedServiceLineItems.map((line, index) => (
          <div key={line.key} style={{ paddingTop: index === 0 ? 0 : 10, borderTop: index === 0 ? 'none' : '1px solid #eef2f7', display: 'grid', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', background: '#f8fafc', border: `1px solid ${servicesPrimaryBorder}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <ServiceImage imageSources={line.imageSources} alt={line.title} sizes="36px" width={36} height={36} fallbackLabel="" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{line.title}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b', whiteSpace: 'nowrap' }}>{line.quantity}x</span>
            </div>
            {line.variant ? <div style={{ fontSize: 12, color: '#64748b' }}>{line.variant}</div> : null}
            {(line.addOns || []).map((addOn) => (
              <div key={addOn.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: servicesPrimary }}>+ {addOn.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: servicesPrimary, whiteSpace: 'nowrap' }}>{addOn.amount}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section style={{ border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, borderRadius: 20, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: STYLES.colors.dark }}>Fulfillment Information</div>
          <button type="button" onClick={() => setServiceBookingStep(3)} style={editSectionButtonStyle}>Edit section</button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {fulfillmentRows.map((row) => (
            <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: '#fff', border: `1px solid ${servicesPrimaryBorder}`, display: 'grid', placeItems: 'center', color: servicesPrimary, flexShrink: 0 }}>
                <row.icon size={15} />
              </div>
              <div style={{ minWidth: 0, display: 'flex', flex: 1, justifyContent: 'space-between', gap: 12, flexWrap: isMobileViewport ? 'wrap' : 'nowrap' }}>
                <span style={{ fontSize: 12, color: '#64748b' }}>{row.label}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textAlign: 'right', wordBreak: 'break-word' }}>{row.value}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: STYLES.colors.dark }}>Additional Instructions</div>
          <button type="button" onClick={() => setServiceBookingStep(2)} style={editSectionButtonStyle}>Edit section</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: servicesPrimarySoft, border: `1px solid ${servicesPrimaryBorder}`, display: 'grid', placeItems: 'center', color: servicesPrimary, flexShrink: 0 }}>
            <MessageSquare size={15} />
          </div>
          <div style={{ minWidth: 0, display: 'flex', flex: 1, justifyContent: 'space-between', gap: 12, flexWrap: isMobileViewport ? 'wrap' : 'nowrap' }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>Special instructions (optional)</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', textAlign: 'right', wordBreak: 'break-word' }}>{specialInstructions || 'Not provided'}</span>
          </div>
        </div>
      </section>
      </div>

      {storefrontClosedByHours && storefrontClosedMessageBody ? (
        <div style={{ border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, color: servicesPrimary, borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{storefrontClosedTitle}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{storefrontClosedMessageBody}</div>
        </div>
      ) : null}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
      {!referenceStyle || !isMobileViewport ? <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 16 }}>
        <GhostButton onClick={() => setServiceBookingStep(3)} style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}>Back</GhostButton>
        <PrimaryButton
          {...primaryButtonProps}
          onClick={() => {
            if (!paymentStepComplete) {
              toast.error(isQuoteFlow ? 'Review the quote request before continuing.' : 'Select a payment method before confirming the booking.');
              return;
            }
            handleCheckout();
          }}
          style={{ minHeight: referenceStyle ? 51 : (isMobileViewport ? 38 : 44), fontSize: referenceStyle ? 16 : (isMobileViewport ? 14 : 15), borderRadius: referenceStyle ? 12 : undefined }}
        >
          {isQuoteFlow ? 'Send Quote Request' : 'Confirm Booking'}
        </PrimaryButton>
      </div> : null}
      </section>
    </div>
    {showOnlinePaymentNotice ? (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15, 23, 42, 0.56)',
          display: 'grid',
          placeItems: 'center',
          padding: isMobileViewport ? 18 : 24,
          zIndex: 1200,
        }}
        onClick={() => setShowOnlinePaymentNotice(false)}
      >
        <div
          onClick={(event) => event.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: isMobileViewport ? 360 : 432,
            borderRadius: isMobileViewport ? 20 : 22,
            border: '1px solid rgba(15, 118, 110, 0.16)',
            background: '#ffffff',
            boxShadow: '0 28px 64px rgba(15, 23, 42, 0.24)',
            padding: isMobileViewport ? 18 : 20,
            display: 'grid',
            gap: 16,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              margin: isMobileViewport ? '-18px -18px 0' : '-20px -20px 0',
              padding: isMobileViewport ? '16px 18px 14px' : '16px 20px 14px',
              background: 'linear-gradient(135deg, rgba(15,118,110,0.1) 0%, rgba(240,253,250,1) 100%)',
              borderBottom: '1px solid rgba(15, 118, 110, 0.1)',
              display: 'grid',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 14,
                  background: '#ffffff',
                  color: servicesPrimary || '#0f766e',
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: '0 10px 24px rgba(15, 23, 42, 0.08)',
                  flexShrink: 0,
                }}
              >
                <Clock3 size={18} />
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: servicesPrimary || '#0f766e', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Online Payment
                </div>
                <div style={{ fontSize: isMobileViewport ? 20 : 22, fontWeight: 900, color: '#0f172a', fontFamily: servicesDisplayFont || 'inherit', lineHeight: 1.05 }}>
                  Coming soon
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#475569' }}>
              DGFY will connect this booking flow to PayMongo soon. For now, you can still confirm your booking and wait for the merchant&apos;s payment instructions after confirmation.
            </div>
          </div>

          <div
            style={{
              border: '1px solid #e2e8f0',
              background: '#ffffff',
              borderRadius: 20,
              padding: isMobileViewport ? '14px 15px' : '16px 16px',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Booking total</span>
              <strong style={{ fontSize: 15, color: '#0f172a', fontFamily: servicesDisplayFont || 'inherit' }}>{money(bookingSummaryAmount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>Payment mode</span>
              <strong style={{ fontSize: 13, color: '#0f172a' }}>
                {servicePaymentTiming === 'deposit' ? 'Deposit' : 'Full payment'}
              </strong>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: 16,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
            }}
          >
            <CheckCircle2 size={18} color={servicesPrimary || '#0f766e'} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>Your booking flow will continue normally</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#64748b' }}>
                This notice only affects the payment interface. It does not stop your booking from being confirmed.
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowOnlinePaymentNotice(false)}
            style={{
              minHeight: isMobileViewport ? 38 : 44,
              borderRadius: 14,
              border: 'none',
              background: servicesPrimary || '#0f766e',
              color: '#fff',
              fontSize: isMobileViewport ? 13 : 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 12px 24px rgba(15, 118, 110, 0.18)',
            }}
          >
            Continue booking
          </button>
        </div>
      </div>
    ) : null}
    </>
  );
}
