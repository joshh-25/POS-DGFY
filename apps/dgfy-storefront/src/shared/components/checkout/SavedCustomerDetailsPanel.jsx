import { CustomerIdentityCard } from './CustomerIdentityCard.jsx';
import {
  GUEST_CHECKOUT_FONT_FAMILY,
  GUEST_CHECKOUT_SAVED_DETAILS_TITLE,
  getGuestCheckoutTypography
} from './guestCheckoutTypography.js';

export function SavedCustomerDetailsPanel({
  title = GUEST_CHECKOUT_SAVED_DETAILS_TITLE,
  customerName = '',
  customerEmail = '',
  customerPhone = '',
  hasSavedCustomerDetails = false,
  isEditing = false,
  isMobileViewport = false,
  feedback = null,
  onUseDifferentDetails,
  onCancelEdit,
  onApplyEdit,
  applyLabel = 'Apply Details',
  children = null
}) {
  if (!hasSavedCustomerDetails && !isEditing) {
    return null;
  }

  const typography = getGuestCheckoutTypography(isMobileViewport);

  return (
    <section
      style={{
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        padding: 0,
        display: 'grid',
        gap: 16,
        fontFamily: GUEST_CHECKOUT_FONT_FAMILY
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ ...typography.savedDetailsTitle, color: '#0f172a' }}>{title}</div>
        {feedback?.message ? (
          <div
            style={{
              ...typography.helper,
              borderRadius: 12,
              padding: '8px 10px',
              border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#bfdbfe'}`,
              background: feedback.type === 'error' ? '#fff1f2' : '#eff6ff',
              color: feedback.type === 'error' ? '#b91c1c' : '#1d4ed8'
            }}
          >
            {feedback.message}
          </div>
        ) : null}
      </div>

      {!isEditing ? (
        <>
          <CustomerIdentityCard
            title={title}
            subtitle=""
            showVerifiedBadge={false}
            name={customerName || 'Guest customer'}
            phone={customerPhone}
            email={customerEmail}
            isMobileViewport={isMobileViewport}
            bodyFont={GUEST_CHECKOUT_FONT_FAMILY}
            displayFont={GUEST_CHECKOUT_FONT_FAMILY}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'flex-end',
              gap: 8
            }}
          >
            <button
              type="button"
              onClick={onUseDifferentDetails}
              style={{
                border: 'none',
                background: 'transparent',
                color: '#1a4e8d',
                ...typography.helper,
                fontWeight: 600,
                fontFamily: GUEST_CHECKOUT_FONT_FAMILY,
                cursor: 'pointer',
                padding: 0
              }}
            >
              Not you? Use different details
            </button>
          </div>
        </>
      ) : (
        <>
          {children}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: isMobileViewport ? 'nowrap' : 'wrap' }}>
            <button
              type="button"
              onClick={onCancelEdit}
              style={{
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                padding: '0 14px',
                ...typography.action,
                fontWeight: 700,
                fontFamily: GUEST_CHECKOUT_FONT_FAMILY,
                cursor: 'pointer',
                flex: isMobileViewport ? 1 : undefined
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApplyEdit}
              style={{
                minHeight: 44,
                borderRadius: 12,
                border: '1px solid #1a4e8d',
                background: '#1a4e8d',
                color: '#fff',
                padding: '0 14px',
                ...typography.action,
                fontWeight: 700,
                fontFamily: GUEST_CHECKOUT_FONT_FAMILY,
                cursor: 'pointer',
                flex: isMobileViewport ? 1 : undefined
              }}
            >
              {applyLabel}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
