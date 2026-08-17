import React from 'react';

export function CheckoutStepProgressHeader({
  steps = [],
  activeStep,
  onStepClick,
  variant = 'cards',
  isMobileViewport = false,
  accentColor = '#0f766e',
  accentSoft = '#ecfeff',
  accentBorder = '#99f6e4',
  completeColor = '#68b7ea',
  inactiveBorder = '#e2e8f0',
  inactiveText = '#334155',
  mutedText = '#64748b',
  activeText = null,
  referenceStyle = false
}) {
  if (variant === 'connected') {
    if (referenceStyle) {
      return (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, padding: 0, width: '100%' }}>
          {steps.map((item, index) => {
            const displayStep = Number(item.displayStep || index + 1);
            const isActive = activeStep === item.realStep;
            const done = Number(activeStep) > Number(item.realStep);
            const canContinue = item.allow !== false;
            const stepTextColor = isActive ? (activeText || accentColor) : mutedText;
            return (
              <React.Fragment key={item.key || `checkout-step-${item.realStep}`}>
                <button
                  type="button"
                  onClick={() => onStepClick?.(item)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: stepTextColor,
                    padding: '0 0',
                     minWidth: isMobileViewport ? 0 : 80,
                     flex: isMobileViewport ? '1 1 0%' : '0 0 80px',
                    fontSize: 12.8,
                    fontWeight: 700,
                    cursor: !canContinue ? 'not-allowed' : 'pointer',
                    display: 'grid',
                    justifyItems: displayStep === 1 ? 'start' : (displayStep === steps.length ? 'end' : 'center'),
                    gap: 8,
                    opacity: canContinue ? 1 : 0.72,
                  }}
                  disabled={!canContinue}
                >
                  <span style={{ width: 24, height: 24, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, lineHeight: '19.2px', fontWeight: 700, border: `1px solid ${isActive ? accentColor : (done || canContinue ? accentBorder : '#cce8ee')}`, background: isActive ? accentColor : (done ? accentSoft : (canContinue ? accentSoft : '#fff')), color: isActive ? '#fff' : (done || canContinue ? accentColor : mutedText) }}>
                    {displayStep}
                  </span>
                  <span style={{ textAlign: displayStep === 1 ? 'left' : (displayStep === steps.length ? 'right' : 'center'), lineHeight: 1.6, whiteSpace: displayStep === steps.length ? 'normal' : 'nowrap' }}>
                    {item.label}
                  </span>
                </button>
                {index < steps.length - 1 ? <span aria-hidden="true" style={{ height: 2, flex: '1 1 0%', minWidth: 12, margin: '12px 8px 0', borderRadius: 999, background: done || isActive ? completeColor : '#bae6fd' }} /> : null}
              </React.Fragment>
            );
          })}
        </div>
      );
    }
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))`, gap: 18, alignItems: 'start', padding: '4px 0 10px' }}>
        {steps.map((item, index) => {
          const displayStep = Number(item.displayStep || index + 1);
          const isActive = activeStep === item.realStep;
          const done = Number(activeStep) > Number(item.realStep);
          const stepTextColor = isActive ? (activeText || accentColor) : mutedText;
          return (
            <button
              key={item.key || `checkout-step-${item.realStep}`}
              type="button"
              onClick={() => onStepClick?.(item)}
              style={{
                border: 'none',
                background: 'transparent',
                color: stepTextColor,
                padding: '0 6px',
                fontSize: isMobileViewport ? 12 : 14,
                fontWeight: isActive ? 700 : 600,
                cursor: item.allow === false ? 'not-allowed' : 'pointer',
                display: 'grid',
                gap: 10,
                transition: 'all 200ms ease',
                position: 'relative',
                opacity: item.allow === false ? 0.65 : 1
              }}
              disabled={item.allow === false}
            >
              <span style={{ display: 'grid', gap: 8, width: '100%' }}>
                <span style={{ display: 'grid', gridTemplateColumns: displayStep === 1 ? 'auto 1fr' : (displayStep === steps.length ? '1fr auto' : '1fr auto 1fr'), alignItems: 'center', columnGap: 12, width: '100%' }}>
                  {displayStep > 1 ? (
                    <span aria-hidden="true" style={{ height: 2, borderRadius: 999, background: done || isActive ? completeColor : '#dbe5ee', width: '100%' }} />
                  ) : null}
                  <span style={{ width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, border: `1px solid ${isActive ? accentColor : (done ? accentBorder : '#cbd5e1')}`, background: isActive ? accentColor : (done ? accentSoft : '#fff'), color: isActive ? '#fff' : (done ? accentColor : '#64748b'), transition: 'all 200ms ease', position: 'relative', zIndex: 1, justifySelf: 'center' }}>
                    {displayStep}
                  </span>
                  {displayStep < steps.length ? (
                    <span aria-hidden="true" style={{ height: 2, borderRadius: 999, background: done ? completeColor : (isActive ? accentColor : '#dbe5ee'), width: '100%' }} />
                  ) : null}
                </span>
                <span style={{ fontSize: isMobileViewport ? 12 : 13, fontWeight: isActive ? 700 : 600, textAlign: displayStep === 1 ? 'left' : (displayStep === steps.length ? 'right' : 'center'), lineHeight: 1.2 }}>
                  {item.label}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobileViewport ? '1fr 1fr' : `repeat(${steps.length}, minmax(0, 1fr))`, gap: 10 }}>
      {steps.map((item, index) => {
        const displayStep = Number(item.displayStep || index + 1);
        const isActive = activeStep === item.realStep;
        const done = Number(activeStep) > Number(item.realStep) || (item.completeWhen ? item.completeWhen() : false);
        return (
          <button
            key={item.key || `checkout-step-${item.realStep}`}
            type="button"
            onClick={() => onStepClick?.(item)}
            disabled={item.allow === false}
            style={{
              borderRadius: 14,
              border: `1px solid ${isActive ? accentColor : inactiveBorder}`,
              background: isActive ? accentSoft : '#fff',
              color: isActive ? accentColor : inactiveText,
              minHeight: 52,
              fontSize: 13,
              fontWeight: 800,
              cursor: item.allow === false ? 'not-allowed' : 'pointer',
              opacity: item.allow === false ? 0.65 : 1
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: 999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, background: done ? accentColor : (isActive ? accentColor : inactiveBorder), color: done || isActive ? '#fff' : mutedText }}>
                {displayStep}
              </span>
              <span>{item.label}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
