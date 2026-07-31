import { ChevronDown, ChevronLeft, ChevronRight, Lock, ShoppingBag, X } from 'lucide-react';

const SIMPLE_BRAND = '#0f766e';
const SIMPLE_BRAND_DARK = '#134e4a';
const SIMPLE_BRAND_SHADOW = 'rgba(15,118,110,.28)';

/**
 * MSME (Simple) mobile checkout summary sheet and persistent action footer.
 * Structurally mirrors FnbCheckoutMobileSummaryPanel (same bottom-sheet +
 * floating footer pattern) while keeping MSME's own teal accent and simpler
 * sequential step numbering (1 Customer / 2 Fulfillment / 3 Payment).
 */
export function SimpleCheckoutMobileSummaryPanel({
  cart,
  cartCount = 0,
  cartImageErrors,
  checkoutAllowed = false,
  checkoutLoading = false,
  customerStepComplete = false,
  fulfillmentStepComplete = false,
  isDeliveryOrder = false,
  money,
  onBackToCatalog,
  onCheckout,
  onImageError,
  onStepChange,
  orderStep,
  promoDiscountSummaryRow,
  promoPanel,
  scheduleLabel = 'NOW',
  setSummaryOpen,
  showSummary,
  totals = {},
  withAssetOrigin,
}) {
  const totalFeeAndTaxes = (totals.service_fee_amount || 0) + (totals.vat_amount || 0);
  const isPrimaryDisabled = orderStep === 1
    ? !customerStepComplete
    : orderStep === 3
      ? !checkoutAllowed
      : !fulfillmentStepComplete;

  const handleBack = () => {
    if (orderStep === 1) {
      onBackToCatalog();
      return;
    }
    onStepChange(orderStep - 1);
  };

  const handlePrimary = () => {
    if (orderStep === 1 || orderStep === 2) {
      onStepChange(orderStep + 1);
      return;
    }
    onCheckout();
  };

  return (
    <>
      {showSummary && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 2200, background: 'rgba(15,23,42,0.38)', display: 'grid', alignItems: 'end' }}
          onClick={() => setSummaryOpen(false)}
        >
          <div
            style={{ background: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '78vh', overflow: 'hidden', boxShadow: '0 -18px 40px rgba(15,23,42,0.18)', display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ padding: '10px 16px 14px', borderBottom: '1px solid #e2e8f0', display: 'grid', gap: 12 }}>
              <div style={{ width: 56, height: 5, borderRadius: 999, background: '#cbd5e1', margin: '0 auto' }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>Order Summary</div>
                <button type="button" onClick={() => setSummaryOpen(false)} style={{ width: 28, height: 28, borderRadius: 12, border: '1px solid #dbe5ee', background: '#fff', color: '#334155', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
                  <X size={18} />
                </button>
              </div>
            </div>
            <div style={{ overflowY: 'auto', padding: '16px 16px 20px', display: 'grid', gap: 16 }}>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#1e293b', lineHeight: 1 }}>{money(totals.total_amount)}</div>
              <div style={{ display: 'grid', gap: 8, fontSize: 13, color: '#334155' }}>
                <SummaryRow label="Fulfillment" value={isDeliveryOrder ? 'Delivery' : 'Pickup'} />
                <SummaryRow label="Schedule" value={scheduleLabel} />
                <SummaryRow label="Items" value={`${cartCount} item${cartCount === 1 ? '' : 's'}`} />
              </div>
              <div style={{ display: 'grid', gap: 12 }}>
                {cart.map((line) => (
                  <div key={`simple-mobile-order-summary-${line.cart_line_id || line.item_id}`} style={{ display: 'grid', gridTemplateColumns: '64px minmax(0, 1fr) auto', gap: 12, alignItems: 'start', border: '1px solid #e2e8f0', borderRadius: 18, padding: 12 }}>
                    <div style={{ width: 64, height: 64, borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f8fafc', display: 'grid', placeItems: 'center' }}>
                      {line.image_url && !cartImageErrors.has(Number(line.item_id)) ? (
                        <img src={withAssetOrigin(line.image_url)} alt={line.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={() => onImageError(line.item_id)} />
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{String(line.name || '').slice(0, 1) || 'I'}</span>
                      )}
                    </div>
                    <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', lineHeight: 1.2 }}>{line.name}</div>
                      <div style={{ fontSize: 13, color: '#64748b' }}>x {Math.max(1, Number(line.quantity || 1))}</div>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>{money((Number(line.quantity || 0) || 0) * (Number(line.price || 0) || 0))}</div>
                  </div>
                ))}
              </div>
              {promoPanel}
              <div style={{ display: 'grid', gap: 10, borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <SummaryRow label="Subtotal" value={money(totals.subtotal_amount)} />
                {promoDiscountSummaryRow ? <SummaryRow label={promoDiscountSummaryRow.label} value={promoDiscountSummaryRow.value} /> : null}
                <SummaryRow label="Delivery Fee" value={money(totals.delivery_fee)} />
                <SummaryRow label="Fees & Taxes" value={money(totalFeeAndTaxes)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, paddingTop: 10, borderTop: '1px solid #e2e8f0', fontSize: 18, color: '#0f172a' }}>
                  <span style={{ fontWeight: 700 }}>Total</span>
                  <strong style={{ fontWeight: 800 }}>{money(totals.total_amount)}</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div key={`simple-responsive-footer-step-${orderStep}`} style={{ position: 'fixed', left: 16, right: 16, bottom: 0, zIndex: 30, marginTop: 16, padding: '0 0 calc(env(safe-area-inset-bottom, 0px) + 14px)', background: 'transparent' }}>
        <div style={{ borderRadius: 24, border: '1px solid #dbe5ee', background: '#fff', boxShadow: '0 -16px 36px rgba(15,23,42,0.14)', padding: '14px 14px 16px', display: 'grid', gap: 14, width: '100%', maxWidth: '100%', minWidth: 0, margin: '0 auto', boxSizing: 'border-box' }}>
          <button type="button" onClick={() => setSummaryOpen((previous) => !previous)} style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: 12, alignItems: 'center', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ width: 46, height: 46, borderRadius: 14, border: '1px solid #dbe5ee', background: '#f0fdfa', display: 'grid', placeItems: 'center', color: SIMPLE_BRAND }}><ShoppingBag size={20} /></div>
            <div style={{ minWidth: 0, display: 'grid', gap: 2 }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{cartCount} Item{cartCount === 1 ? '' : 's'} - {money(totals.total_amount)}</div>
              <div style={{ fontSize: 14, color: SIMPLE_BRAND, fontWeight: 700 }}>View Order Summary</div>
            </div>
            <ChevronDown size={20} color={SIMPLE_BRAND} style={{ transform: showSummary ? 'rotate(180deg)' : 'none', transition: 'transform 200ms ease' }} />
          </button>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <button type="button" onClick={handleBack} style={secondaryButtonStyle}>
              <ChevronLeft size={18} />
              Back
            </button>
            <button type="button" onClick={handlePrimary} disabled={isPrimaryDisabled} style={{ ...primaryButtonStyle, background: `linear-gradient(180deg, ${SIMPLE_BRAND} 0%, ${SIMPLE_BRAND_DARK} 100%)`, boxShadow: `0 12px 24px ${SIMPLE_BRAND_SHADOW}`, opacity: isPrimaryDisabled ? 0.6 : 1 }}>
              {orderStep === 3 ? <><Lock size={18} />{checkoutLoading ? 'Processing...' : 'Place Order'}</> : <>Continue<ChevronRight size={20} /></>}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryRow({ label, value }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 14, color: '#334155' }}><span>{label}</span><strong>{value}</strong></div>;
}

const secondaryButtonStyle = {
  minHeight: 38,
  borderRadius: 16,
  border: '1px solid #cbd5e1',
  background: '#fff',
  color: '#1e293b',
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
