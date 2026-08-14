/**
 * F&B payment step view boundary.
 * Submission and payment state remain in checkout hooks, not the view.
 */
export function FnbCheckoutPaymentStepView({ children, isDesktop, stepKey }) {
  return (
    <div key={stepKey} style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'minmax(0, 1.5fr) minmax(300px, 380px)' : '1fr', gap: 14, alignItems: 'start' }}>
      {children}
    </div>
  );
}
