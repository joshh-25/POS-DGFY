import React from 'react';
import { Check, RotateCcw, Store } from 'lucide-react';
import { StorefrontTrackingOrderSummary } from '../../../../shared/components/tracking/StorefrontTrackingOrderSummary.jsx';

/** Simple/MSME completion summary shown after the tracking status reaches completed. */
export function SimpleTrackingCompletedView({ actions, formatters, isMobileViewport, viewModel }) {
  const { copyTextToClipboard, goStoreCatalogPage } = actions;
  const { formatTicketDate, money, servicesBodyFont, servicesDisplayFont } = formatters;
  const {
    branchAddress,
    branchName,
    dgfyPrimary,
    isPickup,
    trackingResult
  } = viewModel;
  const completedOn = trackingResult?.updatedAt || trackingResult?.createdAt;
  const completedOnLabel = completedOn ? formatTicketDate(completedOn) : 'Today';

  return (
    <div
      data-testid="simple-tracking-completed"
      style={{
        maxWidth: 560,
        margin: '0 auto',
        border: '1px solid #D8E8DC',
        borderRadius: 20,
        padding: isMobileViewport ? 16 : 28,
        background: '#fff',
        boxShadow: '0 4px 20px rgba(23,107,58,.06)',
        display: 'grid',
        gap: 16,
        width: '100%',
        boxSizing: 'border-box'
      }}
    >
      <section style={{ display: 'grid', justifyItems: 'center', textAlign: 'center', gap: 8, paddingBottom: 8 }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#ecfdf5', border: '2px solid #86efac', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
          <Check size={36} strokeWidth={3} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 800, color: dgfyPrimary, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: servicesBodyFont }}>
          {isPickup ? 'Pickup Completed' : 'Delivery Completed'}
        </div>
        <h1 style={{ margin: 0, fontSize: isMobileViewport ? 26 : 32, fontWeight: 800, color: '#0f172a', lineHeight: 1.15, fontFamily: servicesDisplayFont }}>
          {isPickup ? 'Order Picked Up' : 'Order Delivered'}
        </h1>
        <div style={{ fontSize: 14, color: '#64748b', fontFamily: servicesBodyFont }}>
          {isPickup ? 'Thank you! Your order has been picked up.' : 'Thank you! Your order has been delivered.'}
        </div>
      </section>

      <section style={{ border: '1px solid #eef2f7', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#f1f5f9', color: dgfyPrimary, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          <Store size={24} />
        </div>
        <div style={{ flex: 1, minWidth: 0, fontFamily: servicesBodyFont }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', overflowWrap: 'anywhere' }}>{branchName || 'Storefront'}</div>
          {branchAddress ? <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, overflowWrap: 'anywhere' }}>{branchAddress}</div> : null}
        </div>
      </section>

      <StorefrontTrackingOrderSummary
        accentColor={dgfyPrimary}
        bodyFont={servicesBodyFont}
        completedOnLabel={completedOnLabel}
        displayFont={servicesDisplayFont}
        formatTicketDate={formatTicketDate}
        money={money}
        onCopyPin={(pin) => copyTextToClipboard?.(pin, 'Order PIN copied.')}
        statusLabel={trackingResult?.status_label || 'Completed'}
        trackingResult={trackingResult}
      />

      <button type="button" onClick={goStoreCatalogPage} style={{ width: '100%', minHeight: 46, borderRadius: 12, border: 'none', background: dgfyPrimary, color: '#fff', fontSize: 15, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: servicesBodyFont }}>
        <RotateCcw size={18} /> Order Again
      </button>
    </div>
  );
}
