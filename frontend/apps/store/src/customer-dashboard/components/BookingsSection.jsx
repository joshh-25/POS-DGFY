import React from 'react';
import { CalendarDays } from 'lucide-react';

export function BookingsSection({ bookings, EmptyState, StatusBadge, formatDate, theme }) {
  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <h2 style={{ fontSize: 24, fontWeight: 800, color: theme.text, marginBottom: 8 }}>Bookings</h2>
      <div style={{ display: 'grid', gap: 16 }}>
        {bookings.length === 0 ? (
          <EmptyState title="No bookings found" desc="You don't have any appointments scheduled." />
        ) : bookings.map((booking) => (
          <div key={`all-booking-${booking.reference}`} style={{ background: theme.surface, borderRadius: 16, border: `1px solid ${theme.border}`, padding: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: theme.purpleBg, color: theme.purple, display: 'grid', placeItems: 'center' }}><CalendarDays size={24} /></div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.text, marginBottom: 4 }}>{booking.store_name || 'DGFY Service'}</div>
                <div style={{ fontSize: 13, color: theme.muted }}>{booking.reference} {'\u2022'} {formatDate(booking.occurred_at)}</div>
              </div>
            </div>
            <StatusBadge status={booking.status_label || booking.status} />
            <button type="button" onClick={() => window.alert('Booking details will be available soon.')} style={{ background: theme.surface, border: `1px solid ${theme.border}`, color: theme.primary, borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>View Details</button>
          </div>
        ))}
      </div>
    </div>
  );
}
