// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SimpleOrderMethodSelector } from './SimpleOrderMethodSelector.jsx';

describe('SimpleOrderMethodSelector', () => {
  it('keeps an unavailable method visible and reports why without changing selection', () => {
    const onOrderMethodChange = vi.fn();
    render(<SimpleOrderMethodSelector
      orderMethod="delivery"
      onOrderMethodChange={onOrderMethodChange}
      options={[
        { value: 'delivery', label: 'Delivery', available: true },
        { value: 'pickup', label: 'Pickup', available: false }
      ]}
    />);

    fireEvent.click(screen.getByRole('button', { name: 'Pickup (Unavailable)' }));

    expect(onOrderMethodChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('This store does not support Pickup.');
    expect(screen.getByRole('button', { name: 'Pickup (Unavailable)' }).getAttribute('aria-disabled')).toBe('true');
  });
});
