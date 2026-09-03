import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';

const RETAIL_ACCENT = '#1a4e8d';
const RETAIL_ACCENT_SOFT = '#eef4fb';
const RETAIL_ACCENT_BORDER = '#b9cfe8';
const RETAIL_PROGRESS_COMPLETE = '#1a4586';

/**
 * Retail order page's journey header. Mirrors SimpleCheckoutJourneyHeader.jsx /
 * FnbCheckoutJourneyHeader.jsx's structure (own steps array, shared CheckoutHeroHeader,
 * "connected" stepper variant), using this mode's own blue accent. Three real steps only
 * (Account/Fulfillment/Review & Payment); Confirmation is a post-order state, not a clickable
 * step, matching the other checkout trees.
 */
export function RetailOrderJourneyHeader({
  activeStep,
  cartHasItems,
  isMobileViewport,
  displayFont,
  onStepChange
}) {
  const steps = [
    { realStep: 1, displayStep: 1, label: 'Account', allow: cartHasItems },
    { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cartHasItems },
    { realStep: 3, displayStep: 3, label: 'Review & Payment', allow: cartHasItems }
  ];

  return (
    <>
      <CheckoutHeroHeader
        eyebrow="Order Journey"
        title="Complete Your Product Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        isMobileViewport={isMobileViewport}
        accentColor={RETAIL_ACCENT}
        accentSoft={RETAIL_ACCENT_SOFT}
        accentBorder={RETAIL_ACCENT_BORDER}
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
        accentColor={RETAIL_ACCENT}
        accentSoft={RETAIL_ACCENT_SOFT}
        accentBorder={RETAIL_ACCENT_BORDER}
        completeColor={RETAIL_PROGRESS_COMPLETE}
        activeText={RETAIL_ACCENT}
      />
    </>
  );
}
