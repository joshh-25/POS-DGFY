import { ChevronLeft, ChevronRight } from 'lucide-react';

const SIMPLE_BRAND = '#0f766e';
const SIMPLE_BRAND_DARK = '#134e4a';

export function SimpleCheckoutCustomerStep({
  canUseGuestCheckoutFlow = false,
  isDeliveryOrder = false,
  isDgfyCustomerSignedIn = false,
  isMobileViewport = false,
  renderAccountOwnedIdentitySummary,
  renderGuestCheckoutEntry,
  renderGuestIdentityFields,
  simpleCustomerStepComplete = false,
  onBackToCatalog,
  onContinue
}) {
  if (!isDgfyCustomerSignedIn && !canUseGuestCheckoutFlow) {
    return renderGuestCheckoutEntry({
      title: 'Continue to your order',
      description: 'Create an account or continue as guest to continue this order.',
      resumeTarget: {
        checkoutTab: 'checkout',
        simpleOrderStep: 1
      }
    });
  }

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 1: Customer Details</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>
        {isDgfyCustomerSignedIn
          ? 'Your account details are already linked. Review them here before continuing to fulfillment.'
          : 'Enter the customer details for this order before continuing to fulfillment.'}
      </div>
      {isDgfyCustomerSignedIn ? renderAccountOwnedIdentitySummary({
        title: 'Customer Account',
        subtitle: 'These account details will be used for this order.'
      }) : renderGuestIdentityFields({
        title: 'Guest Details',
        subtitle: 'These guest details will be used for this order.',
        includeAddress: isDeliveryOrder,
        addressLabel: 'Delivery Address',
        addressPlaceholder: 'House no., street, barangay, landmark',
        addressRequired: isDeliveryOrder
      })}
      {!isMobileViewport && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" onClick={onBackToCatalog} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back to Catalog</button>
          <button type="button" onClick={onContinue} disabled={!simpleCustomerStepComplete} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: simpleCustomerStepComplete ? `linear-gradient(180deg, ${SIMPLE_BRAND} 0%, ${SIMPLE_BRAND_DARK} 100%)` : '#cbd5e1', color: '#fff', fontWeight: 700, cursor: simpleCustomerStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
        </div>
      )}
      {!simpleCustomerStepComplete && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          Add customer name, one contact method, and a delivery address when delivery is selected.
        </div>
      )}
    </section>
  );
}
