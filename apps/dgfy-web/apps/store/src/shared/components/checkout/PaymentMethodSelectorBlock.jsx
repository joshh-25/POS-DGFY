import { Info } from 'lucide-react';

export function PaymentMethodSelectorBlock({
  label = 'Payment Type',
  value,
  onChange,
  options = [],
  DropdownComponent,
  triggerStyle,
  menuStyle,
  optionStyle,
  selectedLabelStyle,
  showCashInfo = false,
  cashInfoTitle = 'Pay with cash when your order arrives.',
  cashInfoBody = 'Ensure exact amount is ready for faster transaction.',
  cashInfoAccent = '#1a4e8d',
  cashInfoBorder = '#dbe8f5',
  cashInfoBackground = '#f8fbff',
  labelColor = '#475569',
  bodyFont = 'inherit',
  // Phase 142 (#823): an optional node rendered under the dropdown -- the downpayment amount
  // callout + refundable seam. Kept generic (any node, not a fixed shape) so this shared block
  // doesn't need to know about downpayment presentation at all; each mode builds its own callout
  // from shared/model/storefrontDownpaymentPresentation.js and passes it in.
  downpaymentCallout = null
}) {
  if (typeof DropdownComponent !== 'function') return null;

  return (
    <>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: labelColor }}>
        {label}
        <DropdownComponent
          value={value}
          onChange={(nextValue) => onChange(String(nextValue))}
          options={options}
          triggerStyle={triggerStyle}
          menuStyle={menuStyle}
          optionStyle={optionStyle}
          selectedLabelStyle={selectedLabelStyle}
        />
      </label>
      {downpaymentCallout}
      {showCashInfo ? (
        <div style={{ border: `1px solid ${cashInfoBorder}`, borderRadius: 16, background: cashInfoBackground, padding: '14px 16px', display: 'grid', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Info size={18} color={cashInfoAccent} style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: bodyFont }}>{cashInfoTitle}</div>
              <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5, fontFamily: bodyFont }}>{cashInfoBody}</div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
