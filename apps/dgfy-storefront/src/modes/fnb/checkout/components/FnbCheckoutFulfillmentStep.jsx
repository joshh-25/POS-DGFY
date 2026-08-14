/**
 * F&B fulfillment step shell. Interaction-heavy map and address controls are
 * supplied as children until their ViewModel extraction is complete.
 */
export function FnbCheckoutFulfillmentStep({
  children,
  isMobileViewport,
  isResponsive
}) {
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: isResponsive ? 20 : 18, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: isResponsive ? 16 : 20, boxShadow: '0 10px 24px rgba(15,23,42,.04)', width: '100%', maxWidth: '100%', minWidth: 0, boxSizing: 'border-box' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 2: Fulfillment</div>
      <div style={{ marginTop: -4, fontSize: 12, color: '#64748b' }}>Choose how and when the customer will receive the order, then add optional notes.</div>
      {children}
    </section>
  );
}
