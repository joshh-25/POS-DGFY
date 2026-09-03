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
  labelColor = '#475569',
  labelStyle,
  // Phase 142 (#823): an optional node rendered under the dropdown -- the downpayment amount
  // callout + refundable seam. Kept generic (any node, not a fixed shape) so this shared block
  // doesn't need to know about downpayment presentation at all; each mode builds its own callout
  // from shared/model/storefrontDownpaymentPresentation.js and passes it in.
  downpaymentCallout = null,
  // #963: a second generic node slot, same contract as downpaymentCallout above -- rendered under
  // the dropdown, shape unknown to this block. Today every mode passes the card billing-email
  // prompt through it; keeping it generic is what stops this shared block from learning yet
  // another domain concept.
  notice = null
}) {
  if (typeof DropdownComponent !== 'function') return null;

  return (
    <>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: labelColor, ...labelStyle }}>
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
      {notice}
    </>
  );
}
