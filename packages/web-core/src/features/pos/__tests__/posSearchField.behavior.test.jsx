// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosSearchField from '../components/PosSearchField.jsx';

afterEach(() => cleanup());

describe('PosSearchField', () => {
  it('keeps clear disabled for an empty value and invokes the page clear handler for a query', () => {
    const onClear = vi.fn();
    const { rerender } = render(
      <PosSearchField ariaLabel="Search items" value="" onClear={onClear} onChange={vi.fn()} />
    );

    const clearButton = screen.getByRole('button', { name: 'Clear search' });
    expect(clearButton.disabled).toBe(true);

    rerender(
      <PosSearchField ariaLabel="Search items" value="tea" onClear={onClear} onChange={vi.fn()} />
    );
    expect(clearButton.disabled).toBe(false);

    fireEvent.click(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables both the search input and clear control when the field is disabled', () => {
    render(
      <PosSearchField ariaLabel="Search items" value="tea" onClear={vi.fn()} onChange={vi.fn()} disabled />
    );

    expect(screen.getByRole('searchbox', { name: 'Search items' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Clear search' }).disabled).toBe(true);
  });
});
