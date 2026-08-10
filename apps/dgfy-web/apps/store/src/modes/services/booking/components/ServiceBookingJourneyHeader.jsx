import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';

/**
 * Services checkout journey header. Mirrors
 * modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx's shape exactly (same shared
 * CheckoutHeroHeader + CheckoutStepProgressHeader pair) — Services previously had no journey
 * header at all, just a bare <h1> outside the wizard card. This is Services' own file per the
 * "independent trees" pattern; the two shared primitives it composes are reused unmodified.
 */
export function ServiceBookingJourneyHeader({
  accentBorder,
  accentColor,
  accentSoft,
  activeStep,
  bookingSummaryQuantity,
  completeColor,
  displayFont,
  accountStepComplete,
  fulfillmentStepComplete,
  isMobileViewport,
  onStepChange,
  serviceOrderMethod
}) {
  const steps = [
    { realStep: 1, displayStep: 1, label: 'Account', allow: true },
    { realStep: 2, displayStep: 2, label: 'Add-ons', allow: accountStepComplete },
    { realStep: 3, displayStep: 3, label: 'Fulfillment', allow: accountStepComplete },
    { realStep: 4, displayStep: 4, label: 'Review and Payment', allow: accountStepComplete && fulfillmentStepComplete }
  ];

  return (
    <>
      <CheckoutHeroHeader
        eyebrow="Order Journey"
        title="Complete Your Service Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        badges={[
          { label: `${bookingSummaryQuantity} item${bookingSummaryQuantity === 1 ? '' : 's'}`, tone: 'pill' },
          { label: serviceOrderMethod === 'pickup' ? 'Pickup Order Flow' : 'Delivery Order Flow' }
        ]}
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
          if (item.allow === false) return;
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
