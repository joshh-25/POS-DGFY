import { SimpleCartLineItem } from './SimpleCartLineItem.jsx';

export function SimpleCartDrawerSurface({
  activeOrderMethodLabel,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  cartTotal = 0,
  isMobileViewport = false,
  isOpen = false,
  money,
  onCheckout,
  onClose,
  onImageError,
  onRemoveItem,
  onUpdateQuantity,
  servicesDisplayFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadowStrong,
  withAssetOrigin
}) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2095,
        pointerEvents: isOpen ? 'auto' : 'none'
      }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClose}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            onClose();
          }
        }}
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(15,23,42,.46)',
          backdropFilter: 'blur(4px)',
          opacity: isOpen ? 1 : 0,
          transition: 'opacity 180ms ease'
        }}
      />
      <aside
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobileViewport ? 'min(100vw, 100%)' : 'min(520px, calc(100vw - 40px))',
          background: '#ffffff',
          borderLeft: '1px solid #dbe5ee',
          boxShadow: '0 24px 60px rgba(15,23,42,.18)',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(104%)',
          transition: 'transform 220ms ease'
        }}
      >
        <div style={{ padding: isMobileViewport ? '18px 16px 14px' : '22px 20px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Product Cart</div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', fontFamily: servicesDisplayFont }}>Added products</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>Manage the products in cart, then continue to checkout.</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              style={{ width: 42, height: 42, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 900, cursor: 'pointer' }}
            >
              x
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 999, padding: '4px 10px' }}>
              {cartCount} item{cartCount === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              {activeOrderMethodLabel}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 14 }}>
          {cart.length === 0 ? (
            <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', textAlign: 'center', display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>No product added yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                Add a product from the catalog to continue to checkout.
              </div>
            </div>
          ) : (
            cart.map((line) => (
              <SimpleCartLineItem
                key={`simple-cart-line-${line.item_id}`}
                activeOrderMethodLabel={activeOrderMethodLabel}
                cartImageErrors={cartImageErrors}
                isMobileViewport={isMobileViewport}
                line={line}
                money={money}
                onImageError={onImageError}
                onRemoveItem={onRemoveItem}
                onUpdateQuantity={onUpdateQuantity}
                withAssetOrigin={withAssetOrigin}
              />
            ))
          )}
        </div>

        <div style={{ borderTop: '1px solid #e2e8f0', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: '#64748b' }}>Current total</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{money(cartTotal)}</div>
            </div>
            <div style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
              {cartCount} selected
            </div>
          </div>
          <button
            type="button"
            onClick={onCheckout}
            disabled={cart.length === 0}
            style={{
              minHeight: 50,
              borderRadius: 16,
              border: 'none',
              background: cart.length === 0 ? '#cbd5e1' : `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
              color: '#fff',
              fontSize: 15,
              fontWeight: 900,
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: cart.length === 0 ? 'none' : `0 14px 30px ${servicesPrimaryShadowStrong}`
            }}
          >
            Order &amp; Purchase
          </button>
        </div>
      </aside>
    </div>
  );
}
