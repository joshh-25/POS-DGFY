import React from 'react';
import { Award, CalendarDays, ChevronRight, MapPin, Package, ShoppingBag } from 'lucide-react';

export function OverviewKpiGrid({ isMobileViewport, theme, inProgressOrders, completedOrders, allBookings, allAddresses, loyalty, setActiveNav }) {
  return (
  <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'repeat(2, minmax(0, 1fr))' : 'repeat(5, 1fr)', gap: isMobileViewport ? 12 : 16 }}>
    {[
      { label: 'Active Orders', value: inProgressOrders.length, icon: ShoppingBag, color: theme.success, bg: theme.successBg, link: 'View all', action: () => setActiveNav('orders') },
      { label: 'Past Orders', value: completedOrders.length, icon: Package, color: theme.info, bg: theme.infoBg, link: 'View all', action: () => setActiveNav('orders') },
      { label: 'Bookings', value: allBookings.length, icon: CalendarDays, color: theme.purple, bg: theme.purpleBg, link: 'View all', action: () => setActiveNav('bookings') },
      { label: 'Addresses', value: allAddresses.length, icon: MapPin, color: theme.orange, bg: theme.orangeBg, link: 'Manage', action: () => setActiveNav('addresses') },
      { label: 'Loyalty Points', value: loyalty.balance, icon: Award, color: theme.success, bg: theme.successBg, link: 'View details', action: () => setActiveNav('loyalty') }
    ].map((stat, index) => {
      const Icon = stat.icon;
      const isLastMobileOddCard = isMobileViewport && index === 4;
      return (
        <div key={index} style={{ background: theme.surface, borderRadius: isMobileViewport ? 18 : 12, border: `1px solid ${theme.border}`, padding: isMobileViewport ? '14px 16px' : '16px', display: 'flex', flexDirection: 'column', gap: isMobileViewport ? 10 : 12, minWidth: 0, minHeight: isMobileViewport ? 82 : 'auto', gridColumn: isLastMobileOddCard ? '1 / -1' : 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: isMobileViewport ? 12 : 10, minWidth: 0 }}>
            <div style={{ width: isMobileViewport ? 42 : 40, height: isMobileViewport ? 42 : 40, borderRadius: 12, background: stat.bg, color: stat.color, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              <Icon size={20} />
            </div>
            <div style={{ minWidth: 0, display: 'grid', gap: isMobileViewport ? 4 : 6 }}>
              <div style={{ fontSize: isMobileViewport ? 18 : 22, fontWeight: 700, color: theme.text, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: 12, color: theme.muted, lineHeight: 1.25, wordBreak: 'break-word' }}>{stat.label}</div>
            </div>
          </div>
          {!isMobileViewport ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: theme.primary, cursor: 'pointer', marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 4 }} onClick={stat.action}>
              {stat.link} <ChevronRight size={14} />
            </div>
          ) : null}
        </div>
      );
    })}
  </div>
  );
}

