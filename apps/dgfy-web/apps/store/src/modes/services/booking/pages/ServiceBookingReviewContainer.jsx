import React from 'react';
import { Trash2 } from 'lucide-react';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';

/**
 * Moved verbatim from `StorefrontApp.jsx`: the "Review Your Booking" summary
 * card previously rendered inline inside the shell's checkout drawer under
 * the `checkoutTab === 'review'` guard. The shell keeps that guard (and the
 * `hasServiceCart`/`!isServicesMode` conditions) and renders this container
 * for the body only. Placed in `modes/services/booking/pages/` since it is
 * entirely service-booking-owned.
 */
export function ServiceBookingReviewContainer({
  cartImageErrors,
  cartTotal,
  firstServiceLine,
  isDesktopCheckout,
  isMobileViewport,
  money,
  openServiceCartEditor,
  removeCartItem,
  serviceBookingSummarySchedule,
  serviceIntakeFields,
  serviceIntakeResponses,
  servicePaymentOptions,
  servicePaymentTiming,
  setCartImageErrors,
  setCheckoutTab,
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktopCheckout ? 'minmax(0, 1.25fr) minmax(280px, 360px)' : '1fr', gap: 16, alignItems: 'start' }}>
      <section style={{ display: 'grid', gap: 14 }}>
        <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 18, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Review Your Booking</div>
              <div style={{ marginTop: 4, fontSize: 13, color: '#64748b' }}>Confirm the selected service, schedule, and booking instructions before you continue.</div>
            </div>
            <button
              type="button"
              onClick={openServiceCartEditor}
              style={{ borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}
            >
              Edit service
            </button>
          </div>
  
          <div style={{ marginTop: 16, border: '1px solid #e2e8f0', borderRadius: 18, padding: 16, background: '#fcfdff', display: 'grid', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '88px 1fr auto', gap: 14, alignItems: 'center' }}>
              <div style={{ width: 88, height: 88, borderRadius: 18, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                {(firstServiceLine?.thumbnail_url || firstServiceLine?.image_url) && !cartImageErrors.has(Number(firstServiceLine.item_id)) ? (
                  <StorefrontResponsiveImage
                    imageSources={resolveStorefrontImageSources(firstServiceLine, { preferred: 'thumbnail' })}
                    alt={firstServiceLine.name}
                    sizes="88px"
                    width={88}
                    height={88}
                    loading="lazy"
                    decoding="async"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={() => {
                      const normalizedLineItemId = Number(firstServiceLine.item_id);
                      if (!Number.isFinite(normalizedLineItemId)) return;
                      setCartImageErrors((prev) => {
                        const next = new Set(prev);
                        next.add(normalizedLineItemId);
                        return next;
                      });
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>No image</span>
                )}
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    {firstServiceLine?.service_detail?.service_type || firstServiceLine?.category || 'Service'}
                  </div>
                  <div style={{ marginTop: 3, fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
                    {firstServiceLine?.variantName || firstServiceLine?.name}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                    {firstServiceLine?.service_detail?.service_area_type || firstServiceLine?.serviceAreaLabel || 'Service'}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                    Qty {firstServiceLine?.quantity || 1}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#334155', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px' }}>
                    {servicePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Payment pending'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', textAlign: isMobileViewport ? 'left' : 'right' }}>
                {money((Number(firstServiceLine?.price || 0) || 0) * Math.max(1, Number(firstServiceLine?.quantity || 1)))}
              </div>
            </div>
  
            <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Preferred schedule</div>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{serviceBookingSummarySchedule}</div>
              </div>
              <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Booking instructions</div>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  {String(firstServiceLine?.service_notes || '').trim() || 'No special instructions yet.'}
                </div>
              </div>
              <div style={{ borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', padding: 14, display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Validation note</div>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5 }}>
                  SKUpervisor confirms conflicts, lead time, and other booking rules when you submit.
                </div>
              </div>
            </div>
  
            {serviceIntakeFields.length > 0 && (
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>Service requirements</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {serviceIntakeFields.map((field) => (
                    <div key={`review-${field.id}`} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '180px 1fr', gap: 10, padding: '10px 0', borderTop: '1px solid #edf2f7' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{field.label}</div>
                      <div style={{ fontSize: 13, color: '#334155' }}>
                        {field.type === 'checkbox'
                          ? (serviceIntakeResponses[field.id] === true ? 'Confirmed' : 'Not confirmed')
                          : (String(serviceIntakeResponses[field.id] || '').trim() || 'Not provided')}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
  
      <aside style={{ display: 'grid', gap: 12, position: isDesktopCheckout ? 'sticky' : 'static', top: 0 }}>
        <div style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: 16, background: '#ffffff', boxShadow: '0 12px 32px rgba(15,23,42,.06)', display: 'grid', gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Booking Summary</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>Move to customer details when the service details look correct.</div>
          </div>
          <div style={{ borderRadius: 16, background: 'linear-gradient(135deg,#0f766e,#1d8f86)', color: '#fff', padding: 14, display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, opacity: .95 }}>Service total</span>
              <strong style={{ fontSize: 18 }}>{money(cartTotal)}</strong>
            </div>
            <div style={{ fontSize: 12, opacity: .95 }}>
              {serviceBookingSummarySchedule}
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <button
              type="button"
              onClick={() => setCheckoutTab('checkout')}
              style={{ borderRadius: 14, border: '1px solid rgba(15,118,110,.15)', background: '#0f766e', color: '#fff', padding: '12px 14px', fontWeight: 800, cursor: 'pointer' }}
            >
              Continue to Checkout
            </button>
            <button
              type="button"
              onClick={() => removeCartItem(firstServiceLine.item_id)}
              style={{ borderRadius: 14, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', padding: '12px 14px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
            >
              <Trash2 size={16} />
              Remove Service
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
