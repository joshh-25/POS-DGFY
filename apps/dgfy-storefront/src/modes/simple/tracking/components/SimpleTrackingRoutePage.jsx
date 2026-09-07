import React, { useMemo } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  HelpCircle,
  MapPin,
  MessageSquare,
  PackageCheck,
  Store,
  Truck
} from 'lucide-react';
import TrackingRouteMap from '../../../../tracking/TrackingRouteMapLazy.jsx';
import { extractTrackingMapCoordinates } from '../../../../tracking/extractTrackingMapCoordinates.js';
import { StorefrontOrderInstructions } from '../../../../shared/components/storefront/StorefrontOrderInstructions.jsx';
import { SimpleTrackingCompletedView } from './SimpleTrackingCompletedView.jsx';
import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../../../../shared/components/tracking/StorefrontTrackingLayout.jsx';
import { StorefrontTrackingStatusCard } from '../../../../shared/components/tracking/StorefrontTrackingStatusCard.jsx';
import { StorefrontTrackingTimeline } from '../../../../shared/components/tracking/StorefrontTrackingTimeline.jsx';
import { TRACKING_MAP_HEIGHT } from '../../../../tracking/trackingMapSizing.js';

function SimpleTrackingLoadingState({ selectedTrackingPin }) {
  return (
    <div style={{ border: '1px solid #dbe5ee', borderRadius: 18, padding: 32, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <div className="dgfy-loader" style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid #E4C98E', borderTopColor: '#176B3A', borderRadius: '50%', animation: 'simple-tracking-spin 1s linear infinite', marginBottom: 16 }} />
      <style>{'@keyframes simple-tracking-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Loading Order Details...</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Fetching real-time status for {selectedTrackingPin}</div>
    </div>
  );
}

function TrackingStatusIcon({ status, color }) {
  if (status === 'confirmed') return <Store size={42} color={color} strokeWidth={1.6} />;
  if (status === 'preparing') return <PackageCheck size={42} color={color} strokeWidth={1.6} />;
  if (status === 'out_for_delivery') return <Truck size={42} color={color} strokeWidth={1.6} />;
  if (status === 'completed') return <CheckCircle2 size={42} color={color} strokeWidth={1.6} />;
  return <Clock3 size={42} color={color} strokeWidth={1.6} />;
}

export function SimpleTrackingRoutePage({
  actions,
  formatters,
  getCompletedTrackingLabel,
  getTrackingFlowForOrderMethod,
  isMobileViewport,
  presentation,
  primaryLocationId,
  selectedLocationId,
  selectedStore,
  selectedTrackingPin,
  showCompletedTrackingCard,
  storeLocations,
  trackingError,
  trackingPinInput,
  trackingResult
}) {
  const viewModel = useMemo(() => {
    const activeTrackingPin = String(selectedTrackingPin || trackingPinInput || '').trim().toUpperCase();
    const resultTrackingPin = String(trackingResult?.tracking_pin || '').trim().toUpperCase();
    const isMatchingTrackingPin = Boolean(trackingResult)
      && (!activeTrackingPin || !resultTrackingPin || activeTrackingPin === resultTrackingPin);
    if (!isMatchingTrackingPin) return { isMatchingTrackingPin };

    const orderMethod = String(trackingResult.order_method || 'delivery').trim().toLowerCase();
    const status = String(trackingResult.status || '').trim().toLowerCase();
    const steps = getTrackingFlowForOrderMethod(orderMethod);
    const activeStepIndex = Math.max(0, steps.findIndex((step) => step.id === status));
    const isPickup = orderMethod === 'pickup';
    const locations = Array.isArray(storeLocations) ? storeLocations : [];
    const selectedLocation = locations.find((location) => Number(location.location_id) === Number(selectedLocationId))
      || locations.find((location) => Number(location.location_id) === Number(primaryLocationId))
      || locations[0]
      || null;
    const trackingMapCoordinates = extractTrackingMapCoordinates(trackingResult, selectedStore, selectedLocation);
    const completed = status === 'completed';
    const statusLabel = completed
      ? getCompletedTrackingLabel(orderMethod)
      : (trackingResult.status_label || trackingResult.status || 'Order confirmed');
    const deliveryAddress = String(
      trackingResult.deliveryAddress
      || trackingResult.raw?.data?.order?.delivery_address
      || trackingResult.raw?.data?.delivery_address
      || trackingResult.raw?.order?.delivery_address
      || trackingResult.raw?.delivery_address
      || ''
    ).trim();
    const branchName = String(trackingResult.branchName || selectedLocation?.name || selectedStore?.tenant_name || 'Storefront').trim();
    const branchAddress = String(
      trackingResult.branchAddress
      || selectedLocation?.full_address
      || selectedLocation?.address_line
      || selectedStore?.address_line
      || selectedStore?.locationLabel
      || ''
    ).trim();
    // Phase 210 (#1179). Merchant-attributed copy, only ever shown for a rejected order --
    // never DGFY's own statement.
    const rejectionReason = String(trackingResult.rejectionReason || trackingResult.rejection_reason || '').trim();
    const guidance = status === 'rejected' && rejectionReason
      ? `The store could not accept this order: ${rejectionReason}`
      : ({
        placed: 'We received your product order and it is being confirmed by the store.',
        confirmed: 'The store confirmed your order and is preparing it.',
        preparing: 'Your products are being prepared for dispatch or pickup.',
        out_for_delivery: 'Your order is on the way to you.',
        ready_for_pickup: 'Your order is ready for pickup. Please show your order PIN at the store.',
        completed: isPickup ? 'Your order has been picked up successfully.' : 'Your order has been delivered successfully.'
      }[status] || 'We are preparing your latest order status update.');

    return {
      activeStepIndex,
      branchAddress,
      branchName,
      completed,
      deliveryAddress,
      dgfyBg: '#FFF8E7',
      dgfyBorder: '#E4C98E',
      dgfyPrimary: '#176B3A',
      dgfySoftText: '#64748b',
      guidance,
      hasDiscount: Number.isFinite(trackingResult.discountAmount) && trackingResult.discountAmount > 0,
      hasServiceFee: Number.isFinite(trackingResult.serviceFeeAmount) && trackingResult.serviceFeeAmount > 0,
      isMatchingTrackingPin,
      isPickup,
      mapCoordinates: trackingMapCoordinates,
      orderMethod,
      status,
      statusLabel,
      steps,
      trackingResult
    };
  }, [getCompletedTrackingLabel, getTrackingFlowForOrderMethod, primaryLocationId, selectedLocationId, selectedStore, selectedTrackingPin, storeLocations, trackingPinInput, trackingResult]);

  if (!viewModel.isMatchingTrackingPin) {
    return selectedTrackingPin && !trackingError ? <SimpleTrackingLoadingState selectedTrackingPin={selectedTrackingPin} /> : null;
  }

  const { copyTextToClipboard, goStoreCatalogPage } = actions;
  const { formatTicketDate, money, servicesBodyFont, servicesDisplayFont, TILING_SERVER, tileTransformRequest } = formatters;
  const { dgfyBg, dgfyBorder, dgfyPrimary, dgfySoftText } = viewModel;

  if (viewModel.completed && showCompletedTrackingCard) {
    return (
      <SimpleTrackingCompletedView
        actions={{ goStoreCatalogPage }}
        formatters={{ formatTicketDate, money, servicesBodyFont, servicesDisplayFont }}
        isMobileViewport={isMobileViewport}
        viewModel={viewModel}
      />
    );
  }

  const pin = viewModel.trackingResult.tracking_pin || trackingPinInput;
  const items = Array.isArray(viewModel.trackingResult.items) ? viewModel.trackingResult.items : [];
  const hasSubtotal = Number.isFinite(viewModel.trackingResult.subtotalAmount);
  const hasDeliveryFee = Number.isFinite(viewModel.trackingResult.deliveryFee);
  const hasTotal = Number.isFinite(viewModel.trackingResult.totalAmount);
  const handleBackToItems = () => {
    goStoreCatalogPage();
    window.setTimeout(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      {trackingError ? (
        <div role="alert" style={{ border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', background: '#fff1f2', color: '#b91c1c', fontSize: 14, fontFamily: servicesBodyFont }}>
          {trackingError}
        </div>
      ) : null}

      <StorefrontTrackingLayout isMobileViewport={isMobileViewport} sidebarWidth={360}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div data-tracking-slot="status" style={{ order: getTrackingFlowOrder('status') }}>
          <StorefrontTrackingStatusCard
            title={viewModel.completed ? 'Order Completed' : viewModel.statusLabel}
            description={viewModel.guidance}
            icon={<TrackingStatusIcon status={viewModel.status} color="#fff" size={24} />}
            accentColor={dgfyPrimary}
            background={dgfyBg}
            borderColor={dgfyBorder}
            bodyFont={servicesBodyFont}
            displayFont={servicesDisplayFont}
            isMobileViewport={isMobileViewport}
          />
          </div>

          <div data-tracking-slot="timeline" style={{ order: getTrackingFlowOrder('timeline') }}>
            <StorefrontTrackingTimeline
              ariaLabel="Order progress"
              steps={viewModel.steps}
              activeStepIndex={viewModel.activeStepIndex}
              isCompleted={viewModel.completed}
              isMobileViewport={isMobileViewport}
              accentColor={dgfyPrimary}
              bodyFont={servicesBodyFont}
            />
          </div>

          <div data-tracking-slot="map" style={{ order: getTrackingFlowOrder('map') }}>
          <TrackingRouteMap
            storePin={viewModel.mapCoordinates?.storePin}
            customerPin={viewModel.isPickup ? null : viewModel.mapCoordinates?.customerPin}
            styleUrl={TILING_SERVER}
            transformRequest={tileTransformRequest}
            mapHeight={TRACKING_MAP_HEIGHT}
          />
          </div>

          <div data-tracking-slot="actions" style={{ order: 4, display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
            <button type="button" onClick={presentation?.returnToCatalog ? handleBackToItems : () => actions.setCheckoutTab('checkout')} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 10, padding: '11px 28px', fontSize: 14, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: servicesBodyFont }}>
              {presentation?.backLabel || 'Back to Items'}
            </button>
          </div>
        </div>

        <aside style={{ display: 'grid', gap: 16 }}>
          <section style={{ border: '1px solid #dbe5ee', borderRadius: 18, padding: 18, background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.03)' }}>
            <h2 style={{ margin: '0 0 16px', fontSize: 18, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont }}>Order Details</h2>
            <div style={{ display: 'grid', gap: 14, fontFamily: servicesBodyFont }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div><div style={{ fontSize: 12, color: dgfySoftText }}>Order PIN</div><div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{pin}</div></div>
                <button type="button" onClick={() => copyTextToClipboard(pin, 'Order PIN copied.')} style={{ color: dgfyPrimary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13 }}>Copy</button>
              </div>
              <div style={{ paddingBottom: 4 }}>
                <div style={{ fontSize: 12, color: dgfySoftText }}>Order time</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{viewModel.trackingResult.createdAt ? formatTicketDate(viewModel.trackingResult.createdAt) : (viewModel.trackingResult.updatedAt ? formatTicketDate(viewModel.trackingResult.updatedAt) : 'Today')}</div>
              </div>
              <StorefrontOrderInstructions value={viewModel.trackingResult.specialInstructions} accentColor={dgfyPrimary} bodyFont={servicesBodyFont} compact />
              <div style={{ display: 'grid', gap: 10 }}>
                {items.map((item, index) => (
                  <div key={item.id || index} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}>
                    <span style={{ color: '#334155', minWidth: 0 }}>{item.name} <span style={{ color: dgfySoftText }}>× {item.qty}</span></span>
                    <span style={{ fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{money(item.amount)}</span>
                  </div>
                ))}
              </div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 8, fontSize: 14 }}>
                {hasSubtotal ? <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: dgfySoftText }}>Subtotal</span><span style={{ fontWeight: 600 }}>{money(viewModel.trackingResult.subtotalAmount)}</span></div> : null}
                {viewModel.hasDiscount ? <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d', fontWeight: 700 }}><span>{viewModel.trackingResult.discountLabel || 'Promo / Discount'}</span><span>- {money(viewModel.trackingResult.discountAmount)}</span></div> : null}
                {hasDeliveryFee ? <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: dgfySoftText }}>Delivery fee</span><span style={{ fontWeight: 600 }}>{money(viewModel.trackingResult.deliveryFee)}</span></div> : null}
                {viewModel.hasServiceFee ? <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: dgfySoftText }}>Service fee</span><span style={{ fontWeight: 600 }}>{money(viewModel.trackingResult.serviceFeeAmount)}</span></div> : null}
              </div>
              {hasTotal ? <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont }}>Total</span><span style={{ fontSize: 18, fontWeight: 800, color: dgfyPrimary, fontFamily: servicesDisplayFont }}>{money(viewModel.trackingResult.totalAmount)}</span></div> : null}
              <DownpaymentTrackingSummary trackingResult={viewModel.trackingResult} money={money} orderMethod={viewModel.isPickup ? 'pickup' : 'delivery'} />
            </div>
          </section>

          <section style={{ border: '1px solid #dbe5ee', borderRadius: 18, padding: 18, background: '#fff' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont }}>{viewModel.isPickup ? 'Pickup At' : 'Delivery To'}</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontFamily: servicesBodyFont }}>
              <MapPin size={20} color={dgfyPrimary} style={{ flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', lineHeight: 1.4 }}>{viewModel.isPickup ? viewModel.branchName : (viewModel.deliveryAddress || 'Customer location unavailable')}</div>
                <div style={{ fontSize: 13, color: dgfySoftText, marginTop: 3 }}>{viewModel.isPickup ? (viewModel.branchAddress || 'Branch address unavailable') : (viewModel.deliveryAddress ? 'Customer delivery address' : viewModel.branchName)}</div>
              </div>
            </div>
          </section>

          <section style={{ border: '1px solid #dbe5ee', borderRadius: 18, padding: 18, background: '#fff' }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont }}>Need Help?</h2>
            <div style={{ display: 'grid', gap: 12, fontFamily: servicesBodyFont }}>
              <button type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#334155' }}><span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600 }}><MessageSquare size={18} /> Chat with support</span><ChevronRight size={16} color={dgfySoftText} /></button>
              <div style={{ height: 1, background: '#e2e8f0' }} />
              <button type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: '#334155' }}><span style={{ display: 'inline-flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600 }}><HelpCircle size={18} /> View help center</span><ChevronRight size={16} color={dgfySoftText} /></button>
            </div>
          </section>
        </aside>
      </StorefrontTrackingLayout>
    </div>
  );
}
