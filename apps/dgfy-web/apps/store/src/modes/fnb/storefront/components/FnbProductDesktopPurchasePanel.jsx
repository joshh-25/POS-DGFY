import React from 'react';
import { Lock, ShoppingCart, Zap } from 'lucide-react';

export function FnbProductDesktopPurchasePanel({
  accentColor = '#f97316',
  accentDark = '#26884c',
  actionButtonBase,
  available,
  formatMoney,
  isRetailPresentation = false,
  isEditingCartLine = false,
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
          <div style={{ fontSize: 24, fontWeight: isRetailPresentation ? 700 : 900, color: '#0f172a', lineHeight: 1.1, letterSpacing: isRetailPresentation ? '-0.015em' : '-0.02em' }}>{formatMoney(totalPrice)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button
          type="button"
          onClick={(event) => onAddToCart?.(event)}
          disabled={!available}
          style={{ ...actionButtonBase, border: 'none', background: available ? accentDark : '#cbd5e1', color: '#fff', boxShadow: 'none', opacity: available ? 1 : 0.65 }}
        >
          <ShoppingCart size={16} />
          {isEditingCartLine ? 'Save changes' : 'Add to Cart'}
        </button>
        <button
          type="button"
          onClick={(event) => onBuyNow?.(event)}
          disabled={!available}
          style={{ ...actionButtonBase, border: 'none', background: available ? accentColor : '#cbd5e1', color: '#fff', boxShadow: 'none', opacity: available ? 1 : 0.65 }}
        >
          <Zap size={16} />
          {isEditingCartLine ? 'Save & view cart' : 'Buy Now'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 12, color: '#64748b', fontWeight: 600, marginTop: 8 }}>
        <Lock size={16} color="#64748b" />
        Secure checkout - 100% safe
      </div>
    </div>
  );
}
