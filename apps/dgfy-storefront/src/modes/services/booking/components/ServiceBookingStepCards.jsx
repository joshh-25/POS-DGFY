import React from 'react';
import { ArrowRight } from 'lucide-react';
import { SERVICES_PALETTE } from '../../servicesPalette.js';

export function ServiceBookingStepCards({
  bookingSteps,
  currentStep,
  onStepChange,
  isMobileViewport,
  activeBackground,
  activeBorder,
  activeAccent,
}) {
  if (isMobileViewport) {
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 10,
          alignItems: 'start',
        }}
      >
        {bookingSteps.map((item) => {
          const isActive = currentStep === item.step;
          const isDone = item.complete;
          const tone = isDone ? SERVICES_PALETTE.success : isActive ? activeAccent : SERVICES_PALETTE.border;
          return (
            <button
              key={`booking-step-${item.step}`}
              type="button"
              onClick={() => onStepChange(item.step)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                display: 'grid',
                gap: 8,
                textAlign: 'left',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    background: tone,
                    color: SERVICES_PALETTE.surface,
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 900,
                    fontSize: 13,
                    flexShrink: 0,
                    boxShadow: isActive ? `0 10px 22px ${activeBorder}` : 'none',
                  }}
                >
                  {item.step}
                </div>
                <div style={{ flex: 1, height: 2, borderRadius: 999, background: item.complete || currentStep > item.step ? activeAccent : '#dbe5ee' }} />
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SERVICES_PALETTE.textPrimary }}>{item.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isDone ? SERVICES_PALETTE.success : isActive ? activeAccent : SERVICES_PALETTE.textMuted }}>
                  {isDone ? 'Done' : isActive ? 'In progress' : 'Pending'}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        flexWrap: 'nowrap',
      }}
    >
      {bookingSteps.map((item, index) => {
        const isActive = currentStep === item.step;
        const isDone = item.complete;
        const tone = isDone ? SERVICES_PALETTE.success : isActive ? activeAccent : SERVICES_PALETTE.border;
        return (
          <React.Fragment key={`booking-step-${item.step}`}>
            <button
              type="button"
              onClick={() => onStepChange(item.step)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                textAlign: 'left',
                flex: '0 1 auto',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  background: tone,
                  color: SERVICES_PALETTE.surface,
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 900,
                  fontSize: 13,
                  flexShrink: 0,
                  boxShadow: isActive ? `0 10px 22px ${activeBorder}` : 'none',
                }}
              >
                {item.step}
              </div>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: SERVICES_PALETTE.textPrimary }}>{item.label}</div>
                <div style={{ fontSize: 11, fontWeight: 700, color: isDone ? SERVICES_PALETTE.success : isActive ? activeAccent : SERVICES_PALETTE.textMuted }}>
                  {isDone ? 'Done' : isActive ? 'In progress' : 'Pending'}
                </div>
              </div>
            </button>
            {index < bookingSteps.length - 1 ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', color: '#94a3b8', flexShrink: 0 }}>
                <ArrowRight size={18} />
              </div>
            ) : null}
          </React.Fragment>
        );
      })}
    </div>
  );
}
