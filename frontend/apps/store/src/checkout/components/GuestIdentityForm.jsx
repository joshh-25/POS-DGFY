import React from 'react';

export function GuestIdentityForm({
  title = 'Guest Details',
  subtitle = 'Use guest checkout now, or create a DGFY account later with these same details.',
  requireEmail = false,
  includeAddress = false,
  showSingleNameField = false,
  addressLabel = 'Delivery Address',
  addressPlaceholder = 'House no., street, barangay, landmark',
  addressRequired = false,
  customerName = '',
  firstName = '',
  lastName = '',
  phone = '',
  email = '',
  address = '',
  onCustomerNameChange,
  onFirstNameChange,
  onLastNameChange,
  onPhoneChange,
  onEmailChange,
  onAddressChange,
  isMobileViewport = false,
  autoFocusFirstField = false,
  firstFieldFocusKey = '',
  footer = null,
  embedded = false
}) {
  const firstInputRef = React.useRef(null);

  React.useEffect(() => {
    if (!autoFocusFirstField) return;
    if (!firstInputRef.current) return;
    const timerId = window.setTimeout(() => {
      firstInputRef.current?.focus?.();
      firstInputRef.current?.select?.();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [autoFocusFirstField, firstFieldFocusKey]);

  const content = (
    <>
      {title || subtitle ? (
        <div style={{ display: 'grid', gap: 4 }}>
          {title ? <div style={{ fontSize: 15, fontWeight: 900, color: '#0f172a' }}>{title}</div> : null}
          {subtitle ? <div style={{ fontSize: 12, color: '#64748b' }}>{subtitle}</div> : null}
        </div>
      ) : null}
      <div style={{ display: 'grid', gap: 14 }}>
        {showSingleNameField ? (
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
            Customer Name *
            <input
              ref={firstInputRef}
              value={customerName}
              onChange={(event) => onCustomerNameChange?.(event.target.value)}
              placeholder="Enter your full name"
              style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', background: '#fff' }}
            />
          </label>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
              First Name *
              <input
                ref={firstInputRef}
                value={firstName}
                onChange={(event) => onFirstNameChange?.(event.target.value)}
                placeholder="Enter first name"
                style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', background: '#fff' }}
              />
            </label>
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
              Last Name *
              <input
                value={lastName}
                onChange={(event) => onLastNameChange?.(event.target.value)}
                placeholder="Enter last name"
                style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', background: '#fff' }}
              />
            </label>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))', gap: 14 }}>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
            Phone Number *
            <input
              value={phone}
              onChange={(event) => onPhoneChange?.(event.target.value)}
              placeholder="Mobile number"
              style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', background: '#fff' }}
            />
          </label>
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
            Email{requireEmail ? ' *' : ''}
            <input
              value={email}
              onChange={(event) => onEmailChange?.(event.target.value)}
              placeholder="For tickets and updates"
              style={{ minHeight: 44, border: '1px solid #cbd5e1', borderRadius: 12, padding: '10px 12px', background: '#fff' }}
            />
          </label>
        </div>
        {includeAddress ? (
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
            {addressLabel}{addressRequired ? ' *' : ''}
            <textarea
              value={address}
              onChange={(event) => onAddressChange?.(event.target.value)}
              placeholder={addressPlaceholder}
              rows={3}
              style={{ minHeight: 92, border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical' }}
            />
          </label>
        ) : null}
        {footer}
      </div>
    </>
  );

  if (embedded) {
    return <div style={{ display: 'grid', gap: 14 }}>{content}</div>;
  }

  return (
    <section style={{ border: '1px solid #dbe5ee', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 14 }}>
      {content}
    </section>
  );
}
