import React from 'react';
import { Check } from 'lucide-react';

const DEFAULT_PENDING_BORDER = '#cbd5e1';
const DEFAULT_TRACK = '#e2e8f0';
const DEFAULT_MUTED = '#94a3b8';

function getStepState(step, index, activeStepIndex, isCompleted, stepCount) {
  if (step?.state === 'done' || step?.state === 'active' || step?.state === 'pending') {
    return {
      done: step.state === 'done',
      active: step.state === 'active',
    };
  }

  const done = index < activeStepIndex;
  const active = index === activeStepIndex || (isCompleted && index === stepCount - 1);
  return { done, active };
}

function defaultStepIcon({ done, index, size }) {
  return done ? <Check size={size} strokeWidth={4} /> : index + 1;
}

/**
 * Shared tracking progress indicator. Desktop keeps the compact horizontal
 * stepper; narrow screens switch to a readable vertical sequence with
 * connectors between each status row.
 */
export function StorefrontTrackingTimeline({
  accentColor = '#2563eb',
  activeStepIndex = 0,
  ariaLabel = 'Order progress',
  bodyFont = 'inherit',
  isCompleted = false,
  isMobileViewport = false,
  renderStepIcon = defaultStepIcon,
  showUpdated = false,
  steps = [],
  style
}) {
  const normalizedSteps = Array.isArray(steps) ? steps.filter(Boolean) : [];
  const stepCount = normalizedSteps.length;
  const safeActiveStepIndex = Number.isFinite(activeStepIndex)
    ? Math.max(0, Math.min(activeStepIndex, Math.max(0, stepCount - 1)))
    : 0;
  const progressPercent = stepCount > 1
    ? (safeActiveStepIndex / (stepCount - 1)) * 100
    : 0;

  if (isMobileViewport) {
    return (
      <section
        aria-label={ariaLabel}
        data-orientation="vertical"
        data-testid="storefront-tracking-timeline"
        style={{
          position: 'relative',
          display: 'grid',
          gridTemplateColumns: '1fr',
          minWidth: 0,
          padding: '8px 0',
          overflowX: 'hidden',
          ...style
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: 22,
            bottom: 22,
            left: 13,
            width: 3,
            borderRadius: 999,
            background: DEFAULT_TRACK,
            pointerEvents: 'none'
          }}
        />
        <div style={{ display: 'grid', rowGap: 14, minWidth: 0 }}>
          {normalizedSteps.map((step, index) => {
            const { done, active } = getStepState(step, index, safeActiveStepIndex, isCompleted, stepCount);
            const pending = !done && !active;
            const iconSize = 14;
            return (
              <div
                key={step.id || `step-${index}`}
                aria-current={active ? 'step' : undefined}
                data-testid="storefront-tracking-step"
                style={{
                  position: 'relative',
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0, 1fr)',
                  columnGap: 12,
                  alignItems: 'start',
                  minWidth: 0,
                  minHeight: 40,
                  zIndex: 1
                }}
              >
                {index < stepCount - 1 ? (
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'absolute',
                      top: 28,
                      bottom: -14,
                      left: 13,
                      width: 3,
                      borderRadius: 999,
                      background: index < safeActiveStepIndex ? accentColor : DEFAULT_TRACK,
                      zIndex: 0,
                      pointerEvents: 'none'
                    }}
                  />
                ) : null}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: '50%',
                    background: pending ? '#fff' : accentColor,
                    border: `2px solid ${pending ? DEFAULT_PENDING_BORDER : accentColor}`,
                    color: pending ? DEFAULT_MUTED : '#fff',
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 12,
                    fontWeight: 900,
                    lineHeight: 1,
                    transition: 'all .3s',
                    zIndex: 1
                  }}
                >
                  {renderStepIcon({ step, index, done, active, pending, size: iconSize })}
                </div>
                <div
                  style={{
                    minWidth: 0,
                    paddingTop: 3,
                    color: active ? accentColor : (pending ? DEFAULT_MUTED : '#334155'),
                    fontFamily: bodyFont,
                    fontSize: 13,
                    fontWeight: active ? 800 : 600,
                    lineHeight: 1.25,
                    overflowWrap: 'anywhere'
                  }}
                >
                  <div>{step.label}</div>
                  {active && showUpdated ? (
                    <div style={{ marginTop: 3, color: DEFAULT_MUTED, fontSize: 11, fontWeight: 500 }}>Updated</div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={ariaLabel}
      data-orientation="horizontal"
      data-testid="storefront-tracking-timeline"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: `repeat(${Math.max(1, stepCount)}, minmax(0, 1fr))`,
        columnGap: 12,
        minWidth: 0,
        padding: '10px 0',
        overflowX: 'hidden',
        ...style
      }}
    >
      {stepCount > 1 ? (
        <>
          <div aria-hidden="true" style={{ position: 'absolute', top: 24, left: '8%', right: '8%', height: 4, borderRadius: 999, background: DEFAULT_TRACK, zIndex: 0 }} />
          <div aria-hidden="true" style={{ position: 'absolute', top: 24, left: '8%', width: `${Math.max(0, Math.min(84, progressPercent * 0.84))}%`, height: 4, borderRadius: 999, background: accentColor, zIndex: 0, transition: 'width .3s ease' }} />
        </>
      ) : null}
      {normalizedSteps.map((step, index) => {
        const { done, active } = getStepState(step, index, safeActiveStepIndex, isCompleted, stepCount);
        const pending = !done && !active;
        return (
          <div
            key={step.id || `step-${index}`}
            aria-current={active ? 'step' : undefined}
            data-testid="storefront-tracking-step"
            style={{
              position: 'relative',
              display: 'grid',
              justifyItems: 'center',
              gridTemplateRows: '28px minmax(23px, auto)',
              rowGap: 8,
              minWidth: 0,
              zIndex: 1,
              textAlign: 'center'
            }}
          >
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: pending ? '#fff' : accentColor, border: `2px solid ${pending ? DEFAULT_PENDING_BORDER : accentColor}`, color: pending ? DEFAULT_MUTED : '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 900, lineHeight: 1, transition: 'all .3s' }}>
              {renderStepIcon({ step, index, done, active, pending, size: 16 })}
            </div>
            <div style={{ width: '100%', maxWidth: 120, minHeight: 23, color: active ? accentColor : (pending ? DEFAULT_MUTED : '#334155'), fontFamily: bodyFont, fontSize: 12, fontWeight: active ? 700 : 600, lineHeight: 1.2, overflowWrap: 'anywhere' }}>
              <div>{step.label}</div>
              {active && showUpdated ? <div style={{ marginTop: 4, color: DEFAULT_MUTED, fontSize: 11, fontWeight: 500 }}>Updated</div> : null}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export default StorefrontTrackingTimeline;
