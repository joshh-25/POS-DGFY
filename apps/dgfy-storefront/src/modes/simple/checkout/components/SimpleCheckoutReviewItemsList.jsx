const SIMPLE_BRAND = '#176B3A';

/** MSME payment-step read-only order recap. Mirrors FnbCheckoutReviewItemsList.jsx's
 * thumbnail/row treatment so it reads as one system with F&B's — kept as MSME's own
 * component per the "two independent checkout trees" decision. */
export function SimpleCheckoutReviewItemsList({
  cart = [],
  cartImageErrors,
  isMobileViewport = false,
  money,
  onImageError,
  withAssetOrigin
}) {
  if (cart.length === 0) return null;

  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: SIMPLE_BRAND, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Your Items
      </div>
      <div style={{ maxHeight: isMobileViewport ? 260 : 320, overflowY: 'auto', display: 'grid', gap: 10, paddingRight: 2 }}>
        {cart.map((line) => {
          const quantity = Math.max(1, Number(line.quantity || 1));
          const subtotal = (Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0);
          return (
            <div key={`simple-review-item-${line.cart_line_id || line.item_id}`} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', border: '1px solid #e2e8f0', borderRadius: 12, padding: '8px 10px', background: '#fff' }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                {line.image_url && !cartImageErrors.has(Number(line.item_id))
                  ? <img src={withAssetOrigin(line.image_url)} alt={line.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => onImageError(line.item_id)} />
                  : <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{String(line.name || '').slice(0, 1) || 'I'}</span>}
              </div>
              <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{line.name}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>x {quantity}</div>
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{money(subtotal)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
