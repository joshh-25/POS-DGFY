// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontTimePickerSelect } from './StorefrontTimePickerSelect.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('StorefrontTimePickerSelect', () => {
  it('renders an iPhone-style roller without a dropdown or text input', () => {
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Minute"
        onChange={vi.fn()}
        options={['00', '01', '02', '59']}
        placeholder="Min"
        value="02"
      />
    );

    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('listbox', { name: 'Minute' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '02' }).getAttribute('aria-selected')).toBe('true');
  });

  it('supports every minute from 00 through 59 and emits the selected value', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Minute"
        onChange={onChange}
        options={Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))}
        placeholder="Min"
        value="30"
      />
    );

    expect(screen.getByRole('option', { name: '00' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '59' })).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: '59' }));
    expect(onChange).toHaveBeenCalledWith('59');
  });

  it('keeps unavailable wheel options disabled', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Minute"
        onChange={onChange}
        options={[
          { value: '00', label: '00', disabled: true },
          { value: '01', label: '01', disabled: true },
          { value: '02', label: '02', disabled: false }
        ]}
        placeholder="Min"
        value="02"
      />
    );

    expect(screen.getByRole('option', { name: '00' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('option', { name: '00' }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('option', { name: '02' }));
    expect(onChange).not.toHaveBeenCalled();
  });
});
