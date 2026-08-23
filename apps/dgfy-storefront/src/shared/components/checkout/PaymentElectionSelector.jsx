import { PAYMENT_ELECTION_OPTIONS } from '../../model/storefrontPaymentElection.js';

/**
 * Phase 150 (#866). The "how would you like to pay?" segmented control rendered ONLY at a
 * payment_mode='customer_choice' store, above the payment-method selector. Mirrors
 * PaymentMethodSelectorBlock/DownpaymentPaymentCallout's plain-style-object convention (this
 * `shared/` tree has no shared button/radio primitive, each block owns its own inline styles) so
 * it drops into the same visual language without a new dependency. Renders nothing when
 * `isCustomerChoiceStore(selectedStore)` is false -- callers can render this unconditionally.
 */
export function PaymentElectionSelector({
  accentColor = '#1a4e8d',
  active = false,
  bodyFont = 'inherit',
  onChange,
  value
}) {
  if (!active) return null;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontSize: 12, color: '#475569', fontFamily: bodyFont }}>How would you like to pay?</span>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {PAYMENT_ELECTION_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              style={{
                display: 'grid',
                gap: 2,
                border: `1px solid ${selected ? accentColor : '#e2e8f0'}`,
                borderRadius: 14,
                background: selected ? `${accentColor}0d` : '#fff',
                padding: '10px 12px',
                cursor: 'pointer'
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="storefront-payment-election"
                  checked={selected}
                  onChange={() => onChange(option.value)}
                  style={{ margin: 0 }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', fontFamily: bodyFont }}>{option.label}</span>
              </span>
              <span style={{ fontSize: 11, color: '#64748b', lineHeight: 1.4, fontFamily: bodyFont, paddingLeft: 22 }}>
                {option.description}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
