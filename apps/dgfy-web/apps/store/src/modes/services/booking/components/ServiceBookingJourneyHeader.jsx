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
    { realStep: 1, displayStep: 1, label: 'Customer', allow: true },
    { realStep: 2, displayStep: 2, label: 'Add-ons', allow: accountStepComplete },
    { realStep: 3, displayStep: 3, label: 'Fulfillment', allow: accountStepComplete },
    { realStep: 4, displayStep: 4, label: 'Payment and Review', allow: accountStepComplete && fulfillmentStepComplete }
  ];

  return (
    <>
      <CheckoutHeroHeader
        title="Complete your service booking"
        description="Provide customer details, review add-ons, choose fulfillment and payment, then confirm your booking."
        badges={[
          { label: `${bookingSummaryQuantity} service${bookingSummaryQuantity === 1 ? '' : 's'}`, tone: 'pill' },
          { label: serviceOrderMethod === 'pickup' ? 'Pickup booking' : 'Delivery booking' }
        ]}
        isMobileViewport={isMobileViewport}
        accentColor={accentColor}
        accentSoft={accentSoft}
        accentBorder={accentBorder}
        displayFont={displayFont}
        variant="services-reference"
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
        referenceStyle
      />
    </>
  );
}
