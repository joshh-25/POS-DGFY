const PAYMENT_DROPDOWN_MAX_HEIGHT = 220;
const PAYMENT_DROPDOWN_OPTION_STYLE = {
  minHeight: 40,
  padding: '8px 12px'
};

export function PaymentMethodSelectorBlock({
  label = 'Payment Type',
  value,
  onChange,
  options = [],
  emptyMessage,
  DropdownComponent,
  portalMenu = false,
  triggerStyle,
  menuStyle,
  optionStyle,
  selectedLabelStyle,
  portalMenu = true,
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

  // Payment menus stay dense and scrollable so the checkout card does not grow
  // excessively tall. The shared dropdown still owns portal positioning and
  // viewport collision handling, keeping this sizing change isolated to payment.
  const paymentMenuStyle = {
    ...(menuStyle || {}),
    maxHeight: PAYMENT_DROPDOWN_MAX_HEIGHT
  };
  const paymentOptionStyle = {
    ...(optionStyle || {}),
    ...PAYMENT_DROPDOWN_OPTION_STYLE
  };

  return (
    <>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: labelColor, ...labelStyle }}>
        {label}
        <DropdownComponent
          value={value}
          onChange={(nextValue) => onChange(String(nextValue))}
          options={options}
          emptyMessage={emptyMessage}
          portalMenu={portalMenu}
          triggerStyle={triggerStyle}
          menuStyle={paymentMenuStyle}
          optionStyle={paymentOptionStyle}
          selectedLabelStyle={selectedLabelStyle}
          portalMenu={portalMenu}
        />
      </label>
      {downpaymentCallout}
      {notice}
    </>
  );
}
