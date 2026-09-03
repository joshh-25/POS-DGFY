import React from 'react';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

export function ServiceBookingEmptyState({
  onBrowseServices,
  isMobileViewport,
  servicesPrimary = SERVICES_PALETTE.primary,
  servicesPrimaryDark = SERVICES_PALETTE.primaryDark,
  servicesPrimaryShadow = SERVICES_PALETTE.primaryShadow,
  servicesDisplayFont,
}) {
  return (
    <section
      style={{
        border: `1px solid ${SERVICES_PALETTE.border}`,
        borderRadius: 24,
        background: SERVICES_PALETTE.surface,
        padding: isMobileViewport ? 20 : 28,
        boxShadow: SERVICES_PALETTE.cardShadow,
        display: 'grid',
        gap: 16,
        maxWidth: 760,
      }}
    >
      <div style={{ display: 'grid', gap: 8 }}>
        <div style={{ fontSize: 24, fontWeight: 900, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont }}>
          No service selected yet
        </div>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.65, color: SERVICES_PALETTE.textMuted }}>
          Choose a service first so we can load its booking details and requirements here.
        </p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <button
          type="button"
          onClick={onBrowseServices}
          style={{
            minHeight: 46,
            borderRadius: 14,
            border: 'none',
            background: `linear-gradient(135deg, ${servicesPrimary}, ${servicesPrimaryDark})`,
            color: SERVICES_PALETTE.surface,
            padding: '0 18px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: `0 10px 24px ${servicesPrimaryShadow}`,
          }}
        >
          Browse Services
        </button>
      </div>
    </section>
  );
}
