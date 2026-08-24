import React from 'react';
import { CalendarDays, ChevronRight, MapPin, ShoppingBag } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function OverviewKpiGrid({ isMobileViewport, theme, inProgressOrders, allBookings, allAddresses, setActiveNav }) {
  return (
  <div data-testid="customer-dashboard-overview-kpis" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(3, 1fr)', gap: isMobileViewport ? 12 : 16 }}>
    {[
      { label: 'Active Orders', value: inProgressOrders.length, icon: ShoppingBag, color: theme.success, bg: theme.successBg, link: 'View all', action: () => setActiveNav('orders') },
      { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: theme.purple, bg: theme.purpleBg, link: 'View all', action: () => setActiveNav('bookings') },
      { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: theme.orange, bg: theme.orangeBg, link: 'Manage', action: () => setActiveNav('addresses') }
    ].map((stat, index) => {
      const Icon = stat.icon;
      const Card = isMobileViewport ? 'button' : 'div';
      const isFullWidthMobileCard = isMobileViewport && index === 2;
      return (
        <Card key={index} type={isMobileViewport ? 'button' : undefined} onClick={isMobileViewport ? stat.action : undefined} style={{ background: theme.surface, borderRadius: isMobileViewport ? 18 : 12, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '14px 16px' : '16px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 10 : 12, minWidth: 0, minHeight: isMobileViewport ? 82 : 'auto', width: isMobileViewport ? '100%' : undefined, gridColumn: isFullWidthMobileCard ? '1 / -1' : undefined, textAlign: isMobileViewport ? 'left' : undefined, fontFamily: isMobileViewport ? 'inherit' : undefined, color: isMobileViewport ? 'inherit' : undefined, cursor: isMobileViewport ? 'pointer' : 'default', appearance: isMobileViewport ? 'none' : undefined }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: isMobileViewport ? 12 : 10, minWidth: 0 }}>
            <div style={{ width: isMobileViewport ? 42 : 40, height: isMobileViewport ? 42 : 40, borderRadius: 12, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={20} />
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: isMobileViewport ? 4 : 6 }}>
              <div style={{ fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.metric.desktop, fontWeight: 700, color: theme.text, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.caption, color: theme.muted, lineHeight: 1.25, wordBreak: 'break-word' }}>{stat.label}</div>
            </div>
          </div>
          {!isMobileViewport ? (
            <div style={{ fontSize: CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction, fontWeight: 600, color: theme.primary, cursor: 'pointer', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={stat.action}>
              {stat.link} <ChevronRight size={14} />
            </div>
          ) : null}
        </Card>
      );
    })}
  </div>
  );
}
