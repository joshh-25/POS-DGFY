import React from 'react';
import { DownpaymentTrackingSummary } from './DownpaymentTrackingSummary.jsx';
import { VatDisclosureNote } from '../checkout/VatDisclosureNote.jsx';
import { StorefrontOrderInstructions } from '../storefront/StorefrontOrderInstructions.jsx';
import { buildStorefrontOrderBreakdownRows } from '../../model/storefrontOrderBreakdownPresentation.js';

function fulfillmentLabel(orderMethod) {
  const method = String(orderMethod || '').trim().toLowerCase();
  if (method === 'dine_in' || method === 'dine-in') return 'Dine In';
  if (method === 'pickup') return 'Pickup';
  return 'Delivery';
}

export function StorefrontTrackingOrderSummary({
  accentColor,
  bodyFont,
  displayFont,
  formatTicketDate,
  money,
  onCopyPin,
  completedOnLabel = '',
  renderItemAction,
  softText = '#64748b',
  statusLabel,
  trackingResult,
}) {
  const items = Array.isArray(trackingResult?.items)
    ? trackingResult.items.filter((item) => String(item?.name || '').trim())
    : [];
  const orderMethod = String(trackingResult?.order_method || 'delivery').trim().toLowerCase();
  const scheduledFor = String(
    trackingResult?.scheduledFor
      || trackingResult?.scheduled_for
      || trackingResult?.order?.scheduled_for
      || trackingResult?.raw?.data?.order?.scheduled_for
      || trackingResult?.raw?.order?.scheduled_for
      || ''
  ).trim();
  const orderTime = trackingResult?.createdAt
    ? formatTicketDate(trackingResult.createdAt)
    : (trackingResult?.updatedAt ? formatTicketDate(trackingResult.updatedAt) : 'Today');
  const scheduleTime = scheduledFor ? formatTicketDate(scheduledFor) : orderTime;
  const pin = String(trackingResult?.tracking_pin || '').trim() || 'N/A';
  const breakdownRows = buildStorefrontOrderBreakdownRows({
    money,
    orderMethod,
    totals: {
      subtotal_amount: trackingResult?.subtotalAmount,
      discount_amount: trackingResult?.discountAmount,
      discount_label: trackingResult?.discountLabel,
      customer_processing_fee_amount: trackingResult?.customerProcessingFeeAmount,
      customer_processing_fee_label: trackingResult?.customerProcessingFeeLabel,
      delivery_fee: trackingResult?.deliveryFee,
      vat_amount: trackingResult?.vatAmount,
      total_amount: trackingResult?.totalAmount,
    },
  });
  const totalSummaryRow = breakdownRows.find((row) => row.label === 'Total');
  const showVatDisclosure = breakdownRows.some((row) => row.informational);

  return (
    <section style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 18, background: '#fff', boxShadow: '0 12px 24px rgba(15,23,42,.06)', display: 'grid', gap: 14, fontFamily: bodyFont }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Order Summary</div>
      {totalSummaryRow ? <div style={{ fontSize: 38, fontWeight: 800, color: '#1e293b', lineHeight: 1, fontFamily: displayFont }}>{totalSummaryRow.value}</div> : null}

      <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Fulfillment</span><strong>{fulfillmentLabel(orderMethod)}</strong></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>{scheduledFor ? 'Scheduled for' : 'Order time'}</span><strong style={{ textAlign: 'right' }}>{scheduleTime}</strong></div>
        {statusLabel ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Status</span><strong style={{ textAlign: 'right' }}>{statusLabel}</strong></div> : null}
        {completedOnLabel ? <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span>Completed on</span><strong style={{ textAlign: 'right' }}>{completedOnLabel}</strong></div> : null}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
        <div><div style={{ fontSize: 12, color: softText }}>Order PIN</div><div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', overflowWrap: 'anywhere' }}>{pin}</div></div>
        <button type="button" onClick={() => onCopyPin(pin)} style={{ minHeight: 36, color: accentColor, fontWeight: 700, background: 'transparent', border: `1px solid ${accentColor}33`, borderRadius: 10, cursor: 'pointer', padding: '7px 12px', fontSize: 13, fontFamily: bodyFont }}>Copy</button>
      </div>

      <StorefrontOrderInstructions value={trackingResult?.specialInstructions} accentColor={accentColor} bodyFont={bodyFont} compact />

      {items.length > 0 ? (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: displayFont }}>Your Items</div>
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map((item, index) => {
              const itemAction = renderItemAction?.(item);
              return (
                <div key={item.id || item.item_id || index} style={{ display: 'grid', gridTemplateColumns: item.image_url ? '48px minmax(0, 1fr) auto' : 'minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
                  {item.image_url ? <img src={item.image_url} alt="" width="48" height="48" loading="lazy" style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #e2e8f0', objectFit: 'cover', background: '#f8fafc' }} /> : null}
                  <div style={{ minWidth: 0, display: 'grid', gap: 4 }}><div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', overflowWrap: 'anywhere', fontFamily: displayFont }}>{item.name}</div><div style={{ fontSize: 12, color: softText }}>x {Math.max(1, Number(item.qty || 1))}</div></div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', fontFamily: displayFont }}>{money(item.amount ?? 0)}</div>
                  {itemAction ? <div style={{ gridColumn: '1 / -1' }}>{itemAction}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {breakdownRows.length > 0 ? (
        <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10, fontSize: 13, color: '#334155' }}>
          {breakdownRows.map((row) => (
            <div key={row.label} style={{ borderTop: row.borderTop ? '1px solid #e2e8f0' : 'none', paddingTop: row.borderTop ? 10 : 0, display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: row.emphasis ? 16 : 13, color: row.color || '#334155' }}>
              <span style={{ fontWeight: row.emphasis ? 700 : 400, fontFamily: row.emphasis ? displayFont : undefined }}>{row.label}</span>
              <strong style={{ fontSize: row.emphasis ? 18 : 13, fontFamily: row.emphasis ? displayFont : undefined }}>{row.value}</strong>
            </div>
          ))}
          {showVatDisclosure ? <VatDisclosureNote /> : null}
        </div>
      ) : null}

      <DownpaymentTrackingSummary trackingResult={trackingResult} money={money} orderMethod={orderMethod} />
    </section>
  );
}
