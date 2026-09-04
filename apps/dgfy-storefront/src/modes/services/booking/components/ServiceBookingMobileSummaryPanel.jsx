import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Lock, ShoppingBag, X } from 'lucide-react';

import { ServiceImage } from '../../ServiceImage.jsx';
import { formatServiceNumber } from '../../servicesFormatters.js';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

/**
 * Services mobile checkout footer modeled after the established F&B responsive
 * checkout shell. It owns presentation only; step transitions stay with the
 * Services storefront route.
 */
export function ServiceBookingMobileSummaryPanel({
  accountStepComplete,
  bookingSummaryAmount,
  bookingSummaryQuantity,
  checkoutLoading = false,
  fulfillmentStepComplete,
  isMobileViewport,
  isQuoteFlow,
  money,
  onBack,
  onPrimary,
  serviceBookingStep,
  serviceLineItems = [],
  servicePaymentTiming,
  servicesBodyFont,
  servicesDisplayFont,
  servicesPrimary,
  servicesPrimaryDark,
  servicesPrimaryShadow,
  summaryRows = [],
}) {
  const [showSummary, setShowSummary] = useState(false);

  if (!isMobileViewport) return null;

  const itemCountLabel = `${formatServiceNumber(bookingSummaryQuantity)} ${bookingSummaryQuantity === 1 ? 'service' : 'services'}`;
  const primaryDisabled = serviceBookingStep === 1
    ? !accountStepComplete
    : serviceBookingStep === 3
      ? !fulfillmentStepComplete
      : serviceBookingStep === 4
        ? !isQuoteFlow && !servicePaymentTiming
        : false;
  const primaryLabel = serviceBookingStep === 4
    ? (isQuoteFlow ? 'Send quote request' : (checkoutLoading ? 'Processing...' : 'Confirm booking'))
    : 'Continue';

  const handlePrimary = () => {
    if (primaryDisabled || checkoutLoading) return;
    onPrimary?.();
  };

  return (
    <>
      {showSummary ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Booking summary"
          style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(15,23,42,0.38)', display: 'grid', alignItems: 'end' }}
          onClick={() => setShowSummary(false)}
        >
          <div
            style={{ background: SERVICES_PALETTE.surface, borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78vh', overflow: 'hidden', boxShadow: SERVICES_PALETTE.modalShadow, display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', fontFamily: servicesBodyFont }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '10px 16px 14px', borderBottom: `1px solid ${SERVICES_PALETTE.border}`, display: 'grid', gap: 12 }}>
              <div style={{ width: 56, height: 5, borderRadius: 999, background: SERVICES_PALETTE.border, margin: '0 auto' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont }}>Booking summary</div>
                <button type="button" aria-label="Close booking summary" onClick={() => setShowSummary(false)} style={{ width: 28, height: 28, borderRadius: 12, border: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.surface, color: SERVICES_PALETTE.textSecondary, display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 16px 20px', display: 'grid', gap: 16 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, lineHeight: 1, fontFamily: servicesDisplayFont }}>{money(bookingSummaryAmount)}</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: SERVICES_PALETTE.textSecondary }}>
                {summaryRows.map((row) => <SummaryRow key={row.label} label={row.label} value={row.value} />)}
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {serviceLineItems.map((line) => (
                  <div key={line.key} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', border: `1px solid ${SERVICES_PALETTE.border}`, borderRadius: 18, padding: 12, minWidth: 0 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', border: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.page, display: 'grid', placeItems: 'center' }}>
                      <ServiceImage imageSources={line.imageSources} alt={line.title} sizes="64px" width={64} height={64} fallbackLabel="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: SERVICES_PALETTE.textPrimary, lineHeight: 1.2, fontFamily: servicesDisplayFont, overflowWrap: 'anywhere' }}>{line.title}</div>
                      <div style={{ fontSize: 13, color: SERVICES_PALETTE.textMuted }}>x {formatServiceNumber(line.quantity)}</div>
                      {(line.addOns || []).map((addOn) => <div key={addOn.key} style={{ fontSize: 13, color: servicesPrimary, overflowWrap: 'anywhere' }}>+ {addOn.label}</div>)}
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont, whiteSpace: 'nowrap' }}>{line.amount}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: 'grid', gap: 10, borderTop: `1px solid ${SERVICES_PALETTE.border}`, paddingTop: 14 }}>
                <SummaryRow label="Subtotal" value={money(bookingSummaryAmount)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: `1px solid ${SERVICES_PALETTE.border}`, fontSize: 18, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <strong style={{ fontWeight: 800, fontFamily: servicesDisplayFont }}>{money(bookingSummaryAmount)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div style={{ position: 'fixed', left: 16, right: 16, bottom: 0, zIndex: 30, padding: '0 0 calc(env(safe-area-inset-bottom, 0px) + 14px)', background: 'transparent', fontFamily: servicesBodyFont }}>
        <div style={{ borderRadius: 24, border: `1px solid ${SERVICES_PALETTE.border}`, background: SERVICES_PALETTE.surface, boxShadow: SERVICES_PALETTE.modalShadow, padding: '14px 14px 16px', display: 'grid', gap: 14, width: '100%', maxWidth: '100%', minWidth: 0, margin: '0 auto', boxSizing: 'border-box' }}>
          <button type="button" onClick={() => setShowSummary(true)} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, border: `1px solid ${SERVICES_PALETTE.primaryBorder}`, background: SERVICES_PALETTE.primarySoft, display: 'grid', placeItems: 'center', color: servicesPrimary }}><ShoppingBag size={20} /></div>
            <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: SERVICES_PALETTE.textPrimary, fontFamily: servicesDisplayFont, overflowWrap: 'anywhere' }}>{itemCountLabel} - {money(bookingSummaryAmount)}</div>
              <div style={{ fontSize: 14, color: servicesPrimary, fontWeight: 700 }}>View booking summary</div>
            </div>
            <ChevronDown size={20} color={servicesPrimary} style={{ transform: showSummary ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: serviceBookingStep === 1 ? '1fr' : '1fr 1fr', gap: 12 }}>
            {serviceBookingStep !== 1 ? (
              <button type="button" onClick={onBack} style={secondaryButtonStyle}><ChevronLeft size={18} /> Back</button>
            ) : null}
            <button type="button" onClick={handlePrimary} disabled={primaryDisabled || checkoutLoading} style={{ ...primaryButtonStyle, background: `linear-gradient(180deg, ${servicesPrimary} 0%, ${servicesPrimaryDark} 100%)`, boxShadow: `0 12px 24px ${servicesPrimaryShadow}`, opacity: primaryDisabled || checkoutLoading ? 0.6 : 1 }}>
              {serviceBookingStep === 4 ? <><Lock size={18} />{primaryLabel}</> : <>Continue<ChevronRight size={20} /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: SERVICES_PALETTE.textSecondary }}><span>{label}</span><strong style={{ color: SERVICES_PALETTE.textPrimary, textAlign: 'right', overflowWrap: 'anywhere' }}>{value}</strong></div>;
}

const secondaryButtonStyle = {
  minHeight: 38,
  borderRadius: 16,
  border: `1px solid ${SERVICES_PALETTE.border}`,
  background: SERVICES_PALETTE.surface,
  color: SERVICES_PALETTE.textPrimary,
  fontWeight: 800,
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};

const primaryButtonStyle = {
  minHeight: 38,
  border: 'none',
  borderRadius: 16,
  color: '#fff',
  fontWeight: 900,
  fontSize: 14,
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
};
