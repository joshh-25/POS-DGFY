export function SimpleCheckoutReviewItemsList({
  cart = [],
  isMobileViewport = false,
  money
}) {
  return (
    <div style={{ maxHeight: isMobileViewport ? 260 : 320, overflowY: 'auto', display: 'grid', gap: 8 }}>
      {cart.map((line) => {
        const quantity = Math.max(1, Number(line.quantity || 1));
        const subtotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);

        return (
          <div key={`simple-order-summary-${line.item_id}`} style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fff', padding: '9px 10px', display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
            <span>{line.name} x {quantity}</span>
            <strong>{money(subtotal)}</strong>
          </div>
        );
      })}
    </div>
  );
}
