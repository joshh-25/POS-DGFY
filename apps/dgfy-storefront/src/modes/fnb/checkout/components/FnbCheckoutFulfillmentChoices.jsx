import { CalendarDays, Clock, ShoppingBag, Zap } from 'lucide-react';
import { useState } from 'react';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import { getUnavailableFulfillmentMessage, resolveStorefrontFulfillmentOptions } from '../../../../shared/model/storefrontFulfillmentOptions.js';
import { buildCheckoutSectionNumbers, resolveFulfillmentSelectorPresentation } from '../../../../shared/model/storefrontFulfillmentPresentation.js';
import { FulfillmentMethodNotice } from '../../../../shared/components/checkout/FulfillmentMethodNotice.jsx';
import { buildLeadTimeExpectationMessage, resolveOrderTimingPolicy } from '../../../../shared/model/storefrontOrderTimingPolicy.js';
import { CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';
import { StorefrontScheduledDateTimePicker } from '../../../../shared/components/checkout/StorefrontScheduledDateTimePicker.jsx';

const deliveryIcon = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgc3Ryb2tlLXdpZHRoPSIyIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxwYXRoIGQ9Im0xOCAxNC0xLTMiLz48cGF0aCBkPSJtMyA5IDYgMmEyIDIgMCAwIDEgMi0yaDJhMiAyIDAgMCAxIDEuOTkgMS44MSIvPjxwYXRoIGQ9Ik04IDE3aDNhMSAxIDAgMCAwIDEtMSA2IDYgMCAwIDEgNi02IDEgMSAwIDAgMCAxLTF2LS43NUE1IDUgMCAwIDAgMTcgNSIvPjxjaXJjbGUgY3g9IjE5IiBjeT0iMTciIHI9IjMiLz48Y2lyY2xlIGN4PSI1IiBjeT0iMTciIHI9IjMiLz48L3N2Zz4=';

function buildChoiceCardProps({
  active,
  brand,
  brandBorder,
  brandShadow,
  icon,
  isResponsive,
  mobileOptionHeight,
  mobileOptionIconBox,
  mobileOptionTextSize,
  onClick,
  label
}) {
  return {
    active,
    activeBackground: '#e8f4ff',
    activeBorderColor: brandBorder,
    activeBoxShadow: `0 8px 20px ${brandShadow}`,
    activeIconBackground: '#dff3f8',
    activeIconColor: brand,
    borderRadius: 14,
    checkColor: brand,
    fontFamily: CHECKOUT_FONT_FAMILY,
    fontSize: mobileOptionTextSize,
    fontWeight: 700,
    gap: isResponsive ? 10 : 12,
    icon,
    iconBoxSize: mobileOptionIconBox,
    iconSize: isResponsive ? 18 : 20,
    inactiveBorderColor: '#dbe5ee',
    inactiveIconBackground: '#f8fafc',
    inactiveIconColor: '#1e293b',
    label,
    minHeight: mobileOptionHeight,
    onClick,
    padding: isResponsive ? '10px 12px' : '12px 14px'
  };
}

/**
 * Presentation-only F&B fulfillment choices. Address selection and map state
 * intentionally remain in the route container because they are interaction-heavy.
 */
export function FnbCheckoutFulfillmentChoices({
  fnbOrderBrand,
  fnbOrderBrandBorder,
  fnbOrderBrandShadow,
  fnbOrderBrandShadowStrong,
  fnbScheduleMode,
  fnbScheduledFor,
  isDeliveryOrder,
  isResponsive,
  mobileOptionHeight,
  mobileOptionIconBox,
  mobileOptionTextSize,
  onOrderMethodChange,
  onScheduleModeChange,
  onScheduledForChange,
  orderMethod,
  fulfillmentOptions = resolveStorefrontFulfillmentOptions(),
  scheduleHoursLabel,
  orderTimingPolicy = resolveOrderTimingPolicy(),
  storefrontHours
}) {
  const [unavailableMessage, setUnavailableMessage] = useState('');
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  const isDineInOrder = orderMethod === 'dine_in';
  // #1217: a single available method is a statement, not a question.
  const { showSelector: showOrderMethodSelector, notice: orderMethodNotice, soleOption: soleOrderMethod } =
    resolveFulfillmentSelectorPresentation(fulfillmentOptions);
  const choiceGridColumns = isResponsive ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))';
  const timingChoiceGridColumns = isResponsive ? '1fr' : choiceGridColumns;
  const { showSchedule, showImmediate, showTimingChooser, showTimingStep } = orderTimingPolicy;
  const showScheduledDateTimePicker = (showSchedule && !showImmediate)
    || (showTimingChooser && fnbScheduleMode === 'schedule');
  const showScheduleHoursWarning = showTimingChooser && fnbScheduleMode === 'schedule' && scheduleHoursLabel;
  const hoursNoticeMessage = isDineInOrder && scheduleHoursLabel
    ? `Dine-in orders must be within store hours: ${scheduleHoursLabel}.`
    : showScheduleHoursWarning
      ? `Scheduled orders must be within store hours: ${scheduleHoursLabel}.`
      : '';
  const showTimingSection = isDineInOrder || (showTimingStep && (showTimingChooser || showSchedule));
  const sectionNumbers = buildCheckoutSectionNumbers({ showOrderMethodSelector, showTimingStep: showTimingSection });
  const typography = getCheckoutStepTypography();
  const choiceProps = {
    brand: fnbOrderBrand,
    brandBorder: fnbOrderBrandBorder,
    brandShadow: fnbOrderBrandShadow,
    isResponsive,
    mobileOptionHeight,
    mobileOptionIconBox,
    mobileOptionTextSize
  };
  const saveScheduledDateTime = (nextValue) => {
    if (!String(nextValue || '').trim()) return;
    onScheduleModeChange('schedule');
    onScheduledForChange(nextValue);
    setDateTimePickerOpen(false);
  };
  const renderScheduledDateTimePicker = (availabilityMode) => (
    <StorefrontScheduledDateTimePicker
      availabilityMode={availabilityMode}
      brandColor={fnbOrderBrand}
      brandShadow={fnbOrderBrandShadowStrong}
      isResponsive={isResponsive}
      onApply={saveScheduledDateTime}
      onOpenChange={setDateTimePickerOpen}
      open={dateTimePickerOpen}
      hoursNoticeMessage={hoursNoticeMessage}
      scheduleHoursLabel={scheduleHoursLabel}
      storefrontHours={storefrontHours}
      leadTimeMinDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMinDays : null}
      leadTimeMaxDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMaxDays : null}
      value={fnbScheduledFor}
    />
  );

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
      {showOrderMethodSelector ? (
      <div style={{ display: 'grid', gap: 16 }}>
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>1. How would you like to receive your order?</div>
        <div style={{ display: 'grid', gridTemplateColumns: choiceGridColumns, gap: 16 }}>
          {fulfillmentOptions.map((option) => {
            const isAvailable = option.available !== false;
            return <SelectableOptionCard key={option.value} {...buildChoiceCardProps({
              ...choiceProps,
              active: orderMethod === option.value,
              icon: option.value === 'delivery'
                ? () => <span style={{ width: isResponsive ? 18 : 22, height: isResponsive ? 18 : 22, display: 'inline-block', backgroundColor: 'currentColor', WebkitMaskImage: `url("${deliveryIcon}")`, WebkitMaskRepeat: 'no-repeat', WebkitMaskPosition: 'center', WebkitMaskSize: 'contain', maskImage: `url("${deliveryIcon}")`, maskRepeat: 'no-repeat', maskPosition: 'center', maskSize: 'contain' }} />
                : ({ size }) => <ShoppingBag size={size} />,
              label: option.label,
              onClick: () => {
                if (!isAvailable) {
                  setUnavailableMessage(getUnavailableFulfillmentMessage(option));
                  return;
                }
                setUnavailableMessage('');
                setDateTimePickerOpen(false);
                onOrderMethodChange(option.value);
                if (option.value === 'dine_in') {
                  onScheduleModeChange('schedule');
                }
              }
            })} unavailable={!isAvailable} />;
          })}
        </div>
        {unavailableMessage ? <div role="alert" style={{ color: '#9f1239', fontSize: 13, fontWeight: 600 }}>{unavailableMessage}</div> : null}
      </div>
      ) : (
        <FulfillmentMethodNotice
          accentColor={fnbOrderBrand}
          message={orderMethodNotice}
          variant={soleOrderMethod?.value === 'delivery' ? 'delivery-only' : soleOrderMethod?.value === 'pickup' ? 'pickup-only' : soleOrderMethod ? 'info' : 'warning'}
        />
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {isDineInOrder ? <>
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.timing}. When will you dine in?</div>
        {renderScheduledDateTimePicker('dine_in')}
        </> : showTimingSection ? <>
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.timing}. When would you like your order?</div>
        {showTimingChooser ? <div data-testid="order-timing-choice-grid" style={{ display: 'grid', gridTemplateColumns: timingChoiceGridColumns, gap: 16 }}>
          <SelectableOptionCard
            {...buildChoiceCardProps({
              ...choiceProps,
              active: fnbScheduleMode === 'asap',
              icon: ({ size }) => <Zap size={size} />,
              label: 'NOW',
              onClick: () => {
                setDateTimePickerOpen(false);
                onScheduleModeChange('asap');
              }
            })}
          />
          <SelectableOptionCard
            {...buildChoiceCardProps({
              ...choiceProps,
              active: fnbScheduleMode === 'schedule',
              icon: ({ size }) => <CalendarDays size={size} />,
              label: 'Schedule',
              onClick: () => onScheduleModeChange('schedule')
            })}
          />
          <SelectableOptionCard
            {...buildChoiceCardProps({
              ...choiceProps,
              active: fnbScheduleMode === 'anytime',
              icon: ({ size }) => <Clock size={size} />,
              label: 'Anytime',
              onClick: () => {
                setDateTimePickerOpen(false);
                onScheduleModeChange('anytime');
              }
            })}
          />
          </div> : null}
        {showSchedule && !showImmediate ? (
          <FulfillmentMethodNotice accentColor={fnbOrderBrand} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" />
        ) : null}
        {showScheduledDateTimePicker ? renderScheduledDateTimePicker('any') : null}</> : <FulfillmentMethodNotice accentColor={fnbOrderBrand} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" data-testid="order-timing-expectation" />}
      </div>
    </div>
  );
}
