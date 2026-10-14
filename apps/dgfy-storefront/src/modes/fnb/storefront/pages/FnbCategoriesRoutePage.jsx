import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { FnbCatalogRoutePage } from './FnbCatalogRoutePage.jsx';

export function FnbCategoriesRoutePage({ cartCount = 0, isMobileViewport, onContinue, selectedStore, ...catalogProps }) {
  const storeName = selectedStore?.tenant_name || selectedStore?.name || 'Store menu';
  const hasCart = Number(cartCount) > 0;

  return (
    <div data-storefront-categories-page="true" style={{ minHeight: '100vh', background: '#fff' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          maxWidth: 1320,
          margin: '0 auto',
          padding: isMobileViewport ? '18px 16px 10px' : '24px 24px 12px',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
          <div style={{ color: '#ea580c', fontSize: 11, fontWeight: 900, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Menu
          </div>
          <h1 style={{ margin: 0, color: '#0f172a', fontSize: isMobileViewport ? 24 : 30, fontWeight: 900, lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {storeName}
          </h1>
        </div>
        <button
          type="button"
          aria-label={`Cart / Continue${hasCart ? `, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}` : ''}`}
          onClick={onContinue}
          disabled={!hasCart}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 44,
            border: 'none',
            borderRadius: 12,
            padding: '0 16px',
            background: hasCart ? '#ea580c' : '#cbd5e1',
            color: '#fff',
            fontSize: 13,
            fontWeight: 900,
            cursor: hasCart ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            boxShadow: hasCart ? '0 10px 20px rgba(234,88,12,0.2)' : 'none'
          }}
        >
          <ShoppingCart size={17} aria-hidden="true" />
          Cart / Continue{hasCart ? ` (${cartCount})` : ''}
        </button>
      </header>
      <FnbCatalogRoutePage {...catalogProps} categoriesOnly />
    </div>
  );
}
