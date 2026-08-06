/** @vitest-environment jsdom */
import React, { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberStepper from '@/components/ui/number-stepper';

function StatefulStepper(props) {
  const [value, setValue] = useState(props.initialValue ?? 0);
  return (
    <NumberStepper
      value={value}
      onChange={setValue}
      min={props.min ?? 0}
      step={props.step ?? 1}
      allowEmpty={props.allowEmpty ?? false}
      uomLabel={props.uomLabel ?? ''}
      size="sm"
    />
  );
}

afterEach(() => {
  cleanup();
});

describe('NumberStepper behavior', () => {
  it('increments and decrements by one via buttons', async () => {
    const user = userEvent.setup();
    render(<StatefulStepper initialValue={2} />);

    const input = screen.getByRole('spinbutton');
    await user.click(screen.getByRole('button', { name: /increase value/i }));
    expect(input.value).toBe('3');

    await user.click(screen.getByRole('button', { name: /decrease value/i }));
    expect(input.value).toBe('2');
  });

  it('handles ArrowUp/ArrowDown with step 1', async () => {
    const user = userEvent.setup();
    render(<StatefulStepper initialValue={4} />);

    const input = screen.getByRole('spinbutton');
    input.focus();
    await user.keyboard('{ArrowUp}');
    expect(input.value).toBe('5');

    await user.keyboard('{ArrowDown}');
    expect(input.value).toBe('4');
  });

  it('clamps to min and prevents negative values', async () => {
    const user = userEvent.setup();
    render(<StatefulStepper initialValue={0} min={0} />);

    const input = screen.getByRole('spinbutton');
    await user.click(screen.getByRole('button', { name: /decrease value/i }));
    expect(input.value).toBe('0');
  });

  it('supports manual empty input when allowEmpty is enabled', async () => {
    const user = userEvent.setup();
    render(<StatefulStepper initialValue={8} allowEmpty />);

    const input = screen.getByRole('spinbutton');
    await user.clear(input);
    expect(input.value).toBe('');
  });

  it('renders UOM label outside input and preserves typed numeric value', async () => {
    const user = userEvent.setup();
    render(<StatefulStepper initialValue={1} allowEmpty uomLabel="kg" />);

    const input = screen.getByRole('spinbutton');
    expect(screen.getByText('kg')).toBeTruthy();

    await user.clear(input);
    await user.type(input, '12');
    expect(input.value).toBe('12');
    expect(screen.getByText('kg')).toBeTruthy();
  });
});
