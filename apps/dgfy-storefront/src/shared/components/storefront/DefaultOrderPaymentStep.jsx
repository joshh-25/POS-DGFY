import { ChevronLeft } from 'lucide-react';
import { StorefrontDropdown } from '../../../features/shared-storefront/components/StorefrontDropdown.jsx';
import { PaymentMethodSelectorBlock } from '../checkout/PaymentMethodSelectorBlock.jsx';
import { DefaultOrderReviewItemsList } from './DefaultOrderReviewItemsList.jsx';
import { CHECKOUT_CONTROL_MIN_HEIGHT, CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../checkout/checkoutUiTokens.js';

// Placeholder payment options — not connected to the backend yet. See DefaultOrderPage.jsx's
// doc comment.
const PLACEHOLDER_PAYMENT_OPTIONS = [
  { value: 'cash', label: 'Cash on delivery/pickup' },
  { value: 'gcash', label: 'GCash' },
  { value: 'maya', label: 'Maya' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank transfer' }
];

/**
 * Default/Retail order page's Review & Payment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutPaymentStep.jsx's layout (payment selector +
 * read-only item list + actions). Payment type is placeholder-only local state; the item list
 * shows the real cart.
 */
export function DefaultOrderPaymentStep({
  cart = [],
  isMobileViewport = false,
  money,
  onBack,
  onPaymentTypeChange,
  paymentType = 'cash'
}) {
  const typography = getCheckoutStepTypography();

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14, fontFamily: CHECKOUT_FONT_FAMILY }}>
      <div style={{ ...typography.title, color: '#1e293b' }}>Step 3: Review &amp; Payment</div>
      <PaymentMethodSelectorBlock
        label="Payment Type"
        value={paymentType}
        onChange={onPaymentTypeChange}
        options={PLACEHOLDER_PAYMENT_OPTIONS}
        DropdownComponent={StorefrontDropdown}
        labelStyle={{ ...typography.sectionTitle, color: '#1e293b', fontFamily: CHECKOUT_FONT_FAMILY }}
        triggerStyle={{ ...typography.control, minHeight: CHECKOUT_CONTROL_MIN_HEIGHT, borderRadius: 12, fontFamily: CHECKOUT_FONT_FAMILY }}
      />
      <DefaultOrderReviewItemsList cart={cart} isMobileViewport={isMobileViewport} money={money} />
      <div style={{ fontSize: 12, color: '#b45309', fontWeight: 700, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
        This step is a preview only — placing an order isn&apos;t connected to checkout yet.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
        <button type="button" disabled style={{ minHeight: 46, borderRadius: 12, border: 'none', background: '#cbd5e1', color: '#fff', fontWeight: 700, cursor: 'not-allowed' }}>
          Place Order (Coming Soon)
        </button>
      </div>
    </section>
  );
}
