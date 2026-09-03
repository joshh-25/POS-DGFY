import React, { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { ServiceImage } from '../../ServiceImage.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { formatServiceNumber } from '../../servicesFormatters.js';

const findSummaryValue = (summaryRows, matcher) => {
  const row = summaryRows.find((entry) => matcher(String(entry?.label || '').toLowerCase()));
  return row?.value == null ? '' : String(row.value);
};

const SUMMARY_TWO_COLUMN_GRID = 'minmax(0, 1fr) minmax(0, auto)';

export function ServiceBookingSummaryCard({
  isMobileViewport,
  money,
  bookingSummaryAmount,
  summaryRows = [],
  serviceLineItems = [],
  servicesPrimary = SERVICES_PALETTE.primary,
  servicesPrimaryDark = SERVICES_PALETTE.primaryDark,
  servicesPrimarySoft = SERVICES_PALETTE.primarySoft,
  servicesPrimaryBorder = SERVICES_PALETTE.primaryBorder,
  servicesDisplayFont,
}) {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const shouldExpand = !isMobileViewport || isMobileExpanded;
  const totalQuantity = serviceLineItems.reduce((total, line) => total + Math.max(1, Number(line?.quantity || 1)), 0);
  const itemCountLabel = `${formatServiceNumber(totalQuantity)} ${totalQuantity === 1 ? 'service' : 'services'}`;
  const infoRows = useMemo(() => ([
    { label: 'Fulfillment', value: findSummaryValue(summaryRows, (label) => label.includes('fulfillment')) },
    { label: 'Schedule', value: findSummaryValue(summaryRows, (label) => label.includes('schedule')) },
    { label: 'Items', value: itemCountLabel },
  ].filter((row) => row.value)), [itemCountLabel, summaryRows]);

  return (
    <aside style={{ display: 'grid', gap: 16, position: isMobileViewport ? 'static' : 'sticky', top: 32, minWidth: 0 }}>
      <section style={{ border: `1px solid ${servicesPrimaryBorder}`, borderRadius: 16, background: SERVICES_PALETTE.surface, padding: isMobileViewport ? 18 : 24, display: 'grid', gap: 0, boxSizing: 'border-box' }}>
        <h2 style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 }}>Booking summary</h2>
        <div style={{ fontSize: 12.48, lineHeight: 1.6, fontWeight: 800, color: servicesPrimary, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
          Your booking
        </div>
        <div style={{ fontSize: isMobileViewport ? 30 : 35.2, lineHeight: isMobileViewport ? 1.25 : 1.6, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont, marginBottom: 24, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
            <div style={{ display: 'grid', gap: 7.2, borderBottom: `1px solid ${servicesPrimaryBorder}`, paddingBottom: 24, marginBottom: 24 }}>
              {infoRows.map((row) => (
                <div key={row.label} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? 'minmax(0, 0.85fr) minmax(0, 1.15fr)' : SUMMARY_TWO_COLUMN_GRID, alignItems: 'center', columnGap: 16, minHeight: 24.3, minWidth: 0 }}>
                  <span style={{ fontSize: 14.4, lineHeight: 1.6, color: SERVICES_PALETTE.textMuted }}>{row.label}</span>
                  <strong style={{ fontSize: 14.4, lineHeight: 1.6, color: servicesPrimaryDark, textAlign: 'right', fontWeight: 700, justifySelf: 'stretch', minWidth: 0, overflowWrap: 'anywhere' }}>{row.value}</strong>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 0 }}>
              <h3 style={{ margin: '0 0 16px', fontFamily: servicesDisplayFont, fontSize: 16, lineHeight: 1.25, fontWeight: 700, color: SERVICES_PALETTE.textPrimary }}>Your items</h3>
              <ul style={{ listStyle: 'none', margin: '0 0 24px', padding: 0, display: 'grid', gap: 16 }}>
                {serviceLineItems.map((line) => (
                  <li key={line.key} style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '52px minmax(0, 1fr)' : '52px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', minWidth: 0 }}>
                    <div style={{ width: 52, height: 52, borderRadius: 10, overflow: 'hidden', background: SERVICES_PALETTE.page, border: `1px solid ${servicesPrimaryBorder}`, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
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
                      <div style={{ fontSize: 16, lineHeight: 1.4, fontWeight: 700, color: SERVICES_PALETTE.textPrimary, overflowWrap: 'anywhere' }}>{line.title}</div>
                      <div style={{ fontSize: 14.4, lineHeight: 1.6, color: SERVICES_PALETTE.textMuted }}>
                        x {formatServiceNumber(line.quantity)}{line.variant ? ` · ${line.variant}` : ''}
                      </div>
                      {(line.addOns || []).map((addOn) => (
                        <div key={addOn.key} style={{ fontSize: 12.8, lineHeight: 1.5, color: servicesPrimary }}>+ {addOn.label}</div>
                      ))}
                    </div>
                    <strong style={{ gridColumn: isMobileViewport ? '2' : undefined, fontSize: 14.4, lineHeight: 1.6, color: servicesPrimary, whiteSpace: 'nowrap', fontWeight: 800, justifySelf: isMobileViewport ? 'start' : 'end' }}>{line.amount}</strong>
                  </li>
                ))}
              </ul>

              <div style={{ display: 'grid', gap: 2.4, marginTop: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: SUMMARY_TWO_COLUMN_GRID, alignItems: 'center', columnGap: 16, padding: '8.8px 0', color: SERVICES_PALETTE.textMuted, fontSize: 14.4, lineHeight: 1 }}>
                  <span>Subtotal</span><span>{money(bookingSummaryAmount)}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: SUMMARY_TWO_COLUMN_GRID, alignItems: 'baseline', columnGap: 16, borderTop: `1px solid ${servicesPrimaryBorder}`, marginTop: 12, padding: '16px 0', color: SERVICES_PALETTE.textPrimary, fontSize: 18.4, lineHeight: 1.6, fontWeight: 700, fontFamily: servicesDisplayFont }}>
                  <span>Total</span><strong style={{ fontFamily: servicesDisplayFont }}>{money(bookingSummaryAmount)}</strong>
                </div>
              </div>
            </div>

            <div style={{ borderTop: `1px solid ${servicesPrimaryBorder}`, paddingTop: 16, marginTop: 8, display: 'flex', alignItems: 'flex-start', gap: 8, color: servicesPrimary }}>
              <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
              <div style={{ display: 'grid', gap: 2 }}>
                <strong style={{ fontSize: 14.4, lineHeight: 1.6, fontFamily: servicesDisplayFont }}>Secure and private</strong>
                <span style={{ fontSize: 12.8, lineHeight: 1.6, color: SERVICES_PALETTE.textMuted }}>Your information stays in this browser and is only used for this booking.</span>
              </div>
            </div>
          </>
        ) : null}
      </section>
    </aside>
  );
}
