import React from 'react';
import { ArrowRight, Compass, MapPinned, Sparkles } from 'lucide-react';
import { CUSTOMER_DASHBOARD_TYPOGRAPHY } from '../model/customerDashboardPresentation.jsx';

export function OverviewDiscoveryCta({ isMobileViewport, theme, onGoDiscovery }) {
  const headingId = 'overview-discovery-cta-heading';

  return (
    <section
      data-testid="overview-discovery-cta"
      aria-labelledby={headingId}
      style={{
        position: 'relative',
        overflow: 'hidden',
        minHeight: '100%',
        boxSizing: 'border-box',
        border: '1px solid #D6EAF8',
        borderRadius: isMobileViewport ? 20 : 16,
        padding: isMobileViewport ? 20 : 24,
        background: 'linear-gradient(135deg, rgba(245, 251, 255, 0.98) 0%, rgba(229, 244, 255, 0.94) 58%, rgba(241, 248, 255, 0.98) 100%)',
        display: 'flex',
        alignItems: 'center'
      }}
    >
      <MapPinned aria-hidden="true" size={isMobileViewport ? 92 : 132} strokeWidth={1.1} style={{ position: 'absolute', right: isMobileViewport ? -18 : -12, bottom: isMobileViewport ? -22 : -30, color: '#75B9F5', opacity: 0.18, transform: 'rotate(-12deg)' }} />
      <Sparkles aria-hidden="true" size={isMobileViewport ? 20 : 24} style={{ position: 'absolute', top: isMobileViewport ? 16 : 22, right: isMobileViewport ? 24 : 34, color: '#5BAAF1', opacity: 0.8 }} />

      <div style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'flex-start', gap: isMobileViewport ? 12 : 16, minWidth: 0, width: '100%' }}>
        <div style={{ width: isMobileViewport ? 48 : 56, height: isMobileViewport ? 48 : 56, borderRadius: '50%', background: 'rgba(91, 170, 241, 0.22)', color: theme.primary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Compass size={isMobileViewport ? 26 : 32} strokeWidth={2.1} />
        </div>
        <div style={{ minWidth: 0 }}>
          <h3 id={headingId} style={{ margin: 0, color: theme.text, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.mobile : CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitle.desktop, lineHeight: 1.25, fontWeight: CUSTOMER_DASHBOARD_TYPOGRAPHY.subsectionTitleWeight }}>
            Curious what&apos;s around you?
          </h3>
          <p style={{ margin: '8px 0 16px', maxWidth: 360, color: theme.muted, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.secondary : CUSTOMER_DASHBOARD_TYPOGRAPHY.body, lineHeight: 1.5 }}>
            Explore nearby businesses, products, and services at DGFY Map
          </p>
          <button type="button" aria-label="Discover something" onClick={() => onGoDiscovery?.()} style={{ minHeight: 42, border: `1px solid ${theme.primary}`, borderRadius: 10, padding: '0 14px', background: theme.primary, color: '#FFF', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: isMobileViewport ? CUSTOMER_DASHBOARD_TYPOGRAPHY.compactAction : CUSTOMER_DASHBOARD_TYPOGRAPHY.action, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            <Compass size={15} strokeWidth={2.4} />
            Discover something
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </section>
  );
}
