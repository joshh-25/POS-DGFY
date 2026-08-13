import React, { useMemo } from 'react';
import {
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  PackageCheck,
  Package,
  PartyPopper,
  ShoppingBag,
  Store,
  Truck,
  XCircle
} from 'lucide-react';
import TrackingRouteMap from '../../../../tracking/TrackingRouteMapLazy.jsx';
import { extractTrackingMapCoordinates } from '../../../../tracking/extractTrackingMapCoordinates.js';
import {
  buildServiceTrackingTimeline,
  getServiceTrackingActiveStepIndex,
  getServiceTrackingStatusCopyForProfile,
  normalizeServiceTrackingStatus
} from '../model/serviceTrackingPresentation.js';
import { getServicesFlowPresentation } from '../../booking/model/servicesLocalFlow.js';
import { ServiceImage } from '../../ServiceImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';

const DEFAULT_THEME = {
  cardBorder: '#8cb4d9',
  primary: '#1a4e8d',
  primaryDark: '#1a4586',
  soft: '#eef6fd',
  secondarySoft: '#aee8f4',
  text: '#10233f',
  muted: '#64748b'
};
const DEFAULT_BODY_FONT = "'Source Sans 3', 'Segoe UI', sans-serif";
const DEFAULT_DISPLAY_FONT = "'Lexend', 'Segoe UI', Arial, sans-serif";

const numberOrNull = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveServiceAddress = (value) => {
  const line = String(value || '').split(/\r?\n/).map((entry) => entry.trim()).find((entry) => /^service address:/i.test(entry));
  return line ? line.replace(/^service address:\s*/i, '').trim() : '';
};

function ServiceTrackingLookup({ actions, isMobileViewport, trackingError, trackingPinInput, isTrackingRefreshing, theme }) {
  return (
    <section style={{ maxWidth: 620, margin: '36px auto 0', border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 20 : 30, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: theme.primary }}>Service tracking</div>
      <h1 style={{ margin: '10px 0 8px', color: theme.text, fontSize: isMobileViewport ? 28 : 36, lineHeight: 1.1, fontFamily: theme.displayFont }}>Track your service booking</h1>
      <p style={{ margin: 0, color: theme.muted, fontSize: 15, lineHeight: 1.6 }}>Enter the booking reference from your confirmation to view the latest service status.</p>
      <form onSubmit={(event) => { event.preventDefault(); actions.handleTrack(); }} style={{ display: 'flex', gap: 10, marginTop: 22, flexDirection: isMobileViewport ? 'column' : 'row' }}>
        <input aria-label="Booking reference" value={trackingPinInput} onChange={(event) => actions.setTrackingPinInput(event.target.value.toUpperCase())} placeholder="Enter booking reference" style={{ flex: 1, minHeight: 48, border: `1px solid ${theme.cardBorder}`, borderRadius: 12, padding: '0 14px', color: theme.text, fontSize: 15, outlineColor: theme.primary, fontFamily: theme.bodyFont }} />
        <button type="submit" disabled={isTrackingRefreshing} style={{ minHeight: 48, border: 0, borderRadius: 12, padding: '0 20px', background: theme.primary, color: '#fff', fontWeight: 800, cursor: isTrackingRefreshing ? 'wait' : 'pointer', fontFamily: theme.bodyFont }}>{isTrackingRefreshing ? 'Loading...' : 'Track booking'}</button>
      </form>
      {trackingError ? <div role="alert" style={{ marginTop: 14, color: '#b42318', fontSize: 14, lineHeight: 1.45 }}>{trackingError}</div> : null}
    </section>
  );
}

function StatusIcon({ status, size = 44 }) {
  const normalized = normalizeServiceTrackingStatus(status);
  if (normalized === 'cancelled') return <XCircle size={size} strokeWidth={1.8} />;
  if (normalized === 'completed') return <CheckCircle2 size={size} strokeWidth={1.8} />;
  if (normalized === 'in_service') return <PackageCheck size={size} strokeWidth={1.8} />;
  if (normalized === 'checked_in') return <CalendarClock size={size} strokeWidth={1.8} />;
  if (normalized === 'confirmed') return <Store size={size} strokeWidth={1.8} />;
  if (normalized === 'quoted' || normalized === 'accepted') return <FileText size={size} strokeWidth={1.8} />;
  if (normalized === 'for_dropoff' || normalized === 'dropoff_completed') return <Package size={size} strokeWidth={1.8} />;
  return <Clock3 size={size} strokeWidth={1.8} />;
}

