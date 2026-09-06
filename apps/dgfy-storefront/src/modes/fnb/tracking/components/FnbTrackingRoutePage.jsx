import React, { useMemo } from 'react';

import { PickupTrackingMobileView } from '../../../../features/tracking/components/PickupTrackingMobileView.jsx';
import TrackingRouteMap from '../../../../tracking/TrackingRouteMapLazy.jsx';
// Issue #282, Phase E: imported from its own pure module (no maplibre-gl
// dependency), not from TrackingRouteMap.jsx / TrackingRouteMapLazy.jsx --
// pulling it from either would defeat the lazy-loading above.
import { extractTrackingMapCoordinates } from '../../../../tracking/extractTrackingMapCoordinates.js';
import { FnbTrackingActiveView } from './FnbTrackingActiveView.jsx';
import { FnbTrackingCompletedView } from './FnbTrackingCompletedView.jsx';

function FnbTrackingLoadingState({ selectedTrackingPin }) {
  return (
    <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 40, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,.04)', maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
      <div className="dgfy-loader" style={{ display: 'inline-block', width: 24, height: 24, border: '3px solid #e2e8f0', borderTopColor: '#0f172a', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: 16 }} />
      <style>{'@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }'}</style>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Loading Order Details...</div>
      <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Fetching real-time status for {selectedTrackingPin}</div>
    </div>
  );
}

