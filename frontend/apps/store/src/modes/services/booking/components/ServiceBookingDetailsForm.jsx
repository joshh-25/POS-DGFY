import React from 'react';
import { CalendarDays, Minus, Plus } from 'lucide-react';

export function ServiceBookingDetailsForm({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  registerBookingFieldRef,
  shouldBookingFieldSpanFullWidth,
  formatLongDateLabel,
  combineDateAndTimeParts,
  getPreferredBookingTimeForDate,
  openPreferredBookingDatePicker,
  activeBookingService,
  isMobileViewport,
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
  servicesPrimary,
}) {
  const compactFieldMinHeight = isMobileViewport ? 40 : 42;
  const compactFieldPadding = isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px';
  const compactQuantityButtonSize = isMobileViewport ? 32 : 34;
  const extraFields = bookingStepOneAdditionalFields.filter(field => field.id !== 'special_instructions' && field.id !== 'instructions');

  return (
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

        {extraFields.length > 0 && (
          <section style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 13, fontWeight: 900, color: STYLES.colors.dark, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Additional Service Details</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Only fill in the extra details required for this service.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 16, alignItems: 'start' }}>
              {extraFields.map((field) => (
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
  );
}