function StepIcon({ id, done, size = 16 }) {
  if (done) return <Check size={size} strokeWidth={4} />;
  if (id === 'confirmed') return <Store size={size} strokeWidth={2.5} />;
  if (id === 'checked_in') return <PackageCheck size={size} strokeWidth={2.5} />;
  if (id === 'in_service') return <Truck size={size} strokeWidth={2.5} />;
  if (id === 'completed') return <ShoppingBag size={size} strokeWidth={2.5} />;
  return <Clock3 size={size} strokeWidth={2.5} />;
}

export function ServicesTrackingRoutePage({
  actions,
  catalog,
  formatTicketDate,
  isMobileViewport,
  isTrackingRefreshing,
  selectedLocation,
  selectedStore,
  serviceHandoff = 'delivery',
  trackingError,
  trackingPinInput,
  trackingResult,
  tileTransformRequest,
  tilingServer,
  bodyFont = DEFAULT_BODY_FONT,
  displayFont = DEFAULT_DISPLAY_FONT,
  servicesPrimary,
  servicesPrimaryBorder,
  servicesPrimaryDark,
  servicesPrimarySoft
}) {
  const theme = {
    ...DEFAULT_THEME,
    bodyFont,
    displayFont,
    primary: servicesPrimary || DEFAULT_THEME.primary,
    primaryDark: servicesPrimaryDark || DEFAULT_THEME.primaryDark,
    soft: servicesPrimarySoft || DEFAULT_THEME.soft,
    cardBorder: servicesPrimaryBorder || DEFAULT_THEME.cardBorder
  };
  const { cardBorder, primary, primaryDark, soft, secondarySoft, text, muted } = theme;
  const view = useMemo(() => {
    const booking = trackingResult?.booking && typeof trackingResult.booking === 'object' ? trackingResult.booking : {};
    const status = normalizeServiceTrackingStatus(trackingResult?.status);
    const serviceProfileKey = String(trackingResult?.serviceProfileKey || trackingResult?.profile_key || booking.profile_key || '').trim();
    const statusCopy = getServiceTrackingStatusCopyForProfile(status, serviceProfileKey);
    const serviceItemId = numberOrNull(trackingResult?.serviceItemId || booking.service_item_id || trackingResult?.items?.[0]?.item_id);
    const catalogItem = Array.isArray(catalog) ? catalog.find((item) => numberOrNull(item?.item_id) === serviceItemId) : null;
    const item = trackingResult?.items?.[0] || null;
    const imageItem = {
      ...(catalogItem || {}),
      ...(item || {}),
      image_url: item?.image_url
        || item?.thumbnail_url
        || catalogItem?.image_url
        || catalogItem?.storefront_image_url
        || catalogItem?.storefront_image_path
        || '',
      image_variants: item?.image_variants || catalogItem?.image_variants || null
    };
    const handoff = String(serviceHandoff || '').trim().toLowerCase() === 'pickup' ? 'pickup' : 'delivery';
    return {
      activeStepIndex: getServiceTrackingActiveStepIndex(status, serviceProfileKey),
      amount: numberOrNull(trackingResult?.totalAmount ?? booking.total_amount),
      appointmentEnd: trackingResult?.appointmentEndAt || booking.end_at || null,
      appointmentStart: trackingResult?.appointmentStartAt || booking.start_at || null,
      booking,
      customerAddress: resolveServiceAddress(trackingResult?.notes || booking.notes),
      handoff,
      imageSources: imageItem.image_url || imageItem.image_variants
        ? resolveStorefrontImageSources(imageItem, { preferred: 'thumbnail' })
        : null,
      catalogItem,
      item,
      locationAddress: String(trackingResult?.branchAddress || booking.location?.full_address || booking.location?.address_line || '').trim(),
      locationName: String(trackingResult?.branchName || booking.location?.name || '').trim(),
      reference: String(trackingResult?.tracking_pin || trackingResult?.reference || booking.public_reference || '').trim().toUpperCase(),
      serviceCategory: String(trackingResult?.serviceCategory || booking.service_category || '').trim(),
      serviceName: String(trackingResult?.serviceName || item?.name || booking.service_name || booking.service?.name || '').trim(),
      serviceProfileKey,
      status,
      statusCopy,
      statusDate: trackingResult?.updatedAt || trackingResult?.createdAt || booking.updated_at || booking.created_at,
      timeline: buildServiceTrackingTimeline(status, serviceProfileKey),
      localSimulation: trackingResult?.localSimulation === true || trackingResult?.local_simulation === true || booking.local_simulation === true,
      trackingMapCoordinates: extractTrackingMapCoordinates(trackingResult, selectedStore, selectedLocation)
    };
  }, [catalog, selectedLocation, selectedStore, serviceHandoff, trackingResult]);

  if (!trackingResult || !view.reference) {
    return <ServiceTrackingLookup actions={actions} isMobileViewport={isMobileViewport} isTrackingRefreshing={isTrackingRefreshing} trackingError={trackingError} trackingPinInput={trackingPinInput} theme={theme} />;
  }

  const quantity = Math.max(1, Number(view.item?.qty || view.booking.quantity || 1));
  const bookingDate = view.booking.created_at || trackingResult.createdAt || view.appointmentStart;
  const progressWidth = view.activeStepIndex < 0 ? 0 : (view.activeStepIndex / Math.max(1, view.timeline.length - 1)) * 80;
  const isException = view.status === 'cancelled' || view.status === 'no_show';
  const isLocalQuote = view.serviceProfileKey === 'quote_request';
  const isLocalDropoff = view.serviceProfileKey === 'item_dropoff_collection';
  const isPickup = !isLocalQuote && !isLocalDropoff && view.handoff === 'pickup';
  const flowPresentation = getServicesFlowPresentation(view.serviceProfileKey || (isPickup ? 'pickup' : 'delivery'));
  const handoffLabel = flowPresentation.label;
  const handoffTitle = flowPresentation.trackingTitle;
  const handoffDescription = view.localSimulation
    ? flowPresentation.trackingDescription
    : view.statusCopy.guidance;
  const locationTitle = flowPresentation.locationTitle;

  return (
    <>
      {isException ? <div role="alert" style={{ marginTop: 18, border: '1px solid #f2b8b5', borderRadius: 16, padding: '14px 16px', background: '#fff5f5', color: '#9f1c1c', fontWeight: 700 }}>{view.statusCopy.guidance}</div> : null}
      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'minmax(0, 1fr) 370px', gap: 24, marginTop: 28, alignItems: 'start' }}>
        <div style={{ display: 'grid', gap: 24, minWidth: 0 }}>
          <section style={{ background: soft, border: `1px solid ${cardBorder}`, borderRadius: 20, padding: isMobileViewport ? 20 : 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden', position: 'relative', flexWrap: 'wrap', gap: 20 }}>
            <div style={{ zIndex: 2, display: 'flex', gap: 16, alignItems: 'flex-start', flex: '1 1 auto', minWidth: 280 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: primary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}><StatusIcon status={view.status} size={31} /></div>
              <div>
                <h1 style={{ fontSize: isMobileViewport ? 26 : 32, fontWeight: 800, color: text, margin: '0 0 8px', letterSpacing: '-.02em', fontFamily: displayFont }}>{view.statusCopy.label}</h1>
                <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, maxWidth: 500 }}>{view.statusCopy.guidance}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, fontSize: 14, fontWeight: 600 }}>
                  <span style={{ color: muted }}>Booking reference</span><span style={{ color: text, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px' }}>{view.reference}</span>
                  <button type="button" onClick={() => actions.copyTextToClipboard(view.reference, 'Booking reference copied.')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 4, color: primary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: bodyFont }}><Copy size={14} /> Copy</button>
                </div>
              </div>
            </div>
            <div aria-hidden="true" style={{ zIndex: 1, display: 'grid', placeItems: 'center', minWidth: 100, opacity: 0.85, color: primary }}>{isLocalQuote ? <FileText size={94} strokeWidth={1.4} /> : (isLocalDropoff ? <Package size={94} strokeWidth={1.4} /> : (isPickup ? <ShoppingBag size={94} strokeWidth={1.4} /> : <Truck size={94} strokeWidth={1.4} />))}</div>
          </section>

          <section aria-label="Service status timeline" style={{ position: 'relative', padding: '10px 0', display: 'flex', justifyContent: 'space-between', overflowX: 'auto' }}>
            <div style={{ position: 'absolute', top: 22, left: '10%', right: '10%', height: 4, background: '#e2e8f0', zIndex: 0 }} />
            <div style={{ position: 'absolute', top: 22, left: '10%', width: `${Math.max(0, Math.min(80, progressWidth))}%`, height: 4, background: primary, zIndex: 0, transition: 'width .5s ease-in-out', borderRadius: 999 }} />
            {view.timeline.map((step) => {
              const done = step.state === 'done';
              const active = step.state === 'active';
              return <div key={step.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 100, minWidth: 100, gap: 8, zIndex: 1, textAlign: 'center' }}><div style={{ width: 30, height: 30, borderRadius: '50%', background: done || active ? primary : '#fff', border: `2px solid ${done || active ? primary : '#cbd5e1'}`, color: done || active ? '#fff' : '#cbd5e1', display: 'grid', placeItems: 'center', transition: 'all .3s' }}><StepIcon id={step.id} done={done} /></div><div style={{ fontSize: 12, fontWeight: active ? 800 : 600, color: active ? primary : (done ? text : '#94a3b8'), lineHeight: 1.2 }}>{step.label}</div>{active ? <div style={{ fontSize: 11, color: muted, marginTop: -2 }}>Updated</div> : null}</div>;
            })}
          </section>

          <section style={{ background: secondarySoft, borderRadius: 16, padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}><div style={{ color: primaryDark, display: 'grid', placeItems: 'center', flexShrink: 0 }}>{isLocalQuote ? <FileText size={28} /> : (isLocalDropoff ? <Package size={28} /> : (isPickup ? <ShoppingBag size={28} /> : <Truck size={28} />))}</div><div><div style={{ fontSize: 17, fontWeight: 800, color: primaryDark }}>{handoffTitle}</div><div style={{ marginTop: 3, fontSize: 14, color: '#1e516b', lineHeight: 1.45 }}>{handoffDescription}</div></div></section>

          <section style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #d9e4e8', background: '#d9dee1', minHeight: 300 }}>
            {tilingServer && view.trackingMapCoordinates.storePin ? <TrackingRouteMap storePin={view.trackingMapCoordinates.storePin} customerPin={isPickup ? null : view.trackingMapCoordinates.customerPin} styleUrl={tilingServer} transformRequest={tileTransformRequest} mapHeight={300} /> : <div style={{ minHeight: 300, display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#64748b', background: '#eef1f2' }}><div><MapPin size={28} color={primary} /><div style={{ marginTop: 8, fontWeight: 700 }}>Location details will be confirmed by the store.</div></div></div>}
          </section>

        </div>

        <aside style={{ display: 'grid', gap: 20 }}>
          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 18, boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
            <h2 style={{ margin: 0, color: text, fontSize: 23, lineHeight: 1.15, fontFamily: displayFont }}>Booking details</h2>
            <div style={{ display: 'grid', gap: 5 }}><div style={{ color: muted, fontSize: 13 }}>Booking reference</div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><strong style={{ color: text, fontSize: 17, fontFamily: displayFont }}>{view.reference}</strong><button type="button" onClick={() => actions.copyTextToClipboard(view.reference, 'Booking reference copied.')} style={{ border: 0, background: 'transparent', color: primary, display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: bodyFont }}><Copy size={14} /> Copy</button></div></div>
            {bookingDate ? <div style={{ display: 'grid', gap: 5 }}><div style={{ color: muted, fontSize: 13 }}>Booking date</div><strong style={{ color: text, fontSize: 15 }}>{formatTicketDate(bookingDate)}</strong></div> : null}
            <div style={{ borderTop: '1px solid #eef2f7', paddingTop: 16, display: 'grid', gap: 12 }}><div style={{ display: 'flex', alignItems: 'center', gap: 12 }}><div style={{ width: 58, height: 58, borderRadius: 13, overflow: 'hidden', background: soft, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ServiceImage item={view.catalogItem} imageSources={view.imageSources} alt={view.serviceName} sizes="58px" width={58} height={58} fallbackLabel="" fallbackIcon={<PackageCheck size={22} color={primary} />} /></div><div style={{ minWidth: 0, flex: 1 }}><div style={{ color: text, fontSize: 15, fontWeight: 900 }}>{view.serviceName || 'Service booking'}</div><div style={{ color: muted, fontSize: 13, marginTop: 4 }}>x {quantity}{view.serviceCategory ? ` - ${view.serviceCategory}` : ''}</div></div>{view.amount !== null ? <strong style={{ color: primaryDark, fontSize: 15 }}>{actions.money(view.amount)}</strong> : null}</div></div>
            <div style={{ borderTop: '1px dashed #d9e4e8', paddingTop: 16, display: 'grid', gap: 10 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Handoff</span><span style={{ color: text, fontWeight: 800, textAlign: 'right' }}>{handoffLabel}</span></div>{view.amount !== null ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Service total</span><span>{actions.money(view.amount)}</span></div> : null}{view.booking.payment_status ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Payment</span><span style={{ color: text, fontWeight: 800, textTransform: 'capitalize' }}>{String(view.booking.payment_status).replace(/_/g, ' ')}</span></div> : null}</div>
            {view.amount !== null ? <div style={{ borderTop: '1px dashed #d9e4e8', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><strong style={{ color: text, fontSize: 18, fontFamily: displayFont }}>Total</strong><strong style={{ color: text, fontSize: 22, fontFamily: displayFont }}>{actions.money(view.amount)}</strong></div> : null}
          </section>

          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 16 }}><h2 style={{ margin: 0, color: text, fontSize: 21, fontFamily: displayFont }}>{locationTitle}</h2><div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}><MapPin size={23} color={primary} style={{ flexShrink: 0 }} /><div><div style={{ fontWeight: 800, color: text }}>{isLocalQuote ? (view.serviceCategory || 'Details supplied in the request') : (isLocalDropoff || isPickup ? (view.locationName || 'Store branch') : (view.customerAddress || 'Customer address'))}</div><div style={{ marginTop: 3, color: muted, fontSize: 14, lineHeight: 1.45 }}>{isLocalQuote ? 'The business will review this request and prepare a price.' : (isLocalDropoff || isPickup ? (view.locationAddress || 'Branch address will be confirmed by the store.') : (view.locationName || view.locationAddress || 'The store team will confirm delivery details.'))}</div></div></div></section>

          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 4 }}><h2 style={{ margin: 0, color: text, fontSize: 21, fontFamily: displayFont }}>Need help?</h2>{[{ icon: <MessageSquare size={18} />, label: 'Chat with support' }, { icon: <HelpCircle size={18} />, label: 'View help center' }].map((item) => <button key={item.label} type="button" onClick={() => {}} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 46, border: 0, borderBottom: item.label === 'Chat with support' ? '1px solid #e2e8f0' : 'none', background: 'transparent', color: text, padding: '0 0 0 2px', fontSize: 15, cursor: 'pointer', textAlign: 'left', fontFamily: bodyFont }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{item.icon}{item.label}</span><ChevronRight size={18} color={muted} /></button>)}</section>

          <section style={{ border: `1px solid ${cardBorder}`, borderRadius: 18, padding: 18, background: soft, display: 'flex', gap: 12, alignItems: 'flex-start' }}><div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#fff', color: primary }}><PartyPopper size={19} /></div><div><div style={{ fontWeight: 800, color: text }}>Thank you for your booking!</div><div style={{ marginTop: 4, color: muted, fontSize: 14 }}>We&apos;ll update you as your service progresses.</div></div></section>
        </aside>
      </div>
      {view.statusDate ? <div style={{ marginTop: 24, color: muted, fontSize: 13 }}>Last updated {formatTicketDate(view.statusDate)}.</div> : null}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 38 }}><button type="button" onClick={actions.goStoreCatalogPage} style={{ minHeight: 48, minWidth: 204, borderRadius: 14, border: '1px solid #cbd9e6', background: '#fff', color: text, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: bodyFont }}>Back to Services</button></div>
    </>
  );
}