export function FnbTrackingRoutePage({
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
  trackingResult,
  withAssetOrigin,
}) {
  const viewModel = useMemo(() => {
    const activeTrackingPin = String(selectedTrackingPin || trackingPinInput || '').trim().toUpperCase();
    const resultTrackingPin = String(trackingResult?.tracking_pin || '').trim().toUpperCase();
    const isMatchingTrackingPin = Boolean(trackingResult)
      && (!activeTrackingPin || !resultTrackingPin || activeTrackingPin === resultTrackingPin);

    if (!isMatchingTrackingPin) return { isMatchingTrackingPin };

    const trackingOrderMethod = String(trackingResult.order_method || 'delivery').trim().toLowerCase();
    const activeStatus = String(trackingResult.status || '').trim().toLowerCase();
    const trackingSteps = getTrackingFlowForOrderMethod(trackingOrderMethod);
    const activeStepIndex = Math.max(0, trackingSteps.findIndex((step) => step.id === activeStatus));
    const isPickup = trackingOrderMethod === 'pickup';
    const finalStatusLabel = activeStatus === 'completed'
      ? getCompletedTrackingLabel(trackingOrderMethod)
      : (trackingResult.status_label || trackingResult.status || 'Order placed');
    const selectedStoreLocationForMap = storeLocations.find((location) => Number(location.location_id) === Number(selectedLocationId))
      || storeLocations.find((location) => Number(location.location_id) === Number(primaryLocationId))
      || storeLocations[0]
      || null;
    const trackingMapCoordinates = extractTrackingMapCoordinates(trackingResult, selectedStore, selectedStoreLocationForMap);
    const pickupBranchName = String(trackingResult.branchName || selectedStoreLocationForMap?.name || selectedStore?.tenant_name || 'Pickup branch').trim();
    const pickupBranchAddress = String(
      trackingResult.branchAddress
      || selectedStoreLocationForMap?.full_address
      || selectedStoreLocationForMap?.address_line
      || selectedStore?.address_line
      || selectedStore?.locationLabel
      || ''
    ).trim();
    const resolvedTrackingDeliveryAddress = String(
      trackingResult.deliveryAddress
      || trackingResult.raw?.data?.order?.delivery_address
      || trackingResult.raw?.data?.delivery_address
      || trackingResult.raw?.order?.delivery_address
      || trackingResult.raw?.delivery_address
      || trackingResult.raw?.data?.payload?.delivery_address
      || ''
    ).trim();
    const statusGuidanceByCode = {
      placed: isPickup ? 'Your pickup order has been received and is being confirmed by the store.' : "We've received your order and it's being confirmed by the store.",
      confirmed: isPickup ? 'The store has confirmed your order and is preparing it with care.' : 'Your order is confirmed and queued for preparation.',
      preparing: isPickup ? 'Good things take time! Your order is being prepared fresh by our team.' : 'The store is currently preparing your order.',
      out_for_delivery: 'Your rider is on the way with your order.',
      ready_for_pickup: 'Great news! Your order is ready to go. Head to the counter and show your PIN to claim your order.',
      completed: isPickup ? 'Your order has been picked up successfully.' : 'Your order has been delivered successfully.',
    };
    const reviewInvites = Array.isArray(trackingResult.review_invites) ? trackingResult.review_invites : [];
    const reviewInviteByItemId = new globalThis.Map(
      reviewInvites
        .filter((invite) => String(invite?.target_type || '').trim() === 'fnb_item' && Number.isFinite(Number(invite?.target_id)))
        .map((invite) => [Number(invite.target_id), invite])
    );

    return {
      activeStatus,
      activeStepIndex,
      completedOnLabel: trackingResult.updatedAt || trackingResult.createdAt
        ? formatters.formatTicketDate(trackingResult.updatedAt || trackingResult.createdAt)
        : 'Today',
      dgfyBg: '#EEF6FD',
      dgfyBorder: '#8CB4D9',
      dgfyPrimary: '#1A4E8D',
      dgfySecondary: '#1A4586',
      dgfySecondaryBg: '#AEE8F4',
      dgfySoftText: '#64748b',
      etaHeadline: activeStatus === 'completed'
        ? (isPickup ? 'Picked up' : 'Delivered')
        : (trackingResult.etaMinutes != null ? `${trackingResult.etaMinutes} mins` : finalStatusLabel),
      finalStatusLabel,
      hasDeliveryFee: Number.isFinite(trackingResult.deliveryFee) && trackingResult.deliveryFee > 0,
      hasDiscount: Number.isFinite(trackingResult.discountAmount) && trackingResult.discountAmount > 0,
      discountLabel: String(trackingResult.discountLabel || 'Promo / Discount').trim(),
      hasServiceFee: Number.isFinite(trackingResult.serviceFeeAmount) && trackingResult.serviceFeeAmount > 0,
      hasSubtotal: Number.isFinite(trackingResult.subtotalAmount),
      isMatchingTrackingPin,
      presentation: {
        backLabel: presentation?.backLabel || 'Back to Menu',
        returnToCatalog: presentation?.returnToCatalog === true,
      },
      isPickup,
      orderTypeLabel: isPickup ? 'Pickup' : 'Delivery',
      pickupBranchAddress,
      pickupBranchName,
      primaryReviewInvite: reviewInvites.find((invite) => String(invite?.target_type || '').trim() === 'fnb_item') || null,
      receiptItems: Array.isArray(trackingResult.items) ? trackingResult.items.filter((item) => String(item?.name || '').trim()) : [],
      resolvedTrackingDeliveryAddress,
      reviewInviteByItemId,
      servicesBodyFont: formatters.servicesBodyFont,
      servicesDisplayFont: formatters.servicesDisplayFont,
      showBreakdown: Number.isFinite(trackingResult.subtotalAmount)
        && (
          Number.isFinite(trackingResult.discountAmount) && trackingResult.discountAmount > 0
          || Number.isFinite(trackingResult.deliveryFee) && trackingResult.deliveryFee > 0
          || Number.isFinite(trackingResult.serviceFeeAmount) && trackingResult.serviceFeeAmount > 0
        ),
      // Phase 210 (#1179). Merchant-attributed copy, only ever shown for a rejected order --
      // never DGFY's own statement.
      statusGuidance: activeStatus === 'rejected' && String(trackingResult.rejectionReason || trackingResult.rejection_reason || '').trim()
        ? `The store could not accept this order: ${String(trackingResult.rejectionReason || trackingResult.rejection_reason).trim()}`
        : (statusGuidanceByCode[activeStatus] || "We're preparing your latest status update."),
      storeAddress: String(selectedStoreLocationForMap?.address_line || selectedStore?.address_line || selectedStore?.locationLabel || '').trim(),
      storeDisplayName: selectedStore?.tenant_name || 'Storefront',
      storeLogoUrl: withAssetOrigin(selectedStore?.storefront_profile_image_url),
      trackingMapCoordinates,
      trackingOrderMethod,
      trackingPinInput,
      trackingResult,
      trackingSteps,
    };
  }, [formatters, getCompletedTrackingLabel, getTrackingFlowForOrderMethod, presentation, primaryLocationId, selectedLocationId, selectedStore, selectedTrackingPin, storeLocations, trackingPinInput, trackingResult, withAssetOrigin]);

  if (!viewModel.isMatchingTrackingPin) {
    return selectedTrackingPin && !trackingError ? <FnbTrackingLoadingState selectedTrackingPin={selectedTrackingPin} /> : null;
  }

  const sharedViewProps = {
    actions,
    formatters,
    isMobileViewport,
    viewModel,
  };

  if (viewModel.activeStatus === 'completed' && showCompletedTrackingCard) {
    return <FnbTrackingCompletedView {...sharedViewProps} />;
  }

  if (viewModel.isPickup && isMobileViewport) {
    return (
      <PickupTrackingMobileView
        trackingResult={trackingResult}
        trackingSteps={viewModel.trackingSteps}
        activeStepIndex={viewModel.activeStepIndex}
        activeStatus={viewModel.activeStatus}
        statusGuidance={viewModel.statusGuidance}
        etaHeadline={viewModel.etaHeadline}
        theme={{ primary: viewModel.dgfyPrimary, secondary: viewModel.dgfySecondary, bg: viewModel.dgfyBg, secondaryBg: viewModel.dgfySecondaryBg, border: viewModel.dgfyBorder, softText: '#64748b' }}
        actions={{ copyTextToClipboard: actions.copyTextToClipboard, setCheckoutTab: actions.setCheckoutTab, goStoreCatalogPage: actions.goStoreCatalogPage }}
        formatters={{ money: formatters.money, formatTicketDate: formatters.formatTicketDate }}
        trackingPinInput={trackingPinInput}
        TrackingRouteMap={TrackingRouteMap}
        mapProps={{ storePin: viewModel.trackingMapCoordinates?.storePin, styleUrl: formatters.TILING_SERVER, transformRequest: formatters.tileTransformRequest }}
      />
    );
  }

  return (
    <FnbTrackingActiveView
      {...sharedViewProps}
      mapProps={{ TILING_SERVER: formatters.TILING_SERVER, tileTransformRequest: formatters.tileTransformRequest, TrackingRouteMap }}
    />
  );
}
