import React, { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ServiceImage } from '../../ServiceImage.jsx';

const findSummaryValue = (summaryRows, matcher) => {
  const row = summaryRows.find((entry) => matcher(String(entry?.label || '').toLowerCase()));
  return row?.value == null ? '' : String(row.value);
};

export function ServiceBookingSummaryCard({
  isMobileViewport,
  money,
  bookingSummaryAmount,
  summaryRows = [],
  serviceLineItems = [],
  servicesPrimary = '#0f766e',
  servicesPrimarySoft = '#ecfeff',
  servicesPrimaryBorder = 'rgba(15,118,110,0.2)',
}) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const shouldExpand = !isMobileViewport || isMobileExpanded;
  const totalQuantity = serviceLineItems.reduce((total, line) => total + Math.max(1, Number(line?.quantity || 1)), 0);
  const itemCountLabel = `${totalQuantity} ${totalQuantity === 1 ? 'service' : 'services'}`;
  const infoRows = useMemo(() => ([
    { label: 'Fulfillment', value: findSummaryValue(summaryRows, (label) => label.includes('fulfillment')) },
    { label: 'Schedule', value: findSummaryValue(summaryRows, (label) => label.includes('schedule')) },
    { label: 'Items', value: itemCountLabel },
  ].filter((row) => row.value)), [itemCountLabel, summaryRows]);

  return (
    <aside style={{ display: 'grid', gap: 16, position: isMobileViewport ? 'static' : 'sticky', top: 32, minWidth: 0 }}>
      <section style={{ border: '1px solid #cce8ee', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 18 : 24, display: 'grid', gap: 0, boxSizing: 'border-box' }}>
        <h2 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Booking summary</h2>
        <div style={{ fontSize: 12.48, lineHeight: 1.6, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Your booking
        </div>
        <div style={{ fontSize: 35.2, lineHeight: 1.6, fontWeight: 800, color: '#101010', marginBottom: 24, whiteSpace: 'nowrap' }}>
          {money(bookingSummaryAmount)}
        </div>

        {isMobileViewport ? (
          <button
            type="button"
            onClick={() => setIsMobileExpanded((previous) => !previous)}
            style={{ justifySelf: 'start', border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 999, background: servicesPrimarySoft, color: servicesPrimary, padding: '8px 14px', minHeight: 42, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}
          >
            {isMobileExpanded ? 'Hide details' : 'Booking summary'}
          </button>
        ) : null}

        {shouldExpand ? (
          <>
            <div style={{ display: 'grid', gap: 7.2, borderBottom: '1px solid #cce8ee', paddingBottom: 24, marginBottom: 24 }}>
              {infoRows.map((row) => (
                <div key={row.label} style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, minHeight: 24.3 }}>
                  <span style={{ fontSize: 14.4, lineHeight: 1.6, color: '#58717a' }}>{row.label}</span>
                  <strong style={{ fontSize: 14.4, lineHeight: 1.6, color: '#153e4a', textAlign: 'right', fontWeight: 700 }}>{row.value}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 0 }}>
              <h3 style={{ margin: '0 0 16px', fontFamily: "'Lexend', 'Segoe UI', Arial, sans-serif", fontSize: 16, lineHeight: 1.25, fontWeight: 700, color: '#101010' }}>Your items</h3>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'grid', gap: 16 }}>
                {serviceLineItems.map((line) => (
                  <li key={line.key} style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) auto', gap: 12, alignItems: 'start' }}>
                    <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: '#f1f5f9', border: '1px solid #cce8ee', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                      <ServiceImage
                        imageSources={line.imageSources}
                        alt={line.title}
                        sizes="52px"
                        width={52}
                        height={52}
                        fallbackLabel=""
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
                      <div style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 700, color: '#101010' }}>{line.title}</div>
                      <div style={{ fontSize: 14.4, lineHeight: 1.6, color: '#58717a' }}>
                        x {line.quantity}{line.variant ? ` · ${line.variant}` : ''}
                      </div>
                      {(line.addOns || []).map((addOn) => (
                        <div key={addOn.key} style={{ fontSize: 12.8, lineHeight: 1.5, color: servicesPrimary }}>+ {addOn.label}</div>
                      ))}
                    </div>
                    <strong style={{ fontSize: 14.4, lineHeight: 1.6, color: servicesPrimary, whiteSpace: 'nowrap', fontWeight: 800 }}>{line.amount}</strong>
                  </li>
                ))}
              </ul>

              <div style={{ display: 'grid', gap: 2.4, marginTop: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '8.8px 0', color: '#58717a', fontSize: 14.4, lineHeight: 1 }}>
                  <span>Subtotal</span><span>{money(bookingSummaryAmount)}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTop: '1px solid #cce8ee', marginTop: 12, padding: '16px 0', color: '#101010', fontSize: 18.4, lineHeight: 1.6, fontWeight: 700 }}>
                  <span>Total</span><strong>{money(bookingSummaryAmount)}</strong>
                </div>
              </div>
            </div>

            <div style={{ borderTop: '1px solid #cce8ee', paddingTop: 16, marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 8, color: servicesPrimary }}>
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14.4, lineHeight: 1.6 }}>Secure and private</strong>
                <span style={{ fontSize: 12.8, lineHeight: 1.6, color: '#58717a' }}>Your information stays in this browser and is only used for this booking.</span>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </aside>
  );
}
