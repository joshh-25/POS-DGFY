import React from 'react';
import { Lock, ShoppingCart, Zap } from 'lucide-react';

export function FnbProductDesktopPurchasePanel({
  actionButtonBase,
  available,
  formatMoney,
  onAddToCart,
  onBuyNow,
  selectedModifiersTotal,
  totalPrice
}) {
  return (
    <div style={{ display: 'grid', gap: 16, borderTop: '1px solid rgba(226,232,240,0.6)', paddingTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 0' }}>
        <div style={{ display: 'grid', gap: 2 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Total</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>Base price plus selected add-ons</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          {selectedModifiersTotal > 0 ? (
            <div style={{ fontSize: 12, fontWeight: 700, color: '#15803d' }}>+{formatMoney(selectedModifiersTotal)}</div>
          ) : null}
          <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{formatMoney(totalPrice)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button
          type="button"
          onClick={(event) => onAddToCart?.(event)}
          disabled={!available}
          style={{ ...actionButtonBase, border: 'none', background: available ? '#26884c' : '#cbd5e1', color: '#fff', boxShadow: 'none', opacity: available ? 1 : 0.65 }}
        >
          <ShoppingCart size={16} />
          Add to Cart
        </button>
        <button
          type="button"
          onClick={(event) => onBuyNow?.(event)}
          disabled={!available}
          style={{ ...actionButtonBase, border: 'none', background: available ? '#f97316' : '#cbd5e1', color: '#fff', boxShadow: 'none', opacity: available ? 1 : 0.65 }}
        >
          <Zap size={16} />
          Buy Now
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 8 }}>
        <Lock size={16} color="#64748b" />
        Secure checkout - 100% safe
      </div>
    </div>
  );
}
