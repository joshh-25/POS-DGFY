import { CalendarDays, ChevronLeft, ChevronRight, MapPin, ShoppingBag, Truck, Zap } from 'lucide-react';
import { DeliveryPinMap } from '../../../features/locations/components/DeliveryPinMapLazy.jsx';
import { SelectableOptionCard } from '../checkout/SelectableOptionCard.jsx';
import { SavedAddressCard } from '../checkout/SavedAddressCard.jsx';
import { ORDER_METHOD_OPTIONS } from '../../model/storefrontConstants.js';
import { buildCheckoutSectionNumbers, resolveFulfillmentSelectorPresentation } from '../../model/storefrontFulfillmentPresentation.js';
import { FulfillmentMethodNotice } from '../checkout/FulfillmentMethodNotice.jsx';
import { buildLeadTimeExpectationMessage, resolveOrderTimingPolicy } from '../../model/storefrontOrderTimingPolicy.js';

const DEFAULT_ACCENT = '#1a4e8d';
const DEFAULT_ACCENT_DARK = '#1a4586';
const DEFAULT_ACCENT_SHADOW_STRONG = 'rgba(26,69,134,.24)';
const DEFAULT_ACCENT_TINT = '#eef4fb';
const DEFAULT_ACCENT_SOFT_BORDER = '#b9cfe8';

const ORDER_METHOD_ICONS = {
  delivery: ({ size }) => <Truck size={size} />,
  pickup: ({ size }) => <ShoppingBag size={size} />
};

// Retail only offers Delivery/Pickup — Dine In/Takeout (from the shared
// ORDER_METHOD_OPTIONS list, used by dine-in-capable modes) don't apply here.
const RETAIL_ORDER_METHOD_OPTIONS = ORDER_METHOD_OPTIONS.filter(
  (option) => option.value === 'delivery' || option.value === 'pickup'
);

// Placeholder saved addresses — the Location & Addresses section isn't connected to the DGFY
// account addresses backend yet. See DefaultOrderPage.jsx's doc comment. The map itself IS a
// real, interactive DeliveryPinMap.
const PLACEHOLDER_ADDRESSES = [
  { id: 'placeholder-home', label: 'Home', fullAddress: 'Jereos Street, San Pedro, Jaro, Iloilo City', isDefault: true },
  { id: 'placeholder-work', label: 'Work', fullAddress: 'Ledesco Village, La Paz, Iloilo City', isDefault: false }
];

/**
 * Default/Retail order page's Fulfillment step. Mirrors
 * modes/simple/checkout/components/SimpleCheckoutFulfillmentStep.jsx +
 * SimpleCheckoutFulfillmentChoices.jsx's layout (Order Type + Now/Schedule combined section,
 * then Location). Order method, schedule, and saved addresses are all local placeholder state
 * owned by DefaultOrderPage — not connected to the backend yet. The map is real/interactive.
 */
