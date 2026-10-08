import { CalendarDays, Clock, Zap } from 'lucide-react';
import { useState } from 'react';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import { SimpleOrderMethodSelector } from './SimpleOrderMethodSelector.jsx';
import { buildCheckoutSectionNumbers, resolveFulfillmentSelectorPresentation } from '../../../../shared/model/storefrontFulfillmentPresentation.js';
import { FulfillmentMethodNotice } from '../../../../shared/components/checkout/FulfillmentMethodNotice.jsx';
import { StorefrontScheduledDateTimePicker } from '../../../../shared/components/checkout/StorefrontScheduledDateTimePicker.jsx';
import { buildLeadTimeExpectationMessage, resolveOrderTimingPolicy } from '../../../../shared/model/storefrontOrderTimingPolicy.js';
import { CHECKOUT_FONT_FAMILY, getCheckoutStepTypography } from '../../../../shared/components/checkout/checkoutUiTokens.js';

const SIMPLE_BRAND = '#176B3A';
const SIMPLE_BRAND_SHADOW_STRONG = 'rgba(23,107,58,0.16)';

/**
 * MSME's combined "Order Type + Date/Time" section, mirroring FnbCheckoutFulfillmentChoices.jsx's
 * two-column layout and Now/Schedule toggle, styled with MSME's own teal accent. Kept as MSME's
 * own component per the "two independent checkout trees" decision — not shared with F&B's.
 */
