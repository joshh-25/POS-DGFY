import React from 'react';
import { ChevronRight, Minus, Plus, ShoppingCart, Trash2, X } from 'lucide-react';

import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { ServiceImage } from '../../ServiceImage.jsx';

const resolveLineName = (line) => String(line?.variantName || line?.name || '').trim();

const resolveLineDetail = (line) => {
  const optionLabels = (Array.isArray(line?.selected_options) ? line.selected_options : [])
    .map((option) => String(option?.name || '').trim())
    .filter(Boolean);
  if (optionLabels.length > 0) return [...new Set(optionLabels)].join(' · ');

  const supportingLabels = [line?.serviceAreaLabel, line?.durationLabel]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  return [...new Set([...optionLabels, ...supportingLabels])].join(' · ');
};

export function ServiceCartDrawer({
  isCheckoutOpen,
  setIsCheckoutOpen,
  cartButtonRef,
  isMobileViewport,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  servicesPrimaryShadowStrong,
  servicesDisplayFont,
  serviceCartCount,
  serviceCartLines,
  cartImageErrors,
  setCartImageErrors,
  money,
  updateQty,
  removeCartItem,
  productCartLines,
  serviceCartTotal,
  hasServiceCart,
  hasMixedServiceCart,
  handleServicesCartCheckout,
  renderPromoCodePanel
}) {
  const safeServiceCartLines = Array.isArray(serviceCartLines) ? serviceCartLines : [];
  const safeProductCartLines = Array.isArray(productCartLines) ? productCartLines : [];
  const hasProductCartConflict = Boolean(hasMixedServiceCart || safeProductCartLines.length > 0);

  return (
    <>
      <button
        type="button"
        ref={cartButtonRef}
        onClick={() => setIsCheckoutOpen((previous) => !previous)}
        aria-label={isCheckoutOpen ? 'Close service cart' : 'Open service cart'}
        data-service-cart-fab="true"
        style={{
          position: 'fixed',
          right: isMobileViewport ? 20 : 36,
          bottom: isMobileViewport ? 10 : 18,
          zIndex: 2100,
          width: isMobileViewport ? 62 : 68,
          height: isMobileViewport ? 62 : 68,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
          background: `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
          color: '#fff',
          boxShadow: `0 18px 38px ${servicesPrimaryShadowStrong}`,
          cursor: 'pointer',
          display: isCheckoutOpen ? 'none' : 'grid',
          placeItems: 'center'
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            minWidth: 22,
            height: 22,
            padding: '0 6px',
            borderRadius: 999,
            background: '#0f172a',
            color: '#fff',
            fontSize: 11,
            fontWeight: 900,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff'
          }}
        >
          {serviceCartCount}
        </span>
        <ShoppingCart size={24} strokeWidth={2.2} />
      </button>

      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2095,
          pointerEvents: isCheckoutOpen ? 'auto' : 'none'
        }}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label="Close service cart backdrop"
          onClick={() => setIsCheckoutOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setIsCheckoutOpen(false);
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,42,.46)',
            backdropFilter: 'blur(4px)',
            opacity: isCheckoutOpen ? 1 : 0,
            transition: 'opacity 180ms ease'
          }}
        />

        <aside
          data-service-cart-drawer="true"
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
            transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(104%)',
            transition: 'transform 220ms ease'
          }}
        >
          <header style={{ padding: isMobileViewport ? '10px 14px' : '22px 20px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'grid', gap: 4, minWidth: 0 }}>
              {isMobileViewport ? <div style={{ width: 56, height: 5, borderRadius: 999, background: '#d1d5db', margin: '0 auto 10px' }} /> : null}
              <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, lineHeight: 1.2, color: '#0f172a', fontFamily: servicesDisplayFont }}>
                Your cart ({serviceCartCount})
              </h2>
              <p style={{ margin: 0, color: '#64748b', fontSize: 13, lineHeight: 1.4 }}>
                Review your items before checkout.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close service cart"
              onClick={() => setIsCheckoutOpen(false)}
              style={{ width: 34, height: 34, flexShrink: 0, borderRadius: 999, border: `1px solid ${servicesPrimaryBorder}`, background: '#fff', color: '#0f172a', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
            >
              <X size={18} strokeWidth={2} />
            </button>
          </header>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? '14px 16px 18px' : '16px 20px 18px', display: 'grid', gap: isMobileViewport ? 10 : 12, alignContent: 'start' }}>
              {safeServiceCartLines.length === 0 ? (
                <div style={{ border: `1px dashed ${servicesPrimaryBorder}`, borderRadius: 20, background: servicesPrimarySoft, padding: '28px 20px', minHeight: isMobileViewport ? 240 : 320, textAlign: 'center', display: 'grid', alignContent: 'center', gap: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a', fontFamily: servicesDisplayFont }}>No service added yet</div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                    Add a service from the catalog to continue to booking.
                  </div>
                </div>
              ) : (
                <div>
                  {safeServiceCartLines.map((line, index) => {
                    const lineName = resolveLineName(line) || 'Service';
                    const lineDetail = resolveLineDetail(line);
                    const quantity = Math.max(1, Number(line.quantity || 1));
                    const linePrice = Number(line.price || 0) || 0;
                    const lineItemId = Number(line.item_id);
                    const hasLineImage = (line.thumbnail_url || line.image_url)
                      && !(cartImageErrors instanceof Set && cartImageErrors.has(lineItemId));

                    const imageSize = isMobileViewport ? 72 : 78;

                    return (
                      <article
                        key={`services-cart-line-${line.cart_line_id || line.item_id || index}`}
                        style={{ borderBottom: '1px solid #e2e8f0', padding: isMobileViewport ? '2px 0 12px' : '4px 0 14px', display: 'grid', gap: isMobileViewport ? 8 : 10 }}
                      >
                        <div style={{ display: 'grid', gridTemplateColumns: `${imageSize}px minmax(0, 1fr)`, gap: isMobileViewport ? 12 : 14, alignItems: 'start' }}>
                          <div style={{ position: 'relative', width: imageSize, height: imageSize, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <div style={{ position: 'absolute', top: 6, right: 6, minWidth: 24, height: 24, padding: '0 7px', borderRadius: 999, background: servicesPrimary, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, boxShadow: `0 8px 18px ${servicesPrimaryShadowStrong}`, zIndex: 1 }}>
                              {quantity}
                            </div>
                            {hasLineImage ? (
                              <ServiceImage
                                item={line}
                                imageSources={resolveStorefrontImageSources(line, { preferred: 'thumbnail' })}
                                alt={lineName}
                                sizes={`${imageSize}px`}
                                width={imageSize}
                                height={imageSize}
                                fallbackLabel=""
                                fallbackIcon={<ShoppingCart size={isMobileViewport ? 24 : 28} color={servicesPrimary} strokeWidth={1.8} />}
                                onError={() => {
                                  if (!Number.isFinite(lineItemId)) return;
                                  setCartImageErrors((previous) => {
                                    const next = new Set(previous);
                                    next.add(lineItemId);
                                    return next;
                                  });
                                }}
                              />
                            ) : (
                              <ShoppingCart size={isMobileViewport ? 24 : 28} color={servicesPrimary} strokeWidth={1.8} />
                            )}
                          </div>

                          <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto', alignItems: 'start', gap: 10 }}>
                              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                                <div style={{ fontSize: isMobileViewport ? 15 : 16, fontWeight: 900, color: '#0f172a', lineHeight: 1.15, overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', fontFamily: servicesDisplayFont }}>
                                  {lineName}
                                </div>
                                {lineDetail ? (
                                  <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {lineDetail}
                                  </div>
                                ) : null}
                              </div>
                              <div style={{ fontSize: isMobileViewport ? 14 : 15, fontWeight: 900, color: servicesPrimary, whiteSpace: 'nowrap', alignSelf: 'center' }}>
                                {money(quantity * linePrice)}
                              </div>
                              <button
                                type="button"
                                aria-label={`Remove ${lineName}`}
                                onClick={() => removeCartItem(line.item_id, line.cart_line_id)}
                                style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                              >
                                <Trash2 size={16} strokeWidth={2} />
                              </button>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: 2 }}>
                              <div style={{ display: 'inline-grid', gridTemplateColumns: '32px minmax(24px, auto) 32px', alignItems: 'center', justifyItems: 'center', borderRadius: 999, border: `1px solid ${servicesPrimaryBorder}`, background: '#ffffff', boxShadow: '0 4px 10px rgba(15,23,42,0.04)', padding: '2px 4px', gap: 4 }}>
                                <button
                                  type="button"
                                  aria-label={`Decrease quantity for ${lineName}`}
                                  onClick={() => updateQty(line.item_id, Math.max(0, quantity - 1), line.cart_line_id)}
                                  style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${servicesPrimaryBorder}`, background: '#ffffff', color: servicesPrimary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                                >
                                  <Minus size={14} strokeWidth={2.5} />
                                </button>
                                <span style={{ minWidth: 24, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>
                                  {quantity}
                                </span>
                                <button
                                  type="button"
                                  aria-label={`Increase quantity for ${lineName}`}
                                  onClick={() => updateQty(line.item_id, quantity + 1, line.cart_line_id)}
                                  style={{ width: 28, height: 28, borderRadius: '50%', border: `1px solid ${servicesPrimaryBorder}`, background: '#ffffff', color: servicesPrimary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, lineHeight: 1 }}
                                >
                                  <Plus size={14} strokeWidth={2.5} />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

          </div>

          <footer style={{ borderTop: '1px solid #e2e8f0', paddingTop: isMobileViewport ? 14 : 16, paddingRight: isMobileViewport ? 16 : 20, paddingBottom: isMobileViewport ? 20 : 8, paddingLeft: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
            {safeServiceCartLines.length > 0 ? (
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 10, alignItems: 'center', width: '100%', borderRadius: 12, border: `1px solid ${servicesPrimaryBorder}`, background: servicesPrimarySoft, padding: isMobileViewport ? '10px 12px' : '10px 14px', cursor: 'pointer', textAlign: 'left' }}
              >
                <span style={{ width: 28, height: 28, borderRadius: 8, border: `1px solid ${servicesPrimaryBorder}`, background: '#fff', color: servicesPrimary, display: 'grid', placeItems: 'center' }}>
                  <Plus size={16} strokeWidth={2.5} />
                </span>
                <span style={{ display: 'grid', gap: 2 }}>
                  <strong style={{ display: 'block', fontSize: 14, fontWeight: 800, lineHeight: 1.35, color: servicesPrimary, fontFamily: servicesDisplayFont }}>Add more items</strong>
                  <span style={{ fontSize: 11, lineHeight: 1.45, color: '#64748b' }}>Explore more services and care options.</span>
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: servicesPrimary, fontSize: 12, lineHeight: 1.4, fontWeight: 800, textAlign: 'right', whiteSpace: 'nowrap' }}>
                  Browse Services
                  <ChevronRight size={14} strokeWidth={2.5} />
                </span>
              </button>
            ) : null}

            {hasProductCartConflict ? (
              <div style={{ border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412', borderRadius: 12, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
                Product items are not included in service booking. Continue with service booking only, or remove non-service items first.
              </div>
            ) : null}

            {renderPromoCodePanel ? (
              <div style={{ marginBottom: 8 }}>
                {renderPromoCodePanel({ compact: true, variant: 'services-cart', accentColor: servicesPrimary, bodyFont: servicesDisplayFont, isMobile: isMobileViewport })}
              </div>
            ) : null}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, fontSize: 14, lineHeight: 1.4, color: '#475569' }}>
              <span>Estimated subtotal</span>
              <span style={{ fontWeight: 700, color: '#334155' }}>{money(serviceCartTotal)}</span>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'grid', gap: 6 }}>
                <strong style={{ color: '#0f172a', fontSize: 18, lineHeight: 1.2, fontFamily: servicesDisplayFont }}>Total</strong>
                <span style={{ color: '#64748b', fontSize: 13, lineHeight: 1.2 }}>{serviceCartCount} item{serviceCartCount === 1 ? '' : 's'}</span>
              </div>
              <strong style={{ color: '#0f172a', fontSize: isMobileViewport ? 26 : 32, fontWeight: 900, lineHeight: 1.2, textAlign: 'right', fontFamily: servicesDisplayFont }}>{money(serviceCartTotal)}</strong>
            </div>

            <button
              type="button"
              onClick={handleServicesCartCheckout}
              disabled={!hasServiceCart}
              style={{ width: '100%', minHeight: isMobileViewport ? 48 : 54, padding: '11.2px 17.6px', borderRadius: 18, border: 'none', background: !hasServiceCart ? '#cbd5e1' : `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`, color: '#fff', fontSize: 16, lineHeight: 1.4, fontWeight: 900, fontFamily: servicesDisplayFont, cursor: !hasServiceCart ? 'not-allowed' : 'pointer', boxShadow: !hasServiceCart ? 'none' : `0 14px 30px ${servicesPrimaryShadowStrong}` }}
            >
              Continue to booking
            </button>
          </footer>
        </aside>
      </div>
    </>
  );
}
