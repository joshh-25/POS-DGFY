// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontTimePickerSelect } from './StorefrontTimePickerSelect.jsx';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
describe('StorefrontTimePickerSelect', () => {
  it('renders an iPhone-style roller with an editable centered value', () => {
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

    const minuteInput = screen.getByRole('textbox', { name: 'Minute' });
    expect(minuteInput).toBeTruthy();
    expect(minuteInput.className).toContain('storefront-time-picker-input');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('listbox', { name: 'Minute' })).toBeTruthy();
    expect(screen.getByRole('option', { name: '02' }).getAttribute('aria-selected')).toBe('true');
  });

  it('focuses the centered item for exact typing without changing the roller layout', () => {
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

    const centeredOption = screen.getByRole('option', { name: '2' });
    const hourInput = screen.getByRole('textbox', { name: 'Hour' });
    fireEvent.click(centeredOption);

    expect(document.activeElement).toBe(hourInput);
    expect(hourInput.selectionStart).toBe(0);
    expect(hourInput.selectionEnd).toBe(1);

    fireEvent.change(hourInput, { target: { value: '3' } });
    fireEvent.blur(hourInput);
    expect(onChange).toHaveBeenCalledWith('3');
  });

  it('forwards center-row wheel movement to the roller while keeping the input clickable', () => {
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Minute"
        onChange={vi.fn()}
        options={['00', '01', '02', '03']}
        placeholder="Min"
        value="01"
      />
    );

    const wheel = screen.getByRole('listbox', { name: 'Minute' });
    const minuteInput = screen.getByRole('textbox', { name: 'Minute' });
    wheel.scrollTop = 42;
    fireEvent.wheel(minuteInput, { deltaY: 42 });

    expect(wheel.scrollTop).toBe(84);
    expect(minuteInput.style.pointerEvents).not.toBe('none');
  });

  it('does not visually duplicate the centered AM/PM value', () => {
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

    const activeOption = screen.getByRole('option', { name: 'AM' });
    const inactiveOption = screen.getByRole('option', { name: 'PM' });
    const amPmInput = screen.getByRole('textbox', { name: 'AM/PM' });

    expect(activeOption.style.color).toBe('transparent');
    expect(activeOption.style.scrollSnapAlign).toBe('center');
    expect(inactiveOption.style.color).not.toBe('transparent');
    expect(amPmInput.value).toBe('AM');
  });

  it('snaps back to the last enabled option when scrolling reaches a disabled trailing value', () => {
    vi.useFakeTimers();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Hour"
        onChange={vi.fn()}
        options={[
          { value: '11', label: '11', disabled: false },
          { value: '12', label: '12', disabled: true }
        ]}
        placeholder="Hour"
        value="11"
      />
    );

    const wheel = screen.getByRole('listbox', { name: 'Hour' });
    vi.advanceTimersByTime(1);
    wheel.scrollTop = 42;
    fireEvent.scroll(wheel);
    vi.advanceTimersByTime(100);

    expect(wheel.scrollTop).toBe(0);
  });

  it('rejects out-of-range hour drafts while accepting the 1-12 boundary', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Hour"
        onChange={onChange}
        options={Array.from({ length: 12 }, (_, index) => String(index + 1))}
        placeholder="Hour"
        value="11"
      />
    );

    const hourInput = screen.getByRole('textbox', { name: 'Hour' });
    fireEvent.change(hourInput, { target: { value: '13' } });
    expect(hourInput.value).toBe('11');
    fireEvent.change(hourInput, { target: { value: '12' } });
    fireEvent.blur(hourInput);

    expect(onChange).toHaveBeenCalledWith('12');
  });

  it('rejects out-of-range minute drafts while accepting 00-59 and normalizing a single digit', () => {
    const onChange = vi.fn();
    render(
      <StorefrontTimePickerSelect
        brandColor="#1A4E8D"
        label="Minute"
        onChange={onChange}
        options={Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0'))}
        placeholder="Min"
        value="58"
      />
    );

    const minuteInput = screen.getByRole('textbox', { name: 'Minute' });
    fireEvent.change(minuteInput, { target: { value: '60' } });
    expect(minuteInput.value).toBe('58');
    fireEvent.change(minuteInput, { target: { value: '7' } });
    fireEvent.blur(minuteInput);

    expect(onChange).toHaveBeenCalledWith('07');
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
