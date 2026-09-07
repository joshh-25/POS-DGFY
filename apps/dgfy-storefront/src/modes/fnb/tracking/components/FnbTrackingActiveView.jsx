import React from 'react';
import {
  Bike,
  Check,
  ChefHat,
  ChevronRight,
  Clock3,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  PartyPopper,
  ShoppingBag,
  Store,
} from 'lucide-react';
import { DownpaymentTrackingSummary } from '../../../../shared/components/tracking/DownpaymentTrackingSummary.jsx';
import { StorefrontOrderInstructions } from '../../../../shared/components/storefront/StorefrontOrderInstructions.jsx';
import { getTrackingFlowOrder, StorefrontTrackingLayout } from '../../../../shared/components/tracking/StorefrontTrackingLayout.jsx';
import { StorefrontTrackingStatusCard } from '../../../../shared/components/tracking/StorefrontTrackingStatusCard.jsx';
import { StorefrontTrackingTimeline } from '../../../../shared/components/tracking/StorefrontTrackingTimeline.jsx';
import { TRACKING_MAP_HEIGHT } from '../../../../tracking/trackingMapSizing.js';

export function FnbTrackingActiveView({ actions, formatters, isMobileViewport, mapProps, viewModel }) {
  const {
    activeStatus,
    activeStepIndex,
    dgfyBg,
    dgfyBorder,
    dgfyPrimary,
    dgfySoftText,
    finalStatusLabel,
    isPickup,
    presentation,
    pickupBranchAddress,
    pickupBranchName,
    resolvedTrackingDeliveryAddress,
    servicesBodyFont,
    servicesDisplayFont,
    statusGuidance,
    trackingMapCoordinates,
    trackingResult,
    trackingSteps,
  } = viewModel;
  const { copyTextToClipboard, goStoreCatalogPage } = actions;
  const { formatTicketDate, money } = formatters;
  const handleBackToCatalog = () => {
    goStoreCatalogPage();
    window.setTimeout(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };
  const { TILING_SERVER, tileTransformRequest, TrackingRouteMap } = mapProps;
  const statusTitle = isPickup
    ? (activeStatus === 'placed' ? 'Order Confirmed!' : activeStatus === 'confirmed' ? 'Confirmed by Store!' : activeStatus === 'preparing' ? 'Preparing Your Order ✨' : activeStatus === 'ready_for_pickup' ? 'Your Order is Ready for Pickup! 🎉' : 'Pickup Completed!')
    : finalStatusLabel;
  const statusIcon = isPickup
    ? (activeStatus === 'confirmed' ? <Store size={24} strokeWidth={2.5} /> : activeStatus === 'preparing' ? <ChefHat size={24} strokeWidth={2.5} /> : <Check size={24} strokeWidth={2.5} />)
    : (activeStatus === 'confirmed' ? <Store size={24} strokeWidth={2.5} /> : activeStatus === 'preparing' ? <ChefHat size={24} strokeWidth={2.5} /> : activeStatus === 'out_for_delivery' ? <Bike size={24} strokeWidth={2.5} /> : activeStatus === 'completed' ? <Check size={24} strokeWidth={2.5} /> : <Clock3 size={24} strokeWidth={2.5} />);

  return (
                    <StorefrontTrackingLayout isMobileViewport={isMobileViewport} sidebarWidth={360}>
                      {/* Left Column: Tracking Flow */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
                        <div data-tracking-slot="status" style={{ order: getTrackingFlowOrder('status') }}>
                          <StorefrontTrackingStatusCard
                            title={statusTitle}
                            description={statusGuidance}
                            icon={statusIcon}
                            accentColor={dgfyPrimary}
                            background={isPickup ? dgfyBg : '#fafaf9'}
                            borderColor={isPickup ? dgfyBorder : '#e7e5e4'}
                            bodyFont={servicesBodyFont}
                            displayFont={servicesDisplayFont}
                            isMobileViewport={isMobileViewport}
                          />
                        </div>

                        <div data-tracking-slot="timeline" style={{ order: getTrackingFlowOrder('timeline') }}>
                          <StorefrontTrackingTimeline
                            ariaLabel="Order progress"
                            steps={trackingSteps}
                            activeStepIndex={activeStepIndex}
                            isCompleted={activeStatus === 'completed'}
                            isMobileViewport={isMobileViewport}
                            accentColor={dgfyPrimary}
                            bodyFont={servicesBodyFont}
                            showUpdated
                            renderStepIcon={({ done, index, size }) => isPickup ? (
                              done ? <Check size={size + 2} strokeWidth={4} /> :
                              index === 0 ? <FileText size={size} strokeWidth={2.5} /> :
                              index === 1 ? <Store size={size} strokeWidth={2.5} /> :
                              index === 2 ? <ChefHat size={size} strokeWidth={2.5} /> :
                              <ShoppingBag size={size} strokeWidth={2.5} />
                            ) : (
                              done ? <Check size={size + 2} strokeWidth={4} /> : index + 1
                            )}
                          />
                        </div>

                        {/* Map Section */}
                        <div data-tracking-slot="map" style={{ order: getTrackingFlowOrder('map') }}>
                        <TrackingRouteMap
                          storePin={trackingMapCoordinates.storePin}
                          customerPin={isPickup ? null : trackingMapCoordinates.customerPin}
                          styleUrl={TILING_SERVER}
                          transformRequest={tileTransformRequest}
                          mapHeight={TRACKING_MAP_HEIGHT}
                        />
                        </div>

                        {/* Trust badges are omitted to keep the active tracking flow compact. */}

                        {/* Bottom Actions */}
                        <div data-tracking-slot="actions" style={{ order: 6, display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                          <button type="button" onClick={handleBackToCatalog} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 32px', fontSize: 15, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: servicesBodyFont }}>
                            {presentation.backLabel}
                          </button>
                        </div>
                      </div>

                      {/* Right Column: Order Details Sidebar */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                        {/* Receipt Box */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.03)' }}>
                           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                              <h4 style={{ margin: 0, fontSize: 18, fontWeight: 800, fontFamily: servicesDisplayFont }}>Order Details</h4>
                           </div>
                           <div style={{ display: 'grid', gap: 16 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div>
                                  <div style={{ fontSize: 12, color: dgfySoftText }}>Order PIN</div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>{trackingResult.tracking_pin}</div>
                                </div>
                                <button type="button" onClick={() => copyTextToClipboard(trackingResult.tracking_pin, 'Order PIN copied.')} style={{ color: dgfyPrimary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 13, fontFamily: servicesBodyFont }}>Copy</button>
                              </div>
                               <div style={{ paddingBottom: 4 }}>
                                 <div style={{ fontSize: 12, color: dgfySoftText }}>Order time</div>
                                 <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>{trackingResult.createdAt ? formatTicketDate(trackingResult.createdAt) : (trackingResult.updatedAt ? formatTicketDate(trackingResult.updatedAt) : 'Today')}</div>
                               </div>
                               <StorefrontOrderInstructions value={trackingResult.specialInstructions} accentColor={dgfyPrimary} bodyFont={servicesBodyFont} compact />
                               <div style={{ display: 'grid', gap: 12 }}>
                                {trackingResult.items && trackingResult.items.map((item, idx) => (
                                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                                    <div style={{ color: '#334155', flex: 1, paddingRight: 10 }}>{item.name} <span style={{ color: dgfySoftText }}>{'\u00D7'} {item.qty}</span></div>
                                    <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: servicesBodyFont }}>{money(item.amount)}</div>
                                  </div>
                                ))}
                              </div>
                              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'grid', gap: 8, fontSize: 14 }}>
                                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                   <span style={{ color: dgfySoftText }}>Subtotal</span>
                                   <span style={{ fontWeight: 600, fontFamily: servicesBodyFont }}>{money(trackingResult.subtotalAmount ?? 0)}</span>
                                 </div>
                                 {viewModel.hasDiscount ? (
                                   <div style={{ display: 'flex', justifyContent: 'space-between', color: '#15803d' }}>
                                     <span>{viewModel.discountLabel || 'Promo / Discount'}</span>
                                     <span style={{ fontWeight: 700, fontFamily: servicesBodyFont }}>- {money(trackingResult.discountAmount)}</span>
                                   </div>
                                 ) : null}
                                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span style={{ color: dgfySoftText }}>Delivery fee</span>
                                   <span style={{ fontWeight: 600, fontFamily: servicesBodyFont }}>{money(trackingResult.deliveryFee ?? 0)}</span>
                                 </div>
                                 <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                   <span style={{ color: dgfySoftText }}>Service fee</span>
                                   <span style={{ fontWeight: 600, fontFamily: servicesBodyFont }}>{money(trackingResult.serviceFeeAmount ?? 0)}</span>
                                 </div>
                              </div>
                              <div style={{ borderTop: '1px dashed #cbd5e1', paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                 <span style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont }}>Total</span>
                                 <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont }}>{money(trackingResult.totalAmount || 0)}</span>
                              </div>
                              <DownpaymentTrackingSummary trackingResult={trackingResult} money={money} orderMethod={isPickup ? 'pickup' : 'delivery'} />
                           </div>
                        </div>

                        {/* Delivery/Pickup Location Box */}
                        {!isPickup ? (
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.03)' }}>
                             <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, fontFamily: servicesDisplayFont }}>Delivery To</h4>
                             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                               <MapPin size={20} color={dgfyPrimary} style={{ flexShrink: 0, marginTop: 2 }} />
                               <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.4, fontFamily: servicesBodyFont }}>
                                  {resolvedTrackingDeliveryAddress || 'Customer location unavailable'}
                                </div>
                                <div style={{ fontSize: 13, color: dgfySoftText, marginTop: 2 }}>
                                  {resolvedTrackingDeliveryAddress ? 'Customer delivery address' : (trackingResult.branchName || 'Main Branch')}
                                </div>
                              </div>
                             </div>
                          </div>
                        ) : (
                          <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.03)' }}>
                             <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, fontFamily: servicesDisplayFont }}>Pickup At</h4>
                             <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                               <MapPin size={20} color={dgfyPrimary} style={{ flexShrink: 0, marginTop: 2 }} />
                               <div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', lineHeight: 1.4, fontFamily: servicesBodyFont }}>
                                  {pickupBranchName}
                                </div>
                                <div style={{ fontSize: 13, color: dgfySoftText, marginTop: 2 }}>
                                  {pickupBranchAddress || 'Branch address unavailable'}
                                </div>
                              </div>
                             </div>
                          </div>
                        )}

                        {/* Need Help Box */}
                        <div style={{ border: '1px solid #e2e8f0', borderRadius: 20, padding: 20, background: '#fff', boxShadow: '0 4px 12px rgba(15,23,42,.03)' }}>
                           <h4 style={{ margin: '0 0 16px 0', fontSize: 16, fontWeight: 800, fontFamily: servicesDisplayFont }}>Need Help?</h4>
                           <div style={{ display: 'grid', gap: 12 }}>
                              <button type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600, color: '#334155', fontFamily: servicesBodyFont }}>
                                  <MessageSquare size={18} /> Chat with support
                                </div>
                                <ChevronRight size={16} color={dgfySoftText} />
                              </button>
                              <div style={{ height: 1, background: '#e2e8f0' }}></div>
                              <button type="button" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
                                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14, fontWeight: 600, color: '#334155', fontFamily: servicesBodyFont }}>
                                  <HelpCircle size={18} /> View help center
                                </div>
                                <ChevronRight size={16} color={dgfySoftText} />
                              </button>
                           </div>
                        </div>

                        {/* Thank You Box */}
                        <div style={{ background: dgfyBg, border: `1px solid ${dgfyBorder}`, borderRadius: 20, padding: 20, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                            <PartyPopper size={18} color={dgfyPrimary} />
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>Thank you for your order!</div>
                            <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>We&apos;ll update you as your order progresses.</div>
                          </div>
                        </div>

                      </div>
                    </StorefrontTrackingLayout>
  );
}
