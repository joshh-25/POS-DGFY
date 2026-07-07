import React from 'react';
import { CalendarDays, CheckCircle2, Clock3, Minus, Plus, Trash2 } from 'lucide-react';

export function ServiceBookingStepOne({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  PrimaryButton,
  renderAccountOwnedIdentitySummary,
  renderGuestIdentityFields,
  renderGuestCheckoutEntry,
  registerBookingFieldRef,
  shouldBookingFieldSpanFullWidth,
  formatLongDateLabel,
  combineDateAndTimeParts,
  getPreferredBookingTimeForDate,
  openPreferredBookingDatePicker,
  activeBookingService,
  isMobileViewport,
  isDgfyCustomerSignedIn,
  canUseGuestCheckoutFlow,
  bookingFieldPlan,
  selectedServiceDatePart,
  bookingDateOptions,
  bookingPreferredDateInputRef,
  selectedServiceTimePart,
  bookingTimeSlotOptions,
  setServiceAppointmentAt,
  serviceUnitType,
  setServiceUnitType,
  serviceDraftQuantity,
  setServiceDraftQuantity,
  bookingStepOneAdditionalFields,
  serviceIntakeResponses,
  setServiceIntakeResponses,
  missingCustomerInformation,
  missingScheduleAndServiceInfo,
  missingStepOneAdditionalFields,
  stepOneComplete,
  servicesPrimary,
  servicesDisplayFont,
  toast,
  setServiceBookingStep,
  renderLocationSection,
}) {
  const compactFieldMinHeight = isMobileViewport ? 40 : 42;
  const compactFieldPadding = isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px';
  const compactQuantityButtonSize = isMobileViewport ? 32 : 34;

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {isDgfyCustomerSignedIn || canUseGuestCheckoutFlow ? (
        <>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Step 1: Service Information</div>
            <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
              Confirm who is booking, then set the schedule, service options, notes, and service location.
            </div>
          </div>

          <div style={{ display: 'grid', gap: 18 }}>
            <section style={{ display: 'grid', gap: 12 }}>
              {isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({
                title: 'Customer Details',
                subtitle: 'We will use your signed-in DGFY account for this booking.',
              }) : renderGuestIdentityFields({
                title: 'Customer Details',
                subtitle: 'We will use these details for your booking.',
                requireEmail: bookingFieldPlan.emailField?.required === true,
                includeAddress: false,
                addressLabel: 'Service Address',
                addressPlaceholder: 'Use the map and saved-location picker below.',
                addressRequired: false,
              })}
            </section>

            <section
              style={{
                display: 'grid',
                gap: 18,
                border: '1px solid #e2e8f0',
                borderRadius: 20,
                background: '#fff',
                padding: isMobileViewport ? 16 : 20,
                boxShadow: '0 18px 40px rgba(15, 23, 42, 0.04)',
              }}
            >
              <div style={{ display: 'grid', gap: 16 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: isMobileViewport ? '1fr' : '1.15fr 1.05fr 1fr 0.9fr',
                    gap: isMobileViewport ? 14 : 12,
                    alignItems: 'end',
                  }}
                >
                  <label ref={registerBookingFieldRef('preferred_date')} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Schedule *</div>
                    <div style={{ position: 'relative', minWidth: 0 }}>
                      <div
                        role="button"
                        tabIndex={0}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          openPreferredBookingDatePicker();
                        }}
                        onClick={openPreferredBookingDatePicker}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openPreferredBookingDatePicker();
                          }
                        }}
                        style={{
                          ...BOOKING_FIELD_STYLE,
                          marginTop: 0,
                          minHeight: compactFieldMinHeight,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                          color: selectedServiceDatePart ? STYLES.colors.dark : '#94a3b8',
                          fontWeight: selectedServiceDatePart ? 700 : 500,
                          cursor: 'pointer',
                        }}
                      >
                        <span>{selectedServiceDatePart ? formatLongDateLabel(selectedServiceDatePart) : 'Pick a preferred date'}</span>
                        <CalendarDays size={18} color={servicesPrimary} />
                      </div>
                      <input
                        ref={bookingPreferredDateInputRef}
                        type="date"
                        value={selectedServiceDatePart}
                        min={bookingDateOptions[0]?.value || undefined}
                        onChange={(event) => setServiceAppointmentAt(combineDateAndTimeParts(event.target.value, getPreferredBookingTimeForDate(activeBookingService, event.target.value, selectedServiceTimePart)))}
                        aria-hidden="true"
                        tabIndex={-1}
                        style={{ position: 'absolute', width: 1, height: 1, opacity: 0, pointerEvents: 'none', inset: 'auto' }}
                      />
                    </div>
                  </label>

                  <label ref={registerBookingFieldRef('preferred_time')} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Time *</div>
                    <StorefrontDropdown
                      value={selectedServiceTimePart}
                      disabled={!selectedServiceDatePart || bookingTimeSlotOptions.length === 0}
                      onChange={(nextValue) => setServiceAppointmentAt(combineDateAndTimeParts(selectedServiceDatePart, nextValue))}
                      options={bookingTimeSlotOptions.map((slot) => ({
                        value: slot.value,
                        label: slot.label,
                      }))}
                      placeholder={
                        !selectedServiceDatePart
                          ? 'Choose a date first'
                          : bookingTimeSlotOptions.length === 0
                            ? 'No suggested time slots available'
                            : 'Select a time slot'
                      }
                      triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: compactFieldPadding }}
                      menuStyle={{ borderRadius: 18 }}
                      selectedLabelStyle={{ fontWeight: selectedServiceDatePart && bookingTimeSlotOptions.length > 0 ? 700 : 500 }}
                    />
                  </label>

                  {bookingFieldPlan.unitTypeField ? (
                    <label ref={registerBookingFieldRef('unit_type')} style={{ display: 'grid', gap: 8, fontSize: 12, color: '#475569', minWidth: 0 }}>
                      {bookingFieldPlan.unitTypeField.label}{bookingFieldPlan.unitTypeField.required ? ' *' : ''}
                      {bookingFieldPlan.unitTypeField.type === 'select' ? (
                        <StorefrontDropdown
                          value={serviceUnitType}
                          onChange={setServiceUnitType}
                          options={bookingFieldPlan.unitTypeField.options.map((option) => ({ value: option, label: option }))}
                          placeholder="Select"
                          triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: compactFieldPadding }}
                          menuStyle={{ borderRadius: 18 }}
                        />
                      ) : (
                        <input value={serviceUnitType} onChange={(event) => setServiceUnitType(event.target.value)} placeholder="Specify the unit type" style={{ ...BOOKING_FIELD_STYLE, marginTop: 0, minHeight: compactFieldMinHeight, padding: isMobileViewport ? '9px 11px' : '10px 12px' }} />
                      )}
                    </label>
                  ) : <div />}

                  <label ref={registerBookingFieldRef('unit_count')} style={{ display: 'grid', gap: 8, fontSize: 12, color: '#475569', minWidth: 0 }}>
                    {bookingFieldPlan.unitCountField?.label || 'Number of Units'} *
                    <div
                      style={{
                        ...BOOKING_FIELD_STYLE,
                        marginTop: 0,
                        minHeight: compactFieldMinHeight,
                        padding: isMobileViewport ? '4px' : '5px',
                        display: 'grid',
                        gridTemplateColumns: `${compactQuantityButtonSize}px minmax(0, 1fr) ${compactQuantityButtonSize}px`,
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setServiceDraftQuantity(Math.max(1, Number(serviceDraftQuantity || 1) - 1))}
                        disabled={Number(serviceDraftQuantity || 1) <= 1}
                        aria-label="Decrease number of units"
                        style={{
                          width: '100%',
                          height: compactQuantityButtonSize,
                          borderRadius: 12,
                          border: '1px solid #dbe5ee',
                          background: Number(serviceDraftQuantity || 1) <= 1 ? '#f8fafc' : '#fff',
                          color: Number(serviceDraftQuantity || 1) <= 1 ? '#94a3b8' : STYLES.colors.dark,
                          display: 'grid',
                          placeItems: 'center',
                          cursor: Number(serviceDraftQuantity || 1) <= 1 ? 'not-allowed' : 'pointer',
                        }}
                      >
                        <Minus size={16} />
                      </button>
                      <div
                        aria-live="polite"
                        style={{
                          minWidth: 0,
                          textAlign: 'center',
                          fontSize: isMobileViewport ? 14 : 15,
                          fontWeight: 800,
                          color: STYLES.colors.dark,
                        }}
                      >
                        {Math.max(1, Number(serviceDraftQuantity || 1))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setServiceDraftQuantity(Math.max(1, Number(serviceDraftQuantity || 1) + 1))}
                        aria-label="Increase number of units"
                        style={{
                          width: '100%',
                          height: compactQuantityButtonSize,
                          borderRadius: 12,
                          border: '1px solid #dbe5ee',
                          background: '#fff',
                          color: STYLES.colors.dark,
                          display: 'grid',
                          placeItems: 'center',
                          cursor: 'pointer',
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                  </label>
                </div>

                <label
                  ref={registerBookingFieldRef('special_instructions')}
                  style={{ display: 'grid', gap: 8, minWidth: 0 }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>Additional Instructions</div>
                  <textarea
                    value={serviceIntakeResponses.special_instructions || serviceIntakeResponses.instructions || ''}
                    onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, special_instructions: event.target.value }))}
                    placeholder="Input here your instructions"
                    style={{ ...BOOKING_FIELD_STYLE, minHeight: 84, marginTop: 0, resize: 'vertical', padding: isMobileViewport ? '10px 11px' : '11px 12px' }}
                  />
                </label>

                {bookingStepOneAdditionalFields.filter(field => field.id !== 'special_instructions' && field.id !== 'instructions').length > 0 && (
                  <section
                    style={{
                      display: 'grid',
                      gap: 14,
                    }}
                  >
                    <div style={{ display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Additional Service Details</div>
                      <div style={{ fontSize: 12, color: '#64748b' }}>Only fill in the extra details required for this service.</div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
                      {bookingStepOneAdditionalFields
                        .filter(field => field.id !== 'special_instructions' && field.id !== 'instructions')
                        .map((field) => (
                        <label
                          ref={registerBookingFieldRef(`intake_${field.id}`)}
                          key={`booking-step-one-${field.id}`}
                          style={{
                            display: 'block',
                            fontSize: 12,
                            color: '#475569',
                            minWidth: 0,
                            gridColumn: !isMobileViewport && shouldBookingFieldSpanFullWidth(field) ? '1 / -1' : 'auto',
                          }}
                        >
                          {field.label}{field.required ? ' *' : ''}
                          {field.type === 'textarea' ? (
                            <textarea value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={{ ...BOOKING_FIELD_STYLE, minHeight: 84, resize: 'vertical', padding: isMobileViewport ? '10px 11px' : '11px 12px' }} />
                          ) : field.type === 'select' ? (
                            <StorefrontDropdown
                              value={serviceIntakeResponses[field.id] || ''}
                              onChange={(nextValue) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: nextValue }))}
                              options={field.options.map((option) => ({ value: option, label: option }))}
                              placeholder="Select"
                              triggerStyle={{ ...BOOKING_FIELD_STYLE, marginTop: 6, minHeight: compactFieldMinHeight, padding: isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px' }}
                              menuStyle={{ borderRadius: 18 }}
                            />
                          ) : field.type === 'checkbox' ? (
                            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10, padding: isMobileViewport ? '10px 11px' : '11px 12px', border: '1px solid #cbd5e1', borderRadius: 14, background: '#fff' }}>
                              <input type="checkbox" checked={serviceIntakeResponses[field.id] === true} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.checked }))} />
                              <span style={{ fontSize: 13, color: STYLES.colors.text }}>Confirm</span>
                            </div>
                          ) : (
                            <input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} value={serviceIntakeResponses[field.id] || ''} onChange={(event) => setServiceIntakeResponses((previous) => ({ ...previous, [field.id]: event.target.value }))} style={BOOKING_FIELD_STYLE} />
                          )}
                        </label>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            </section>

            {typeof renderLocationSection === 'function' ? renderLocationSection() : null}
          </div>

          {(missingCustomerInformation.length > 0 || missingScheduleAndServiceInfo.length > 0 || missingStepOneAdditionalFields.length > 0) && (
            <div style={{ fontSize: 13, color: '#b91c1c', border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 14, padding: '10px 12px', lineHeight: 1.6 }}>
              Complete the required customer, schedule, and service details before continuing.
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <PrimaryButton
              onClick={() => {
                const firstMissingField = missingCustomerInformation[0]
                  || missingScheduleAndServiceInfo[0]
                  || missingStepOneAdditionalFields[0]?.label
                  || '';
                if (!stepOneComplete) {
                  toast.error(firstMissingField ? `Complete "${firstMissingField}" before continuing.` : 'Complete the required booking details before continuing.');
                  return;
                }
                setServiceBookingStep(2);
              }}
              style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}
            >
              Continue
            </PrimaryButton>
          </div>
        </>
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

export function ServiceBookingStepTwo({
  STYLES,
  GhostButton,
  PrimaryButton,
  isMobileViewport,
  servicesPrimary,
  servicesDisplayFont,
  reviewServiceLines,
  reviewSections,
  jumpToBookingField,
  selectedLocation,
  setServiceBookingStep,
}) {
  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: servicesPrimary || '#1a4e8d', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Step 2: Review Booking</div>
        <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
          Review the selected services and booking details before you choose the payment method.
        </div>
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {reviewServiceLines.map((line) => (
          <section key={line.key} style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fcfdff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark }}>{line.title}</div>
              <GhostButton onClick={() => jumpToBookingField(1, line.editFieldKey || 'unit_count')} style={{ minHeight: isMobileViewport ? 34 : 36, padding: '0 12px' }}>
                Edit service
              </GhostButton>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {line.rows.map((row) => (
                <div key={`${line.key}-${row.label}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(140px, 180px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                  <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.55, wordBreak: 'break-word' }}>{row.value}</div>
                  <button
                    type="button"
                    onClick={() => jumpToBookingField(1, row.fieldKey)}
                    style={{ border: 'none', background: 'transparent', color: '#1a4e8d', fontWeight: 800, cursor: 'pointer', padding: 0, justifySelf: isMobileViewport ? 'start' : 'end' }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}

        {reviewSections.map((section) => (
          <section key={section.title} style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fcfdff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark }}>{section.title}</div>
              <GhostButton onClick={() => jumpToBookingField(section.step, section.rows[0]?.fieldKey || '')} style={{ minHeight: isMobileViewport ? 34 : 36, padding: '0 12px' }}>
                Edit section
              </GhostButton>
            </div>
            <div style={{ display: 'grid', gap: 10 }}>
              {section.rows.map((row) => (
                <div key={`${section.title}-${row.label}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(140px, 180px) minmax(0, 1fr) auto', gap: 10, alignItems: 'center', paddingTop: 10, borderTop: '1px solid #edf2f7' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</div>
                  <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.55, wordBreak: 'break-word' }}>{row.value}</div>
                  <button
                    type="button"
                    onClick={() => jumpToBookingField(section.step, row.fieldKey)}
                    style={{ border: 'none', background: 'transparent', color: '#1a4e8d', fontWeight: 800, cursor: 'pointer', padding: 0, justifySelf: isMobileViewport ? 'start' : 'end' }}
                  >
                    Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}

        {selectedLocation ? (
          <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fcfdff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 15, fontWeight: 900, color: STYLES.colors.dark }}>Service Location</div>
              <GhostButton onClick={() => setServiceBookingStep(1)} style={{ minHeight: isMobileViewport ? 34 : 36, padding: '0 12px' }}>
                Edit location
              </GhostButton>
            </div>
            <div style={{ fontSize: 14, color: '#0f172a', lineHeight: 1.6 }}>
              {selectedLocation.address || 'No location selected yet.'}
            </div>
          </section>
        ) : null}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <GhostButton onClick={() => setServiceBookingStep(1)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
        <PrimaryButton onClick={() => setServiceBookingStep(3)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>
          Continue
        </PrimaryButton>
      </div>
    </div>
  );
}

export function ServiceBookingStepThree({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  GhostButton,
  PrimaryButton,
  servicesPrimary,
  money,
  registerBookingFieldRef,
  isMobileViewport,
  servicePaymentTiming,
  setServicePaymentTiming,
  bookingPagePaymentOptions,
  servicePaymentPreviewMethod,
  setServicePaymentPreviewMethod,
  bookingSummaryAmount,
  servicePaymentPreviewReceiptName,
  setServicePaymentPreviewReceiptName,
  servicePaymentPreviewCard,
  setServicePaymentPreviewCard,
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

  return (
    <>
    <div style={{ display: 'grid', gap: 18 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 900, color: servicesPrimary || '#1a4e8d', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Step 3: Payment</div>
        <div style={{ marginTop: 4, fontSize: 13, color: STYLES.colors.muted }}>
          Choose how the service will be paid before you confirm the booking.
        </div>
      </div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <GhostButton onClick={() => setServiceBookingStep(2)} style={{ minHeight: isMobileViewport ? 38 : 44, fontSize: isMobileViewport ? 14 : 15 }}>Back</GhostButton>
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
              DGFY will connect this booking flow to PayMongo soon. For now, you can still confirm your booking and wait for the merchant's payment instructions after confirmation.
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
