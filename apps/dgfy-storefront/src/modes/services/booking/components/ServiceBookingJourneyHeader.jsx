import { CheckoutHeroHeader } from '../../../../shared/components/checkout/CheckoutHeroHeader.jsx';
import { CheckoutStepProgressHeader } from '../../../../shared/components/checkout/CheckoutStepProgressHeader.jsx';
import { SERVICES_PALETTE } from '../../servicesPalette.js';
import { getServicesFlowPresentation } from '../model/servicesLocalFlow.js';

/**
 * Services checkout journey header. Mirrors
 * modes/fnb/checkout/components/FnbCheckoutJourneyHeader.jsx's shape exactly (same shared
 * CheckoutHeroHeader + CheckoutStepProgressHeader pair) — Services previously had no journey
 * header at all, just a bare <h1> outside the wizard card. This is Services' own file per the
 * "independent trees" pattern; the two shared primitives it composes are reused unmodified.
 */
export function ServiceBookingJourneyHeader({
  activeStep,
  bookingSummaryQuantity,
  displayFont,
  accountStepComplete,
  fulfillmentStepComplete,
  isMobileViewport,
  onStepChange,
  serviceOrderMethod,
  serviceFlowMethod,
  serviceFlowProfileMethod
}) {
  const normalizedOrderMethod = String(serviceOrderMethod || '').trim().toLowerCase();
  const normalizedFlowMethod = String(serviceFlowMethod || normalizedOrderMethod || '').trim().toLowerCase();
  const normalizedProfileMethod = String(serviceFlowProfileMethod || '').trim().toLowerCase();
  const hasSelectedServiceFlow = Boolean(normalizedOrderMethod);
  const flowPresentation = hasSelectedServiceFlow ? getServicesFlowPresentation(normalizedOrderMethod) : null;
  const isAppointmentFlow = normalizedFlowMethod === 'appointment' || normalizedProfileMethod === 'appointment';
  const isCustomerAddressFlow = normalizedFlowMethod === 'on_site' || normalizedProfileMethod === 'on_site';
  const isOnlineFlow = normalizedFlowMethod === 'online' || normalizedProfileMethod === 'online';
  const isHybridFlow = normalizedFlowMethod === 'hybrid' || normalizedProfileMethod === 'hybrid';
  const journeyBadgeLabel = !hasSelectedServiceFlow
    ? 'Not selected yet'
    : (isAppointmentFlow
      ? flowPresentation.shortLabel
      : (isOnlineFlow ? 'Online booking' : (isCustomerAddressFlow ? 'On-site booking' : (normalizedOrderMethod === 'pickup' ? 'Pickup booking' : 'Delivery booking'))));
  const journeyDescription = (() => {
    if (!hasSelectedServiceFlow) {
      if (isAppointmentFlow) return 'Provide customer details and review add-ons, then choose a branch, date, and time.';
      if (isCustomerAddressFlow) return 'Provide customer details and review add-ons, then choose a service visit date, time, and address.';
      if (isOnlineFlow) return 'Provide customer details and review add-ons, then choose an online appointment date and time.';
      if (isHybridFlow) return 'Provide customer details and review add-ons, then choose where the service will take place and schedule it.';
      return 'Provide customer details and review add-ons, then choose a fulfillment option and payment.';
    }
    if (isAppointmentFlow) return 'Provide customer details, choose a branch appointment time, review payment, then confirm your appointment.';
    if (isCustomerAddressFlow) return 'Share customer details, review add-ons, choose fulfillment and payment, then confirm your booking.';
    if (isOnlineFlow) return 'Provide customer details, choose an online appointment time, review payment, then confirm your appointment.';
    return 'Provide customer details, review add-ons, choose fulfillment and payment, then confirm your booking.';
  })();
  const steps = [
    { realStep: 1, displayStep: 1, label: 'Customer', allow: true },
    { realStep: 2, displayStep: 2, label: 'Add-ons', allow: accountStepComplete },
    { realStep: 3, displayStep: 3, label: 'Fulfillment', allow: accountStepComplete },
    { realStep: 4, displayStep: 4, label: 'Payment & review', allow: accountStepComplete && fulfillmentStepComplete }
  ];

  return (
    <>
      <CheckoutHeroHeader
        title="Complete your service booking"
        description={journeyDescription}
        badges={[
          { label: `${bookingSummaryQuantity} service${bookingSummaryQuantity === 1 ? '' : 's'}`, tone: 'pill' },
          { label: journeyBadgeLabel }
        ]}
        isMobileViewport={isMobileViewport}
        accentColor={SERVICES_PALETTE.primary}
        accentSoft={SERVICES_PALETTE.primarySoft}
        accentBorder={SERVICES_PALETTE.primaryBorder}
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
        accentColor={SERVICES_PALETTE.primary}
        accentSoft={SERVICES_PALETTE.primarySoft}
        accentBorder={SERVICES_PALETTE.primaryBorder}
        completeColor={SERVICES_PALETTE.primary}
        referenceStyle
        preventLabelWordBreaks
      />
    </>
  );
}
