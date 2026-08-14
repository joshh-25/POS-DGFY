import { ChevronRight, Plus } from 'lucide-react';
import { DefaultProductCartLineItem } from './DefaultProductCartLineItem.jsx';

const DEFAULT_BRAND = '#1a4e8d';
const DEFAULT_BRAND_DARK = '#1a4586';
const DEFAULT_BRAND_SHADOW_STRONG = 'rgba(26,69,134,.38)';
const DEFAULT_BRAND_TINT = '#eef4fb';
const DEFAULT_BRAND_SOFT_BORDER = '#b9cfe8';

/**
 * Default/Retail's own "Product Cart" popup. Mirrors
 * modes/simple/checkout/components/SimpleCartDrawerSurface.jsx's functionality (item list,
 * quantity controls, subtotal, CTA) but is this mode's own file — not shared with MSME — per
 * the "independent trees" pattern already used for checkout elsewhere in this app. Uses this
 * mode's own blue brand color instead of MSME's teal.
 *
 * Layout matches F&B's FnbCartDrawerContent.jsx (header, empty state, "Add more items" prompt,
 * promo panel, subtotal/total split, CTA) — ported deliberately so all three modes' cart drawers
 * read the same, each with its own color coding.
 *
 * `onCheckout` navigates to the Default/Retail order page (`/order`, DefaultOrderPage.jsx) —
 * navigation only, not a backend call.
 */
export function DefaultProductCartDrawer({
  cart = [],
  cartCount = 0,
  cartImageErrors,
  cartSubtotal = 0,
  cartTotal = 0,
  goStoreCatalogPage,
  isMobileViewport = false,
  isRetailMode = false,
  isOpen = false,
  money,
  onCheckout,
  onClose,
  onImageError,
  onRemoveItem,
  onUpdateQuantity,
  renderPromoCodePanel,
  servicesBodyFont,
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
        <div style={{ padding: isMobileViewport ? '10px 14px' : '22px 20px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            {isMobileViewport ? (
              <div style={{ width: 56, height: 5, borderRadius: 999, background: '#d1d5db', margin: '0 auto 10px' }} />
            ) : null}
            <div style={{ fontSize: isRetailMode && isMobileViewport ? 20 : 24, fontWeight: isRetailMode ? 700 : 900, color: '#0f172a', fontFamily: servicesBodyFont }}>Your Cart ({cartCount})</div>
            <div style={{ fontSize: 13, color: '#64748b' }}>Review your items before checkout.</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ width: 34, height: 34, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 900, cursor: 'pointer', flexShrink: 0 }}
          >
            x
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? '14px 16px 18px' : '16px 20px 18px', display: 'grid', gap: isMobileViewport ? 10 : 12, alignContent: 'start' }}>
          {cart.length === 0 ? (
            <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', minHeight: isMobileViewport ? 240 : 320, textAlign: 'center', display: 'grid', alignContent: 'center', gap: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>No product added yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                Add a product from the catalog to continue to checkout.
              </div>
            </div>
          ) : (
            cart.map((line) => (
              <DefaultProductCartLineItem
                key={`default-cart-line-${line.item_id}`}
                cartImageErrors={cartImageErrors}
                isMobileViewport={isMobileViewport}
                isRetailMode={isRetailMode}
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

        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: isMobileViewport ? 14 : 16, paddingRight: isMobileViewport ? 16 : 20, paddingBottom: isMobileViewport ? 20 : 8, paddingLeft: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              goStoreCatalogPage?.();
              setTimeout(() => {
                const el = document.getElementById('storefront-catalog-section');
                if (el) {
                  const yOffset = -60;
                  const y = el.getBoundingClientRect().top + window.scrollY + yOffset;
                  window.scrollTo({ top: y, behavior: 'smooth' });
                }
              }, 300);
            }}
            style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', borderRadius: 12, border: `1px solid ${DEFAULT_BRAND_SOFT_BORDER}`, background: DEFAULT_BRAND_TINT, padding: isMobileViewport ? '10px 12px' : '10px 14px', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${DEFAULT_BRAND_SOFT_BORDER}`, background: '#fff', color: DEFAULT_BRAND, display: 'grid', placeItems: 'center' }}>
              <Plus size={16} strokeWidth={2.5} />
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Add more items</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Explore more products in the catalog.</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: DEFAULT_BRAND, whiteSpace: 'nowrap' }}>
              Browse Products
              <ChevronRight size={14} strokeWidth={2.5} />
            </div>
          </button>

          {renderPromoCodePanel ? renderPromoCodePanel({
            compact: true,
            accentColor: DEFAULT_BRAND,
            bodyFont: servicesBodyFont,
            isMobile: isMobileViewport
          }) : null}

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#475569' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700, color: '#334155' }}>{money(cartSubtotal)}</span>
            </div>
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 18, fontWeight: isRetailMode ? 700 : 900, color: '#0f172a' }}>Total</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
            </div>
            <div style={{ fontSize: isRetailMode ? (isMobileViewport ? 24 : 30) : (isMobileViewport ? 26 : 32), fontWeight: isRetailMode ? 700 : 900, color: '#0f172a', textAlign: 'right' }}>{money(cartTotal)}</div>
          </div>

          <button
            type="button"
            onClick={() => onCheckout?.()}
            disabled={cart.length === 0}
            style={{
              minHeight: isRetailMode ? (isMobileViewport ? 44 : 50) : (isMobileViewport ? 48 : 54),
              borderRadius: isRetailMode ? 12 : 18,
              border: 'none',
              background: cart.length === 0 ? '#cbd5e1' : `linear-gradient(135deg,${DEFAULT_BRAND},${DEFAULT_BRAND_DARK})`,
              color: '#fff',
              fontSize: isRetailMode ? (isMobileViewport ? 14 : 15) : 16,
              fontWeight: isRetailMode ? 700 : 900,
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              boxShadow: cart.length === 0 ? 'none' : `0 14px 30px ${DEFAULT_BRAND_SHADOW_STRONG}`
            }}
          >
            Order &amp; Purchase
          </button>
        </div>
      </aside>
    </div>
  );
}
