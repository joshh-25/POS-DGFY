import React from 'react';
import { CalendarDays, CheckCircle2, Clock3, MapPin, MessageSquare, Truck } from 'lucide-react';
import { ServiceBookingDetailsForm } from './ServiceBookingDetailsForm.jsx';
import { ServiceBookingFulfillmentChoices } from './ServiceBookingFulfillmentChoices.jsx';
import { ServiceBookingStepActions } from './ServiceBookingStepActions.jsx';
import { ServiceBookingGuestEmailVerification } from './ServiceBookingGuestEmailVerification.jsx';
import { ServiceImage } from '../../ServiceImage.jsx';
import { formatTimeSlotLabel, SERVICE_BOOKING_NOT_SELECTED_LABEL } from '../model/serviceBookingSchedule.js';
import { getServicesFlowPresentation, getServicesLocalFlowDefinition, isServicesQuoteFlow } from '../model/servicesLocalFlow.js';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

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
          <div style={{ fontSize: referenceStyle ? 20 : 18, fontWeight: referenceStyle ? 700 : 800, color: '#101010', fontFamily: servicesDisplayFont || 'inherit' }}>Customer details</div>
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
  serviceFlowMethod,
  serviceFlowProfileMethod,
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
  const normalizedFlowMethod = String(serviceFlowMethod || '').trim().toLowerCase();
  const normalizedProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const isOnSiteFlow = normalizedFlowMethod === 'on_site' || normalizedProfileMethod === 'on_site';
  const serviceCalendarKey = `${normalizedFlowMethod || normalizedProfileMethod || 'default'}-${activeBookingService?.cart_line_id || activeBookingService?.item_id || 'none'}`;
  const renderDetailsForm = () => (
    <ServiceBookingDetailsForm
      key={isOnSiteFlow ? `on-site-calendar-${serviceCalendarKey}` : `service-flow-${serviceCalendarKey}`}
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
      serviceScheduleMode={serviceScheduleMode}
      serviceFlowMethod={serviceFlowMethod}
      serviceFlowProfileMethod={serviceFlowProfileMethod}
      selectedServiceDatePart={selectedServiceDatePart}
      selectedServiceTimePart={selectedServiceTimePart}
      serviceDraftQuantity={serviceDraftQuantity}
      serviceIntakeResponses={serviceIntakeResponses}
      serviceUnitType={serviceUnitType}
      servicesPrimary={servicesPrimary}
      servicesPrimarySoft={servicesPrimarySoft}
      servicesPrimaryBorder={servicesPrimaryBorder}
      servicesPrimaryShadow={servicesPrimaryShadow}
      servicesDisplayFont={servicesDisplayFont}
      setServiceAppointmentAt={setServiceAppointmentAt}
      setServiceScheduleMode={setServiceScheduleMode}
      setServiceDraftQuantity={setServiceDraftQuantity}
      setServiceIntakeResponses={setServiceIntakeResponses}
      setServiceUnitType={setServiceUnitType}
      shouldBookingFieldSpanFullWidth={shouldBookingFieldSpanFullWidth}
    />
  );
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={panelStyle}>
        <div style={{ fontSize: referenceStyle ? 20 : 18, fontWeight: referenceStyle ? 700 : 800, color: '#101010', fontFamily: servicesDisplayFont || 'inherit' }}>
          {isOnSiteFlow ? 'Service time and location' : 'Fulfillment'}
        </div>
        <div style={{ marginTop: -4, fontSize: 12, color: STYLES.colors.muted }}>
          {isOnSiteFlow
            ? 'Choose a service visit time, then provide the address where the work will be completed.'
            : 'Choose how and when the customer will receive the order, then add the service details.'}
        </div>

        {!isOnSiteFlow ? (
          <ServiceBookingFulfillmentChoices
            isMobileViewport={isMobileViewport}
            onOrderMethodChange={onOrderMethodChange}
            serviceOrderMethod={serviceOrderMethod}
            serviceFlowMethod={serviceFlowMethod}
            serviceFlowProfileMethod={serviceFlowProfileMethod}
            servicesPrimary={servicesPrimary}
            servicesPrimarySoft={servicesPrimarySoft}
            servicesPrimaryBorder={servicesPrimaryBorder}
            servicesPrimaryShadow={servicesPrimaryShadow}
            servicesDisplayFont={servicesDisplayFont}
          />
        ) : null}

        {isOnSiteFlow ? (
          <div data-testid="on-site-fulfillment-sections" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: referenceStyle ? 28 : 14, alignItems: 'stretch' }}>
            <div style={{ minWidth: 0 }}>{renderDetailsForm()}</div>
            <div style={{ minWidth: 0 }}>{typeof renderLocationSection === 'function' ? renderLocationSection({ compactLayout: false }) : null}</div>
          </div>
        ) : (
          <>
            {renderDetailsForm()}
            {typeof renderLocationSection === 'function' ? renderLocationSection() : null}
          </>
        )}

        <ServiceBookingStepActions
          GhostButton={GhostButton}
          PrimaryButton={PrimaryButton}
          primaryButtonProps={primaryButtonProps}
          isMobileViewport={isMobileViewport}
          referenceStyle={referenceStyle}
          onBack={() => setServiceBookingStep(2)}
          onContinue={() => {
            if (!fulfillmentStepComplete) {
              toast.error(missingScheduleAndServiceInfo[0] ? `Complete "${missingScheduleAndServiceInfo[0]}" before continuing.` : 'Complete the required fulfillment details before continuing.');
              return;
            }
            syncServiceBookingDraft(activeBookingService);
            setServiceBookingStep(4);
          }}
        />
      </section>
    </div>
  );
}

