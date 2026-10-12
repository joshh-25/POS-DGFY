// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StagedStorefrontImages from '../business/components/StagedStorefrontImages.jsx';

describe('StagedStorefrontImages', () => {
  afterEach(() => cleanup());

  it('uses the Store Content cover-and-profile composition without reposition controls', () => {
    render(<StagedStorefrontImages uploads={[]} previewUrls={{}} onUpload={vi.fn()} onRemove={vi.fn()} />);

    expect(screen.getByText('No cover photo uploaded')).toBeTruthy();
    expect(screen.getByText('Profile photo')).toBeTruthy();
    expect(screen.getAllByText('Not added')).toHaveLength(2);
    expect(screen.queryByText('JPG or PNG, one image.')).toBeNull();
    expect(screen.queryByText('No image selected.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Choose cover photo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Choose profile photo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /reposition|crop/i })).toBeNull();
  });

  it('shows an accurate staged state for saved cover metadata when no browser preview exists', () => {
    render(<StagedStorefrontImages
      uploads={[{ id: 'cover-saved', category: 'cover_image', original_name: 'cover.png' }]}
      previewUrls={{}}
      onUpload={vi.fn()}
      onRemove={vi.fn()}
    />);

    expect(screen.getByText('Cover photo staged')).toBeTruthy();
    expect(screen.queryByText('No cover photo uploaded')).toBeNull();
  });

  it('stages a selected cover image through the registration upload callback', async () => {
    const user = userEvent.setup();
    const onUpload = vi.fn().mockResolvedValue({ id: 'cover-1' });
    const file = new File(['cover image'], 'cover.png', { type: 'image/png' });
    render(<StagedStorefrontImages uploads={[]} previewUrls={{}} onUpload={onUpload} onRemove={vi.fn()} />);

    await user.upload(screen.getByLabelText('Choose cover photo file'), file);

    await waitFor(() => expect(onUpload).toHaveBeenCalledWith('cover_image', file, expect.any(Function)));
  });

  it('removes only the selected staged image', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn().mockResolvedValue(undefined);
    const uploads = [
      { id: 'profile-7', category: 'profile_image', original_name: 'profile.png' },
      { id: 'cover-4', category: 'cover_image', original_name: 'cover.jpg' }
    ];
    render(<StagedStorefrontImages uploads={uploads} previewUrls={{}} onUpload={vi.fn()} onRemove={onRemove} />);

    await user.click(screen.getByRole('button', { name: 'Remove profile photo' }));

    await waitFor(() => expect(onRemove).toHaveBeenCalledWith('profile-7'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
});
