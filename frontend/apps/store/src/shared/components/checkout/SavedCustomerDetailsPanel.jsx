import { CustomerIdentityCard } from './CustomerIdentityCard.jsx';

export function SavedCustomerDetailsPanel({
  title = 'Customer Details',
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

  return (
    <section
      style={{
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
        padding: 0,
        display: 'grid',
        gap: 10
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>{title}</div>
        {feedback?.message ? (
          <div
            style={{
              fontSize: 12,
              lineHeight: 1.5,
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
            title="Saved Details"
            subtitle=""
            showVerifiedBadge={false}
            name={customerName || 'Guest customer'}
            phone={customerPhone}
            email={customerEmail}
            isMobileViewport={isMobileViewport}
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
                fontSize: 12,
                fontWeight: 800,
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
                minHeight: 36,
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 700,
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
                minHeight: 36,
                borderRadius: 12,
                border: '1px solid #1a4e8d',
                background: '#1a4e8d',
                color: '#fff',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 700,
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
