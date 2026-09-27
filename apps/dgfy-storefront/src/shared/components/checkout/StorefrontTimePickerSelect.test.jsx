// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontTimePickerSelect } from './StorefrontTimePickerSelect.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StorefrontTimePickerSelect', () => {
  it('accepts typed hour and minute values while retaining dropdown selection', () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <StorefrontTimePickerSelect brandColor="#1A4E8D" label="Hour" onChange={onChange} options={['1', '2', '11']} placeholder="Hour" value="11" />
    );
    const hour = screen.getByRole('textbox', { name: 'Hour' });
    fireEvent.change(hour, { target: { value: '02' } });
    fireEvent.blur(hour);
    expect(onChange).toHaveBeenCalledWith('2');

    rerender(<StorefrontTimePickerSelect brandColor="#1A4E8D" label="Minute" onChange={onChange} options={['00', '30']} placeholder="Min" value="30" />);
    const minute = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.change(minute, { target: { value: '0' } });
    fireEvent.blur(minute);
    expect(onChange).toHaveBeenCalledWith('00');
    fireEvent.click(screen.getByRole('button', { name: 'Minute: 30' }));
    expect(screen.getByRole('listbox', { name: 'Minute options' })).toBeTruthy();
  });

  it('does not commit typed values outside the available options', () => {
    const onChange = vi.fn();
    render(<StorefrontTimePickerSelect brandColor="#1A4E8D" label="Minute" onChange={onChange} options={['00', '30']} placeholder="Min" value="30" />);
    const minute = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.change(minute, { target: { value: '45' } });
    fireEvent.blur(minute);
    expect(onChange).not.toHaveBeenCalled();
    expect(minute.value).toBe('30');
    expect(minute.getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByRole('alert').textContent).toBe('Enter 00–60.');
    expect(minute.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
  });

  it('accepts manual minute values from 0 through 60 when the dropdown uses short increments', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        allowCustomInput
        brandColor="#1A4E8D"
        label="Minute"
        onChange={onChange}
        options={['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55']}
        placeholder="Min"
        value="00"
      />
    );
    const minute = screen.getByRole('textbox', { name: 'Minute' });

    fireEvent.change(minute, { target: { value: '16' } });
    fireEvent.blur(minute);
    expect(onChange).toHaveBeenLastCalledWith('16');

    fireEvent.change(minute, { target: { value: '60' } });
    fireEvent.blur(minute);
    expect(onChange).toHaveBeenLastCalledWith('60');

    fireEvent.change(minute, { target: { value: '61' } });
    fireEvent.blur(minute);
    expect(onChange).toHaveBeenCalledTimes(2);
    expect(minute.getAttribute('aria-invalid')).toBe('true');
  });

  it('uses the DGFY selected-option treatment and supports keyboard selection navigation', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Hour"
        onChange={onChange}
        options={['1', '2', '3']}
        placeholder="Hour"
        value="2"
      />
    );

    const trigger = screen.getByRole('button', { name: 'Hour: 2' });
    fireEvent.click(trigger);

    const listbox = screen.getByRole('listbox', { name: 'Hour options' });
    const selectedOption = screen.getByRole('option', { name: '2' });
    expect(selectedOption.getAttribute('aria-selected')).toBe('true');
    expect(selectedOption.style.background).toBe('rgb(239, 246, 255)');
    expect(selectedOption.style.color).toBe('rgb(26, 78, 141)');

    fireEvent.keyDown(listbox, { key: 'ArrowDown' });
    const nextOption = screen.getByRole('option', { name: '3' });
    expect(document.activeElement).toBe(nextOption);
    fireEvent.click(nextOption);

    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes with Escape and restores focus to its trigger', () => {
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="AM/PM"
        onChange={vi.fn()}
        options={['AM', 'PM']}
        placeholder="AM/PM"
        value="AM"
      />
    );

    const trigger = screen.getByRole('button', { name: 'AM/PM: AM' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('listbox', { name: 'AM/PM options' }), { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
