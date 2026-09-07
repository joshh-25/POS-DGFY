import { ShieldCheck } from 'lucide-react';
import { OrderSummaryCard } from '../../../../shared/components/checkout/OrderSummaryCard.jsx';
import { StorefrontResponsiveImage } from '../../../../shared/components/storefront/StorefrontResponsiveImage.jsx';
import { resolveStorefrontImageSources } from '../../../../shared/utils/storefrontImageSources.js';
import { buildDownpaymentTotalsRows, resolveDownpaymentDisplay } from '../../../../shared/model/storefrontDownpaymentPresentation.js';
import { buildFeeAndVatSummaryRows } from '../../../../shared/model/storefrontFeesAndTaxesPresentation.js';
import { VatDisclosureNote } from '../../../../shared/components/checkout/VatDisclosureNote.jsx';
import { StorefrontOrderInstructions } from '../../../../shared/components/storefront/StorefrontOrderInstructions.jsx';

function FnbCheckoutTrustCard({ accentColor, accentSoft, accentTint, displayFont, headingWeight }) {
  return (
    <div style={{ border: `1px solid ${accentSoft}`, borderRadius: 18, padding: 16, background: accentTint, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
      <div style={{ width: 42, height: 42, borderRadius: '50%', background: '#fff', color: accentColor, display: 'grid', placeItems: 'center', flexShrink: 0 }}><ShieldCheck size={22} /></div>
      <div style={{ display: 'grid', gap: 4 }}>
        <div style={{ fontSize: 14, fontWeight: headingWeight, color: '#1e293b', fontFamily: displayFont }}>Secure &amp; Private</div>
        <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>Your information is safe and will only be used for this order.</div>
      </div>
    </div>
  );
}

/** Shared desktop F&B summary content. The view does not call APIs or mutate checkout state. */
export function FnbCheckoutSummaryContent({
  accentColor, accentSoft, accentTint, bodyFont, cart, cartImageErrors, cartCount,
  checkoutAllowed, displayFont, isDeliveryOrder, money, onImageError,
  paymentStep = false, promoDiscountSummaryRow, specialInstructions = '', voucherDiscountSummaryRow, promoPanel, scheduleLabel, showFulfillmentSummary = true, totals,
  variant = 'detailed'
}) {
  const statusRows = [
    ...(showFulfillmentSummary ? [
      { label: 'Fulfillment', value: isDeliveryOrder ? 'Delivery' : 'Pickup' },
      { label: 'Schedule', value: scheduleLabel },
    ] : []),
    { label: paymentStep ? 'Status' : 'Items', value: paymentStep ? (checkoutAllowed ? 'Ready to submit' : 'Complete required fields') : `${cartCount} item${cartCount === 1 ? '' : 's'}` }
  ];
  const lineItems = cart.map((line) => ({
    key: `fnb-checkout-summary-${line.cart_line_id || line.item_id}`,
    name: line.name,
    meta: `x ${Math.max(1, Number(line.quantity || 1))}`,
    value: money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0)),
    image: (
      <div style={{ width: 48, height: 48, borderRadius: 12, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
        {(line.thumbnail_url || line.image_url) && !cartImageErrors.has(Number(line.item_id))
          ? <StorefrontResponsiveImage imageSources={resolveStorefrontImageSources(line, { preferred: 'thumbnail' })} alt={line.name} sizes="48px" width={48} height={48} loading="lazy" decoding="async" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => onImageError(line.item_id)} />
          : <span style={{ fontSize: 10, fontWeight: 700, color: '#64748b' }}>{String(line.name || '').slice(0, 1) || 'I'}</span>}
      </div>
    )
  }));
  const downpaymentRows = buildDownpaymentTotalsRows({
    display: resolveDownpaymentDisplay({ quoteResult: totals }),
    money,
    orderMethod: isDeliveryOrder ? 'delivery' : 'pickup'
  });
  const totalsRows = [
    { label: 'Subtotal', value: money(totals.subtotal_amount) },
    ...(promoDiscountSummaryRow ? [promoDiscountSummaryRow] : []),
    ...(voucherDiscountSummaryRow ? [voucherDiscountSummaryRow] : []),
    { label: 'Delivery Fee', value: money(totals.delivery_fee) },
    ...buildFeeAndVatSummaryRows({ totals, money }),
    { label: 'Total', value: money(totals.total_amount), emphasis: true, borderTop: true },
    ...downpaymentRows
  ];

  const detailedCard = (
    <div style={{ border: '1px solid #d9e4e8', borderRadius: 18, padding: 18, background: '#fff', boxShadow: '0 12px 24px rgba(15,23,42,.06)', display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: '0.08em', fontFamily: variant === 'customer' ? bodyFont : undefined }}>Order Summary</div>
      <div style={{ fontSize: 38, fontWeight: 800, color: '#1e293b', lineHeight: 1, fontFamily: variant === 'customer' ? displayFont : undefined }}>{money(totals.total_amount)}</div>
      <div style={{ display: 'grid', gap: 10, fontSize: 13, color: '#334155' }}>
        {statusRows.map((row) => <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{row.label}</span><strong>{row.value}</strong></div>)}
      </div>
      <StorefrontOrderInstructions value={specialInstructions} accentColor={accentColor} bodyFont={bodyFont} compact />
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 14, display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 14, fontWeight: variant === 'customer' ? 800 : 700, color: '#1e293b' }}>Your Items</div>
        <div style={{ display: 'grid', gap: 10 }}>
          {lineItems.map((line) => (
            <div key={line.key} style={{ display: 'grid', gridTemplateColumns: '48px minmax(0, 1fr) auto', gap: 10, alignItems: 'center' }}>
              {line.image}
              <div style={{ minWidth: 0, display: 'grid', gap: 4 }}><div style={{ fontSize: 14, fontWeight: variant === 'customer' ? 800 : 700, color: '#1e293b' }}>{line.name}</div><div style={{ fontSize: 12, color: '#64748b' }}>{line.meta}</div></div>
              <div style={{ fontSize: 14, fontWeight: variant === 'customer' ? 800 : 700, color: '#1e293b', whiteSpace: 'nowrap' }}>{line.value}</div>
            </div>
          ))}
        </div>
      </div>
      {promoPanel}
      <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, display: 'grid', gap: 10 }}>
        {totalsRows.map((row) => <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, paddingTop: row.borderTop ? 8 : 0, borderTop: row.borderTop ? '1px solid #e2e8f0' : 'none', fontSize: row.emphasis ? 16 : 13, color: '#334155' }}><span style={{ fontWeight: row.emphasis ? (variant === 'customer' ? 800 : 700) : 400 }}>{row.label}</span><strong style={{ fontWeight: row.emphasis ? (variant === 'customer' ? 900 : 800) : 700 }}>{row.value}</strong></div>)}
      </div>
      <VatDisclosureNote />
    </div>
  );

  return (
    <>
      {variant === 'compact' ? <OrderSummaryCard accentColor={accentColor} totalLabel="Order Summary" totalAmount={totals.total_amount} money={money} promoPanel={promoPanel} statusRows={statusRows} lineItems={lineItems} totalsRows={totalsRows} bodyFont={bodyFont} displayFont={displayFont} specialInstructions={specialInstructions} footnote={<VatDisclosureNote />} /> : detailedCard}
      <FnbCheckoutTrustCard accentColor={accentColor} accentSoft={accentSoft} accentTint={accentTint} displayFont={displayFont} headingWeight={variant === 'customer' ? 800 : 700} />
    </>
  );
}
