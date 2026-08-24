import { CalendarDays, Clock3, Zap } from 'lucide-react';
import { SelectableOptionCard } from '../../../../shared/components/checkout/SelectableOptionCard.jsx';
import { SimpleOrderMethodSelector } from './SimpleOrderMethodSelector.jsx';

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
  simpleOrderMethodOptions = []
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 20, alignItems: 'start' }}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>1. How would you like to receive your order?</div>
        <SimpleOrderMethodSelector
          isMobileViewport={isMobileViewport}
          options={simpleOrderMethodOptions}
          orderMethod={orderMethod}
          onOrderMethodChange={onOrderMethodChange}
        />
      </div>

      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>2. When would you like your order?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
          <SelectableOptionCard
            onClick={() => onScheduleModeChange('asap')}
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
          />
        </div>
        {fnbScheduleMode === 'asap' ? (
          <div style={{ borderRadius: 6, border: '1px solid #d1fae5', background: '#f0fdf4', padding: '5px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Clock3 size={11} color="#16a34a" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: '#166534', lineHeight: 1.3 }}>{isDeliveryOrder ? 'Your order will be delivered NOW. You\'ll see the estimated time at checkout.' : 'Your order will be prepared NOW. You\'ll see the estimated time at checkout.'}</span>
          </div>
        ) : (
          <label style={{ display: 'grid', gap: 6, fontSize: 12, color: '#475569' }}>
            Scheduled date and time
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <style>{`.simple-modern-datetime-input::-webkit-calendar-picker-indicator { display: none !important; -webkit-appearance: none !important; }`}</style>
              <div style={{ position: 'absolute', left: 14, color: SIMPLE_BRAND, pointerEvents: 'none' }}><CalendarDays size={18} /></div>
              <input
                type="datetime-local"
                className="simple-modern-datetime-input"
                value={fnbScheduledFor}
                onChange={(event) => onScheduledForChange(event.target.value)}
                onClick={(event) => {
                  try {
                    event.target.showPicker();
                  } catch (error) {
                    // The native picker is optional and not supported by every browser.
                  }
                }}
                style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 12, padding: '12px 14px 12px 42px', background: '#f8fafc', color: '#1e293b', fontSize: 14, fontWeight: 600, outline: 'none', boxShadow: 'inset 0 2px 4px rgba(15,23,42,0.02)', transition: 'all 200ms ease', cursor: 'pointer', boxSizing: 'border-box' }}
                onMouseEnter={(event) => { event.target.style.borderColor = SIMPLE_BRAND; event.target.style.background = '#ffffff'; }}
                onMouseLeave={(event) => { if (document.activeElement !== event.target) { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; } }}
                onFocus={(event) => { event.target.style.borderColor = SIMPLE_BRAND; event.target.style.background = '#ffffff'; event.target.style.boxShadow = `0 0 0 3px ${SIMPLE_BRAND_SHADOW_STRONG}, inset 0 2px 4px rgba(15,23,42,0.02)`; }}
                onBlur={(event) => { event.target.style.borderColor = '#cbd5e1'; event.target.style.background = '#f8fafc'; event.target.style.boxShadow = 'inset 0 2px 4px rgba(15,23,42,0.02)'; }}
              />
            </div>
          </label>
        )}
      </div>
    </div>
  );
}
