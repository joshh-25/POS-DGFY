import React from 'react';
import {
  Check,
  CheckCircle2,
  Store,
  ChefHat,
  ShoppingBag,
  Copy,
  Clock3,
  FileText,
  RotateCcw
} from 'lucide-react';

export const PickupTrackingMobileView = ({
  trackingResult,
  trackingSteps,
  activeStepIndex,
  activeStatus,
  statusGuidance,
  etaHeadline,
  theme,
  actions,
  formatters,
  trackingPinInput,
  TrackingRouteMap,
  mapProps
}) => {
  const activeTrackingPin = trackingResult?.tracking_pin || trackingPinInput || 'N/A';
  const hasSubtotal = Number.isFinite(Number(trackingResult?.subtotalAmount));
  const hasDiscount = Number.isFinite(Number(trackingResult?.discountAmount)) && Number(trackingResult?.discountAmount) > 0;
  const hasDeliveryFee = Number.isFinite(Number(trackingResult?.deliveryFee));
  const hasServiceFee = Number.isFinite(Number(trackingResult?.serviceFeeAmount));
  const discountLabel = String(trackingResult?.discountLabel || 'Promo / Discount').trim();

  // Extract theme colors
  const { primary, secondary, bg, secondaryBg, border, softText } = theme;
  const { copyTextToClipboard, setCheckoutTab, goStoreCatalogPage } = actions;
  const { money, formatTicketDate } = formatters;
  const isCompleted = activeStatus === 'completed';

  // Helper for responsive font sizes on mobile
  const textStyles = {
    h2: { fontSize: 22, fontWeight: 800, color: '#0f172a', margin: 0, letterSpacing: '-0.02em' },
    h3: { fontSize: 18, fontWeight: 800, color: '#0f172a', margin: 0 },
    body: { fontSize: 14, color: '#334155', lineHeight: 1.4 },
    caption: { fontSize: 12, color: softText }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 32 }}>

      {/* 1. Main Status Card (Compact) */}
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: primary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {(activeStatus === 'placed' || activeStatus === 'ready_for_pickup' || activeStatus === 'completed') && <ShoppingBag size={24} strokeWidth={2.5} />}
            {activeStatus === 'confirmed' && <Store size={24} strokeWidth={2.5} />}
            {activeStatus === 'preparing' && <ChefHat size={24} strokeWidth={2.5} />}
          </div>
          <div>
            <h2 style={textStyles.h2}>
              {activeStatus === 'placed' ? 'Order Confirmed!' :
               activeStatus === 'confirmed' ? 'Confirmed by Store!' :
               activeStatus === 'preparing' ? 'Preparing Order \u2728' :
               activeStatus === 'ready_for_pickup' ? 'Ready for Pickup! \uD83C\uDF89' : 'Pickup Completed!'}
            </h2>
          </div>
        </div>

        <div style={textStyles.body}>{statusGuidance}</div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
          <span style={{ color: softText }}>Order PIN</span>
          <span style={{ color: '#0f172a', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '6px 12px' }}>{activeTrackingPin}</span>
          <button type="button" onClick={() => copyTextToClipboard(activeTrackingPin, 'Order PIN copied.')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, color: primary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <Copy size={16} /> Copy
          </button>
        </div>
      </div>

      {/* 2. Timeline (Mobile Optimized) */}
      <div style={{ position: 'relative', padding: '12px 0', display: 'flex', justifyContent: 'space-between', zIndex: 1, overflowX: 'hidden' }}>
        <div style={{ position: 'absolute', top: 26, left: '10%', right: '10%', height: 3, background: '#e2e8f0', zIndex: -1 }}></div>
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: '10%',
            width: `${Math.max(0, (activeStepIndex / (Math.max(1, trackingSteps.length - 1))) * 80)}%`,
            height: 3,
            background: isCompleted ? primary : '#94a3b8',
            zIndex: -1,
            transition: 'width 0.5s ease-in-out',
            borderRadius: 999
          }}
        />

        {trackingSteps.map((step, index) => {
          const done = index < activeStepIndex;
          const active = index === activeStepIndex || (isCompleted && index === trackingSteps.length - 1);
          const pending = !done && !active;
          return (
            <div key={`mobile-step-${step.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, gap: 6, minWidth: 0 }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: pending ? '#fff' : primary, border: `2px solid ${pending ? '#cbd5e1' : primary}`, color: pending ? '#cbd5e1' : '#fff', fontSize: 12, fontWeight: 900, display: 'grid', placeItems: 'center', transition: 'all 0.3s', zIndex: 2 }}>
                {done ? <Check size={16} strokeWidth={4} /> :
                 index === 0 ? <FileText size={14} strokeWidth={2.5} /> :
                 index === 1 ? <Store size={14} strokeWidth={2.5} /> :
                 index === 2 ? <ChefHat size={14} strokeWidth={2.5} /> :
                 <ShoppingBag size={14} strokeWidth={2.5} />
                }
              </div>
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: 11, fontWeight: active ? 700 : 600, color: active ? primary : (pending ? '#94a3b8' : '#334155'), lineHeight: 1.2, wordWrap: 'break-word' }}>
                  {step.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. Preparation Info Card */}
      <div style={{ background: secondaryBg, border: 'none', borderRadius: 16, padding: 16, display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ color: secondary, display: 'flex', placeItems: 'center', flexShrink: 0 }}>
          <ShoppingBag size={24} strokeWidth={2.5} />
        </div>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: secondary }}>
            {activeStatus === 'ready_for_pickup' || isCompleted ? 'Please pick up your order as soon as possible.' : 'We are preparing your order.'}
          </div>
          <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
            {activeStatus === 'ready_for_pickup' || isCompleted ? 'For the best quality, we recommend picking up your order right away.' : 'We will notify you when it is ready for pickup.'}
          </div>
        </div>
      </div>

      {/* 4. Map / Diagram (Compact for Mobile) */}
      {TrackingRouteMap && mapProps && (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <TrackingRouteMap
            storePin={mapProps.storePin}
            customerPin={null} // Pickup has no customer pin
            styleUrl={mapProps.styleUrl}
            transformRequest={mapProps.transformRequest}
            mapHeight={140} // Significantly reduced height for mobile pickup
          />
        </div>
      )}

      {/* 5. Order Details Outline */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.02)' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800 }}>Order Details</h4>
        <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: softText }}>Order time</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{trackingResult.createdAt ? formatTicketDate(trackingResult.createdAt) : (trackingResult.updatedAt ? formatTicketDate(trackingResult.updatedAt) : 'Today')}</div>
        </div>
        <div style={{ display: 'grid', gap: 12 }}>
          {trackingResult.items && trackingResult.items.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
              <div style={{ color: '#334155', flex: 1, paddingRight: 10 }}>{item.name} <span style={{ color: softText }}>{'\u00D7'} {item.qty}</span></div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{money(item.amount)}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gap: 8, marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0', fontSize: 13 }}>
          {hasSubtotal ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{money(trackingResult.subtotalAmount)}</span>
            </div>
          ) : null}
          {hasDiscount ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700 }}>
              <span>{discountLabel || 'Promo / Discount'}</span>
              <span style={{ fontWeight: 800 }}>- {money(trackingResult.discountAmount)}</span>
            </div>
          ) : null}
          {hasDeliveryFee ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Delivery fee</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{money(trackingResult.deliveryFee)}</span>
            </div>
          ) : null}
          {hasServiceFee ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b' }}>
              <span>Service fee</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>{money(trackingResult.serviceFeeAmount)}</span>
            </div>
          ) : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid #e2e8f0' }}>
          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Total</span>
          <span style={{ fontSize: 18, fontWeight: 900, color: primary }}>{money(trackingResult.totalAmount || 0)}</span>
        </div>
      </div>

      {/* 6. Footer Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {isCompleted && (
          <button
            type="button"
            onClick={goStoreCatalogPage}
            style={{ width: '100%', minHeight: 48, borderRadius: 14, border: 'none', background: primary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <RotateCcw size={18} /> Order Again
          </button>
        )}
        <button type="button" onClick={() => setCheckoutTab('menu')} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 700, color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          Back to Menu
        </button>
      </div>

    </div>
  );
};
