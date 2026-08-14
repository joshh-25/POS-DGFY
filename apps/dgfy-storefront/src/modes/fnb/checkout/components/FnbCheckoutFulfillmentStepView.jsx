/**
 * F&B fulfillment step view boundary.
 *
 * The route container owns state and passes the already-composed fulfillment
 * content through this slot while the interaction-heavy map is migrated in a
 * later bounded slice.
 */
export function FnbCheckoutFulfillmentStepView({ children, isDesktop }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0, 1.5fr) minmax(300px, 380px)' : '1fr', gap: 14, alignItems: 'start' }}>
      {children}
    </div>
  );
}
