import React from 'react';
import {
  Check,
  RotateCcw,
  Star,
  Store,
} from 'lucide-react';
import { StorefrontTrackingOrderSummary } from '../../../../shared/components/tracking/StorefrontTrackingOrderSummary.jsx';

export function RetailTrackingCompletedView({ actions, formatters, isMobileViewport, viewModel }) {
  const {
    completedOnLabel,
    dgfyBorder,
    dgfyPrimary,
    finalStatusLabel,
    isPickup,
    primaryReviewInvite,
    reviewInviteByItemId,
    storeAddress,
    storeDisplayName,
    storeLogoUrl,
    trackingPinInput,
    trackingResult,
  } = viewModel;
  const { copyTextToClipboard, goStoreCatalogPage, goStoreOrderPage, openRetailItemReviewFromInvite } = actions;
  const { formatTicketDate, money, servicesBodyFont, servicesDisplayFont } = formatters;

  return (
                      <div style={{ maxWidth: 560, margin: '0 auto', borderRadius: 20, padding: isMobileViewport ? 20 : 28, background: '#fff', boxShadow: '0 4px 32px rgba(15,23,42,.07)', border: '1px solid #e2e8f0' }}>

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Hero checkmark ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 10, marginBottom: 24 }}>
                          <div style={{ position: 'relative', width: 80, height: 80, marginBottom: 4 }}>
                            <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#ecfdf5', border: '2px solid #86efac', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
                              <Check size={38} strokeWidth={3} />
                            </div>
                            {/* decorative dots */}
                            {[[-22,-8,'#AEE8F4'],[-10,-20,'#1A4E8D'],[22,-12,'#AEE8F4'],[12,-22,'#1A4586']].map(([x,y,c],i) => (
                              <div key={i} style={{ position:'absolute', width:7, height:7, borderRadius:'50%', background:c, top:`calc(50% + ${y}px)`, left:`calc(50% + ${x}px)` }} />
                            ))}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#16a34a', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                            {isPickup ? 'Pickup Completed' : 'Delivery Completed'}
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.02em' }}>{isPickup ? 'Order Picked Up' : finalStatusLabel}</div>
                          <div style={{ fontSize: 14, color: '#64748b' }}>
                            {isPickup ? 'Thank you! Your order has been picked up.' : 'Thank you! Your order has been delivered.'}
                          </div>
                        </div>

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Store card ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        <div style={{ border: '1px solid #f1f5f9', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                          <div style={{ width: 52, height: 52, borderRadius: 12, background: '#f1f5f9', overflow: 'hidden', flexShrink: 0, display: 'flex', placeItems: 'center', justifyContent: 'center' }}>
                            {storeLogoUrl
                              ? <img src={storeLogoUrl} alt={storeDisplayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              : <Store size={24} color={dgfyPrimary} />
                            }
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{storeDisplayName}</div>
                            {storeAddress && <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{storeAddress}</div>}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (primaryReviewInvite) {
                                openRetailItemReviewFromInvite(primaryReviewInvite);
                                return;
                              }
                              goStoreOrderPage();
                            }}
                            style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, fontSize: 13, fontWeight: 700, color: dgfyPrimary, background: '#EEF6FD', border: `1px solid #AEE8F4`, borderRadius: 8, padding: '6px 12px', cursor: 'pointer', whiteSpace: 'nowrap' }}
                          >
                            <Star size={13} fill={dgfyPrimary} color={dgfyPrimary} /> {primaryReviewInvite ? 'Review Item' : 'Review Store'}
                          </button>
                        </div>

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Reference / date / type strip ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Ordered items ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Total amount ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        <StorefrontTrackingOrderSummary
                          accentColor={dgfyPrimary}
                          bodyFont={servicesBodyFont}
                          completedOnLabel={completedOnLabel}
                          displayFont={servicesDisplayFont}
                          formatTicketDate={formatTicketDate}
                          money={money}
                          onCopyPin={(pin) => copyTextToClipboard?.(pin, 'Order PIN copied.')}
                          renderItemAction={(item) => {
                            const invite = reviewInviteByItemId.get(Number(item.item_id));
                            return invite ? (
                              <button
                                type="button"
                                onClick={() => openRetailItemReviewFromInvite(invite)}
                                style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 32, padding: '0 12px', borderRadius: 10, border: `1px solid ${dgfyBorder}`, background: '#EEF6FD', color: dgfyPrimary, fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                              >
                                <Star size={14} fill={dgfyPrimary} color={dgfyPrimary} /> Review this item
                              </button>
                            ) : null;
                          }}
                          statusLabel={finalStatusLabel}
                          trackingResult={{ ...trackingResult, tracking_pin: trackingResult.tracking_pin || trackingPinInput }}
                        />

                        {/* ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ Order Again CTA ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ÃƒÂ¢Ã¢â‚¬ÂÃ¢â€šÂ¬ */}
                        <button
                          type="button"
                          onClick={goStoreCatalogPage}
                          style={{ width: '100%', minHeight: 50, borderRadius: 14, border: 'none', background: dgfyPrimary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
                        >
                          <RotateCcw size={18} /> Order Again
                        </button>
                      </div>
  );
}
