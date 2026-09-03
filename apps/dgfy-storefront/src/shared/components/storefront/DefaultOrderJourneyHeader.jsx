import { CheckoutHeroHeader } from '../checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../checkout/CheckoutStepProgressHeader.jsx';

const DEFAULT_ACCENT = '#1a4e8d';
const DEFAULT_ACCENT_SOFT = '#eef4fb';
const DEFAULT_ACCENT_BORDER = '#b9cfe8';
const DEFAULT_PROGRESS_COMPLETE = '#1a4586';

/**
 * Default/Retail order page's journey header. Mirrors SimpleCheckoutJourneyHeader.jsx /
 * FnbCheckoutJourneyHeader.jsx's structure (own steps array, shared CheckoutHeroHeader,
 * "connected" stepper variant), using this mode's own blue accent instead of MSME's teal or
 * F&B's blue-with-different-tokens. Three real steps only (Account/Fulfillment/Review &
 * Payment); Confirmation is a post-order state, not a clickable step, matching the other two
 * checkout trees.
 */
export function DefaultOrderJourneyHeader({
  activeStep,
  cartCount,
  cartHasItems,
  isDeliveryOrder,
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
        title="Complete Your Product Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        badges={[
          { label: `${cartCount} item${cartCount === 1 ? '' : 's'}`, tone: 'pill' },
          { label: isDeliveryOrder ? 'Delivery order flow' : 'Pickup order flow' }
        ]}
        isMobileViewport={isMobileViewport}
        accentColor={DEFAULT_ACCENT}
        accentSoft={DEFAULT_ACCENT_SOFT}
        accentBorder={DEFAULT_ACCENT_BORDER}
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
        accentColor={DEFAULT_ACCENT}
        accentSoft={DEFAULT_ACCENT_SOFT}
        accentBorder={DEFAULT_ACCENT_BORDER}
        completeColor={DEFAULT_PROGRESS_COMPLETE}
        activeText={DEFAULT_ACCENT}
      />
    </>
  );
}
