// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WizardStepNavigator from '../WizardStepNavigator.jsx';

afterEach(() => {
  cleanup();
});

const steps = Object.freeze([
  { id: 'one', number: 1, name: 'Basic Info', description: 'Identity and SKU setup.' },
  { id: 'two', number: 2, name: 'POS Setup', description: 'POS and Storefront visibility.' },
  { id: 'three', number: 3, name: 'Review', description: 'Confirm before saving.' }
]);

describe('WizardStepNavigator', () => {
  it('renders numbered circular step buttons with tooltip text metadata', () => {
    render(<WizardStepNavigator steps={steps} currentStep={2} ariaLabel="Product wizard steps" />);

    expect(screen.getByRole('navigation', { name: 'Product wizard steps' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Step 1: Basic Info/i }).textContent).toBe('1');
    expect(screen.getByRole('button', { name: /Step 2: POS Setup/i }).textContent).toBe('2');
    expect(screen.getByRole('button', { name: /Step 3: Review/i }).textContent).toBe('3');
    expect(screen.getByText('POS Setup: POS and Storefront visibility.')).toBeTruthy();
  });

  it('navigates to clicked enabled steps and blocks disabled future steps', async () => {
    const onStepChange = vi.fn();
    const user = userEvent.setup();
    const guardedSteps = [
      steps[0],
      steps[1],
      {
        ...steps[2],
        disabled: true,
        disabledReason: 'Confirm the import before opening results.'
      }
    ];

    render(
      <WizardStepNavigator
        steps={guardedSteps}
        currentStep={1}
        onStepChange={onStepChange}
        ariaLabel="CSV import steps"
      />
    );

    await user.click(screen.getByRole('button', { name: /Step 2: POS Setup/i }));
    expect(onStepChange).toHaveBeenCalledWith(2);

    await user.click(screen.getByRole('button', { name: /Step 3: Review/i }));
    expect(onStepChange).not.toHaveBeenCalledWith(3);
    const disabledStep = screen.getByRole('button', { name: /Confirm the import before opening results/i });
    expect(disabledStep.getAttribute('aria-disabled')).toBe('true');
    expect(disabledStep.disabled).toBe(false);
    disabledStep.focus();
    expect(document.activeElement).toBe(disabledStep);
  });
});
