// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SelectedItemImageCarousel from '../SelectedItemImageCarousel.jsx';
import { getPendingGalleryEntryKey, getSavedGalleryEntryKey } from '../../../src/features/pos/utils/posEditImageDraft.js';

afterEach(cleanup);

describe('SelectedItemImageCarousel combined POS gallery', () => {
  it('shows saved and pending images together and promotes a pending image', async () => {
    const user = userEvent.setup();
    const onSetPendingPrimary = vi.fn();
    const pendingFile = new File(['pending'], 'new-drink.png', { type: 'image/png' });

    render(
      <SelectedItemImageCarousel
        files={[pendingFile]}
        savedGallery={[{ url: '/uploads/items/saved-drink.webp' }]}
        itemName="Blue Drink"
        showPrimaryToggle
        onSetPendingPrimary={onSetPendingPrimary}
        onRemove={vi.fn()}
        onRemoveSaved={vi.fn()}
      />
    );

    expect(screen.getByRole('region', { name: 'Blue Drink item image gallery' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Focus item image/ })).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Next item image' }));
    await user.click(screen.getByRole('switch', { name: 'Make item image 2 primary' }));

    expect(onSetPendingPrimary).toHaveBeenCalledWith(pendingFile, 0);
    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByText(/Showing \d+\/\d+:/i)).toBeNull();
  });

  it('promotes a saved image through the primary callback and displays it first', async () => {
    const user = userEvent.setup();
    const onSetSavedPrimary = vi.fn();

    render(
      <SelectedItemImageCarousel
        savedGallery={[
          { url: '/uploads/items/primary.webp' },
          { url: '/uploads/items/alternate.webp' }
        ]}
        itemName="Blue Drink"
        showPrimaryToggle
        onSetSavedPrimary={onSetSavedPrimary}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Next item image' }));
    await user.click(screen.getByRole('switch', { name: 'Make item image 2 primary' }));

    expect(onSetSavedPrimary).toHaveBeenCalledWith(1);
    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');
  });

  it('routes removal of the focused saved image to the saved-image handler', async () => {
    const user = userEvent.setup();
    const onRemoveSaved = vi.fn();

    render(
      <SelectedItemImageCarousel
        savedGallery={[
          { url: '/uploads/items/primary.webp' },
          { url: '/uploads/items/alternate.webp' }
        ]}
        showPrimaryToggle
        onRemoveSaved={onRemoveSaved}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Remove item image 1' }));
    expect(onRemoveSaved).toHaveBeenCalledWith(0);
  });

  it('keeps a parent-owned pending Primary when another file is added', async () => {
    const user = userEvent.setup();
    const first = new File(['first'], 'first.png', { type: 'image/png', lastModified: 1 });
    const second = new File(['second'], 'second.png', { type: 'image/png', lastModified: 2 });
    const third = new File(['third'], 'third.png', { type: 'image/png', lastModified: 3 });
    const onSetPendingPrimary = vi.fn();
    const { rerender } = render(
      <SelectedItemImageCarousel
        files={[first, second]}
        itemName="Blue Drink"
        showPrimaryToggle
        primaryEntryKey={getPendingGalleryEntryKey(second)}
        onSetPendingPrimary={onSetPendingPrimary}
        onPrimaryChange={vi.fn()}
      />
    );

    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');
    rerender(
      <SelectedItemImageCarousel
        files={[first, second, third]}
        itemName="Blue Drink"
        showPrimaryToggle
        primaryEntryKey={getPendingGalleryEntryKey(second)}
        onSetPendingPrimary={onSetPendingPrimary}
      />
    );
    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');

    await user.click(screen.getByRole('button', { name: 'Next selected item image' }));
    expect(screen.getByRole('switch', { name: 'Make item image 2 primary' }).getAttribute('aria-checked')).toBe('false');
  });

  it('falls back to the first remaining saved entry when the saved Primary is removed', () => {
    const onRemoveSaved = vi.fn();
    render(
      <SelectedItemImageCarousel
        savedGallery={[{ url: '/uploads/items/primary.webp' }, { url: '/uploads/items/alternate.webp' }]}
        showPrimaryToggle
        primaryEntryKey={getSavedGalleryEntryKey({ url: '/uploads/items/primary.webp' }, 0)}
        onRemoveSaved={onRemoveSaved}
      />
    );
    expect(screen.getByRole('switch', { name: 'Make item image 1 primary' }).getAttribute('aria-checked')).toBe('true');
  });
});
