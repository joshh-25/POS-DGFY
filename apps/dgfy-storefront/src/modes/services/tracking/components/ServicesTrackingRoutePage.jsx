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
import { TRACKING_MAP_HEIGHT } from '../../../../tracking/trackingMapSizing.js';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../../../../shared/components/tracking/StorefrontTrackingLayout.jsx';
import { StorefrontTrackingStatusCard } from '../../../../shared/components/tracking/StorefrontTrackingStatusCard.jsx';
import { StorefrontTrackingTimeline } from '../../../../shared/components/tracking/StorefrontTrackingTimeline.jsx';
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
import { SERVICES_BODY_FONT, SERVICES_DISPLAY_FONT } from '../../servicesTypography.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

const DEFAULT_THEME = {
  cardBorder: '#8cb4d9',
  primary: '#1a4e8d',
  primaryDark: '#1a4586',
  soft: '#eef6fd',
  secondarySoft: '#aee8f4',
  text: '#10233f',
  muted: '#64748b'
};
const DEFAULT_BODY_FONT = SERVICES_BODY_FONT;
const DEFAULT_DISPLAY_FONT = SERVICES_DISPLAY_FONT;

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
  const { cardBorder, primary, primaryDark, soft, text, muted } = theme;
  const view = useMemo(() => {
    const booking = trackingResult?.booking && typeof trackingResult.booking === 'object' ? trackingResult.booking : {};
    const status = normalizeServiceTrackingStatus(trackingResult?.status);
    const serviceProfileKey = String(trackingResult?.serviceProfileKey || trackingResult?.profile_key || booking.profile_key || '').trim();
    const statusCopy = getServiceTrackingStatusCopyForProfile(status, serviceProfileKey);
    const amount = numberOrNull(trackingResult?.totalAmount ?? booking.total_amount);
    const reference = String(trackingResult?.tracking_pin || trackingResult?.reference || booking.public_reference || '').trim().toUpperCase();
    const rawItems = Array.isArray(trackingResult?.items)
      ? trackingResult.items.filter((entry) => entry && typeof entry === 'object')
      : [];
    const fallbackServiceName = String(trackingResult?.serviceName || booking.service_name || booking.service?.name || '').trim();
    const sourceItems = rawItems.length > 0
      ? rawItems
      : (fallbackServiceName ? [{
          item_id: trackingResult?.serviceItemId ?? booking.service_item_id,
          name: fallbackServiceName,
          qty: trackingResult?.quantity ?? booking.quantity,
          amount,
          image_url: trackingResult?.serviceImageUrl || '',
          image_variants: trackingResult?.serviceImageVariants || null,
          unit_of_measure: trackingResult?.serviceCategory || booking.service_category || ''
        }] : []);
    const items = sourceItems.map((entry, index) => {
      const itemId = numberOrNull(entry.item_id ?? entry.service_item_id);
      const itemCatalog = Array.isArray(catalog)
        ? catalog.find((catalogEntry) => numberOrNull(catalogEntry?.item_id) === itemId)
        : null;
      const imageItem = {
        ...(itemCatalog || {}),
        ...entry,
        image_url: entry.image_url
          || entry.thumbnail_url
          || itemCatalog?.image_url
          || itemCatalog?.storefront_image_url
          || itemCatalog?.storefront_image_path
          || '',
        image_variants: entry.image_variants || itemCatalog?.image_variants || null
      };
      return {
        ...entry,
        id: entry.id || itemId || `${reference || 'service'}-${index}`,
        item_id: itemId,
        name: String(entry.name || entry.name_snapshot || entry.item_name || entry.service_name || '').trim(),
        qty: Math.max(1, numberOrNull(entry.qty ?? entry.quantity) ?? 1),
        amount: numberOrNull(
          entry.amount
            ?? entry.line_amount
            ?? entry.line_total
            ?? entry.line_subtotal
            ?? entry.subtotal
            ?? entry.total_amount
        ) ?? (sourceItems.length === 1 ? amount : null),
        category: String(entry.unit_of_measure || entry.service_category || entry.category || '').trim(),
        catalogItem: itemCatalog,
        imageSources: imageItem.image_url || imageItem.image_variants
          ? resolveStorefrontImageSources(imageItem, { preferred: 'thumbnail' })
          : null
      };
    }).filter((entry) => entry.name);
    const item = items[0] || null;
    const catalogItem = item?.catalogItem || null;
    const handoff = String(serviceHandoff || '').trim().toLowerCase() === 'pickup' ? 'pickup' : 'delivery';
    return {
      activeStepIndex: getServiceTrackingActiveStepIndex(status, serviceProfileKey),
      amount,
      appointmentEnd: trackingResult?.appointmentEndAt || booking.end_at || null,
      appointmentStart: trackingResult?.appointmentStartAt || booking.start_at || null,
      booking,
      customerAddress: resolveServiceAddress(trackingResult?.notes || booking.notes),
      handoff,
      imageSources: item?.imageSources || null,
      catalogItem,
      item,
      items,
      locationAddress: String(trackingResult?.branchAddress || booking.location?.full_address || booking.location?.address_line || '').trim(),
      locationName: String(trackingResult?.branchName || booking.location?.name || '').trim(),
      reference,
      serviceCategory: String(trackingResult?.serviceCategory || item?.category || booking.service_category || '').trim(),
      serviceName: String(trackingResult?.serviceName || item?.name || fallbackServiceName).trim(),
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

  const bookingDate = view.booking.created_at || trackingResult.createdAt || view.appointmentStart;
  const isException = view.status === 'cancelled' || view.status === 'no_show';
  const isLocalQuote = view.serviceProfileKey === 'quote_request';
  const isLocalDropoff = view.serviceProfileKey === 'item_dropoff_collection';
  const isCustomerAddressService = view.serviceProfileKey === 'service_at_customer_address';
  const isPickup = !isLocalQuote && !isLocalDropoff && view.handoff === 'pickup';
  const flowPresentation = getServicesFlowPresentation(view.serviceProfileKey || (isPickup ? 'pickup' : 'delivery'));
  const handoffLabel = flowPresentation.label;
  const locationTitle = flowPresentation.locationTitle;

  return (
    <>
      {isException ? <div role="alert" style={{ marginTop: 18, border: '1px solid #f2b8b5', borderRadius: 16, padding: '14px 16px', background: '#fff5f5', color: '#9f1c1c', fontWeight: 700 }}>{view.statusCopy.guidance}</div> : null}
      <StorefrontTrackingLayout isMobileViewport={isMobileViewport} sidebarWidth={370} style={{ marginTop: 28 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          <div data-tracking-slot="status" style={{ order: getTrackingFlowOrder('status') }}>
          <StorefrontTrackingStatusCard
            title={view.statusCopy.label}
            description={view.statusCopy.guidance}
            icon={<StatusIcon status={view.status} size={24} />}
            accentColor={primary}
            background={soft}
            borderColor={cardBorder}
            bodyFont={bodyFont}
            displayFont={displayFont}
            isMobileViewport={isMobileViewport}
          />
          </div>

          <div data-tracking-slot="timeline" style={{ order: getTrackingFlowOrder('timeline') }}>
            <StorefrontTrackingTimeline
              ariaLabel="Service status timeline"
              steps={view.timeline}
              activeStepIndex={view.activeStepIndex}
              isCompleted={view.status === 'completed'}
              isMobileViewport={isMobileViewport}
              accentColor={primary}
              bodyFont={bodyFont}
              renderStepIcon={({ step, done, size }) => <StepIcon id={step.id} size={size} done={done} />}
            />
          </div>

          <div data-tracking-slot="map" style={{ order: getTrackingFlowOrder('map') }}>
          <section className="storefront-tracking-map-shell" style={{ borderRadius: 20, overflow: 'hidden', border: '1px solid #d9e4e8', background: '#d9dee1' }}>
            {tilingServer && view.trackingMapCoordinates.storePin ? <TrackingRouteMap storePin={view.trackingMapCoordinates.storePin} customerPin={isPickup ? null : view.trackingMapCoordinates.customerPin} styleUrl={tilingServer} transformRequest={tileTransformRequest} mapHeight={TRACKING_MAP_HEIGHT} /> : <div className="storefront-tracking-map-frame" style={{ display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center', color: '#64748b', background: '#eef1f2' }}><div><MapPin size={28} color={primary} /><div style={{ marginTop: 8, fontWeight: 700 }}>Location details will be confirmed by the store.</div></div></div>}
          </section>
          </div>

        </div>

        <aside style={{ display: 'grid', gap: 20 }}>
          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 18, boxShadow: '0 8px 24px rgba(15,23,42,.04)' }}>
            <h2 style={{ margin: 0, color: text, fontSize: 18, lineHeight: 1.15, fontWeight: 800, fontFamily: displayFont }}>Booking details</h2>
            <div style={{ display: 'grid', gap: 5, minWidth: 0 }}><div style={{ color: muted, fontSize: 13 }}>Booking reference</div><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: isMobileViewport ? 'wrap' : 'nowrap', minWidth: 0 }}><strong style={{ color: text, fontSize: 15, fontWeight: 700, fontFamily: bodyFont, overflowWrap: 'anywhere', minWidth: 0 }}>{view.reference}</strong><button type="button" onClick={() => actions.copyTextToClipboard(view.reference, 'Booking reference copied.')} style={{ border: 0, background: 'transparent', color: primary, display: 'inline-flex', gap: 5, alignItems: 'center', fontWeight: 800, cursor: 'pointer', padding: 0, fontFamily: bodyFont }}> <Copy size={14} /> Copy</button></div></div>
            {bookingDate ? <div style={{ display: 'grid', gap: 5 }}><div style={{ color: muted, fontSize: 13 }}>Booking date</div><strong style={{ color: text, fontSize: 15, fontWeight: 700, fontFamily: bodyFont }}>{formatTicketDate(bookingDate)}</strong></div> : null}
            <div style={{ borderTop: '1px solid #eef2f7', paddingTop: 16, display: 'grid', gap: 12 }}>
              {view.items.map((serviceItem, index) => {
                const itemQuantity = Math.max(1, Number(serviceItem.qty || 1));
                const itemCategory = serviceItem.category || (view.items.length === 1 ? view.serviceCategory : '');
                return (
                  <div
                    key={`${serviceItem.id || 'service'}-${index}`}
                    data-testid="tracking-service-item"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: isMobileViewport ? '58px minmax(0, 1fr)' : '58px minmax(0, 1fr) auto',
                      gap: 12,
                      alignItems: 'start',
                      minWidth: 0
                    }}
                  >
                    <div style={{ width: 58, height: 58, borderRadius: 13, overflow: 'hidden', background: soft, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <ServiceImage item={serviceItem.catalogItem} imageSources={serviceItem.imageSources} alt={serviceItem.name} sizes="58px" width={58} height={58} fallbackLabel="" fallbackIcon={<PackageCheck size={22} color={primary} />} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
                        <div style={{ color: text, fontSize: 15, fontWeight: 800, fontFamily: bodyFont, overflowWrap: 'anywhere', minWidth: 0, flex: '1 1 auto' }}>{serviceItem.name || 'Service booking'}</div>
                        {isMobileViewport && serviceItem.amount !== null ? <strong data-testid="tracking-service-item-amount" style={{ color: primaryDark, fontSize: 13, lineHeight: 1.25, fontWeight: 800, fontFamily: bodyFont, whiteSpace: 'nowrap', textAlign: 'right', flexShrink: 0 }}>{actions.money(serviceItem.amount)}</strong> : null}
                      </div>
                      <div style={{ color: muted, fontSize: 13, marginTop: 4, overflowWrap: 'anywhere' }}>x {formatServiceNumber(itemQuantity)}{itemCategory ? ` - ${itemCategory}` : ''}</div>
                    </div>
                    {!isMobileViewport && serviceItem.amount !== null ? <strong data-testid="tracking-service-item-amount" style={{ color: primaryDark, fontSize: 15, fontWeight: 800, fontFamily: bodyFont, whiteSpace: 'nowrap' }}>{actions.money(serviceItem.amount)}</strong> : null}
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px dashed #d9e4e8', paddingTop: 16, display: 'grid', gap: 10, fontFamily: bodyFont }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Handoff</span><span style={{ color: text, fontWeight: 700, textAlign: 'right' }}>{handoffLabel}</span></div>{view.amount !== null ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Service total</span><span>{actions.money(view.amount)}</span></div> : null}{view.booking.payment_status ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, color: muted, fontSize: 14 }}><span>Payment</span><span style={{ color: text, fontWeight: 700, textTransform: 'capitalize' }}>{String(view.booking.payment_status).replace(/_/g, ' ')}</span></div> : null}</div>
            {view.amount !== null ? <div style={{ borderTop: '1px dashed #d9e4e8', paddingTop: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><strong style={{ color: text, fontSize: 18, fontFamily: displayFont }}>Total</strong><strong style={{ color: text, fontSize: 22, fontFamily: displayFont }}>{actions.money(view.amount)}</strong></div> : null}
          </section>

          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 16, minWidth: 0 }}><h2 style={{ margin: 0, color: text, fontSize: 16, fontWeight: 800, fontFamily: displayFont }}>{locationTitle}</h2><div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}><MapPin size={23} color={primary} style={{ flexShrink: 0 }} /><div style={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: bodyFont }}><div style={{ fontWeight: 600, color: text }}>{isLocalQuote ? (view.serviceCategory || 'Details supplied in the request') : (isLocalDropoff || isPickup ? (view.locationName || 'Store branch') : (view.customerAddress || 'Customer address'))}</div><div style={{ marginTop: 3, color: muted, fontSize: 14, lineHeight: 1.45 }}>{isLocalQuote ? 'The business will review this request and prepare a price.' : (isLocalDropoff || isPickup ? (view.locationAddress || 'Branch address will be confirmed by the store.') : (isCustomerAddressService ? 'The service team will visit this address at the scheduled time.' : (view.locationName || view.locationAddress || 'The store team will confirm delivery details.')))}</div></div></div></section>

          <section style={{ border: '1px solid #d9e4e8', borderRadius: 20, padding: isMobileViewport ? 18 : 24, background: '#fff', display: 'grid', gap: 4 }}><h2 style={{ margin: 0, color: text, fontSize: 16, fontWeight: 800, fontFamily: displayFont }}>Need help?</h2>{[{ icon: <MessageSquare size={18} />, label: 'Chat with support' }, { icon: <HelpCircle size={18} />, label: 'View help center' }].map((item) => <button key={item.label} type="button" onClick={() => {}} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', minHeight: 46, border: 0, borderBottom: item.label === 'Chat with support' ? '1px solid #e2e8f0' : 'none', background: 'transparent', color: text, padding: '0 0 0 2px', fontSize: 15, cursor: 'pointer', textAlign: 'left', fontFamily: bodyFont }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>{item.icon}{item.label}</span><ChevronRight size={18} color={muted} /></button>)}</section>

          <section style={{ border: `1px solid ${cardBorder}`, borderRadius: 18, padding: 18, background: soft, display: 'flex', gap: 12, alignItems: 'flex-start', minWidth: 0 }}><div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: '#fff', color: primary, flexShrink: 0 }}><PartyPopper size={19} /></div><div style={{ minWidth: 0, overflowWrap: 'anywhere', fontFamily: bodyFont }}><div style={{ fontSize: 14, fontWeight: 700, color: text }}>Thank you for your booking!</div><div style={{ marginTop: 4, color: muted, fontSize: 14 }}>We&apos;ll update you as your service progresses.</div></div></section>
        </aside>
      </StorefrontTrackingLayout>
      {view.statusDate ? <div style={{ marginTop: 24, color: muted, fontSize: 13 }}>Last updated {formatTicketDate(view.statusDate)}.</div> : null}
      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 38 }}><button type="button" onClick={actions.goStoreCatalogPage} style={{ minHeight: 48, minWidth: 204, borderRadius: 14, border: '1px solid #cbd9e6', background: '#fff', color: text, fontSize: 15, fontWeight: 800, cursor: 'pointer', fontFamily: bodyFont }}>Back to Services</button></div>
    </>
  );
}
