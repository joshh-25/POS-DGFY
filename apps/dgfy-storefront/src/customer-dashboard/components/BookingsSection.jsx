import React from 'react';
import { CalendarDays } from 'lucide-react';
import { isCustomerBookingReview } from '../model/customerBookingStatus.js';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';
import { CustomerTransactionCard } from './CustomerTransactionCard.jsx';

export function BookingsSection({ activeTab, setActiveTab, activeBookings, pastBookings, reviews, isMobileViewport, EmptyState, StatusBadge, formatDate, money, theme }) {
  const bookingReviews = reviews.filter(isCustomerBookingReview);
  const tabs = [
    { id: 'active', label: 'Active Bookings', count: activeBookings.length },
    { id: 'past', label: 'Past Bookings', count: pastBookings.length },
    { id: 'reviews', label: 'Reviews', count: bookingReviews.length }
  ];
  const visibleBookings = activeTab === 'active' ? activeBookings : pastBookings;

  const renderBookingCard = (booking) => (
    <CustomerTransactionCard
      key={`all-booking-${booking.reference}`}
      testId="customer-booking-card"
      ariaLabel={`${booking.store_name || 'DGFY Service'} booking ${booking.reference}`}
      entry={booking}
      storeName={booking.store_name || 'DGFY Service'}
      reference={booking.reference}
      occurredAt={booking.occurred_at}
      status={booking.status_label || booking.status}
      totalAmount={booking.total_amount}
      totalValue={booking.service_name || booking.booking_type || 'Service booking'}
      formatDate={formatDate}
      money={money}
      isMobileViewport={isMobileViewport}
      theme={theme}
      StatusBadge={StatusBadge}
      FallbackIcon={CalendarDays}
      primaryActionLabel="View Details"
      onPrimaryAction={() => window.alert('Booking details will be available soon.')}
    />
  );

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitle.desktop, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.pageTitleWeight, color: theme.text, marginBottom: 8 }}>Bookings</h2>
      <div data-testid="customer-bookings-tabs" style={{ display: 'flex', flexWrap: 'nowrap', gap: isMobileViewport ? 8 : 10, padding: isMobileViewport ? '0 0 4px' : 0, borderBottom: `1px solid ${theme.border}`, overflowX: 'auto', overscrollBehaviorX: 'contain', scrollbarWidth: 'thin' }}>
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return <button key={tab.id} type="button" aria-label={`${tab.label} ${tab.count}`} onClick={() => setActiveTab(tab.id)} style={{ background: 'transparent', border: 'none', borderBottom: selected ? `2px solid ${theme.primary}` : '2px solid transparent', color: selected ? theme.primary : theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.tab.desktop, fontWeight: selected ? 600 : 500, minHeight: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.controlHeight.desktop, padding: '0 16px', borderRadius: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0, whiteSpace: 'nowrap' }}><span>{tab.label}</span><span style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.badge, fontWeight: 700, background: selected ? '#fff' : theme.bg, color: selected ? theme.primary : theme.muted, padding: '2px 6px', borderRadius: 999 }}>{tab.count}</span></button>;
        })}
      </div>
      <div style={{ display: 'grid', gap: 16 }}>
        {activeTab === 'reviews' ? (
          bookingReviews.length === 0 ? <EmptyState title="No booking reviews yet" desc="Reviews for completed bookings will appear here." /> : bookingReviews.map((review, index) => (
            <div key={`booking-review-${review.review_id || review.booking_id || index}`} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: isMobileViewport ? 16 : 20, display: 'grid', gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.cardTitle, fontWeight: 700, color: theme.text }}>{review.store_name || review.title || 'Reviewed booking'}</div>
                  <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary, color: theme.muted, marginTop: 4 }}>Booking review</div>
                </div>
                <StatusBadge status={review.status_label || review.status || 'Reviewed'} />
              </div>
              {review.comment ? <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.body, color: theme.text, lineHeight: 1.5 }}>{review.comment}</div> : null}
            </div>
          ))
        ) : visibleBookings.length === 0 ? (
          <EmptyState title={activeTab === 'active' ? 'No active bookings' : 'No past bookings'} desc={activeTab === 'active' ? "You don't have any active bookings right now." : 'Completed or closed bookings will appear here.'} />
        ) : visibleBookings.map(renderBookingCard)}
      </div>
    </div>
  );
}
