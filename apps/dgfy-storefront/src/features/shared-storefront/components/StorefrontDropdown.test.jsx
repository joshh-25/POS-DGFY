// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorefrontDropdown } from './StorefrontDropdown.jsx';
import { PaymentMethodSelectorBlock } from '../../../shared/components/checkout/PaymentMethodSelectorBlock.jsx';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const options = [
  { value: 'card', label: 'Card' },
  { value: 'wallet', label: 'QR Ph' }
];

const paymentMockOptions = [
  { value: 'cash', label: 'Cash on delivery/pickup' },
  { value: 'gcash', label: 'GCash (mock)' },
  { value: 'card', label: 'Card' }
];

function mockDropdownGeometry({ nearBottom = false } = {}) {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getBoundingClientRect() {
    if (this.getAttribute('role') === 'combobox') {
      return nearBottom
        ? { top: 650, bottom: 700, left: 40, right: 340, width: 300, height: 50 }
        : { top: 100, bottom: 150, left: 40, right: 340, width: 300, height: 50 };
    }
    if (this.getAttribute('role') === 'listbox') {
      return { top: 0, bottom: 100, left: 0, right: window.innerWidth, width: window.innerWidth, height: 100 };
    }
    return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 };
  });
}

describe('StorefrontDropdown floating payment menu', () => {
  it('renders the payment menu outside clipped checkout containers and keeps selection working', () => {
    mockDropdownGeometry();
    const onChange = vi.fn();

    render(
      <div style={{ overflow: 'hidden' }}>
        <PaymentMethodSelectorBlock
          value=""
          onChange={onChange}
          options={paymentMockOptions}
          DropdownComponent={StorefrontDropdown}
          menuStyle={{ width: '100%', minWidth: '100%', marginTop: 8 }}
        />
      </div>
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(listbox.parentElement).toBe(document.body);
    expect(listbox.style.position).toBe('fixed');
    expect(listbox.style.left).toBe('40px');
    expect(listbox.style.width).toBe('300px');
    expect(listbox.style.maxHeight).toBe('220px');
    expect(screen.getByRole('option', { name: 'GCash (mock)' })).toBeTruthy();
    const cardOption = screen.getByRole('option', { name: 'Card' });
    expect(cardOption).toBeTruthy();
    expect(cardOption.style.minHeight).toBe('40px');
    expect(cardOption.style.padding).toBe('8px 12px');

    fireEvent.click(screen.getByRole('option', { name: 'Card' }));

    expect(onChange).toHaveBeenCalledWith('card');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps direct dropdown consumers inline unless portalMenu is enabled', () => {
    mockDropdownGeometry();

    render(
      <StorefrontDropdown
        value="card"
        onChange={vi.fn()}
        options={options}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(listbox.parentElement).not.toBe(document.body);
    expect(listbox.style.position).toBe('absolute');
  });

  it('opens upward when the payment field is near the bottom of the viewport', () => {
    mockDropdownGeometry({ nearBottom: true });

    render(
      <PaymentMethodSelectorBlock
        value=""
        onChange={vi.fn()}
        options={options}
        DropdownComponent={StorefrontDropdown}
      />
    );

    fireEvent.click(screen.getByRole('combobox'));

    const listbox = screen.getByRole('listbox');
    expect(Number.parseFloat(listbox.style.top)).toBeLessThan(650);
    expect(listbox.style.visibility).toBe('visible');
  });
});
