/** @vitest-environment jsdom */

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosReportsDropdown from '../components/PosReportsDropdown.jsx';

afterEach(cleanup);

describe('POS Reports dropdown', () => {
  it('supports keyboard selection and restores focus after Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <PosReportsDropdown
        value="daily"
        ariaLabel="Compare trend by"
        options={[
          { value: 'daily', label: 'Daily' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' }
        ]}
        onChange={onChange}
      />
    );

    const trigger = screen.getByRole('button', { name: 'Compare trend by: Daily' });
    await user.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole('option', { name: 'Daily' }));
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('weekly');
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });
});
