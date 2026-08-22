import { ShieldCheck } from 'lucide-react';
import { OrderSummaryCard } from '../../../../shared/components/checkout/OrderSummaryCard.jsx';
import { buildDownpaymentTotalsRows, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';

const SIMPLE_ACCENT = '#176B3A';
const SIMPLE_ACCENT_SOFT = '#E4C98E';
const SIMPLE_ACCENT_TINT = '#f0fdfa';

function SimpleCheckoutTrustCard({ displayFont }) {
  return (
    <div style={{ border: `1px solid ${SIMPLE_ACCENT_SOFT}`, borderRadius: 18, padding: 16, background: SIMPLE_ACCENT_TINT, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', color: SIMPLE_ACCENT, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ShieldCheck size={22} /></div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', fontFamily: displayFont }}>Secure &amp; Private</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Your information is safe and will only be used for this order.</div>
      </div>
    </div>
  );
}

/** MSME (Simple) checkout order summary. Structurally mirrors FnbCheckoutSummaryContent
 * (shared OrderSummaryCard + trust card) while keeping MSME's own forest-green accent. */
export function SimpleCheckoutSummaryContent({
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
    key: `simple-checkout-summary-${line.cart_line_id || line.item_id}`,
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
  // Phase 142 (#823): quote-sourced only (resolveDownpaymentDisplay's lowest-precedence source) --
  // this card renders before a payment session or order exists.
  const downpaymentDisplay = resolveDownpaymentDisplay({ quoteResult: totals });
  const downpaymentRows = buildDownpaymentTotalsRows({
    display: downpaymentDisplay,
    money,
    orderMethod: isDeliveryOrder ? 'delivery' : 'pickup'
  });
  const totalsRows = [
    { label: 'Subtotal', value: money(totals.subtotal_amount) },
    ...(promoDiscountSummaryRow ? [promoDiscountSummaryRow] : []),
    ...(voucherDiscountSummaryRow ? [voucherDiscountSummaryRow] : []),
    { label: 'Delivery Fee', value: money(totals.delivery_fee) },
    { label: 'Fees & Taxes', value: money((totals.service_fee_amount || 0) + (totals.vat_amount || 0)) },
    { label: 'Total', value: money(totals.total_amount), emphasis: true, borderTop: true },
    ...downpaymentRows
  ];

  return (
    <div style={{ display: 'grid', gap: 18 }}>
      <OrderSummaryCard
        accentColor={SIMPLE_ACCENT}
        totalLabel="Order Summary"
        totalAmount={totals.total_amount}
        money={money}
        sticky={isSticky}
        promoPanel={promoPanel}
        statusRows={statusRows}
        lineItems={lineItems}
        totalsRows={totalsRows}
        bodyFont={bodyFont}
        displayFont={displayFont}
      />
      <SimpleCheckoutTrustCard displayFont={displayFont} />
    </div>
  );
}
