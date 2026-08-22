import React from 'react';
import {
  Bike,
  Check,
  CheckCircle2,
  ChefHat,
  ChevronRight,
  Clock3,
  Copy,
  FileText,
  HelpCircle,
  MapPin,
  MessageSquare,
  PartyPopper,
  ShieldCheck,
  ShoppingBag,
  Store,
  ThumbsUp,
} from 'lucide-react';

export function FnbTrackingActiveView({ actions, formatters, isMobileViewport, mapProps, viewModel }) {
  const {
    activeStatus,
    activeStepIndex,
    dgfyBg,
    dgfyBorder,
    dgfyPrimary,
    dgfySecondary,
    dgfySecondaryBg,
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
    trackingPinInput,
    trackingResult,
    trackingSteps,
  } = viewModel;
  const { copyTextToClipboard, goStoreCatalogPage, setCheckoutTab } = actions;
  const { formatTicketDate, money } = formatters;
  const handleBackToCatalog = () => {
    goStoreCatalogPage();
    window.setTimeout(() => {
      document.getElementById('storefront-catalog-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 0);
  };
  const { TILING_SERVER, tileTransformRequest, TrackingRouteMap } = mapProps;

  return (
                    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 360px', gap: 24 }}>
                      {/* Left Column: Tracking Flow */}
                      <div style={{ display: 'grid', gap: 24 }}>
                        {isPickup ? (
                          <div style={{ background: dgfyBg, border: `1px solid ${dgfyBorder}`, borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden', position: 'relative', flexWrap: 'wrap', gap: 20 }}>
                             <div style={{ zIndex: 2, display: 'flex', gap: 16, alignItems: 'flex-start', flex: '1 1 auto', minWidth: 280 }}>
                               <div style={{ width: 56, height: 56, borderRadius: '50%', background: dgfyPrimary, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                 {(activeStatus === 'placed' || activeStatus === 'ready_for_pickup' || activeStatus === 'completed') && <Check size={32} strokeWidth={2.5} />}
                                 {activeStatus === 'confirmed' && <Store size={32} strokeWidth={2.5} />}
                                 {activeStatus === 'preparing' && <ChefHat size={32} strokeWidth={2.5} />}
                               </div>
                               <div>
                                 <div style={{ fontSize: 26, fontWeight: 800, color: '#0f172a', margin: '0 0 8px 0', letterSpacing: '-0.02em', fontFamily: servicesDisplayFont }}>
                                   {activeStatus === 'placed' ? 'Order Confirmed!' :
                                    activeStatus === 'confirmed' ? 'Confirmed by Store!' :
                                    activeStatus === 'preparing' ? 'Preparing Your Order \u2728' :
                                    activeStatus === 'ready_for_pickup' ? 'Your Order is Ready for Pickup! \uD83C\uDF89' : 'Pickup Completed!'}
                                 </div>
                                 <div style={{ fontSize: 14, color: '#334155', lineHeight: 1.5, maxWidth: 420 }}>{statusGuidance}</div>

                                 <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 16, fontSize: 14, fontWeight: 600, fontFamily: servicesBodyFont }}>
                                   <span style={{ color: dgfySoftText }}>Order PIN</span>
                                   <span style={{ color: '#0f172a', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 6, padding: '4px 10px' }}>{trackingResult.tracking_pin || trackingPinInput}</span>
                                   <button type="button" onClick={() => copyTextToClipboard(trackingResult.tracking_pin || trackingPinInput, 'Order PIN copied.')} style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 6, color: dgfyPrimary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: servicesBodyFont }}>
                                     <Copy size={14} /> Copy
                                   </button>
                                 </div>
                               </div>
                             </div>

                             <div style={{ zIndex: 1, display: 'flex', placeItems: 'center', justifyContent: 'center', opacity: 0.9 }}>
                               {(activeStatus === 'placed' || activeStatus === 'ready_for_pickup') && <ShoppingBag size={100} color={dgfyPrimary} strokeWidth={1.5} style={{ opacity: 0.8 }} />}
                               {activeStatus === 'confirmed' && <Store size={100} color={dgfyPrimary} strokeWidth={1.5} style={{ opacity: 0.8 }} />}
                               {activeStatus === 'preparing' && <ChefHat size={100} color={dgfySecondary} strokeWidth={1.5} style={{ opacity: 0.8 }} />}
                               {activeStatus === 'completed' && <CheckCircle2 size={100} color={dgfyPrimary} strokeWidth={1.5} style={{ opacity: 0.8 }} />}
                             </div>
                          </div>
                        ) : (
                          <>
                            {/* Header */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
                              <div>
                                <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 24, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont }}>Track Your Order</h3>
                                <p style={{ marginTop: 0, color: dgfySoftText, fontSize: 14 }}>Live updates from store to your doorstep</p>
                              </div>
                              <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 999, padding: '6px 16px', fontSize: 14, fontWeight: 600, fontFamily: servicesBodyFont }}>
                                <span style={{ color: dgfySoftText }}>Order PIN:</span>
                                <span style={{ color: '#0f172a' }}>{trackingResult.tracking_pin || trackingPinInput}</span>
                                <button type="button" onClick={() => copyTextToClipboard(trackingResult.tracking_pin || trackingPinInput, 'Order PIN copied.')} style={{ marginLeft: 6, color: dgfyPrimary, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: servicesBodyFont }}>Copy</button>
                              </div>
                            </div>

                            {/* Order Status */}
                            <div style={{ background: '#fafaf9', border: '1px solid #e7e5e4', borderRadius: 20, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', overflow: 'hidden', position: 'relative', gap: 20 }}>
                               <div style={{ zIndex: 2 }}>
                                 <div style={{ fontSize: 14, fontWeight: 700, color: dgfySoftText, fontFamily: servicesBodyFont }}>Order status</div>
                                 <div style={{ fontSize: 36, fontWeight: 800, color: '#0f172a', margin: '4px 0', fontFamily: servicesDisplayFont }}>{finalStatusLabel}</div>
                                 <div style={{ fontSize: 14, color: '#334155' }}>{statusGuidance}</div>
                               </div>
                               <div style={{ zIndex: 1, width: 140, height: 100, background: dgfyBg, borderRadius: 16, display: 'flex', placeItems: 'center', justifyContent: 'center' }}>
                                 {activeStatus === 'placed' ? <Clock3 size={48} color={dgfyPrimary} strokeWidth={1.5} /> : null}
                                 {activeStatus === 'confirmed' ? <Store size={48} color={dgfyPrimary} strokeWidth={1.5} /> : null}
                                 {activeStatus === 'preparing' ? <ChefHat size={48} color={dgfyPrimary} strokeWidth={1.5} /> : null}
                                 {activeStatus === 'out_for_delivery' ? <Bike size={48} color={dgfyPrimary} strokeWidth={1.5} /> : null}
                                 {activeStatus === 'completed' ? <CheckCircle2 size={48} color={dgfyPrimary} strokeWidth={1.5} /> : null}
                               </div>
                            </div>
                          </>
                        )}

                        {/* Horizontal Stepper */}
                        <div style={{ position: 'relative', padding: '10px 0', display: 'flex', justifyContent: 'space-between', zIndex: 1, overflowX: 'auto' }}>
                          <div style={{ position: 'absolute', top: 22, left: '10%', right: '10%', height: 4, background: '#e2e8f0', zIndex: -1 }}></div>
                          <div
                            className={activeStatus === 'completed' ? undefined : 'tracking-progress-fill'}
                            style={{
                              position: 'absolute',
                              top: 22,
                              left: '10%',
                              width: `${Math.max(0, (activeStepIndex / (Math.max(1, trackingSteps.length - 1))) * 80)}%`,
                              height: 4,
                              background: activeStatus === 'completed' ? dgfyPrimary : undefined,
                              zIndex: -1,
                              transition: 'width 0.5s ease-in-out',
                              borderRadius: 999
                            }}
                          />

                          {trackingSteps.map((step, index) => {
                            const done = index < activeStepIndex;
                            const active = index === activeStepIndex || (activeStatus === 'completed' && index === trackingSteps.length - 1);
                            const pending = !done && !active;
                            return (
                              <div key={`horiz-step-${step.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 80, gap: 8 }}>
                                <div className={active ? 'tracking-step-active-dot' : undefined} style={{ width: 28, height: 28, borderRadius: '50%', background: pending ? '#fff' : dgfyPrimary, border: `2px solid ${pending ? '#cbd5e1' : dgfyPrimary}`, color: pending ? '#cbd5e1' : '#fff', fontSize: 12, fontWeight: 900, display: 'grid', placeItems: 'center', transition: 'all 0.3s' }}>
                                  {isPickup ? (
                                    done ? <Check size={18} strokeWidth={4} /> :
                                    index === 0 ? <FileText size={16} strokeWidth={2.5} /> :
                                    index === 1 ? <Store size={16} strokeWidth={2.5} /> :
                                    index === 2 ? <ChefHat size={16} strokeWidth={2.5} /> :
                                    <ShoppingBag size={16} strokeWidth={2.5} />
                                  ) : (
                                    done ? <Check size={18} strokeWidth={4} /> : index + 1
                                  )}
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                  <div style={{ fontSize: 12, fontWeight: active ? 700 : 600, color: active ? dgfyPrimary : (pending ? '#94a3b8' : '#334155'), lineHeight: 1.2, fontFamily: servicesBodyFont }}>{step.label}</div>
                                  {active && <div style={{ fontSize: 11, color: dgfySoftText, marginTop: 4 }}>Updated</div>}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Handoff / Guidance Banner */}
                        {isPickup ? (
                          <div style={{ background: dgfySecondaryBg, border: 'none', borderRadius: 16, padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                             <div style={{ color: dgfySecondary, display: 'flex', placeItems: 'center', flexShrink: 0 }}>
                               <ShoppingBag size={24} strokeWidth={2.5} />
                             </div>
                             <div>
                               <div style={{ fontSize: 16, fontWeight: 800, color: dgfySecondary, fontFamily: servicesDisplayFont }}>
                                 {activeStatus === 'ready_for_pickup' || activeStatus === 'completed' ? 'Please pick up your order as soon as possible.' : 'We are preparing your order.'}
                               </div>
                               <div style={{ fontSize: 13, color: '#334155', marginTop: 2 }}>
                                 {activeStatus === 'ready_for_pickup' || activeStatus === 'completed' ? 'For the best quality, we recommend picking up your order right away.' : 'We will notify you when it is ready for pickup.'}
                               </div>
                             </div>
                          </div>
                        ) : (
                          <div style={{ background: dgfyBg, border: `1px solid ${dgfyBorder}`, borderRadius: 16, padding: 20, display: 'flex', gap: 16, alignItems: 'center' }}>
                             <div style={{ width: 48, height: 48, borderRadius: '50%', background: '#fff', color: dgfyPrimary, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 4px 12px rgba(26, 78, 141, 0.1)' }}>
                               <Bike size={24} />
                             </div>
                             <div>
                               <div style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', fontFamily: servicesDisplayFont }}>{finalStatusLabel}</div>
                               <div style={{ fontSize: 14, color: '#334155', marginTop: 4 }}>
                                 Delivery orders move from confirmation to preparing, then out for delivery.
                               </div>
                             </div>
                          </div>
                        )}

                        {/* Map Section */}
                        <TrackingRouteMap
                          storePin={trackingMapCoordinates.storePin}
                          customerPin={isPickup ? null : trackingMapCoordinates.customerPin}
                          styleUrl={TILING_SERVER}
                          transformRequest={tileTransformRequest}
                          mapHeight={280}
                        />

                        {/* Footer Badges */}
                        {presentation.showTrustStrip && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, background: '#f8fafc', padding: 20, borderRadius: 16 }}>
                           <div style={{ display: 'flex', gap: 12 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: dgfyPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                <Check size={14} strokeWidth={4} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>Live tracking</div>
                                <div style={{ fontSize: 12, color: dgfySoftText, marginTop: 2 }}>Real-time updates on your order</div>
                              </div>
                           </div>
                           <div style={{ display: 'flex', gap: 12 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: dgfyPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                <ShieldCheck size={14} strokeWidth={3} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>Your safety matters</div>
                                <div style={{ fontSize: 12, color: dgfySoftText, marginTop: 2 }}>Riders are verified and background-checked</div>
                              </div>
                           </div>
                           <div style={{ display: 'flex', gap: 12 }}>
                              <div style={{ width: 24, height: 24, borderRadius: '50%', background: dgfyPrimary, color: '#fff', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                                <ThumbsUp size={14} strokeWidth={3} />
                              </div>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>Top-rated support</div>
                                <div style={{ fontSize: 12, color: dgfySoftText, marginTop: 2 }}>We&apos;re here to help anytime</div>
                              </div>
                           </div>
                        </div>}

                        {/* Bottom Actions */}
                        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
                          <button type="button" onClick={presentation.returnToCatalog ? handleBackToCatalog : () => setCheckoutTab('menu')} style={{ background: '#fff', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 32px', fontSize: 15, fontWeight: 700, color: '#334155', cursor: 'pointer', fontFamily: servicesBodyFont }}>
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
                              <div style={{ borderBottom: '1px dashed #cbd5e1', paddingBottom: 16 }}>
                                <div style={{ fontSize: 12, color: dgfySoftText }}>Order time</div>
                                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', fontFamily: servicesBodyFont }}>{trackingResult.createdAt ? formatTicketDate(trackingResult.createdAt) : (trackingResult.updatedAt ? formatTicketDate(trackingResult.updatedAt) : 'Today')}</div>
                              </div>
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
                              {trackingResult.paymentStatus === 'partially_paid' && trackingResult.balanceDue != null ? (
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#92400e' }}>
                                  <span>Partially paid</span>
                                  <span style={{ fontWeight: 700 }}>Balance due: {money(trackingResult.balanceDue)}</span>
                                </div>
                              ) : null}
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
                    </div>
  );
}
