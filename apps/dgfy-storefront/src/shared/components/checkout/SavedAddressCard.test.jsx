/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SavedAddressCard } from './SavedAddressCard.jsx';

const address = {
  id: 'saved-1',
  label: 'Jaro, Iloilo City',
  fullAddress: 'Jaro, Iloilo City',
  isDefault: true,
};

describe('SavedAddressCard checkout presentation', () => {
  afterEach(cleanup);

  it('uses the industry color for a selected border without the oversized selection shadow', () => {
    const onSelect = vi.fn();

    render(
      <SavedAddressCard
        address={address}
        isSelected
        onSelect={onSelect}
        showActions={false}
        themeColor="#176B3A"
      />
    );

    const selectButton = screen.getByRole('button', { name: 'Use for Checkout' });
    const card = selectButton.parentElement;

    expect(card.style.border).toContain('1.5px');
    expect(card.style.border).toContain('rgb(23, 107, 58)');
    expect(card.style.boxShadow).toBe('0 1px 3px rgba(15,23,42,0.05)');
    expect(card.style.boxShadow).not.toContain('0 0 0 3px');
    expect(card.style.boxShadow).not.toContain('12px 28px');
    expect(card.style.transform).toBe('translateY(0)');

    fireEvent.click(selectButton);
    expect(onSelect).toHaveBeenCalledWith(address);
  });
});
