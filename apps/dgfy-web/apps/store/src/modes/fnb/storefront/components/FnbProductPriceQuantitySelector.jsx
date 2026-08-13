import { Minus, Plus } from 'lucide-react';

/** Displays the F&B unit price and delegates quantity changes to the route view-model. */
export function FnbProductPriceQuantitySelector({
  accentColor = '#f97316',
  formatMoney,
  isMobileViewport,
  compactTypography = false,
  quantity,
  setQuantity,
  spacing,
  unitPrice,
}) {
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const updateQuantity = (nextQuantity) => setQuantity(Math.max(1, Number(nextQuantity || 1)));

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingTop: spacing(2) }}>
      <div style={{ fontSize: isMobileViewport ? 24 : 32, fontWeight: compactTypography ? 700 : 900, color: accentColor, lineHeight: 1, letterSpacing: compactTypography ? '-0.015em' : '-0.02em' }}>
        {formatMoney(unitPrice)}
      </div>

      <div style={{ display: 'inline-grid', gridTemplateColumns: '32px minmax(24px, auto) 32px', alignItems: 'center', justifyItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 999, border: '1px solid rgba(226, 232, 240, 0.8)', background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
        <button
          type="button"
          aria-label="Decrease quantity"
          onClick={() => updateQuantity(safeQuantity - 1)}
          style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center' }}
        >
          <Minus size={14} strokeWidth={2.5} />
        </button>
        <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', minWidth: 24, textAlign: 'center', lineHeight: 1 }}>
          {safeQuantity}
        </span>
        <button
          type="button"
          aria-label="Increase quantity"
          onClick={() => updateQuantity(safeQuantity + 1)}
          style={{ border: 'none', background: 'transparent', color: '#475569', cursor: 'pointer', width: 28, height: 28, padding: 0, display: 'grid', placeItems: 'center' }}
        >
          <Plus size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
import React from 'react';
