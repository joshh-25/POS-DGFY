import React from 'react';
import {
  Check,
  Store,
  ChefHat,
  ShoppingBag,
  FileText,
  RotateCcw
} from 'lucide-react';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../../../shared/components/tracking/StorefrontTrackingLayout.jsx';
import { StorefrontTrackingOrderSummary } from '../../../shared/components/tracking/StorefrontTrackingOrderSummary.jsx';
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
  // Extract theme colors
  const { primary, bg, border, softText } = theme;
  const { copyTextToClipboard, goStoreCatalogPage } = actions;
  const { money, formatTicketDate, servicesBodyFont, servicesDisplayFont } = formatters;
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
      <StorefrontTrackingOrderSummary
        accentColor={primary}
        bodyFont={servicesBodyFont}
        displayFont={servicesDisplayFont}
        formatTicketDate={formatTicketDate}
        money={money}
        onCopyPin={(pin) => copyTextToClipboard(pin, 'Order PIN copied.')}
        softText={softText}
        statusLabel={trackingResult?.status_label || activeStatus}
        trackingResult={{ ...trackingResult, tracking_pin: trackingResult?.tracking_pin || trackingPinInput }}
      />
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
