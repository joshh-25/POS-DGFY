import React, { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

export function ServiceBookingSummaryCard({
  isMobileViewport,
  STYLES,
  servicesPrimary,
  money,
  bookingSummaryAmount,
  summaryRows,
  serviceLineItems,
  bookingPagePaymentOptions,
  servicePaymentTiming,
}) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const shouldExpand = !isMobileViewport || isMobileExpanded;
  const paymentLabel = bookingPagePaymentOptions.find((option) => option.value === servicePaymentTiming)?.label || 'Pending';
  const compactRows = summaryRows.filter((row) => row.label !== 'Payment');

  return (
    <aside style={{ display: 'grid', gap: 16, position: isMobileViewport ? 'static' : 'sticky', top: 100 }}>
      <div
        style={{
          border: '1px solid #dbe5ee',
          borderRadius: 18,
          background: '#fff',
          padding: isMobileViewport ? 16 : 20,
          boxShadow: '0 14px 36px rgba(15, 23, 42, 0.08)',
          display: 'grid',
          gap: isMobileViewport ? 14 : 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0, display: 'grid', gap: 8 }}>
            <div
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: servicesPrimary,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              Booking Summary
            </div>
            <div style={{ fontSize: isMobileViewport ? 26 : 34, fontWeight: 900, color: STYLES.colors.dark, lineHeight: 1 }}>
              {money(bookingSummaryAmount)}
            </div>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                minHeight: 28,
                width: 'fit-content',
                borderRadius: 999,
                border: '1px solid #dbe5ee',
                background: '#f8fafc',
                padding: '0 10px',
                color: '#334155',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.02em',
              }}
            >
              <span style={{ color: '#64748b' }}>Payment</span>
              <span style={{ color: '#0f172a' }}>{paymentLabel}</span>
            </div>
          </div>
          {isMobileViewport ? (
            <button
              type="button"
              onClick={() => setIsMobileExpanded((previous) => !previous)}
              style={{
                minHeight: 36,
                padding: '0 12px',
                borderRadius: 999,
                border: '1px solid #dbe5ee',
                background: '#fff',
                color: servicesPrimary,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isMobileExpanded ? 'Hide details' : 'View details'}
            </button>
          ) : null}
        </div>

        {shouldExpand ? (
          <>
            <div
              style={{
                display: 'grid',
                gap: 10,
                border: '1px solid #e2e8f0',
                borderRadius: 16,
                background: '#fcfdff',
                padding: isMobileViewport ? '12px 14px' : '14px 16px',
              }}
            >
              {compactRows.map((row, index) => (
                <div
                  key={row.label}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) auto',
                    gap: 12,
                    alignItems: 'start',
                    paddingTop: index === 0 ? 0 : 10,
                    borderTop: index === 0 ? 'none' : '1px solid #eef2f7',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{row.label}</span>
                  <strong style={{ textAlign: 'right', maxWidth: isMobileViewport ? '100%' : 190, color: '#0f172a', fontSize: 13, lineHeight: 1.45 }}>
                    {row.value}
                  </strong>
                </div>
              ))}
            </div>

            {serviceLineItems.length > 0 ? (
              <div
                style={{
                  display: 'grid',
                  gap: 10,
                  borderTop: '1px solid #e2e8f0',
                  paddingTop: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Services Ordered
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                    {serviceLineItems.length} {serviceLineItems.length === 1 ? 'service' : 'services'}
                  </div>
                </div>
                {serviceLineItems.map((line) => (
                  <div
                    key={line.key}
                    style={{
                      borderRadius: 16,
                      border: '1px solid #e2e8f0',
                      background: '#fcfdff',
                      padding: isMobileViewport ? '12px 13px' : '13px 14px',
                      display: 'grid',
                      gap: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>{line.title}</div>
                        {line.variant ? (
                          <div style={{ marginTop: 2, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{line.variant}</div>
                        ) : null}
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {line.amount}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(2, minmax(0, 1fr))',
                        gap: 8,
                      }}
                    >
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Schedule</span>
                        <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{line.schedule}</span>
                      </div>
                      <div style={{ display: 'grid', gap: 3 }}>
                        <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Units</span>
                        <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{line.quantity}</span>
                      </div>
                      {line.duration ? (
                        <div style={{ display: 'grid', gap: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</span>
                          <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>{line.duration}</span>
                        </div>
                      ) : null}
                      {line.notes ? (
                        <div style={{ display: 'grid', gap: 3, gridColumn: isMobileViewport ? 'auto' : '1 / -1' }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</span>
                          <span style={{ fontSize: 12, color: '#334155', lineHeight: 1.55 }}>{line.notes}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            <div
              style={{
                borderRadius: 16,
                border: '1px solid #dbeafe',
                background: '#eff6ff',
                padding: '13px 14px',
                display: 'grid',
                gap: 8,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#1d4ed8', fontSize: 13, fontWeight: 800 }}>
                <ShieldCheck size={16} />
                Secure Booking
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.65, color: '#64748b' }}>
                Your booking details and saved addresses stay consistent across supported DGFY storefronts when you are signed in.
              </div>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
