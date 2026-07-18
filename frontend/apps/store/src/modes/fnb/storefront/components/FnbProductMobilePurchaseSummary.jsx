import React from 'react';
import { ChefHat, ShoppingCart, X } from 'lucide-react';

export function FnbProductMobilePurchaseSummary({
  actionButtonBase,
  available,
  displayFont,
  formatMoney,
  imageUrl,
  isOpen,
  itemName,
  onAddToCart,
  onBuyNow,
  onClose,
  onOpen,
  quantity,
  selectedModifiersTotal,
  serviceFee,
  spacing,
  subtotalPrice,
  totalPrice
}) {
  return (
    <>
      <div
        style={{
          position: 'fixed',
          left: spacing(2),
          right: spacing(2),
          bottom: spacing(2),
          zIndex: 60,
          borderRadius: 20,
          border: '1px solid rgba(226,232,240,0.9)',
          background: 'rgba(255,255,255,0.97)',
          backdropFilter: 'blur(18px)',
          boxShadow: '0 16px 40px rgba(15,23,42,0.18)',
          padding: spacing(1.5)
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '92px minmax(0, 1fr)', gap: 10, alignItems: 'center' }}>
          <button
            type="button"
            onClick={onOpen}
            disabled={!available}
            style={{
              ...actionButtonBase,
              minHeight: 48,
              minWidth: 0,
              padding: '0 16px',
              borderRadius: 14,
              border: '1.5px solid #22C55E',
              background: '#ffffff',
              color: '#15803d',
              boxShadow: 'none',
              opacity: available ? 1 : 0.65
            }}
          >
            <ShoppingCart size={16} />
            Cart
          </button>
          <button
            type="button"
            onClick={(event) => onBuyNow?.(event)}
            disabled={!available}
            style={{
              ...actionButtonBase,
              minHeight: 48,
              minWidth: 0,
              padding: '0 18px',
              borderRadius: 14,
              border: 'none',
              background: available ? '#f97316' : '#cbd5e1',
              color: '#fff',
              boxShadow: 'none',
              opacity: available ? 1 : 0.65
            }}
          >
            Buy Now - {formatMoney(totalPrice)}
          </button>
        </div>
      </div>

      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Order Summary"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 70,
            background: 'rgba(15, 23, 42, 0.42)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: `${spacing(2)}px ${spacing(2)}px ${spacing(11)}px`
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 420,
              borderRadius: '24px 24px 18px 18px',
              background: '#ffffff',
              border: '1px solid rgba(226,232,240,0.9)',
              boxShadow: '0 24px 60px rgba(15,23,42,0.24)',
              padding: `${spacing(1.5)}px ${spacing(2)}px ${spacing(2)}px`,
              display: 'grid',
              gap: spacing(2)
            }}
          >
            <div style={{ width: 56, height: 5, borderRadius: 999, background: '#e2e8f0', margin: '0 auto' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: displayFont }}>Order Summary</h3>
              <button
                type="button"
                aria-label="Close order summary"
                onClick={onClose}
                style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#ffffff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div style={{ borderTop: '1px solid rgba(226,232,240,0.8)', paddingTop: spacing(2), display: 'grid', gap: spacing(2) }}>
              <div style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'center' }}>
                <div style={{ width: 64, height: 64, borderRadius: 14, overflow: 'hidden', background: '#f8fafc', border: '1px solid rgba(226,232,240,0.8)', display: 'grid', placeItems: 'center' }}>
                  {imageUrl ? <img src={imageUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ChefHat size={22} color="#94a3b8" />}
                </div>
                <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{itemName}</div>
                  <div style={{ fontSize: 14, color: '#64748b' }}>Quantity: {quantity}</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#f97316', whiteSpace: 'nowrap' }}>{formatMoney(totalPrice)}</div>
              </div>

              <div style={{ borderTop: '1px solid rgba(226,232,240,0.8)', paddingTop: spacing(1.5), display: 'grid', gap: 10 }}>
                {[
                  ['Subtotal', formatMoney(subtotalPrice)],
                  ['Add-ons', formatMoney(selectedModifiersTotal)],
                  ['Service Fee', formatMoney(serviceFee)]
                ].map(([label, value]) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#475569' }}>
                    <span>{label}</span>
                    <span style={{ fontWeight: 700, color: '#334155' }}>{value}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>Total</span>
                  <span style={{ fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{formatMoney(totalPrice)}</span>
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 700, color: '#22C55E', textAlign: 'center' }}>Get cashback from this item!</div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 10 }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{ ...actionButtonBase, minHeight: 44, minWidth: 0, padding: '0 14px', borderRadius: 12, border: '1px solid rgba(203, 213, 225, 0.9)', background: '#ffffff', color: '#334155', boxShadow: 'none', fontSize: 14 }}
                >
                  Continue Shopping
                </button>
                <button
                  type="button"
                  onClick={(event) => { onClose(); onAddToCart?.(event); }}
                  disabled={!available}
                  style={{ ...actionButtonBase, minHeight: 44, minWidth: 0, padding: '0 16px', borderRadius: 12, border: 'none', background: available ? '#16a34a' : '#cbd5e1', color: '#ffffff', boxShadow: 'none', opacity: available ? 1 : 0.65, fontSize: 14 }}
                >
                  Confirm & Add to Cart
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
