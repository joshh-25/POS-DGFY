import React from 'react';

export function FnbCartDrawerHeader({ cartCount, isMobileViewport }) {
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      {isMobileViewport ? (
        <div
          style={{
            width: 56,
            height: 5,
            borderRadius: 999,
            background: '#d1d5db',
            margin: '0 auto 10px',
          }}
        />
      ) : null}
      <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a' }}>
        Your Cart ({cartCount})
      </div>
      <div style={{ fontSize: 13, color: '#64748b' }}>
        Review your items before checkout.
      </div>
    </div>
  );
}
