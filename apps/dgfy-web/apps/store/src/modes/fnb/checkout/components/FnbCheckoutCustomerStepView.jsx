/**
 * F&B customer-details step view boundary.
 * Customer identity state remains owned by the checkout view model.
 */
export function FnbCheckoutCustomerStepView({ children, isDesktop }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0, 1.5fr) minmax(300px, 380px)' : '1fr', gap: 14, alignItems: 'start' }}>
      {children}
    </div>
  );
}
