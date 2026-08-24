import React, { useMemo } from 'react';
import {
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock3,
  HelpCircle,
  MapPin,
  MessageSquare,
  PackageCheck,
  ShoppingBag,
  Store,
  Truck
} from 'lucide-react';
import TrackingRouteMap from '../../../../tracking/TrackingRouteMapLazy.jsx';
import { extractTrackingMapCoordinates } from '../../../../tracking/extractTrackingMapCoordinates.js';
import { SimpleTrackingCompletedView } from './SimpleTrackingCompletedView.jsx';
import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';

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
    const guidance = {
      placed: 'We received your product order and it is being confirmed by the store.',
      confirmed: 'The store confirmed your order and is preparing it.',
      preparing: 'Your products are being prepared for dispatch or pickup.',
      out_for_delivery: 'Your order is on the way to you.',
      ready_for_pickup: 'Your order is ready for pickup. Please show your order PIN at the store.',
      completed: isPickup ? 'Your order has been picked up successfully.' : 'Your order has been delivered successfully.'
    }[status] || 'We are preparing your latest order status update.';

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

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 360px', gap: 24, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 20, minWidth: 0 }}>
          <section style={{ background: dgfyBg, border: `1px solid ${dgfyBorder}`, borderRadius: 18, padding: isMobileViewport ? 18 : 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', minWidth: 0, flex: '1 1 300px' }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: dgfyPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                {viewModel.completed ? <Check size={28} strokeWidth={3} /> : <PackageCheck size={28} strokeWidth={2.2} />}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: isMobileViewport ? 22 : 26, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont, lineHeight: 1.2 }}>
                  {viewModel.completed ? 'Order Completed' : viewModel.statusLabel}
                </div>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, marginTop: 6, maxWidth: 520 }}>{viewModel.guidance}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 14, fontSize: 14, fontWeight: 600, fontFamily: servicesBodyFont }}>
                  <span style={{ color: dgfySoftText }}>Order PIN</span>
                  <span style={{ color: '#0f172a', background: '#fff', border: '1px solid #dbe5ee', borderRadius: 6, padding: '4px 10px' }}>{pin}</span>
                  <button type="button" onClick={() => copyTextToClipboard(pin, 'Order PIN copied.')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: dgfyPrimary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: servicesBodyFont }}>
                    <ClipboardCopy size={14} /> Copy
                  </button>
                </div>
              </div>
            </div>
            {!isMobileViewport ? (
              <div style={{ width: 96, height: 76, borderRadius: 16, background: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                <TrackingStatusIcon status={viewModel.status} color={dgfyPrimary} />
              </div>
            ) : null}
          </section>

          <section aria-label="Order progress" style={{ position: 'relative', padding: '8px 0 2px', display: 'grid', gridTemplateColumns: `repeat(${viewModel.steps.length}, minmax(0, 1fr))`, gap: isMobileViewport ? 4 : 12, width: '100%', overflow: 'visible' }}>
            <div style={{ position: 'absolute', top: 21, left: '8%', right: '8%', height: 4, background: '#e2e8f0', zIndex: 0 }} />
            <div style={{ position: 'absolute', top: 21, left: '8%', width: `${Math.max(0, (viewModel.activeStepIndex / Math.max(1, viewModel.steps.length - 1)) * 84)}%`, height: 4, background: dgfyPrimary, zIndex: 0, borderRadius: 999, transition: 'width .3s ease' }} />
            {viewModel.steps.map((step, index) => {
              const done = index < viewModel.activeStepIndex;
              const active = index === viewModel.activeStepIndex || (viewModel.completed && index === viewModel.steps.length - 1);
              return (
                <div key={step.id} style={{ minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, position: 'relative', zIndex: 1 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: done || active ? dgfyPrimary : '#fff', border: `2px solid ${done || active ? dgfyPrimary : '#cbd5e1'}`, color: done || active ? '#fff' : '#94a3b8', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>
                    {done ? <Check size={16} strokeWidth={4} /> : index + 1}
                  </div>
                  <div style={{ textAlign: 'center', fontSize: isMobileViewport ? 10 : 11, lineHeight: 1.2, fontWeight: active ? 700 : 600, color: active ? dgfyPrimary : (done ? '#334155' : '#94a3b8'), fontFamily: servicesBodyFont, maxWidth: isMobileViewport ? 64 : 96 }}>{step.label}</div>
                </div>
              );
            })}
          </section>

          <div style={{ background: '#FFFBF0', border: `1px solid ${dgfyBorder}`, borderRadius: 16, padding: 18, display: 'flex', gap: 12, alignItems: 'center' }}>
            <ShoppingBag size={24} color={dgfyPrimary} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: servicesDisplayFont }}>{viewModel.completed ? 'Your order is complete.' : 'We are processing your order.'}</div>
              <div style={{ fontSize: 13, color: '#475569', marginTop: 3 }}>We will keep this page updated as the store changes the order status.</div>
            </div>
          </div>

          <TrackingRouteMap
            storePin={viewModel.mapCoordinates?.storePin}
            customerPin={viewModel.isPickup ? null : viewModel.mapCoordinates?.customerPin}
            styleUrl={TILING_SERVER}
            transformRequest={tileTransformRequest}
            mapHeight={280}
          />

          <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 2 }}>
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
              <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: 14 }}>
                <div style={{ fontSize: 12, color: dgfySoftText }}>Order time</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{viewModel.trackingResult.createdAt ? formatTicketDate(viewModel.trackingResult.createdAt) : (viewModel.trackingResult.updatedAt ? formatTicketDate(viewModel.trackingResult.updatedAt) : 'Today')}</div>
              </div>
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
      </div>
    </div>
  );
}
