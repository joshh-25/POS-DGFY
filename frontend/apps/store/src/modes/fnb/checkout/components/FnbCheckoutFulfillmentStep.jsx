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
    <section style={{ border: isResponsive ? 'none' : '1px solid #e2e8f0', borderRadius: isResponsive ? 0 : 18, background: '#fff', padding: isResponsive ? 0 : isMobileViewport ? 16 : 18, display: 'grid', gap: isResponsive ? 24 : 20, boxShadow: isResponsive ? 'none' : '0 10px 24px rgba(15,23,42,.04)', width: '100%', maxWidth: '100%', minWidth: 0, margin: isResponsive ? 0 : undefined, boxSizing: 'border-box' }}>
      {!isResponsive ? <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 2: Fulfillment</div> : null}
      {children}
    </section>
  );
}
