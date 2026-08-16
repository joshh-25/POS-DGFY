import React from 'react';
import { Check, Clock3, FileText, RotateCcw, ShoppingBag, Store, Truck } from 'lucide-react';

/** Simple/MSME completion summary shown after the tracking status reaches completed. */
export function SimpleTrackingCompletedView({ actions, formatters, isMobileViewport, viewModel }) {
  const { goStoreCatalogPage } = actions;
  const { formatTicketDate, money, servicesBodyFont, servicesDisplayFont } = formatters;
  const {
    branchAddress,
    branchName,
    dgfyBorder,
    dgfyPrimary,
    isPickup,
    trackingResult
  } = viewModel;
  const items = Array.isArray(trackingResult?.items)
    ? trackingResult.items.filter((item) => String(item?.name || '').trim())
    : [];
  const completedOn = trackingResult?.updatedAt || trackingResult?.createdAt;
  const completedOnLabel = completedOn ? formatTicketDate(completedOn) : 'Today';
  const hasSubtotal = Number.isFinite(trackingResult?.subtotalAmount);
  const hasDeliveryFee = Number.isFinite(trackingResult?.deliveryFee);
  const hasDiscount = Number.isFinite(trackingResult?.discountAmount) && trackingResult.discountAmount > 0;
  const hasServiceFee = Number.isFinite(trackingResult?.serviceFeeAmount) && trackingResult.serviceFeeAmount > 0;

  return (
    <div
      data-testid="simple-tracking-completed"
      style={{
        maxWidth: 560,
        margin: '0 auto',
        border: '1px solid #D8E8DC',
        borderRadius: 20,
        padding: isMobileViewport ? 16 : 28,
        background: '#fff',
        boxShadow: '0 4px 20px rgba(23,107,58,.06)',
        display: 'grid',
        gap: 16,
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <section style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 8, paddingBottom: 8 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ecfdf5', border: '2px solid #86efac', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
          <Check size={36} strokeWidth={3} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: dgfyPrimary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: servicesBodyFont }}>
          {isPickup ? 'Pickup Completed' : 'Delivery Completed'}
        </div>
        <h1 style={{ margin: 0, fontSize: isMobileViewport ? 26 : 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, fontFamily: servicesDisplayFont }}>
          {isPickup ? 'Order Picked Up' : 'Order Delivered'}
        </h1>
        <div style={{ fontSize: 14, color: '#64748b', fontFamily: servicesBodyFont }}>
          {isPickup ? 'Thank you! Your order has been picked up.' : 'Thank you! Your order has been delivered.'}
        </div>
      </section>

      <section style={{ border: '1px solid #eef2f7', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9', color: dgfyPrimary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Store size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0, fontFamily: servicesBodyFont }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{branchName || 'Storefront'}</div>
          {branchAddress ? <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' }}>{branchAddress}</div> : null}
        </div>
      </section>

      <section style={{ border: '1px solid #eef2f7', borderRadius: 14, padding: '14px 16px', display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(3, 1fr)', gap: isMobileViewport ? 12 : 8, fontFamily: servicesBodyFont }}>
        <div style={{ display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12 }}><FileText size={15} color={dgfyPrimary} /> Reference No.</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{trackingResult?.tracking_pin || 'N/A'}</div>
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12 }}><Clock3 size={15} color={dgfyPrimary} /> {isPickup ? 'Picked Up On' : 'Delivered On'}</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{completedOnLabel}</div>
        </div>
        <div style={{ display: 'grid', gap: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#64748b', fontSize: 12 }}>{isPickup ? <ShoppingBag size={15} color={dgfyPrimary} /> : <Truck size={15} color={dgfyPrimary} />} Order Type</div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{isPickup ? 'Pickup' : 'Delivery'}</div>
        </div>
      </section>

      {items.length > 0 ? (
        <section style={{ display: 'grid', gap: 10, fontFamily: servicesBodyFont }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Ordered Items ({items.length})</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((item, index) => (
              <div key={item.id || index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minWidth: 0 }}>
                <div style={{ minWidth: 0, fontSize: 14, color: '#0f172a', overflowWrap: 'anywhere' }}>
                  {item.name} <span style={{ color: '#64748b', fontSize: 12 }}>x {item.qty}</span>
                </div>
                {Number.isFinite(item.amount) ? <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{money(item.amount)}</div> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section style={{ borderTop: '1px solid #eef2f7', paddingTop: 14, display: 'grid', gap: 7, fontSize: 13, fontFamily: servicesBodyFont }}>
        {hasSubtotal ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}><span>Subtotal</span><span>{money(trackingResult.subtotalAmount)}</span></div> : null}
        {hasDiscount ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700 }}><span>{trackingResult.discountLabel || 'Promo / Discount'}</span><span>- {money(trackingResult.discountAmount)}</span></div> : null}
        {hasDeliveryFee ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}><span>Delivery fee</span><span>{money(trackingResult.deliveryFee)}</span></div> : null}
        {hasServiceFee ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}><span>Service fee</span><span>{money(trackingResult.serviceFeeAmount)}</span></div> : null}
        <div style={{ borderTop: `1px dashed ${dgfyBorder}`, paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont }}>Total Amount</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: dgfyPrimary, fontFamily: servicesDisplayFont }}>{money(trackingResult?.totalAmount || 0)}</span>
        </div>
      </section>

      <button type="button" onClick={goStoreCatalogPage} style={{ width: '100%', minHeight: 46, borderRadius: 12, border: 'none', background: dgfyPrimary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: servicesBodyFont }}>
        <RotateCcw size={18} /> Order Again
      </button>
    </div>
  );
}
