import React from 'react';
import { CalendarDays, Clock3 } from 'lucide-react';

export function ServiceBookingSelectedServiceCard({
  STYLES,
  servicesPrimary,
  servicesPrimarySoft,
  servicesPrimaryBorder,
  isMobileViewport,
  activeBookingService,
  serviceBookingSummaryTitle,
  bookingSummaryQuantity,
  hasServiceCart,
  serviceCartLines,
  selectedServiceCartLineId,
  openServiceCartEditor,
}) {
  const serviceAreaLabel = activeBookingService?.serviceAreaLabel || activeBookingService?.service_detail?.service_area_type || 'Service';
  const durationLabel = activeBookingService?.durationLabel || `${Number(activeBookingService?.service_detail?.duration_minutes || 0) || 0} min`;
  return (
    <>
      <div
        style={{
          border: '1px solid #e2e8f0',
          borderRadius: 18,
          background: '#ffffff',
          padding: isMobileViewport ? 14 : 16,
          display: 'grid',
          gap: 12,
          boxShadow: '0 10px 28px rgba(15, 23, 42, 0.05)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr auto' : '72px minmax(0, 1fr) auto', gap: 14, alignItems: 'center' }}>
          <div
            style={{
              width: isMobileViewport ? 58 : 72,
              height: isMobileViewport ? 58 : 72,
              borderRadius: isMobileViewport ? 16 : 20,
              background: 'linear-gradient(135deg,#eff6ff,#dbeafe)',
              border: `1px solid ${servicesPrimaryBorder}`,
              display: 'grid',
              placeItems: 'center',
              color: servicesPrimary,
              gridRow: isMobileViewport ? '1 / span 2' : 'auto',
            }}
          >
            <CalendarDays size={isMobileViewport ? 24 : 30} />
          </div>

          <div style={{ minWidth: 0, display: 'grid', gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Service
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: isMobileViewport ? 20 : 28, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1.08 }}>
                {serviceBookingSummaryTitle}
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: '#475569',
                  background: '#f8fafc',
                  border: '1px solid #dbe5ee',
                  borderRadius: 999,
                  padding: '4px 10px',
                }}
              >
                {serviceAreaLabel}
              </span>
            </div>
          </div>

          <div
            style={{
              justifySelf: isMobileViewport ? 'start' : 'end',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              minHeight: 34,
              borderRadius: 999,
              border: '1px solid #e2e8f0',
              background: '#fff',
              padding: '0 11px',
              color: '#334155',
              fontSize: 12,
              fontWeight: 800,
              whiteSpace: 'nowrap',
            }}
          >
            <Clock3 size={14} color={servicesPrimary} />
            {hasServiceCart && serviceCartLines.length > 1 ? `${bookingSummaryQuantity} unit${bookingSummaryQuantity === 1 ? '' : 's'}` : durationLabel}
          </div>
        </div>
      </div>

      {serviceCartLines.length > 1 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {serviceCartLines.map((line, index) => {
            const isActiveLine = String(line.cart_line_id || '') === String(selectedServiceCartLineId || '');
            return (
              <button
                key={String(line.cart_line_id || line.item_id || index)}
                type="button"
                onClick={() => openServiceCartEditor(line)}
                style={{
                  minHeight: 38,
                  padding: '0 14px',
                  borderRadius: 999,
                  border: `1px solid ${isActiveLine ? servicesPrimaryBorder : '#dbe5ee'}`,
                  background: isActiveLine ? servicesPrimarySoft : '#fff',
                  color: '#334155',
                  fontSize: 13,
                  fontWeight: 800,
                  cursor: 'pointer',
                }}
              >
                {line.variantName || line.name || `Service ${index + 1}`}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
