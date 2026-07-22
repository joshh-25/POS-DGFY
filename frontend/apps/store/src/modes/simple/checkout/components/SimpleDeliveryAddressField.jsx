export function SimpleDeliveryAddressField({
  customerAddress = '',
  onCustomerAddressChange
}) {
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
        Delivery Address *
        <textarea
          value={customerAddress}
          onChange={(event) => onCustomerAddressChange?.(event.target.value)}
          placeholder="House no., street, barangay, landmark"
          rows={3}
          style={{ border: '1px solid #cbd5e1', borderRadius: 12, padding: '11px 12px', background: '#fff', resize: 'vertical' }}
        />
      </label>
    </div>
  );
}
