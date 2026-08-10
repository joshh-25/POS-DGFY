import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';

const SIMPLE_ACCENT = '#0f766e';
const SIMPLE_ACCENT_SOFT = '#ecfeff';
const SIMPLE_ACCENT_BORDER = '#99f6e4';
const SIMPLE_PROGRESS_COMPLETE = '#14b8a6';

/**
 * MSME (Simple) checkout journey header. Structurally mirrors FnbCheckoutJourneyHeader (own
 * steps array, own hero copy via the shared CheckoutHeroHeader, "connected" stepper variant)
 * while keeping MSME's own teal accent rather than F&B's blue — this is a layout/chrome
 * convergence, not a palette swap. Three real steps only (Account/Fulfillment/Review & Payment);
 * Confirmation is a post-order state, not a clickable step, matching F&B's pattern.
 */
export function SimpleCheckoutJourneyHeader({
  activeStep,
  cartCount,
  cartHasItems,
  isCustomerStepComplete,
  isDeliveryOrder,
  isMobileViewport,
  displayFont,
  onStepChange,
  signedIn
}) {
  const steps = [
    { realStep: 1, displayStep: 1, label: signedIn ? 'Account' : 'Customer', allow: cartHasItems },
    { realStep: 2, displayStep: 2, label: 'Fulfillment', allow: cartHasItems && isCustomerStepComplete },
    { realStep: 3, displayStep: 3, label: 'Review & Payment', allow: cartHasItems && isCustomerStepComplete }
  ];

  return (
    <>
      <CheckoutHeroHeader
        eyebrow="Order Journey"
        title="Complete Your Product Order"
        description="Set fulfillment first, provide one reliable contact, then review payment and totals before submitting."
        badges={[
          { label: `${cartCount} item${cartCount === 1 ? '' : 's'}`, tone: 'pill' },
          { label: isDeliveryOrder ? 'Delivery order flow' : 'Pickup order flow' }
        ]}
        isMobileViewport={isMobileViewport}
        accentColor={SIMPLE_ACCENT}
        accentSoft={SIMPLE_ACCENT_SOFT}
        accentBorder={SIMPLE_ACCENT_BORDER}
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
        accentColor={SIMPLE_ACCENT}
        accentSoft={SIMPLE_ACCENT_SOFT}
        accentBorder={SIMPLE_ACCENT_BORDER}
        completeColor={SIMPLE_PROGRESS_COMPLETE}
        activeText={SIMPLE_ACCENT}
      />
    </>
  );
}
