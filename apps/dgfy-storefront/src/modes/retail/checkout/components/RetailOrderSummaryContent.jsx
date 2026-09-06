import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { OrderSummaryCard } from '../../../../shared/components/checkout/OrderSummaryCard.jsx';
import { buildDownpaymentTotalsRows, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import { buildFeeAndVatSummaryRows } from '../../../../shared/model/storefrontFeesAndTaxesPresentation.js';
import { VatDisclosureNote } from '../../../../shared/components/checkout/VatDisclosureNote.jsx';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_SOFT = '#b9cfe8';
const RETAIL_ACCENT_TINT = '#eef4fb';

function RetailOrderTrustCard({ displayFont }) {
  return (
    <div style={{ border: `1px solid ${RETAIL_ACCENT_SOFT}`, borderRadius: 18, padding: 16, background: RETAIL_ACCENT_TINT, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', color: RETAIL_ACCENT, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ShieldCheck size={22} /></div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: displayFont }}>Secure &amp; Private</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Your information is safe and will only be used for this order.</div>
      </div>
    </div>
  );
}

/** Retail checkout order summary. Structurally mirrors
 * modes/simple/checkout/components/SimpleCheckoutSummaryContent.jsx (shared OrderSummaryCard +
 * trust card) while keeping this mode's own blue accent, kept as its own file per the
 * "independent trees" pattern. Delivery Fee / Fees & Taxes are shown as 0 — Retail's checkout
 * isn't connected to a fee/quote backend yet, so only the real cart subtotal/total are computed. */
export function RetailOrderSummaryContent({
  bodyFont,
  cart = [],
  cartCount = 0,
  cartImageErrors,
  displayFont,
  isDeliveryOrder = false,
  isSticky = false,
  money,
  onImageError,
  promoDiscountSummaryRow = null,
  voucherDiscountSummaryRow = null,
  promoPanel = null,
  scheduleLabel = 'NOW',
  totals = {},
  withAssetOrigin
}) {
  const statusRows = [
    { label: 'Fulfillment', value: isDeliveryOrder ? 'Delivery' : 'Pickup' },
    { label: 'Schedule', value: scheduleLabel },
    { label: 'Items', value: `${cartCount} item${cartCount === 1 ? '' : 's'}` }
  ];
  const lineItems = cart.map((line) => ({
    key: `retail-checkout-summary-${line.cart_line_id || line.item_id}`,
    name: line.name,
    meta: `x ${Math.max(1, Number(line.quantity || 1))}`,
    value: money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0)),
    image: (
      <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
        {line.image_url && !cartImageErrors.has(Number(line.item_id))
          ? <img src={withAssetOrigin(line.image_url)} alt={line.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => onImageError(line.item_id)} />
          : <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{String(line.name || '').slice(0, 1) || 'I'}</span>}
      </div>
    )
  }));
  // Phase 142 (#823): quote-sourced only, same as every other mode's summary -- Retail now
  // quotes for a downpayment-required store (see StorefrontApp.jsx's forced-quote arm), so
  // `totals` carries the real server split in that one case, exactly as this doc comment's
  // "not connected to a fee/quote backend yet" caveat above describes for everything else.
  const downpaymentRows = buildDownpaymentTotalsRows({
    display: resolveDownpaymentDisplay({ quoteResult: totals }),
    money,
    orderMethod: isDeliveryOrder ? 'delivery' : 'pickup'
  });
  const totalsRows = [
    { label: 'Subtotal', value: money(totals.subtotal_amount) },
    { label: 'Delivery Fee', value: money(totals.delivery_fee) },
    ...(promoDiscountSummaryRow ? [{ ...promoDiscountSummaryRow, color: '#15803d' }] : []),
    ...(voucherDiscountSummaryRow ? [{ ...voucherDiscountSummaryRow, color: '#7c3aed' }] : []),
    ...buildFeeAndVatSummaryRows({ totals, money }),
    { label: 'Total', value: money(totals.total_amount), emphasis: true, borderTop: true },
    ...downpaymentRows
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <OrderSummaryCard
        accentColor={RETAIL_ACCENT}
        totalLabel="Order Summary"
        totalAmount={totals.total_amount}
        money={money}
        promoPanel={promoPanel}
        sticky={isSticky}
        statusRows={statusRows}
        lineItems={lineItems}
        totalsRows={totalsRows}
        bodyFont={bodyFont}
        displayFont={displayFont}
        footnote={<VatDisclosureNote />}
      />
      <RetailOrderTrustCard displayFont={displayFont} />
    </div>
  );
}