export function DefaultOrderFulfillmentStep({
  customerPin = null,
  isMobileViewport = false,
  onBack,
  onContinue,
  onOrderMethodChange,
  onPinChange,
  onScheduleModeChange,
  onScheduledForChange,
  onSelectAddress,
  orderMethod = 'delivery',
  orderMethodOptions = null,
  scheduleMode = 'asap',
  scheduledFor = '',
  selectedAddressId = '',
  orderTimingPolicy = resolveOrderTimingPolicy()
}) {
  const isDeliveryOrder = orderMethod === 'delivery';
  const choiceGridColumns = isMobileViewport ? '1fr' : '1fr 1fr';
  const resolvedOrderMethodOptions = orderMethodOptions || RETAIL_ORDER_METHOD_OPTIONS;
  // #1217: same rule as the live modes. This page's options are placeholders with no
  // availability flags, so today this always resolves to "show the selector" -- the branch
  // exists so the page cannot drift from the rule once it is wired to a real location.
  const { showSelector: showOrderMethodSelector, notice: orderMethodNotice, soleOption: soleOrderMethod } =
    resolveFulfillmentSelectorPresentation(resolvedOrderMethodOptions);
  const { showSchedule, showImmediate, showTimingChooser, showTimingStep } = orderTimingPolicy;
  const showTimingSection = showTimingStep && (showTimingChooser || showSchedule);
  const sectionNumbers = buildCheckoutSectionNumbers({ showOrderMethodSelector, showTimingStep: showTimingSection });

  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: 20, background: '#fff', padding: isMobileViewport ? 16 : 18, display: 'grid', gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>Step 2: Fulfillment</div>

      <div style={{ display: 'grid', gridTemplateColumns: choiceGridColumns, gap: 20, alignItems: 'start' }}>
        {showOrderMethodSelector ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>1. How would you like to receive your order?</div>
          <div style={{ display: 'grid', gridTemplateColumns: choiceGridColumns, gap: 16 }}>
            {resolvedOrderMethodOptions.map((option) => (
              <SelectableOptionCard
                key={`default-order-method-${option.value}`}
                onClick={() => onOrderMethodChange(option.value)}
                label={option.label}
                icon={ORDER_METHOD_ICONS[option.value] || null}
                active={orderMethod === option.value}
                activeBorderColor={DEFAULT_ACCENT}
                activeBackground={DEFAULT_ACCENT_TINT}
                activeTextColor={DEFAULT_ACCENT}
                activeIconBackground="#dbe8f7"
                activeIconColor={DEFAULT_ACCENT}
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
                showCheck={false}
              />
            ))}
          </div>
        </div>
        ) : (
          <FulfillmentMethodNotice
            accentColor={DEFAULT_ACCENT}
            message={orderMethodNotice}
            variant={soleOrderMethod?.value === 'delivery' ? 'delivery-only' : soleOrderMethod?.value === 'pickup' ? 'pickup-only' : soleOrderMethod ? 'info' : 'warning'}
          />
        )}

        <div style={{ display: 'grid', gap: 12 }}>
          {showTimingSection ? <>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{sectionNumbers.timing}. When would you like your order?</div>
          {showTimingChooser ? <div data-testid="order-timing-choice-grid" style={{ display: 'grid', gridTemplateColumns: choiceGridColumns, gap: 16 }}>
            <SelectableOptionCard
              onClick={() => onScheduleModeChange('asap')}
              label="NOW"
              icon={({ size }) => <Zap size={size} />}
              active={scheduleMode === 'asap'}
              activeBorderColor={DEFAULT_ACCENT}
              activeBackground={DEFAULT_ACCENT_TINT}
              activeTextColor={DEFAULT_ACCENT}
              activeIconBackground="#dbe8f7"
              activeIconColor={DEFAULT_ACCENT}
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
              showCheck={false}
            />
            <SelectableOptionCard
              onClick={() => onScheduleModeChange('schedule')}
              label="Schedule"
              icon={({ size }) => <CalendarDays size={size} />}
              active={scheduleMode === 'schedule'}
              activeBorderColor={DEFAULT_ACCENT}
              activeBackground={DEFAULT_ACCENT_TINT}
              activeTextColor={DEFAULT_ACCENT}
              activeIconBackground="#dbe8f7"
              activeIconColor={DEFAULT_ACCENT}
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
              showCheck={false}
            />
          </div> : null}
          {showSchedule && !showImmediate ? <>
            <FulfillmentMethodNotice accentColor={DEFAULT_ACCENT} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" />
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>Scheduled date and time<input type="datetime-local" value={scheduledFor} onChange={(event) => onScheduledForChange(event.target.value)} /></label>
          </> : null}
          {showTimingChooser && scheduleMode === 'schedule' ? (
            <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
              Scheduled date and time
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <style>{`.default-modern-datetime-input::-webkit-calendar-picker-indicator { display: none !important; -webkit-appearance: none !important; }`}</style>
                <div style={{ position: 'absolute', left: 14, color: DEFAULT_ACCENT, pointerEvents: 'none' }}><CalendarDays size={18} /></div>
                <input
                  type="datetime-local"
                  className="default-modern-datetime-input"
                  value={scheduledFor}
                  onChange={(event) => onScheduledForChange(event.target.value)}
                  onClick={(event) => {
                    try {
                      event.target.showPicker();
                    } catch (error) {
                      // The native picker is optional and not supported by every browser.
                    }
                  }}
                  style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 14px 12px 42px', background: '#f8fafc', color: '#1e293b', fontSize: 14, fontWeight: 600, outline: 'none', boxShadow: 'inset 0 2px 4px rgba(15,23,42,0.02)', transition: 'all 200ms ease', cursor: 'pointer', boxSizing: 'border-box' }}
                  onMouseEnter={(event) => { event.target.style.borderColor = DEFAULT_ACCENT; event.target.style.background = '#ffffff'; }}
                  onMouseLeave={(event) => { if (document.activeElement !== event.target) { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; } }}
                  onFocus={(event) => { event.target.style.borderColor = DEFAULT_ACCENT; event.target.style.background = '#ffffff'; event.target.style.boxShadow = `0 0 0 3px ${DEFAULT_ACCENT_SHADOW_STRONG}, inset 0 2px 4px rgba(15,23,42,0.02)`; }}
                  onBlur={(event) => { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; event.target.style.boxShadow = 'inset 0 2px 4px rgba(15,23,42,0.02)'; }}
                />
              </div>
            </label>
          ) : null}</> : <FulfillmentMethodNotice accentColor={DEFAULT_ACCENT} message={buildLeadTimeExpectationMessage({ policy: orderTimingPolicy, isDeliveryOrder })} variant="info" data-testid="order-timing-expectation" />}
        </div>
      </div>

      {isDeliveryOrder && (
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>{sectionNumbers.address}. Where should we deliver your order?</div>
            <div style={{ fontSize: 12, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Saved locations</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '280px minmax(0, 1fr)', gap: 16, alignItems: 'start', width: '100%', maxWidth: '100%', minWidth: 0 }}>
            <div style={{ display: 'grid', gap: 8 }}>
              {PLACEHOLDER_ADDRESSES.map((address) => (
                <SavedAddressCard
                  key={`default-placeholder-address-${address.id}`}
                  address={address}
                  isSelected={String(selectedAddressId) === String(address.id)}
                  isBusy={false}
                  onSelect={() => onSelectAddress(address.id)}
                  showActions={false}
                  themeColor={DEFAULT_ACCENT}
                  themeBg={DEFAULT_ACCENT_TINT}
                  themeHoverBorder={DEFAULT_ACCENT_SOFT_BORDER}
                  themeHoverBg="#f5f9fd"
                  themeShadowColor={DEFAULT_ACCENT_SHADOW_STRONG}
                  themeShadowColorSoft="rgba(26,69,134,.12)"
                />
              ))}
            </div>
            <div style={{ display: 'grid', gap: 12, width: '100%', maxWidth: '100%', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.45, display: isMobileViewport ? 'none' : 'block' }}>
                Tap anywhere on the map or drag the pin to set the delivery location.
              </div>
              <DeliveryPinMap
                pin={customerPin}
                onPinChange={onPinChange}
                disabled={false}
                height={isMobileViewport ? 'clamp(230px, 34svh, 280px)' : 260}
                highlighted
                highlightColor={DEFAULT_ACCENT}
                highlightGlow="rgba(26,69,134,.16)"
              />
              {customerPin ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#334155', fontWeight: 600 }}>
                  <MapPin size={14} color={DEFAULT_ACCENT} />
                  Pinned at {Number(customerPin.latitude).toFixed(5)}, {Number(customerPin.longitude).toFixed(5)}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr' : '1fr 1fr', gap: 10 }}>
        <button type="button" onClick={onBack} style={{ minHeight: 46, borderRadius: 12, border: '1px solid #cbd5e1', background: '#fff', color: '#334155', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ChevronLeft size={18} /> Back</button>
        <button type="button" onClick={onContinue} style={{ minHeight: 46, borderRadius: 12, border: 'none', background: `linear-gradient(180deg, ${DEFAULT_ACCENT} 0%, ${DEFAULT_ACCENT_DARK} 100%)`, color: '#fff', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>Continue <ChevronRight size={18} /></button>
      </div>
    </section>
  );
}
