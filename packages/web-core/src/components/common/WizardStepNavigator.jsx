import React from 'react';
import { cn } from '@/lib/utils.js';

const normalizeStep = (step, index) => ({
  id: step?.id ?? index + 1,
  number: step?.number ?? index + 1,
  label: step?.label || step?.name || `Step ${index + 1}`,
  description: step?.description || step?.tooltip || step?.name || `Step ${index + 1}`,
  disabled: Boolean(step?.disabled),
  disabledReason: step?.disabledReason || ''
});

export default function WizardStepNavigator({
  steps = [],
  currentStep = 1,
  completedStep = Math.max(0, currentStep - 1),
  onStepChange,
  className = '',
  ariaLabel = 'Wizard steps'
}) {
  const normalizedSteps = steps.map(normalizeStep);
  if (normalizedSteps.length <= 1) return null;

  return (
    <nav className={cn('wizard-step-navigator', className)} aria-label={ariaLabel}>
      <div className="wizard-step-navigator__track">
        {normalizedSteps.map((step, index) => {
          const isActive = step.number === currentStep;
          const isCompleted = step.number <= completedStep && !isActive;
          const isClickable = !step.disabled && typeof onStepChange === 'function';
          const tooltipId = `wizard-step-${String(step.id).replace(/[^a-zA-Z0-9_-]/g, '-')}-tooltip`;
          const tooltipText = step.disabled && step.disabledReason
            ? `${step.label}: ${step.disabledReason}`
            : `${step.label}: ${step.description}`;

          return (
            <div key={step.id} className="wizard-step-navigator__item">
              <button
                type="button"
                className={cn(
                  'wizard-step-navigator__button',
                  isActive && 'wizard-step-navigator__button--active',
                  isCompleted && 'wizard-step-navigator__button--completed',
                  step.disabled && 'wizard-step-navigator__button--disabled'
                )}
                onClick={() => {
                  if (isClickable) onStepChange(step.number);
                }}
                aria-disabled={step.disabled ? 'true' : undefined}
                aria-current={isActive ? 'step' : undefined}
                aria-label={`Step ${step.number}: ${tooltipText}`}
                aria-describedby={tooltipId}
                title={tooltipText}
              >
                {step.number}
              </button>
              <span id={tooltipId} className="wizard-step-navigator__tooltip" role="tooltip">
                {tooltipText}
              </span>
              {index < normalizedSteps.length - 1 && (
                <span
                  className={cn(
                    'wizard-step-navigator__connector',
                    step.number < currentStep && 'wizard-step-navigator__connector--completed'
                  )}
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    </nav>
  );
}
