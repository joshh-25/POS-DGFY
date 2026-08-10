import React from 'react';
import { CalendarDays, CheckCircle2, Clock3, MapPin, MessageSquare, Truck } from 'lucide-react';
import { ServiceBookingDetailsForm } from './ServiceBookingDetailsForm.jsx';
import { ServiceBookingFulfillmentChoices } from './ServiceBookingFulfillmentChoices.jsx';
import { formatTimeSlotLabel } from '../model/serviceBookingSchedule.js';

const formatShortDateWithYear = (dateString) => {
  if (!dateString) return '';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ServiceBookingStepAccount({
  GhostButton,
  PrimaryButton,
  renderAccountOwnedIdentitySummary,
  renderGuestIdentityFields,
  renderGuestCheckoutEntry,
  bookingFieldPlan,
  activeBookingService,
  isMobileViewport,
  isDgfyCustomerSignedIn,
  canUseGuestCheckoutFlow,
  missingCustomerInformation,
  accountStepComplete,
  toast,
  onBack,
  setServiceBookingStep,
}) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
        <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 1: Customer Details</div>
          <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>
            Your account details are already linked. Review them here before continuing to fulfillment.
          </div>

          <div style={{ display: 'grid', gap: 12 }}>
            {isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({
              title: 'Customer Details',
              subtitle: 'We will use your signed-in DGFY account for this booking.',
            }) : renderGuestIdentityFields({
              title: 'Customer Details',
              subtitle: 'We will use these details for your booking.',
              requireEmail: bookingFieldPlan.emailField?.required === true,
              includeAddress: false,
              addressLabel: 'Service Address',
              addressPlaceholder: 'Use the map and saved-location picker in the next step.',
              addressRequired: false,
            })}
          </div>

          {missingCustomerInformation.length > 0 && (
            <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px', lineHeight: 1.6 }}>
              Complete the required customer details before continuing.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
            <GhostButton onClick={onBack} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
            <PrimaryButton
              onClick={() => {
                if (!accountStepComplete) {
                  toast.error(missingCustomerInformation[0] ? `Complete "${missingCustomerInformation[0]}" before continuing.` : 'Complete the required customer details before continuing.');
                  return;
                }
                setServiceBookingStep(2);
              }}
              style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}
            >
              Continue
            </PrimaryButton>
          </div>
        </section>
      ) : renderGuestCheckoutEntry({
        title: 'Continue to your booking',
        description: 'Create an account or continue as guest to continue this booking.',
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
  activeBookingService,
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
  serviceDraftQuantity,
  serviceIntakeResponses,
  serviceUnitType,
  servicesPrimary,
  servicesPrimaryShadow,
  setServiceAppointmentAt,
  setServiceDraftQuantity,
  setServiceIntakeResponses,
  setServiceUnitType,
  shouldBookingFieldSpanFullWidth,
  serviceOrderMethod,
  onOrderMethodChange,
  renderLocationSection,
  missingScheduleAndServiceInfo,
  fulfillmentStepComplete,
  toast,
  setServiceBookingStep,
}) {
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: servicesPrimary }}>Step 3: Fulfillment</div>
        <div style={{ marginTop: -4, fontSize: 12, color: STYLES.colors.muted }}>
          Choose how and when the customer will receive the order, then add the service details.
        </div>

        <ServiceBookingFulfillmentChoices
          isMobileViewport={isMobileViewport}
          onOrderMethodChange={onOrderMethodChange}
          serviceOrderMethod={serviceOrderMethod}
          servicesPrimary={servicesPrimary}
          servicesPrimaryShadow={servicesPrimaryShadow}
        />

        <ServiceBookingDetailsForm
          STYLES={STYLES}
          BOOKING_FIELD_STYLE={BOOKING_FIELD_STYLE}
          StorefrontDropdown={StorefrontDropdown}
          activeBookingService={activeBookingService}
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
          serviceDraftQuantity={serviceDraftQuantity}
          serviceIntakeResponses={serviceIntakeResponses}
          serviceUnitType={serviceUnitType}
          servicesPrimary={servicesPrimary}
          setServiceAppointmentAt={setServiceAppointmentAt}
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
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
          <GhostButton onClick={() => setServiceBookingStep(2)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
          <PrimaryButton
            onClick={() => {
              if (!fulfillmentStepComplete) {
                toast.error(missingScheduleAndServiceInfo[0] ? `Complete "${missingScheduleAndServiceInfo[0]}" before continuing.` : 'Complete the required fulfillment details before continuing.');
                return;
              }
              setServiceBookingStep(4);
            }}
            style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}
          >
            Continue
          </PrimaryButton>
        </div>
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
}) {
  const [showOnlinePaymentNotice, setShowOnlinePaymentNotice] = React.useState(false);
  const previousPaymentTimingRef = React.useRef(servicePaymentTiming);
  const hasShownOnlinePaymentNoticeRef = React.useRef(false);
  const paymentStepComplete = Boolean(servicePaymentTiming);
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

  const handoffLabel = serviceOrderMethod === 'pickup'
    ? "Pick up and I'll collect"
    : 'Pick up and deliver';
  const fulfillmentRows = [
    { icon: Truck, label: 'Handoff', value: handoffLabel },
    { icon: CalendarDays, label: 'Preferred date', value: selectedServiceDatePart ? formatShortDateWithYear(selectedServiceDatePart) : 'Not selected' },
    { icon: Clock3, label: 'Preferred time', value: selectedServiceTimePart ? formatTimeSlotLabel(selectedServiceTimePart) : 'Not selected' },
    { icon: MapPin, label: 'Delivery Address', value: serviceLocationSummaryDraft || 'Not selected' },
  ];
  const editSectionButtonStyle = { fontSize: 12, fontWeight: 700, color: servicesPrimary, background: '#fff', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 999, padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap' };

  return (
    <>
    <div style={{ display: 'grid', gap: 20 }}>
      <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: servicesPrimary || '#1a4e8d' }}>Step 4: Review and Payment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: STYLES.colors.muted }}>
        Review the fulfillment details, then choose how the service will be paid before you confirm the booking.
      </div>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: STYLES.colors.dark }}>Selected services</div>
        {groupedServiceLineItems.map((line, index) => (
          <div key={line.key} style={{ paddingTop: index === 0 ? 0 : 10, borderTop: index === 0 ? 'none' : '1px solid #eef2f7', display: 'grid', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{line.title}</span>
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

      <div style={{ display: 'grid', gap: 16 }}>
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
          <div style={{ display: 'grid', gap: 10, padding: '16px 18px', borderRadius: 18, border: '1px solid #dbeafe', background: '#eff6ff' }}>
            <div style={{ fontSize: 14, fontWeight: 900, color: '#1a4e8d' }}>
              Pay later selected
            </div>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#334155' }}>
              Payment will be collected during or after the scheduled service based on the merchant setup.
            </div>
          </div>
        ) : null}
      </div>
      {storefrontClosedByHours && storefrontClosedMessageBody ? (
        <div style={{ border: '1px solid #bfdbfe', background: '#eff6ff', color: servicesPrimary || '#1a4e8d', borderRadius: 14, padding: '12px 14px', display: 'grid', gap: 4 }}>
          <div style={{ fontSize: 13, fontWeight: 800 }}>{storefrontClosedTitle}</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{storefrontClosedMessageBody}</div>
        </div>
      ) : null}
      {checkoutError && <p style={{ margin: 0, fontSize: 13, color: '#b91c1c' }}>{checkoutError}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 12 }}>
        <GhostButton onClick={() => setServiceBookingStep(3)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
        <PrimaryButton
          onClick={() => {
            if (!paymentStepComplete) {
              toast.error('Select a payment method before confirming the booking.');
              return;
            }
            handleCheckout();
          }}
          style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}
        >
          Confirm Booking
        </PrimaryButton>
      </div>
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
