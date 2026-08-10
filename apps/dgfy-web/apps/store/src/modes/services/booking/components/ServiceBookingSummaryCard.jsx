import React, { useState } from 'react';
import { ImageIcon, ShieldCheck } from 'lucide-react';

export function ServiceBookingSummaryCard({
  isMobileViewport,
  STYLES,
  servicesPrimary,
  money,
  bookingSummaryAmount,
  summaryRows,
  serviceLineItems,
}) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const shouldExpand = !isMobileViewport || isMobileExpanded;
  const compactRows = summaryRows.map((row) => (row.label === 'Services' ? { ...row, label: 'Service' } : row));

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

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                borderTop: '1px solid #e2e8f0',
                paddingTop: 14,
              }}
            >
              <span style={{ fontSize: 14, fontWeight: 900, color: STYLES.colors.dark }}>Total</span>
              <strong style={{ fontSize: 16, fontWeight: 900, color: STYLES.colors.dark }}>{money(bookingSummaryAmount)}</strong>
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
                {serviceLineItems.map((line, index) => (
                  <div
                    key={line.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      paddingTop: index === 0 ? 0 : 12,
                      borderTop: index === 0 ? 'none' : '1px solid #e2e8f0',
                    }}
                  >
                    <div
                      style={{
                        width: isMobileViewport ? 40 : 44,
                        height: isMobileViewport ? 40 : 44,
                        borderRadius: 12,
                        background: '#f1f5f9',
                        border: '1px solid #e2e8f0',
                        display: 'grid',
                        placeItems: 'center',
                        color: '#94a3b8',
                        flexShrink: 0,
                      }}
                    >
                      <ImageIcon size={18} />
                    </div>
                    <div style={{ flex: '1 1 0%', minWidth: 0, display: 'grid', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', lineHeight: 1.35 }}>{line.title}</div>
                          <div style={{ marginTop: 2, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                            x {line.quantity}{line.variant ? ` · ${line.variant}` : ''}
                          </div>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 900, color: '#0f172a', whiteSpace: 'nowrap' }}>
                          {line.amount}
                        </div>
                      </div>
                      {line.addOns && line.addOns.length > 0 ? (
                        <div style={{ display: 'grid', gap: 2 }}>
                          {line.addOns.map((addOn) => (
                            <div key={addOn.key} style={{ fontSize: 12, color: '#334155', lineHeight: 1.5 }}>+ {addOn.label}</div>
                          ))}
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
                Your information is safe and will only be used for this booking.
              </div>
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
