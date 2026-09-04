import React, { useRef, useState } from 'react';
import {
  MessageSquare,
  Star
} from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';
import { CustomerTransactionCard } from './CustomerTransactionCard.jsx';
import { OrderDetailsModal } from './OrderDetailsModal.jsx';

const getReviewRating = (review) => {
  const rating = Number(review?.rating);
  return Number.isFinite(rating) && rating >= 1 && rating <= 5 ? Math.round(rating) : 0;
};

export function OrdersSection({
  activeTab,
  setActiveTab,
  inProgressOrders,
  completedOrders,
  reviews,
  isMobileViewport,
  customerTrackLoadingReference,
  onGetOrderDetails,
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
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderDetailsLoading, setOrderDetailsLoading] = useState(false);
  const [orderDetailsError, setOrderDetailsError] = useState('');
  const [orderDetailsWarning, setOrderDetailsWarning] = useState('');
  const orderDetailsRequestIdRef = useRef(0);
  const orderDetailsAbortControllerRef = useRef(null);

  const closeOrderDetails = () => {
    orderDetailsRequestIdRef.current += 1;
    orderDetailsAbortControllerRef.current?.abort();
    orderDetailsAbortControllerRef.current = null;
    setSelectedOrder(null);
    setOrderDetailsLoading(false);
    setOrderDetailsError('');
    setOrderDetailsWarning('');
  };

  const openOrderDetails = async (order) => {
    const requestId = orderDetailsRequestIdRef.current + 1;
    orderDetailsRequestIdRef.current = requestId;
    orderDetailsAbortControllerRef.current?.abort();
    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    orderDetailsAbortControllerRef.current = controller;
    setSelectedOrder(order);
    setOrderDetailsError('');
    setOrderDetailsWarning('');
    setOrderDetailsLoading(typeof onGetOrderDetails === 'function');

    if (typeof onGetOrderDetails !== 'function') {
      orderDetailsAbortControllerRef.current = null;
      setOrderDetailsLoading(false);
      return;
    }

    try {
      const response = controller
        ? await onGetOrderDetails(order, { signal: controller.signal })
        : await onGetOrderDetails(order);
      if (requestId !== orderDetailsRequestIdRef.current) return;
      const detailed = response?.order || response?.activity || null;
      if (detailed && typeof detailed === 'object') {
        setSelectedOrder((current) => {
          if (!current || current.reference !== order.reference) return current;
          const currentDisplay = current.display || current.display_snapshot || {};
          const detailedDisplay = detailed.display || detailed.display_snapshot || {};
          return {
            ...current,
            ...detailed,
            display: { ...currentDisplay, ...detailedDisplay },
            summary_lines: Array.isArray(detailed.summary_lines)
              ? detailed.summary_lines
              : current.summary_lines
          };
        });
      }
      if (response?.details_available === false) {
        setOrderDetailsWarning('Some saved order details are unavailable right now. Showing the account snapshot.');
      }
    } catch (error) {
      if (requestId !== orderDetailsRequestIdRef.current || error?.name === 'AbortError') return;
      setOrderDetailsError(String(error?.message || 'Unable to load complete order details right now.'));
    } finally {
      if (requestId === orderDetailsRequestIdRef.current) {
        orderDetailsAbortControllerRef.current = null;
        setOrderDetailsLoading(false);
      }
    }
  };

  const tabs = [
    { id: 'active', label: 'Active Orders', count: inProgressOrders.length },
    { id: 'past', label: 'Past Orders', count: completedOrders.length },
    { id: 'reviews', label: 'Reviews', count: reviews.length }
  ];
  const visibleOrders = activeTab === 'active' ? inProgressOrders : activeTab === 'past' ? completedOrders : [];
  const cardRadius = isMobileViewport ? 14 : 12;

  const renderOrderCard = (order, allowReview) => {
    const storeName = order.store_name || 'DGFY Store';
    const logoUrl = getStoreLogoUrl(order);
    const isTracking = customerTrackLoadingReference === order.reference;
    const canReview = allowReview
      && order?.allowed_actions?.review === true
      && Array.isArray(order?.review_targets)
      && order.review_targets.length > 0;

    return (
      <CustomerTransactionCard
        key={`all-order-${order.reference}`}
        testId="customer-order-card"
        aria-label={`${storeName} order ${order.reference}`}
        entry={order}
        storeName={storeName}
        reference={order.reference}
        logoUrl={logoUrl}
        occurredAt={order.occurred_at}
        status={order.status_label || order.status}
        totalAmount={order.total_amount}
        formatDate={formatDate}
        money={money}
        isMobileViewport={isMobileViewport}
        theme={theme}
        StatusBadge={StatusBadge}
        onOpenStorefront={onOpenStorefront}
        secondaryActionLabel="Track Order"
        onSecondaryAction={() => onTrackReference(order)}
        secondaryDisabled={isTracking}
        secondaryLoadingLabel="Loading..."
        primaryActionLabel="View Order"
        onPrimaryAction={() => { void openOrderDetails(order); }}
        reviewActionLabel={canReview ? 'Review Order' : undefined}
        onReviewAction={canReview ? () => onOpenReview(order) : undefined}
      />
    );
  };

  const renderReviewCard = (review, index) => {
    const rating = getReviewRating(review);
    const reviewStoreName = review.store_name || review.title || 'Reviewed order';
    const reviewType = prettyStatus(review.target_type || review.activity_type || 'Review');
    const reviewDate = review.occurred_at || review.created_at || review.submitted_at;

    return (
      <article
        key={`review-history-${review.review_id || index}`}
        data-testid="customer-review-card"
        style={{
          background: theme.surface,
          borderRadius: cardRadius,
          border: `1px solid ${theme.border}`,
          boxShadow: '0 2px 8px rgba(16, 24, 40, 0.04)',
          padding: isMobileViewport ? 16 : 20,
          display: 'grid',
          gap: 16
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ width: 42, height: 42, borderRadius: 12, display: 'grid', placeItems: 'center', background: theme.infoBg, color: theme.primary, flexShrink: 0 }}>
              <MessageSquare size={19} aria-hidden="true" />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reviewStoreName}</div>
              <div style={{ marginTop: 4, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted }}>{reviewType}</div>
            </div>
          </div>
          <StatusBadge status={review.status_label || review.status || 'Reviewed'} />
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: 14, display: 'grid', gap: 10 }}>
          {rating ? (
            <div aria-label={`${rating} out of 5 stars`} style={{ display: 'flex', gap: 3, color: '#F59E0B' }}>
              {[1, 2, 3, 4, 5].map((star) => <Star key={star} size={16} fill={star <= rating ? 'currentColor' : 'none'} aria-hidden="true" />)}
            </div>
          ) : null}
          {review.comment ? <p style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, lineHeight: 1.55, color: theme.text }}>{review.comment}</p> : <p style={{ margin: 0, fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: theme.muted }}>No written comment was added.</p>}
          {reviewDate ? <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted }}>{formatDate(reviewDate)}</div> : null}
        </div>
      </article>
    );
  };

  return (
    <div style={{ display: 'grid', gap: isMobileViewport ? 18 : 22 }}>
      <div>
        <h2 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: theme.text, margin: 0 }}>Orders</h2>
        <p style={{ margin: '8px 0 0', fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageSubtitle, color: theme.muted, lineHeight: 1.5 }}>Track your in-progress orders, review completed purchases, and revisit your feedback.</p>
      </div>

      <div
        data-testid="customer-orders-tabs"
        aria-label="Order history"
        style={{ display: 'flex', flexWrap: 'nowrap', gap: isMobileViewport ? 4 : 8, padding: isMobileViewport ? '0 0 4px' : 0, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'thin' }}
      >
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={selected}
              onClick={() => setActiveTab(tab.id)}
              style={{ background: 'transparent', border: 'none', borderBottom: selected ? `2px solid ${theme.primary}` : '2px solid transparent', color: selected ? theme.primary : theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.desktop, fontWeight: selected ? 700 : 600, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 14px', borderRadius: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              <span>{tab.label}</span>
              <span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, lineHeight: 1, fontWeight: 700, background: selected ? '#E7F0FF' : theme.bg, color: selected ? theme.primary : theme.muted, padding: '4px 7px', borderRadius: 999 }}>{tab.count}</span>
            </button>
          );
        })}
      </div>

      <div data-testid="customer-orders-list" style={{ display: 'grid', gap: isMobileViewport ? 12 : 10 }}>
        {activeTab === 'reviews'
          ? reviews.length === 0
            ? <EmptyState title="No submitted reviews yet" desc="Completed orders you review will appear here once review history is available in your account feed." />
            : reviews.map(renderReviewCard)
          : visibleOrders.length === 0
            ? <EmptyState title={activeTab === 'active' ? 'No active orders' : 'No past orders'} desc={activeTab === 'active' ? "You don't have any orders in progress right now." : 'Completed orders will appear here after they are finished.'} />
            : visibleOrders.map((order) => renderOrderCard(order, activeTab === 'past'))}
      </div>
      <OrderDetailsModal
        key={selectedOrder?.reference || 'closed'}
        order={selectedOrder}
        isMobileViewport={isMobileViewport}
        onClose={closeOrderDetails}
        onTrack={(order) => {
          closeOrderDetails();
          onTrackReference(order);
        }}
        isLoading={orderDetailsLoading}
        error={orderDetailsError}
        warning={orderDetailsWarning}
        onRetry={() => {
          if (selectedOrder) void openOrderDetails(selectedOrder);
        }}
        isTracking={customerTrackLoadingReference === selectedOrder?.reference}
        formatDate={formatDate}
        money={money}
        prettyStatus={prettyStatus}
        getStoreLogoUrl={getStoreLogoUrl}
        theme={theme}
      />
    </div>
  );
}
