import React from 'react';
import { Package } from 'lucide-react';

export function OrdersSection({
  activeTab,
  setActiveTab,
  inProgressOrders,
  completedOrders,
  reviews,
  isMobileViewport,
  customerTrackLoadingReference,
  onTrackReference,
  onOpenStorefront,
  onOpenReview,
  EmptyState,
  StatusBadge,
  getStoreLogoUrl,
  formatDate,
  money,
  prettyStatus,
  theme
}) {
  const tabs = [
    { id: 'active', label: 'Active Orders', count: inProgressOrders.length },
    { id: 'past', label: 'Past Orders', count: completedOrders.length },
    { id: 'reviews', label: 'Reviews', count: reviews.length }
  ];
  const visibleOrders = activeTab === 'active' ? inProgressOrders : activeTab === 'past' ? completedOrders : [];

  const renderOrderCard = (order, allowReview) => (
    <div key={`all-order-${order.reference}`} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 24, display: isMobileViewport ? 'flex' : 'grid', gridTemplateColumns: isMobileViewport ? undefined : 'minmax(0, 1fr) 180px 360px', justifyContent: 'space-between', alignItems: isMobileViewport ? 'stretch' : 'center', flexWrap: isMobileViewport ? 'wrap' : 'nowrap', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0, flex: '1 1 280px' }}>
        <button type="button" onClick={() => onOpenStorefront(order)} style={{ width: 48, height: 48, borderRadius: 12, background: theme.infoBg, color: theme.info, display: 'grid', placeItems: 'center', overflow: 'hidden', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default', flexShrink: 0 }}>
          {getStoreLogoUrl(order) ? <img src={getStoreLogoUrl(order)} alt={`${order.store_name || 'Store'} logo`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <Package size={24} />}
        </button>
        <div style={{ minWidth: 0 }}>
          <button type="button" onClick={() => onOpenStorefront(order)} style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 4, background: 'transparent', border: 'none', padding: 0, cursor: order.store_slug ? 'pointer' : 'default', textAlign: 'left' }}>{order.store_name || 'DGFY Store'}</button>
          <div style={{ fontSize: 13, color: theme.muted }}>#{order.reference}</div>
        </div>
      </div>
      <div style={{ textAlign: isMobileViewport ? 'left' : 'right', minWidth: isMobileViewport ? '100%' : 160, justifySelf: isMobileViewport ? undefined : 'end' }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: theme.text, marginBottom: 8 }}>{money(order.total_amount)}</div>
        <StatusBadge status={order.status_label || order.status} />
        <div style={{ fontSize: 12, color: theme.muted, marginTop: 8 }}>{formatDate(order.occurred_at)}</div>
      </div>
      <div style={{ display: 'flex', gap: 12, flexWrap: isMobileViewport ? 'wrap' : 'nowrap', width: isMobileViewport ? '100%' : 360, justifySelf: isMobileViewport ? undefined : 'end', alignItems: 'center', justifyContent: isMobileViewport ? 'flex-start' : 'flex-end' }}>
        <button type="button" onClick={() => onTrackReference(order)} disabled={customerTrackLoadingReference === order.reference} style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: customerTrackLoadingReference === order.reference ? 'wait' : 'pointer' }}>{customerTrackLoadingReference === order.reference ? 'Loading...' : 'Track Order'}</button>
        <button type="button" onClick={() => onTrackReference(order)} style={{ background: theme.primary, border: 'none', color: '#FFF', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View Order</button>
        {allowReview && order?.allowed_actions?.review === true && Array.isArray(order?.review_targets) && order.review_targets.length > 0 ? (
          <button type="button" onClick={() => onOpenReview(order)} style={{ background: 'transparent', border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Review Order</button>
        ) : !isMobileViewport && allowReview ? <div style={{ width: 109, height: 37, flexShrink: 0 }} /> : null}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <div><h2 style={{ fontSize: 24, fontWeight: 800, color: theme.text, margin: 0 }}>Orders</h2><p style={{ margin: '8px 0 0', fontSize: 14, color: theme.muted }}>Track your in-progress orders, review completed purchases, and revisit your feedback.</p></div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobileViewport ? 8 : 10, padding: isMobileViewport ? '0 0 4px' : 0, borderBottom: `1px solid ${theme.border}` }}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} style={{ background: isMobileViewport && selected ? theme.infoBg : 'transparent', border: 'none', borderBottom: isMobileViewport ? 'none' : selected ? `2px solid ${theme.primary}` : '2px solid transparent', color: selected ? theme.primary : theme.muted, fontSize: isMobileViewport ? 12 : 14, fontWeight: selected ? 600 : 500, padding: isMobileViewport ? '9px 12px' : '16px 18px', borderRadius: isMobileViewport ? 999 : 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, flex: isMobileViewport ? '1 1 auto' : '0 0 auto', whiteSpace: 'nowrap' }}><span>{tab.label}</span><span style={{ fontSize: 11, fontWeight: 700, background: selected ? '#fff' : theme.bg, color: selected ? theme.primary : theme.muted, padding: '2px 6px', borderRadius: 999 }}>{tab.count}</span></button>;
        })}
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {activeTab === 'reviews' ? reviews.length === 0 ? <EmptyState title="No submitted reviews yet" desc="Completed orders you review will appear here once review history is available in your account feed." /> : reviews.map((review, index) => (
          <div key={`review-history-${review.review_id || index}`} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 10 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}><div><div style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>{review.store_name || review.title || 'Reviewed order'}</div><div style={{ fontSize: 13, color: theme.muted, marginTop: 4 }}>{prettyStatus(review.target_type || 'Review')}</div></div><StatusBadge status={review.status_label || review.status || 'Reviewed'} /></div>{review.comment ? <div style={{ fontSize: 14, color: theme.text, lineHeight: 1.5 }}>{review.comment}</div> : null}</div>
        )) : visibleOrders.length === 0 ? <EmptyState title={activeTab === 'active' ? 'No active orders' : 'No past orders'} desc={activeTab === 'active' ? "You don't have any orders in progress right now." : 'Completed orders will appear here after they are finished.'} /> : visibleOrders.map((order) => renderOrderCard(order, activeTab === 'past'))}
      </div>
    </div>
  );
}
