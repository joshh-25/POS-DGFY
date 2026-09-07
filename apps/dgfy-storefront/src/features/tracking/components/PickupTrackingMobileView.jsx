import React from 'react';
import {
  Check,
  Copy,
  Store,
  ChefHat,
  ShoppingBag,
  FileText,
  RotateCcw
} from 'lucide-react';
import { StorefrontOrderInstructions } from '../../../shared/components/storefront/StorefrontOrderInstructions.jsx';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../../../shared/components/tracking/StorefrontTrackingLayout.jsx';
import { StorefrontTrackingStatusCard } from '../../../shared/components/tracking/StorefrontTrackingStatusCard.jsx';
import { StorefrontTrackingTimeline } from '../../../shared/components/tracking/StorefrontTrackingTimeline.jsx';
import { TRACKING_MAP_HEIGHT } from '../../../tracking/trackingMapSizing.js';

export const PickupTrackingMobileView = ({
  trackingResult,
  trackingSteps,
  activeStepIndex,
  activeStatus,
  statusGuidance,
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
  const { primary, bg, border, softText } = theme;
  const { copyTextToClipboard, goStoreCatalogPage } = actions;
  const { money, formatTicketDate } = formatters;
  const isCompleted = activeStatus === 'completed';
  const handleBackToMenu = () => {
    goStoreCatalogPage();
    window.setTimeout(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  const statusIcon = activeStatus === 'confirmed'
    ? <Store size={24} strokeWidth={2.5} />
    : activeStatus === 'preparing'
      ? <ChefHat size={24} strokeWidth={2.5} />
      : <ShoppingBag size={24} strokeWidth={2.5} />;

  return (
    <StorefrontTrackingLayout isMobileViewport sidebarWidth={360} style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 16, paddingBottom: 32 }}>

      {/* 1. Main Status Card (Compact) */}
      <div data-tracking-slot="status" style={{ order: getTrackingFlowOrder('status') }}>
      <StorefrontTrackingStatusCard
        title={activeStatus === 'placed' ? 'Order Confirmed!' : activeStatus === 'confirmed' ? 'Confirmed by Store!' : activeStatus === 'preparing' ? 'Preparing Order ✨' : activeStatus === 'ready_for_pickup' ? 'Ready for Pickup! 🎉' : 'Pickup Completed!'}
        description={statusGuidance}
        icon={statusIcon}
        accentColor={primary}
        background={bg}
        borderColor={border}
        isMobileViewport
      />
      </div>

      <div data-tracking-slot="timeline" style={{ order: getTrackingFlowOrder('timeline') }}>
        <StorefrontTrackingTimeline
          ariaLabel="Order progress"
          steps={trackingSteps}
          activeStepIndex={activeStepIndex}
          isCompleted={isCompleted}
          isMobileViewport
          accentColor={primary}
          renderStepIcon={({ done, index, size }) => (
            done ? <Check size={size + 2} strokeWidth={4} /> :
              index === 0 ? <FileText size={size} strokeWidth={2.5} /> :
                index === 1 ? <Store size={size} strokeWidth={2.5} /> :
                  index === 2 ? <ChefHat size={size} strokeWidth={2.5} /> :
                    <ShoppingBag size={size} strokeWidth={2.5} />
          )}
        />
      </div>

      {/* 3. Map / Diagram (shared responsive frame) */}
      <div data-tracking-slot="map" style={{ order: getTrackingFlowOrder('map') }}>
      {TrackingRouteMap && mapProps && (
        <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc' }}>
          <TrackingRouteMap
            storePin={mapProps.storePin}
            customerPin={null} // Pickup has no customer pin
            styleUrl={mapProps.styleUrl}
            transformRequest={mapProps.transformRequest}
            mapHeight={TRACKING_MAP_HEIGHT}
          />
        </div>
      )}
      </div>

      {/* 4. Order Details Outline */}
      <div data-tracking-slot="details" style={{ order: 4 }}>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 2px 8px rgba(15,23,42,.02)' }}>
        <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800 }}>Order Details</h4>
        <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: softText }}>Order time</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{trackingResult.createdAt ? formatTicketDate(trackingResult.createdAt) : (trackingResult.updatedAt ? formatTicketDate(trackingResult.updatedAt) : 'Today')}</div>
        </div>
        <div style={{ paddingBottom: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, color: softText }}>Order PIN</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{activeTrackingPin}</div>
            <button type="button" onClick={() => copyTextToClipboard(activeTrackingPin, 'Order PIN copied.')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: primary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Copy size={14} /> Copy
            </button>
          </div>
        </div>
        <StorefrontOrderInstructions value={trackingResult.specialInstructions} accentColor={primary} compact />
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
      </div>

      {/* 5. Footer Actions */}
      <div data-tracking-slot="actions" style={{ order: 5, display: 'flex', flexDirection: 'column', gap: 12, marginTop: 8 }}>
        {isCompleted && (
          <button
            type="button"
            onClick={goStoreCatalogPage}
            style={{ width: '100%', minHeight: 48, borderRadius: 14, border: 'none', background: primary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            <RotateCcw size={18} /> Order Again
          </button>
        )}
        <button type="button" onClick={handleBackToMenu} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 700, color: '#334155', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          Back to Menu
        </button>
      </div>

    </StorefrontTrackingLayout>
  );
};
