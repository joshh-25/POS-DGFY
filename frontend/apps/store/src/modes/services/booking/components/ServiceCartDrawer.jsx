import React from 'react';
import { Pencil, ShoppingCart, Trash2 } from 'lucide-react';

export function ServiceCartDrawer({
  isCheckoutOpen,
  setIsCheckoutOpen,
  cartButtonRef,
  isMobileViewport,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadow,
  servicesPrimaryShadowStrong,
  servicesDisplayFont,
  serviceCartCount,
  serviceCartLines,
  cartImageErrors,
  setCartImageErrors,
  withAssetOrigin,
  money,
  updateQty,
  removeCartItem,
  openServiceCartEditor,
  productCartLines,
  serviceCartTotal,
  hasServiceCart,
  handleServicesCartCheckout,
}) {
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
          right: isMobileViewport ? 16 : 24,
          bottom: isMobileViewport ? 16 : 24,
          zIndex: 2100,
          width: isMobileViewport ? 62 : 68,
          height: isMobileViewport ? 62 : 68,
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
          background: `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
          color: '#fff',
          boxShadow: `0 18px 38px ${servicesPrimaryShadowStrong}`,
          cursor: 'pointer',
          display: 'grid',
          placeItems: 'center',
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
            border: '2px solid #fff',
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
          pointerEvents: isCheckoutOpen ? 'auto' : 'none',
        }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => setIsCheckoutOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              setIsCheckoutOpen(false);
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(15,23,42,.46)',
            backdropFilter: 'blur(4px)',
            opacity: isCheckoutOpen ? 1 : 0,
            transition: 'opacity 180ms ease',
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
            transform: isCheckoutOpen ? 'translateX(0)' : 'translateX(104%)',
            transition: 'transform 220ms ease',
          }}
        >
          <div style={{ padding: isMobileViewport ? '18px 16px 14px' : '22px 20px 16px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'grid', gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Service Cart</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', fontFamily: servicesDisplayFont }}>Added services</div>
                <div style={{ fontSize: 13, color: '#64748b' }}>Manage the services in cart, then continue to booking.</div>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                style={{ width: 38, height: 38, borderRadius: 999, border: '1px solid #cbd5e1', background: '#fff', color: '#0f172a', fontWeight: 900, cursor: 'pointer' }}
              >
                x
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#0f766e', background: '#ecfeff', border: '1px solid #99f6e4', borderRadius: 999, padding: '4px 10px' }}>
                {serviceCartCount} item{serviceCartCount === 1 ? '' : 's'}
              </span>
              <span style={{ fontSize: 12, color: '#64748b' }}>
                Add one or more services, then continue to booking.
              </span>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 14 }}>
            {serviceCartLines.length === 0 ? (
              <div style={{ border: '1px dashed #cbd5e1', borderRadius: 20, background: '#f8fafc', padding: '28px 20px', textAlign: 'center', display: 'grid', gap: 8 }}>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>No service added yet</div>
                <div style={{ fontSize: 13, lineHeight: 1.6, color: '#64748b' }}>
                  Add a service from the catalog to continue to booking.
                </div>
              </div>
            ) : (
              serviceCartLines.map((line, index) => (
                <div key={`services-cart-line-${line.cart_line_id || line.item_id || index}`} style={{ border: '1px solid #e2e8f0', borderRadius: 22, background: '#fff', boxShadow: '0 12px 28px rgba(15,23,42,.06)', padding: isMobileViewport ? 14 : 16, display: 'grid', gap: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '72px minmax(0, 1fr)', gap: 14, alignItems: 'start' }}>
                    <div style={{ width: 72, height: 72, borderRadius: 14, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                        <img
                          src={withAssetOrigin(line.image_url)}
                          alt={line.variantName || line.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          onError={() => {
                            const normalizedLineItemId = Number(line.item_id);
                            if (!Number.isFinite(normalizedLineItemId)) return;
                            setCartImageErrors((previous) => {
                              const next = new Set(previous);
                              next.add(normalizedLineItemId);
                              return next;
                            });
                          }}
                        />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>No image</span>
                      )}
                    </div>
                    <div style={{ display: 'grid', gap: 10, minWidth: 0 }}>
                      <div style={{ display: 'grid', gap: 8 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto auto auto', alignItems: 'start', gap: 10 }}>
                          <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                            <div style={{ fontSize: isMobileViewport ? 16 : 18, fontWeight: 900, color: '#0f172a', lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {line.variantName || line.name}
                            </div>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap', alignSelf: 'center' }}>
                            {money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}
                          </div>
                          <button
                            type="button"
                            aria-label={`Edit ${line.variantName || line.name}`}
                            onClick={() => openServiceCartEditor(line)}
                            style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#1d4ed8', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${line.variantName || line.name}`}
                            onClick={() => removeCartItem(line.item_id, line.cart_line_id)}
                            style={{ width: 28, height: 28, border: 'none', background: 'transparent', color: '#ef4444', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0, alignSelf: 'center' }}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {!!line.serviceAreaLabel && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                            {line.serviceAreaLabel}
                          </span>
                        )}
                        {!!line.durationLabel && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 8px' }}>
                            {line.durationLabel}
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>
                        <button
                          type="button"
                          onClick={() => updateQty(line.item_id, Math.max(0, Number(line.quantity || 1) - 1), line.cart_line_id)}
                          style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        >
                          -
                        </button>
                        <span style={{ minWidth: 14, textAlign: 'center', fontSize: 14, fontWeight: 800, color: '#0f172a' }}>
                          {Math.max(1, Number(line.quantity || 1))}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQty(line.item_id, Number(line.quantity || 1) + 1, line.cart_line_id)}
                          style={{ width: 28, height: 28, borderRadius: 999, border: '1px solid #dbe5ee', background: '#fff', color: '#0f172a', fontSize: 16, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}

            {productCartLines.length > 0 && (
              <div style={{ border: '1px solid #fdba74', background: '#fff7ed', color: '#9a3412', borderRadius: 16, padding: '12px 14px', fontSize: 13, lineHeight: 1.6 }}>
                Product items are not included in service booking. Continue with service booking only, or remove non-service items first.
              </div>
            )}
          </div>

          <div style={{ borderTop: '1px solid #e2e8f0', padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 12, background: '#ffffff' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: '#64748b' }}>Current total</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#0f172a' }}>{money(serviceCartTotal)}</div>
              </div>
              <div style={{ fontSize: 13, color: '#64748b', textAlign: 'right' }}>
                {serviceCartCount} selected
              </div>
            </div>
            <button
              type="button"
              onClick={handleServicesCartCheckout}
              disabled={!hasServiceCart}
              style={{
                minHeight: 50,
                borderRadius: 16,
                border: 'none',
                background: !hasServiceCart ? '#cbd5e1' : `linear-gradient(135deg,${servicesPrimary},${servicesPrimaryDark})`,
                color: '#fff',
                fontSize: 15,
                fontWeight: 900,
                cursor: !hasServiceCart ? 'not-allowed' : 'pointer',
                boxShadow: !hasServiceCart ? 'none' : `0 14px 30px ${servicesPrimaryShadowStrong}`,
              }}
            >
              Continue to Booking
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}
