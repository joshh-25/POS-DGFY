import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';

/**
 * F&B checkout journey header. It owns the visual progress presentation while
 * the route container retains the checkout state transitions.
 */
export function FnbCheckoutJourneyHeader({
  accentBorder,
  accentColor,
  accentSoft,
  activeStep,
  cartHasItems,
  completeColor,
  displayFont,
  isCustomerStepComplete,
  isFulfillmentStepComplete,
  isMobileViewport,
  onStepChange,
  signedIn
}) {
  const steps = [
    { realStep: 3, displayStep: 1, label: signedIn ? 'Account' : 'Customer', allow: cartHasItems },
    { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cartHasItems && isCustomerStepComplete },
    { realStep: 4, displayStep: 3, label: 'Review & Payment', allow: cartHasItems && isCustomerStepComplete && isFulfillmentStepComplete }
  ];

  return (
    <>
      <CheckoutHeroHeader
        title="Complete Your Product Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        isMobileViewport={isMobileViewport}
        accentColor={accentColor}
        accentSoft={accentSoft}
        accentBorder={accentBorder}
        displayFont={displayFont}
      />
      <CheckoutStepProgressHeader
        steps={steps}
        activeStep={activeStep}
        onStepClick={(item) => {
          if (!item.allow) return;
          onStepChange(item.realStep);
        }}
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
