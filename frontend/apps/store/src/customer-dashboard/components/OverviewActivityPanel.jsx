import React from 'react';
import { CalendarDays, ChevronRight, ShoppingBag, Star } from 'lucide-react';
import { CustomerDashboardEmptyState } from '../model/customerDashboardPresentation.jsx';
export function OverviewActivityPanel({ isMobileViewport, theme, activeActivityTab, setActiveActivityTab, isAccountPanelLoading, enrichedActiveOrders, allBookings, reviewEligibleOrders, StatusBadge, getStoreLogoUrl, formatDate, handleOpenStorefront, onTrackReference, openReviewComposer, setActiveNav }) {
  return (
    <div style={{ background: theme.surface, borderRadius: isMobileViewport ? 20 : 16, border: `1px solid ${theme.border}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', borderBottom: isMobileViewport ? 'none' : `1px solid ${theme.border}`, padding: isMobileViewport ? '12px 12px 0' : '0 24px', gap: isMobileViewport ? 8 : 0 }}>
        {[
          { id: 'active_orders', label: isMobileViewport ? 'Orders' : 'Active Orders', icon: ShoppingBag },
          { id: 'upcoming_bookings', label: isMobileViewport ? 'Bookings' : 'Upcoming Bookings', icon: CalendarDays },
          { id: 'need_reviews', label: isMobileViewport ? 'Reviews' : 'Need Reviews', icon: Star }
        ].map((tab) => {
          const isActive = activeActivityTab === tab.id;
          const Icon = tab.icon;
          return (
            <button key={tab.id} onClick={() => setActiveActivityTab(tab.id)} style={{ background: isMobileViewport ? (isActive ? theme.infoBg : 'transparent') : 'transparent', border: 'none', borderBottom: isMobileViewport ? 'none' : (isActive ? `2px solid ${theme.primary}` : '2px solid transparent'), color: isActive ? theme.primary : theme.muted, fontSize: isMobileViewport ? 12 : 14, fontWeight: isActive ? 600 : 500, padding: isMobileViewport ? '9px 10px' : '20px 16px', display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', transition: 'all 200ms', borderRadius: isMobileViewport ? 999 : 0, flex: 1, justifyContent: 'center' }}>
              <Icon size={isMobileViewport ? 14 : 16} /> {tab.label}
            </button>
          );
        })}
      </div>
      <div style={{ padding: isMobileViewport ? 16 : 24, flex: 1 }}>
        {activeActivityTab === 'active_orders' && (
          <div style={{ display: 'grid', gap: isMobileViewport ? 14 : 16, width: '100%' }}>
            {isAccountPanelLoading && enrichedActiveOrders.length === 0 ? (
              <div
                role="status"
                aria-live="polite"
                style={{
                  minHeight: isMobileViewport ? 132 : 96,
                  border: `1px solid ${theme.border}`,
                  borderRadius: 16,
                  background: theme.surface,
                  display: 'grid',
                  placeItems: 'center',
                  color: theme.muted,
                  fontSize: 14,
                  fontWeight: 600
                }}
              >
                Loading active orders...
              </div>
            ) : enrichedActiveOrders.length === 0 ? (
              <CustomerDashboardEmptyState title="No active orders" desc="You don't have any orders in progress right now." isMobileViewport={isMobileViewport} />
            ) : (
              <>
                {isMobileViewport ? (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, lineHeight: 1.15 }}>Active Orders</div>
                    <div style={{ fontSize: 14, color: theme.muted, marginTop: 4 }}>
                      You have {enrichedActiveOrders.length} active order{enrichedActiveOrders.length === 1 ? '' : 's'}
                    </div>
                  </div>
                ) : null}
                {enrichedActiveOrders.slice(0, 3).map((order) => (
                  <div key={order.reference} style={{ display: 'block', gap: isMobileViewport ? 12 : 0, alignItems: 'stretch', justifyContent: 'space-between', paddingBottom: isMobileViewport ? 0 : 16, borderBottom: isMobileViewport ? 'none' : `1px solid ${theme.border}`, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                    {isMobileViewport ? (
                      <div style={{ display: 'grid', gap: 12, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                        <div style={{ border: `1px solid ${theme.border}`, borderRadius: 18, padding: 14, display: 'grid', gap: 14, background: theme.surface, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'flex-start', gap: 12, width: '100%', minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                              <button type="button" onClick={() => handleOpenStorefront(order)} style={{ width: 56, height: 56, borderRadius: '50%', background: theme.text, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, textAlign: 'center', lineHeight: 1.1, flexShrink: 0, overflow: 'hidden', padding: 0, border: 'none', cursor: order.store_slug ? 'pointer' : 'default' }}>
                                {getStoreLogoUrl(order) ? <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (order.store_name ? order.store_name.substring(0, 4).toUpperCase() : 'STORE')}
                              </button>
                              <button type="button" onClick={() => handleOpenStorefront(order)} style={{ minWidth: 0, flex: 1, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: order.store_slug ? 'pointer' : 'default' }}>
                                <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, lineHeight: 1.25 }}>{order.store_name || 'DGFY Store'}</div>
                                <div style={{ fontSize: 12, color: theme.primary, marginTop: 5 }}>#{order.reference}</div>
                              </button>
                            </div>
                            <div style={{ textAlign: 'right', flexShrink: 0, display: 'grid', gap: 6, justifyItems: 'end' }}>
                              <StatusBadge status={order.status_label || order.status} />
                              <div style={{ fontSize: 12, color: theme.muted }}>{formatDate(order.occurred_at)}</div>
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 82px', alignItems: 'center', gap: 8, width: '100%', minWidth: 0 }}>
                            <button onClick={() => onTrackReference(order)} style={{ background: theme.primary, border: `1px solid ${theme.primary}`, borderRadius: 11, padding: '8px 10px', minHeight: 38, fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', whiteSpace: 'nowrap', lineHeight: 1.1 }}>
                              Track Order
                            </button>
                            <button onClick={() => setActiveNav('orders')} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 11, padding: '8px 10px', minHeight: 38, fontSize: 13, fontWeight: 600, color: theme.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap', width: 82, lineHeight: 1.1, textAlign: 'center' }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%' }}>
                                <span>View</span>
                                <ChevronRight size={14} />
                              </span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, width: '100%', minWidth: 0, boxSizing: 'border-box' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0, flex: '1 1 auto' }}>
                          <button type="button" onClick={() => handleOpenStorefront(order)} style={{ width: 48, height: 48, borderRadius: '50%', background: theme.text, color: '#FFF', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, textAlign: 'center', lineHeight: 1.1, flexShrink: 0, overflow: 'hidden', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default' }}>
                            {getStoreLogoUrl(order) ? <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (order.store_name ? order.store_name.substring(0, 4).toUpperCase() : 'STORE')}
                          </button>
                          <button type="button" onClick={() => handleOpenStorefront(order)} style={{ minWidth: 0, background: 'transparent', border: 'none', padding: 0, textAlign: 'left', cursor: order.store_slug ? 'pointer' : 'default' }}>
                            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{order.store_name || 'DGFY Store'}</div>
                            <div style={{ fontSize: 13, color: theme.primary, marginTop: 4 }}>#{order.reference}</div>
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 28, minWidth: 0, flexShrink: 0, marginLeft: 24 }}>
                          <div style={{ textAlign: 'right', minWidth: 132, flexShrink: 0 }}>
                            <StatusBadge status={order.status_label || order.status} />
                            <div style={{ fontSize: 12, color: theme.muted, marginTop: 6 }}>{formatDate(order.occurred_at)}</div>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, minWidth: 0, flexShrink: 0 }}>
                            <button onClick={() => onTrackReference(order)} style={{ background: theme.primary, border: `1px solid ${theme.primary}`, borderRadius: 12, padding: '8px 20px', fontSize: 13, fontWeight: 600, color: '#FFF', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              Track Order
                            </button>
                            <button onClick={() => setActiveNav('orders')} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 12, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: theme.primary, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}>
                              View <ChevronRight size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
            <div style={{ textAlign: 'center', marginTop: isMobileViewport ? 4 : 8, paddingTop: isMobileViewport ? 2 : 0 }}>
              <button onClick={() => setActiveNav('orders')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                View all active orders
              </button>
            </div>
          </div>
        )}
        {activeActivityTab === 'upcoming_bookings' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {allBookings.length === 0 ? (
              <CustomerDashboardEmptyState title="No upcoming bookings" desc="You don't have any appointments scheduled." isMobileViewport={isMobileViewport} />
            ) : (
              allBookings.slice(0, 3).map((booking) => (
                <div key={booking.reference} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 16, borderBottom: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: theme.purpleBg, color: theme.purple, display: 'grid', placeItems: 'center' }}>
                      <CalendarDays size={20} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{booking.store_name || 'DGFY Service'}</div>
                      <div style={{ fontSize: 13, color: theme.muted }}>{booking.reference}</div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <StatusBadge status={booking.status_label || booking.status} />
                    <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>{formatDate(booking.occurred_at)}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => alert('Booking details will be available soon.')} style={{ background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, color: theme.primary, cursor: 'pointer' }}>
                      View Details
                    </button>
                    <ChevronRight size={16} color={theme.muted} />
                  </div>
                </div>
              ))
            )}
            <div style={{ textAlign: 'center', marginTop: 8 }}>
              <button onClick={() => setActiveNav('bookings')} style={{ background: 'transparent', border: 'none', color: theme.primary, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                View all upcoming bookings
              </button>
            </div>
          </div>
        )}
        {activeActivityTab === 'need_reviews' && (
          <div style={{ display: 'grid', gap: 16 }}>
            {reviewEligibleOrders.length === 0 ? (
              <CustomerDashboardEmptyState title="No pending reviews" desc="You have reviewed all your eligible orders." isMobileViewport={isMobileViewport} />
            ) : (
              reviewEligibleOrders.map((order) => (
                <div key={`review-${order.activity_id || order.reference}`} style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 16, padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                      <button type="button" onClick={() => handleOpenStorefront(order)} style={{ width: 44, height: 44, borderRadius: '50%', background: theme.text, color: '#FFF', display: 'grid', placeItems: 'center', overflow: 'hidden', border: 'none', padding: 0, flexShrink: 0, cursor: order.store_slug ? 'pointer' : 'default' }}>
                        {getStoreLogoUrl(order) ? <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <span style={{ fontSize: 11, fontWeight: 700 }}>{order.store_name ? order.store_name.substring(0, 4).toUpperCase() : 'SHOP'}</span>}
                      </button>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{order.store_name || 'DGFY Store'}</div>
                        <div style={{ fontSize: 12, color: theme.muted, marginTop: 4 }}>
                          Completed order #{order.reference}
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={order.status_label || order.status || 'Completed'} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, color: theme.muted }}>
                      {Array.isArray(order.review_targets) ? order.review_targets.length : 0} item review{Array.isArray(order.review_targets) && order.review_targets.length === 1 ? '' : 's'} available
                    </div>
                    <button type="button" onClick={() => openReviewComposer(order)} style={{ background: theme.primary, border: 'none', color: '#FFF', borderRadius: 10, padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      Write Review
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
