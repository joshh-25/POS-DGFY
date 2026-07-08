import { Mail, Phone, UserRound } from 'lucide-react';

export function SavedCustomerDetailsPanel({
  title = 'Customer Details',
  subtitle = "We'll use these details for your order or booking.",
  customerName = '',
  customerEmail = '',
  customerPhone = '',
  hasSavedCustomerDetails = false,
  rememberCustomerDetails = false,
  maskedSavedCustomerPreview = '',
  isEditing = false,
  isMobileViewport = false,
  feedback = null,
  onUseDifferentDetails,
  onCancelEdit,
  onApplyEdit,
  onRememberChange,
  children = null
}) {
  if (!hasSavedCustomerDetails && !isEditing) {
    return null;
  }

  return (
    <section
      style={{
        border: '1px solid #dbe5ee',
        borderRadius: 16,
        background: '#fff',
        padding: isMobileViewport ? 12 : 13,
        display: 'grid',
        gap: 10
      }}
    >
      <div style={{ display: 'grid', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: isMobileViewport ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            gap: 10,
            flexDirection: isMobileViewport ? 'column' : 'row'
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a' }}>{title}</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, color: '#334155' }}>
            <input
              type="checkbox"
              checked={rememberCustomerDetails}
              onChange={(event) => onRememberChange?.(event.target.checked)}
              style={{ width: 16, height: 16 }}
            />
            <span>Remember these details for my next order</span>
          </label>
        </div>
        <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45 }}>{subtitle}</div>
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
          <div
            style={{
              border: '1px solid #dbe5ee',
              borderRadius: 14,
              background: '#f8fafc',
              padding: isMobileViewport ? 11 : 12,
              display: 'grid',
              gap: 8
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: isMobileViewport ? '1fr' : 'auto minmax(0, 1fr)',
                gap: isMobileViewport ? 10 : 12,
                alignItems: 'center',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <div
                  style={{
                    width: isMobileViewport ? 36 : 40,
                    height: isMobileViewport ? 36 : 40,
                    borderRadius: 12,
                    background: '#eff6ff',
                    color: '#1a4e8d',
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <UserRound size={isMobileViewport ? 18 : 20} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.2 }}>
                    {customerName || 'Guest customer'}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Guest checkout</div>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: '#475569' }}>
                  <Mail size={14} color="#64748b" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {customerEmail || 'No email added yet.'}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, color: '#475569' }}>
                  <Phone size={14} color="#64748b" style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {customerPhone || 'No phone number added yet.'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
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
          {maskedSavedCustomerPreview ? (
            <div style={{ fontSize: 12, color: '#64748b' }}>
              Saved details on this device: {maskedSavedCustomerPreview}
            </div>
          ) : null}
          {children}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onCancelEdit}
              style={{
                minHeight: 40,
                borderRadius: 12,
                border: '1px solid #cbd5e1',
                background: '#fff',
                color: '#334155',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onApplyEdit}
              style={{
                minHeight: 40,
                borderRadius: 12,
                border: '1px solid #1a4e8d',
                background: '#1a4e8d',
                color: '#fff',
                padding: '0 14px',
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              Apply Details
            </button>
          </div>
        </>
      )}
    </section>
  );
}
