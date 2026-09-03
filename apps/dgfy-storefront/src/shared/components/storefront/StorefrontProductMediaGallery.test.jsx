/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { StorefrontProductMediaGallery } from './StorefrontProductMediaGallery.jsx';

const gallery = [
  {
    url: '/uploads/catalog/primary-large.webp',
    src: '/uploads/catalog/primary-large.webp',
    thumbnailUrl: '/uploads/catalog/primary-thumbnail.webp',
    largeUrl: '/uploads/catalog/primary-large.webp',
    isPrimary: true,
    sortOrder: 0
  },
  {
    url: '/uploads/catalog/secondary-large.webp',
    src: '/uploads/catalog/secondary-large.webp',
    thumbnailUrl: '/uploads/catalog/secondary-thumbnail.webp',
    largeUrl: '/uploads/catalog/secondary-large.webp',
    isPrimary: false,
    sortOrder: 1
  },
  {
    url: '/uploads/catalog/third-large.webp',
    src: '/uploads/catalog/third-large.webp',
    thumbnailUrl: '/uploads/catalog/third-thumbnail.webp',
    largeUrl: '/uploads/catalog/third-large.webp',
    isPrimary: false,
    sortOrder: 2
  }
];

const renderGallery = () => render(
  <StorefrontProductMediaGallery
    available
    availabilityLabel="Available"
    imageGallery={gallery}
    imageSources={gallery[0]}
    imageUrl={gallery[0].url}
    itemName="Gallery item"
    sectionLabel="Menu"
    standardImageHeight={450}
  />
);

afterEach(cleanup);

describe('StorefrontProductMediaGallery', () => {
  it('renders the primary image first and allows thumbnail and arrow navigation', async () => {
    const user = userEvent.setup();
    renderGallery();

    expect(screen.getAllByRole('button', { name: /Select image/ })).toHaveLength(3);
    expect(screen.getByAltText('Gallery item').getAttribute('src')).toContain('primary-large.webp');

    await user.click(screen.getByRole('button', { name: 'Select image 2 of 3' }));
    expect(screen.getByAltText('Gallery item').getAttribute('src')).toContain('secondary-large.webp');

    await user.click(screen.getByRole('button', { name: 'Next slide' }));
    expect(screen.getByAltText('Gallery item').getAttribute('src')).toContain('third-large.webp');
    expect(screen.getByRole('button', { name: 'Next slide' }).disabled).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Previous slide' }));
    expect(screen.getByAltText('Gallery item').getAttribute('src')).toContain('secondary-large.webp');
  });

  it('opens the selected image in the fullscreen viewer', async () => {
    const user = userEvent.setup();
    renderGallery();

    await user.click(screen.getByRole('button', { name: 'Select image 3 of 3' }));
    await user.click(screen.getByRole('button', { name: 'View larger image' }));

    const dialog = screen.getByRole('dialog', { name: 'Store gallery viewer' });
    expect(dialog.querySelector('img')?.getAttribute('src')).toContain('third-large.webp');
  });

  it('removes a failed active image and selects the next available image', () => {
    renderGallery();
    fireEvent.click(screen.getByRole('button', { name: 'Select image 2 of 3' }));

    fireEvent.error(screen.getByAltText('Gallery item'));

    expect(screen.getAllByRole('button', { name: /Select image/ })).toHaveLength(2);
    expect(screen.getByAltText('Gallery item').getAttribute('src')).toContain('third-large.webp');
  });
});
