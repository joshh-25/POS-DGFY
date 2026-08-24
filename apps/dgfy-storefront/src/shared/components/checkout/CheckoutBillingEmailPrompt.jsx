import { Mail } from 'lucide-react';

// #963: the affordance half of the card billing-email requirement. A signed-in customer whose
// account carries only a phone renders the read-only identity summary
// (features/checkout/renderers/customerIdentityRenderers.jsx) and so has nowhere else on the page
// to supply an email -- blocking submit without offering an input would be a dead end. Purely
// presentational: the value and setter are owned by useGuestCustomerIdentity.js, same as every
// other identity field.
export function CheckoutBillingEmailPrompt({
  value = '',
  onChange,
  invalid = false,
  accentColor = '#1a4e8d',
  bodyFont = 'inherit'
}) {
  return (
    <div
      style={{
        border: `1px solid ${invalid ? '#fca5a5' : '#dbe8f5'}`,
        borderRadius: 16,
        background: invalid ? '#fff7f7' : '#f8fbff',
        padding: '14px 16px',
        display: 'grid',
        gap: 8
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <Mail size={18} color={accentColor} style={{ flexShrink: 0, marginTop: 1 }} />
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: bodyFont }}>
            Email address required for card payments
          </div>
          <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, fontFamily: bodyFont }}>
            Your card issuer needs it to authorize the payment, and we send your receipt there.
          </div>
        </div>
      </div>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569', fontFamily: bodyFont }}>
        Email
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="name@example.com"
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          style={{
            minHeight: 42,
            borderRadius: 12,
            border: `1px solid ${invalid ? '#fca5a5' : '#cbd5e1'}`,
            background: '#fff',
            padding: '0 12px',
            fontSize: 14,
            fontFamily: bodyFont
          }}
        />
      </label>
    </div>
  );
}