export function SimpleCheckoutFulfillmentChoices({
  fnbScheduleMode = 'asap',
  fnbScheduledFor = '',
  isDeliveryOrder = false,
  isMobileViewport = false,
  onOrderMethodChange,
  onScheduleModeChange,
  onScheduledForChange,
  orderMethod,
  simpleOrderMethodOptions = [],
  storefrontHours,
  orderTimingPolicy = resolveOrderTimingPolicy()
}) {
  const [dateTimePickerOpen, setDateTimePickerOpen] = useState(false);
  // #1217: a single available method is a statement, not a question.
  const { showSelector: showOrderMethodSelector, notice: orderMethodNotice, soleOption: soleOrderMethod } =
    resolveFulfillmentSelectorPresentation(simpleOrderMethodOptions);
  const { showSchedule, showImmediate, showTimingChooser, showTimingStep } = orderTimingPolicy;
  const showScheduledDateTimePicker = (showSchedule && !showImmediate)
    || (showTimingChooser && fnbScheduleMode === 'schedule');
  const showTimingSection = showTimingStep && (showTimingChooser || showSchedule);
  const sectionNumbers = buildCheckoutSectionNumbers({ showOrderMethodSelector, showTimingStep: showTimingSection });
  const typography = getCheckoutStepTypography();

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
      {showOrderMethodSelector ? (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>1. How would you like to receive your order?</div>
        <SimpleOrderMethodSelector
          isMobileViewport={isMobileViewport}
          options={simpleOrderMethodOptions}
          orderMethod={orderMethod}
          onOrderMethodChange={onOrderMethodChange}
        />
      </div>
      ) : (
        <FulfillmentMethodNotice
          accentColor={SIMPLE_BRAND}
          message={orderMethodNotice}
          variant={soleOrderMethod?.value === 'delivery' ? 'delivery-only' : soleOrderMethod?.value === 'pickup' ? 'pickup-only' : soleOrderMethod ? 'info' : 'warning'}
        />
      )}

      <div style={{ display: 'grid', gap: 12 }}>
        {showTimingSection ? <>
        <div style={{ ...typography.sectionTitle, color: '#1e293b' }}>{sectionNumbers.timing}. When would you like your order?</div>
        {showTimingChooser ? <div data-testid="order-timing-choice-grid" style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          <SelectableOptionCard
            onClick={() => {
              setDateTimePickerOpen(false);
              onScheduleModeChange('asap');
            }}
            label="NOW"
            icon={({ size }) => <Zap size={size} />}
            active={fnbScheduleMode === 'asap'}
            activeBorderColor={SIMPLE_BRAND}
            activeBackground="#FFF8E7"
            activeTextColor={SIMPLE_BRAND}
            activeIconBackground="#FFF7E6"
            activeIconColor={SIMPLE_BRAND}
            inactiveBorderColor="#dbe5ee"
            inactiveTextColor="#334155"
            minHeight={isMobileViewport ? 52 : 64}
            padding={isMobileViewport ? '10px 12px' : '12px 14px'}
            gap={isMobileViewport ? 10 : 12}
            borderRadius={14}
            fontSize={14}
            fontWeight={700}
            iconBoxSize={isMobileViewport ? 34 : 40}
            iconSize={isMobileViewport ? 18 : 20}
            fontFamily={CHECKOUT_FONT_FAMILY}
          />
          <SelectableOptionCard
            onClick={() => onScheduleModeChange('schedule')}
            label="Schedule"
            icon={({ size }) => <CalendarDays size={size} />}
            active={fnbScheduleMode === 'schedule'}
            activeBorderColor={SIMPLE_BRAND}
            activeBackground="#FFF8E7"
            activeTextColor={SIMPLE_BRAND}
            activeIconBackground="#FFF7E6"
            activeIconColor={SIMPLE_BRAND}
            inactiveBorderColor="#dbe5ee"
            inactiveTextColor="#334155"
            minHeight={isMobileViewport ? 52 : 64}
            padding={isMobileViewport ? '10px 12px' : '12px 14px'}
            gap={isMobileViewport ? 10 : 12}
            borderRadius={14}
            fontSize={14}
            fontWeight={700}
            iconBoxSize={isMobileViewport ? 34 : 40}
            iconSize={isMobileViewport ? 18 : 20}
            fontFamily={CHECKOUT_FONT_FAMILY}
          />
          <SelectableOptionCard
            onClick={() => {
              setDateTimePickerOpen(false);
              onScheduleModeChange('anytime');
            }}
            label="Anytime"
            icon={({ size }) => <Clock size={size} />}
            active={fnbScheduleMode === 'anytime'}
            activeBorderColor={SIMPLE_BRAND}
            activeBackground="#FFF8E7"
            activeTextColor={SIMPLE_BRAND}
            activeIconBackground="#FFF7E6"
            activeIconColor={SIMPLE_BRAND}
            inactiveBorderColor="#dbe5ee"
            inactiveTextColor="#334155"
            minHeight={isMobileViewport ? 52 : 64}
            padding={isMobileViewport ? '10px 12px' : '12px 14px'}
            gap={isMobileViewport ? 10 : 12}
            borderRadius={14}
            fontSize={14}
            fontWeight={700}
            iconBoxSize={isMobileViewport ? 34 : 40}
            iconSize={isMobileViewport ? 18 : 20}
            fontFamily={CHECKOUT_FONT_FAMILY}
          />
        </div> : null}
        {showSchedule && !showImmediate ? <>
          <FulfillmentMethodNotice accentColor={SIMPLE_BRAND} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" />
        </> : null}
       {showScheduledDateTimePicker ? (
          <StorefrontScheduledDateTimePicker
            brandColor={SIMPLE_BRAND}
            brandShadow={SIMPLE_BRAND_SHADOW_STRONG}
            isResponsive={isMobileViewport}
            onApply={onScheduledForChange}
            onOpenChange={setDateTimePickerOpen}
            open={dateTimePickerOpen}
            storefrontHours={storefrontHours}
            leadTimeMinDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMinDays : null}
            leadTimeMaxDays={orderTimingPolicy.hasLeadTime ? orderTimingPolicy.leadTimeMaxDays : null}
            value={fnbScheduledFor}
          />
       ) : null}</> : <FulfillmentMethodNotice accentColor={SIMPLE_BRAND} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" data-testid="order-timing-expectation" />}
      </div>
    </div>
  );
}