export function ServiceBookingStepReviewPayment({
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
  serviceFlowMethod,
  serviceFlowProfileMethod,
  serviceLocationSummaryDraft,
  selectedLocation,
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
  const normalizedServiceOrderMethod = String(serviceOrderMethod || '').trim().toLowerCase();
  const normalizedServiceFlowMethod = String(serviceFlowMethod || normalizedServiceOrderMethod || '').trim().toLowerCase();
  const normalizedServiceProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const resolvedReviewFlowMethod = normalizedServiceFlowMethod || normalizedServiceProfileMethod;
  const isQuoteFlow = isServicesQuoteFlow(normalizedServiceOrderMethod);
  const isAppointmentFlow = normalizedServiceFlowMethod === 'appointment' || normalizedServiceProfileMethod === 'appointment';
  const isCustomerAddressFlow = normalizedServiceFlowMethod === 'on_site' || normalizedServiceProfileMethod === 'on_site';
  const isOnlineFlow = normalizedServiceFlowMethod === 'online' || normalizedServiceProfileMethod === 'online';
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

  const hasSelectedServiceFlow = Boolean(normalizedServiceOrderMethod || resolvedReviewFlowMethod);
  const serviceFlow = resolvedReviewFlowMethod ? getServicesLocalFlowDefinition(resolvedReviewFlowMethod) : null;
  // AC/on-site has a profile-defined flow instead of a customer-selectable
  // handoff. Use the resolved flow as the display source so its review value
  // is populated even when serviceOrderMethod is intentionally empty.
  const flowPresentation = hasSelectedServiceFlow
    ? getServicesFlowPresentation(resolvedReviewFlowMethod || normalizedServiceOrderMethod)
    : null;
  const handoffLabel = flowPresentation?.label || SERVICE_BOOKING_NOT_SELECTED_LABEL;
  const branchLabel = String(selectedLocation?.name || selectedLocation?.label || selectedLocation?.address_line || '').trim() || SERVICE_BOOKING_NOT_SELECTED_LABEL;
  const profileFlowLabel = normalizedServiceProfileMethod === 'hybrid'
    ? 'Service location'
    : (isOnlineFlow ? 'Service type' : (isAppointmentFlow ? 'Booking type' : (isCustomerAddressFlow ? 'Service type' : 'Service flow')));
  const profileFlowIcon = isOnlineFlow || isAppointmentFlow ? CalendarDays : (isCustomerAddressFlow ? MapPin : Truck);
  const fulfillmentRows = [
    { icon: profileFlowIcon, label: profileFlowLabel, value: handoffLabel },
    { icon: CalendarDays, label: 'Preferred date', value: selectedServiceDatePart ? formatShortDateWithYear(selectedServiceDatePart) : SERVICE_BOOKING_NOT_SELECTED_LABEL },
    { icon: Clock3, label: 'Preferred time', value: selectedServiceTimePart ? formatTimeSlotLabel(selectedServiceTimePart) : SERVICE_BOOKING_NOT_SELECTED_LABEL },
    ...(serviceFlow?.requiresBranch ? [{ icon: MapPin, label: 'Branch', value: branchLabel }] : []),
    ...(serviceFlow?.requiresAddress ? [{ icon: MapPin, label: isCustomerAddressFlow ? 'Service address' : 'Pickup address', value: serviceLocationSummaryDraft || SERVICE_BOOKING_NOT_SELECTED_LABEL }] : []),
  ];
  const editSectionButtonStyle = { fontSize: 12, fontWeight: 700, color: SERVICES_PALETTE.primary, background: SERVICES_PALETTE.surface, border: `1px solid ${SERVICES_PALETTE.primaryBorder}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <>
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: referenceStyle ? 18 : 16, background: SERVICES_PALETTE.surface, padding: referenceStyle ? (isMobileViewport ? 22 : 32) : (isMobileViewport ? 14 : 18), display: 'grid', gap: referenceStyle ? 24 : 14 }}>
      <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
        Payment
      </div>
      {!isQuoteFlow ? <div style={{ display: 'grid', gap: 16 }}>
        <label ref={registerBookingFieldRef('payment_timing')} style={{ display: 'block', width: '100%', fontSize: 12, color: SERVICES_PALETTE.textSecondary, minWidth: 0, maxWidth: '100%' }}>
          Payment method
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
            <div style={{ fontSize: 14, fontWeight: 900, color: servicesPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
              Pay later
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: SERVICES_PALETTE.textSecondary }}>
              Payment is collected during or after your service, based on the merchant&apos;s setup.
            </div>
          </div>
        ) : null}
      </div> : (
        <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: servicesPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>Quote request</div>
          <div style={{ fontSize: 13, lineHeight: 1.7, color: SERVICES_PALETTE.textSecondary }}>No payment is required now. The business will review your request and send pricing details.</div>
        </div>
      )}
      </div>

      <div style={{ display: 'grid', gap: 14, paddingTop: 8, borderTop: `1px solid ${SERVICES_PALETTE.border}` }}>
      <div style={{ fontSize: 15, fontWeight: 900, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
        Review your booking
      </div>
      <section style={{ border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: 20, background: SERVICES_PALETTE.surface, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>Your services</div>
        {groupedServiceLineItems.map((line, index) => (
          <div key={line.key} style={{ paddingTop: index === 0 ? 0 : 10, borderTop: index === 0 ? 'none' : `1px solid ${SERVICES_PALETTE.border}`, display: 'grid', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, overflow: 'hidden', background: SERVICES_PALETTE.page, border: `1px solid ${servicesPrimaryBorder}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                  <ServiceImage imageSources={line.imageSources} alt={line.title} sizes="36px" width={36} height={36} fallbackLabel="" />
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: SERVICES_PALETTE.textPrimary }}>{line.title}</span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 800, color: SERVICES_PALETTE.textMuted, whiteSpace: 'nowrap' }}>{formatServiceNumber(line.quantity)}x</span>
            </div>
            {line.variant ? <div style={{ fontSize: 12, color: SERVICES_PALETTE.textMuted }}>{line.variant}</div> : null}
            {(line.addOns || []).map((addOn) => (
              <div key={addOn.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <span style={{ fontSize: 12, color: servicesPrimary }}>+ {addOn.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: servicesPrimary, whiteSpace: 'nowrap' }}>{addOn.amount}</span>
              </div>
            ))}
          </div>
        ))}
      </section>

      <section style={{ border: `1px solid ${SERVICES_PALETTE.primaryBorder}`, background: SERVICES_PALETTE.primarySoft, borderRadius: 20, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
            {isMobileViewport
              ? (isAppointmentFlow ? 'Appointment details' : (isCustomerAddressFlow ? 'Service details' : 'Fulfillment information'))
              : 'Fulfillment Information'}
          </div>
          <button type="button" onClick={() => setServiceBookingStep(3)} style={editSectionButtonStyle}>Edit section</button>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {fulfillmentRows.map((row) => {
            const RowIcon = row.icon;

            return (
              <div key={row.label} style={isMobileViewport
                ? { display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr)', alignItems: 'start', gap: 12, minWidth: 0 }
                : { display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                <div style={{ width: 30, height: 30, borderRadius: 9, background: SERVICES_PALETTE.surface, border: `1px solid ${SERVICES_PALETTE.primaryBorder}`, display: 'grid', placeItems: 'center', color: SERVICES_PALETTE.primary, flexShrink: 0 }}>
                  <RowIcon size={15} />
                </div>
                <div style={isMobileViewport
                  ? { minWidth: 0, display: 'grid', alignContent: 'start', gap: 4 }
                  : { minWidth: 0, display: 'flex', flex: 1, justifyContent: 'space-between', gap: 12, flexWrap: 'nowrap' }}>
                  <span style={{ fontSize: 12, lineHeight: 1.35, color: SERVICES_PALETTE.textMuted }}>{row.label}</span>
                  <span style={{ fontSize: 13, lineHeight: 1.45, fontWeight: 700, color: SERVICES_PALETTE.textPrimary, textAlign: isMobileViewport ? 'left' : 'right', overflowWrap: 'anywhere' }}>{row.value}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: 20, background: SERVICES_PALETTE.surface, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
            {isMobileViewport && isCustomerAddressFlow ? 'Service add-ons and instructions' : 'Additional Instructions'}
          </div>
          <button type="button" onClick={() => setServiceBookingStep(2)} style={editSectionButtonStyle}>Edit section</button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: SERVICES_PALETTE.primarySoft, border: `1px solid ${SERVICES_PALETTE.primaryBorder}`, display: 'grid', placeItems: 'center', color: SERVICES_PALETTE.primary, flexShrink: 0 }}>
            <MessageSquare size={15} />
          </div>
          <div style={{ minWidth: 0, display: 'flex', flex: 1, justifyContent: 'space-between', gap: 12, flexWrap: isMobileViewport ? 'wrap' : 'nowrap' }}>
            <span style={{ fontSize: 12, color: SERVICES_PALETTE.textMuted }}>Special instructions (optional)</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: SERVICES_PALETTE.textPrimary, textAlign: 'right', wordBreak: 'break-word' }}>{specialInstructions || 'Not provided'}</span>
          </div>
        </div>
      </section>
      </div>

      {storefrontClosedByHours && storefrontClosedMessageBody ? (
        <div style={{ border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, color: servicesPrimary, borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800, fontFamily: servicesDisplayFont || 'inherit' }}>{storefrontClosedTitle}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{storefrontClosedMessageBody}</div>
        </div>
      ) : null}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: SERVICES_PALETTE.error }}>{checkoutError}</p>}
      <ServiceBookingStepActions
        GhostButton={GhostButton}
        PrimaryButton={PrimaryButton}
        primaryButtonProps={primaryButtonProps}
        isMobileViewport={isMobileViewport}
        referenceStyle={referenceStyle}
        onBack={() => setServiceBookingStep(3)}
        onContinue={() => {
          if (!paymentStepComplete) {
            toast.error(isQuoteFlow ? 'Review the quote request before continuing.' : 'Select a payment method before confirming the booking.');
            return;
          }
          handleCheckout();
        }}
        continueLabel={isQuoteFlow ? 'Send quote request' : (isAppointmentFlow ? 'Confirm appointment' : 'Confirm booking')}
      />
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
            border: `1px solid ${SERVICES_PALETTE.primaryBorder}`,
            background: SERVICES_PALETTE.surface,
            boxShadow: SERVICES_PALETTE.modalShadow,
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
              background: `linear-gradient(135deg, ${SERVICES_PALETTE.primaryLight}66 0%, ${SERVICES_PALETTE.primarySoft} 100%)`,
              borderBottom: `1px solid ${SERVICES_PALETTE.primaryBorder}`,
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
                  background: SERVICES_PALETTE.surface,
                  color: servicesPrimary || SERVICES_PALETTE.primary,
                  display: 'grid',
                  placeItems: 'center',
                  boxShadow: SERVICES_PALETTE.cardShadow,
                  flexShrink: 0,
                }}
              >
                <Clock3 size={18} />
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 11, fontWeight: 900, color: servicesPrimary || SERVICES_PALETTE.primary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Online payment
                </div>
                <div style={{ fontSize: isMobileViewport ? 20 : 22, fontWeight: 900, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit', lineHeight: 1.05 }}>
                  Coming soon
                </div>
              </div>
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: SERVICES_PALETTE.textSecondary }}>
              DGFY will connect this booking flow to PayMongo soon. For now, you can still confirm your booking and wait for the merchant&apos;s payment instructions after confirmation.
            </div>
          </div>

          <div
            style={{
              border: `1px solid ${SERVICES_PALETTE.border}`,
              background: SERVICES_PALETTE.surface,
              borderRadius: 20,
              padding: isMobileViewport ? '14px 15px' : '16px 16px',
              display: 'grid',
              gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: SERVICES_PALETTE.textMuted }}>Booking total</span>
              <strong style={{ fontSize: 15, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>{money(bookingSummaryAmount)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: SERVICES_PALETTE.textMuted }}>Payment method</span>
              <strong style={{ fontSize: 13, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>
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
              background: SERVICES_PALETTE.primarySoft,
              border: `1px solid ${SERVICES_PALETTE.primaryBorder}`,
            }}
          >
            <CheckCircle2 size={18} color={servicesPrimary || SERVICES_PALETTE.primary} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont || 'inherit' }}>Your booking flow will continue normally</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, color: SERVICES_PALETTE.textMuted }}>
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
              background: servicesPrimary || SERVICES_PALETTE.primary,
              color: '#fff',
              fontSize: isMobileViewport ? 13 : 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: SERVICES_PALETTE.primaryShadow,
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
