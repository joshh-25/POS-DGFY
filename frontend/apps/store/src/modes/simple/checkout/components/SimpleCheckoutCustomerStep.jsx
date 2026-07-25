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
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 16, background: '#fff', padding: isMobileViewport ? 14 : 18, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 900, color: '#0f172a' }}>Step 1: Customer Details</div>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <button type="button" onClick={onBackToCatalog} style={{ minHeight: isMobileViewport ? 38 : 42, minWidth: isMobileViewport ? 140 : 172, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', padding: '0 18px', fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: isMobileViewport ? 14 : 15 }}>Back to Catalog</button>
        <button type="button" onClick={onContinue} disabled={!simpleCustomerStepComplete} style={{ minHeight: isMobileViewport ? 38 : 42, minWidth: isMobileViewport ? 120 : 156, borderRadius: 12, border: 'none', background: simpleCustomerStepComplete ? '#ea580c' : '#cbd5e1', color: '#fff', padding: '0 18px', fontWeight: 800, cursor: simpleCustomerStepComplete ? 'pointer' : 'not-allowed', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: isMobileViewport ? 14 : 15 }}>Continue</button>
      </div>
      {!simpleCustomerStepComplete && (
        <div style={{ fontSize: 12, color: '#b45309' }}>
          Add customer name, one contact method, and a delivery address when delivery is selected.
        </div>
      )}
    </section>
  );
}
