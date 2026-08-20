import { ChevronRight, Plus } from 'lucide-react';
import { SimpleCartLineItem } from './SimpleCartLineItem.jsx';

/**
 * Layout matches F&B's FnbCartDrawerContent.jsx (header, empty state, "Add more items" prompt,
 * promo panel, subtotal/total split, CTA) and Retail's DefaultProductCartDrawer.jsx — ported
 * deliberately so all three modes' cart drawers read the same, each with its own color coding.
 * MSME keeps its own file (not shared) per the "independent trees" pattern used elsewhere in
 * this app, using this mode's own teal brand color via the servicesPrimary* props.
 */
export function SimpleCartDrawerSurface({
  cart = [],
  cartCount = 0,
  cartImageErrors,
  cartSubtotal = 0,
  cartTotal = 0,
  goStoreCatalogPage,
  isMobileViewport = false,
  isOpen = false,
  money,
  onCheckout,
  onClose,
  onImageError,
  onRemoveItem,
  onUpdateQuantity,
  renderPromoCodePanel,
  servicesBodyFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadowStrong,
  promoDiscountAmount = 0,
  promoDiscountLabel = '',
  quoteNeedsRefresh = false,
  voucherDiscountAmount = 0
}) {
  const primaryTint = '#FFF8E7';
  const primarySoftBorder = '#E4C98E';
  // #746: see DefaultProductCartDrawer.jsx's own note -- same fix, same reasoning, ported here.
  // RF-2 (PR #753 review): gated on !quoteNeedsRefresh too -- see that file's own note.
  const hasVoucherDiscount = !quoteNeedsRefresh && voucherDiscountAmount > 0;
  // RF-3 (PR #753 review): see DefaultProductCartDrawer.jsx's own note -- same fix, same reasoning.
  const hasPromoDiscount = !quoteNeedsRefresh && promoDiscountAmount > 0;
  const displayTotal = Math.max(0, cartTotal - (hasVoucherDiscount ? voucherDiscountAmount : 0) - (hasPromoDiscount ? promoDiscountAmount : 0));

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
            <div style={{ fontSize: 24, fontWeight: 800, color: '#0f172a' }}>Your Cart ({cartCount})</div>
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
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>No product added yet</div>
              <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                Add a product from the catalog to continue to checkout.
              </div>
            </div>
          ) : (
            cart.map((line) => (
              <SimpleCartLineItem
                key={`simple-cart-line-${line.item_id}`}
                cartImageErrors={cartImageErrors}
                isMobileViewport={isMobileViewport}
                line={line}
                money={money}
                onImageError={onImageError}
                onRemoveItem={onRemoveItem}
                onUpdateQuantity={onUpdateQuantity}
                servicesPrimary={servicesPrimary}
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
            style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', borderRadius: 12, border: `1px solid ${primarySoftBorder}`, background: primaryTint, padding: isMobileViewport ? '10px 12px' : '10px 14px', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${primarySoftBorder}`, background: '#fff', color: servicesPrimary, display: 'grid', placeItems: 'center' }}>
              <Plus size={16} strokeWidth={2.5} />
            </div>
            <div style={{ display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Add more items</div>
              <div style={{ fontSize: 11, color: '#64748b' }}>Explore more products in the catalog.</div>
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 800, color: servicesPrimary, whiteSpace: 'nowrap' }}>
              Browse Products
              <ChevronRight size={14} strokeWidth={2.5} />
            </div>
          </button>

          {renderPromoCodePanel ? renderPromoCodePanel({
            compact: true,
            accentColor: servicesPrimary,
            bodyFont: servicesBodyFont,
            isMobile: isMobileViewport
          }) : null}

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#475569' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700, color: '#334155' }}>{money(cartSubtotal)}</span>
            </div>
            {hasPromoDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#15803d' }}>
                <span>{promoDiscountLabel || 'Promo Discount'}</span>
                <span style={{ fontWeight: 700 }}>- {money(promoDiscountAmount)}</span>
              </div>
            )}
            {hasVoucherDiscount && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#15803d' }}>
                <span>Voucher Discount</span>
                <span style={{ fontWeight: 700 }}>- {money(voucherDiscountAmount)}</span>
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#0f172a' }}>Total</div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{cartCount} item{cartCount === 1 ? '' : 's'}</div>
            </div>
            <div style={{ fontSize: isMobileViewport ? 26 : 32, fontWeight: 800, color: '#0f172a', textAlign: 'right' }}>{money(displayTotal)}</div>
          </div>

          <button
            type="button"
            onClick={onCheckout}
            disabled={cart.length === 0}
            style={{
              minHeight: isMobileViewport ? 48 : 54,
              borderRadius: 18,
              border: 'none',
              background: cart.length === 0 ? '#cbd5e1' : `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
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
