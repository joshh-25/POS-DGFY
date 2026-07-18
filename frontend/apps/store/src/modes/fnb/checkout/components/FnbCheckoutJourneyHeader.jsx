import { CheckoutHeroHeader } from '../../../../checkout/components/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../checkout/components/CheckoutStepProgressHeader.jsx';

/**
 * F&B checkout journey header. It owns the visual progress presentation while
 * the route container retains the checkout state transitions.
 */
export function FnbCheckoutJourneyHeader({
  activeStep,
  activeStepMeta,
  accentBorder,
  accentColor,
  accentSoft,
  cartHasItems,
  completeColor,
  completeTextColor,
  displayFont,
  isCustomerStepComplete,
  isMobileViewport,
  isResponsive,
  isFulfillmentStepComplete,
  onStepChange,
  signedIn
}) {
  const steps = [
    { realStep: 3, displayStep: 1, label: signedIn ? 'Account' : 'Customer', allow: cartHasItems },
    { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cartHasItems && isCustomerStepComplete },
    { realStep: 4, displayStep: 3, label: 'Payment', allow: cartHasItems && isCustomerStepComplete && isFulfillmentStepComplete }
  ];

  if (isResponsive) {
    return (
      <section style={{ background: '#fff', padding: 0, display: 'grid', gap: 0, width: '100%', maxWidth: '100%', minWidth: 0, margin: '0 auto', boxSizing: 'border-box' }}>
        <div style={{ display: 'grid', gap: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: accentColor }}>Step {activeStepMeta.number} of 3</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b', lineHeight: 1.08, fontFamily: displayFont }}>{activeStepMeta.title}</div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.55 }}>{activeStepMeta.subtitle}</div>
        </div>
        <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', alignItems: 'center', width: '100%', maxWidth: '100%', minWidth: 0, padding: '0 16px', marginTop: 24, boxSizing: 'border-box', overflow: 'hidden' }}>
          {[1, 2, 3].map((displayStep) => {
            const stepState = displayStep < activeStepMeta.number ? 'complete' : displayStep === activeStepMeta.number ? 'active' : 'upcoming';
            return (
              <div key={`mobile-progress-${displayStep}`} style={{ position: 'relative', display: 'flex', justifyContent: 'center', minWidth: 0 }}>
                {displayStep < 3 ? <div style={{ position: 'absolute', top: 15, left: 'calc(50% + 16px)', width: 'calc(100% - 32px)', height: 3, background: displayStep < activeStepMeta.number ? completeColor : '#d9e4ee', zIndex: 0, maxWidth: '100%' }} /> : null}
                <div style={{ position: 'relative', zIndex: 1, width: 32, height: 32, borderRadius: '50%', border: `2px solid ${stepState === 'upcoming' ? '#cbd5e1' : (stepState === 'complete' ? accentBorder : accentColor)}`, background: stepState === 'upcoming' ? '#fff' : (stepState === 'complete' ? accentSoft : accentColor), color: stepState === 'upcoming' ? '#64748b' : (stepState === 'complete' ? completeTextColor : '#fff'), display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 800 }}>
                  {displayStep}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <>
      <CheckoutHeroHeader
        eyebrow="Order Journey"
        title="Complete Your Menu Order"
        description="Share your details once, choose fulfillment, review the order, and submit payment to the store team."
        isMobileViewport={isMobileViewport}
        accentColor={accentColor}
        accentSoft={accentSoft}
        accentBorder={accentBorder}
        displayFont={displayFont}
      />
      <CheckoutStepProgressHeader
        steps={steps}
        activeStep={activeStep}
        onStepClick={(item) => onStepChange(item.realStep)}
        variant="connected"
        isMobileViewport={isMobileViewport}
        accentColor={accentColor}
        accentSoft={accentSoft}
        accentBorder={accentBorder}
        completeColor={completeColor}
        activeText={accentColor}
      />
    </>
  );
}
