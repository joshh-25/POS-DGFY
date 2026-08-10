import React from 'react';
import { CalendarDays } from 'lucide-react';
const formatShortDateWithYear = (dateString) => {
  if (!dateString) return '';
  const parsed = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

export function ServiceBookingDetailsForm({
  STYLES,
  BOOKING_FIELD_STYLE,
  StorefrontDropdown,
  registerBookingFieldRef,
  shouldBookingFieldSpanFullWidth,
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
  bookingStepOneAdditionalFields,
  serviceIntakeResponses,
  setServiceIntakeResponses,
  servicesPrimary,
}) {
  const compactFieldMinHeight = isMobileViewport ? 40 : 42;
  const compactFieldPadding = isMobileViewport ? '9px 40px 9px 11px' : '10px 42px 10px 12px';
  const extraFields = bookingStepOneAdditionalFields.filter(field => field.id !== 'special_instructions' && field.id !== 'instructions');

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: isMobileViewport ? 14 : 12,
            alignItems: 'end',
          }}
        >
          <label ref={registerBookingFieldRef('preferred_date')} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#334155' }}>2. Handoff Schedule</div>
            <div
              style={{
                ...BOOKING_FIELD_STYLE,
                marginTop: 0,
                minHeight: compactFieldMinHeight,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                position: 'relative',
              }}
            >
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
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  cursor: 'pointer',
                  flexShrink: 0,
                  color: selectedServiceDatePart ? STYLES.colors.dark : '#94a3b8',
                  fontWeight: selectedServiceDatePart ? 700 : 500,
                }}
              >
                <CalendarDays size={18} color={servicesPrimary} />
                <span>{selectedServiceDatePart ? formatShortDateWithYear(selectedServiceDatePart) : 'Pick a preferred date'}</span>
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
              {selectedServiceDatePart ? (
                <>
                  <span style={{ color: '#94a3b8' }}>,</span>
                  <div style={{ width: 'auto', minWidth: 0, flex: '1 1 auto' }}>
                    <StorefrontDropdown
                      value={selectedServiceTimePart}
                      disabled={bookingTimeSlotOptions.length === 0}
                      onChange={(nextValue) => setServiceAppointmentAt(combineDateAndTimeParts(selectedServiceDatePart, nextValue))}
                      options={bookingTimeSlotOptions.map((slot) => ({
                        value: slot.value,
                        label: slot.label,
                      }))}
                      placeholder={bookingTimeSlotOptions.length === 0 ? 'No suggested time slots available' : 'Select a time slot'}
                      triggerStyle={{ border: 'none', background: 'transparent', boxShadow: 'none', padding: '0 24px 0 0', minHeight: 'auto', color: STYLES.colors.dark, fontWeight: 700 }}
                      menuStyle={{ borderRadius: 18 }}
                      selectedLabelStyle={{ fontWeight: 700 }}
                    />
                  </div>
                </>
              ) : null}
            </div>
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
          ) : null}
        </div>

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
    </div>
  );
}
