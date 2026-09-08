// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosItemImageViewer from '../../../../packages/web-core/src/features/pos/components/PosItemImageViewer.jsx';

afterEach(cleanup);

const preview = {
  itemName: 'Beef Meal',
  sellingPrice: 300,
  gallery: [
    {
      thumbnailSrc: '/uploads/one-thumb.jpg',
      previewSrc: '/uploads/one-large.jpg',
      previewFallbacks: ['/uploads/one-medium.jpg', '/uploads/one-thumb.jpg']
    },
    {
      thumbnailSrc: '/uploads/two-thumb.jpg',
      previewSrc: '/uploads/two-large.jpg',
      previewFallbacks: []
    }
  ]
};

describe('POS item image viewer', () => {
  it('loads only the active HD image and advances through its fallbacks', () => {
    render(<PosItemImageViewer preview={preview} onClose={vi.fn()} />);
    const fullImage = screen.getByAltText('Beef Meal full-size view');
    expect(screen.getByText('PHP 300.00')).toBeTruthy();
    expect(fullImage.getAttribute('src')).toBe('/uploads/one-large.jpg');
    expect(fullImage.style.transform).toBe('');
    expect(document.querySelector('img[src="/uploads/two-large.jpg"]')).toBeNull();
    fireEvent.error(fullImage);
    expect(screen.getByAltText('Beef Meal full-size view').getAttribute('src')).toBe('/uploads/one-medium.jpg');
  });

  it('supports gallery navigation, zoom, and keyboard close', () => {
    const onClose = vi.fn();
    render(<PosItemImageViewer preview={preview} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
    expect(screen.getByAltText('Beef Meal full-size view').getAttribute('src')).toBe('/uploads/two-large.jpg');
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeTruthy();
    expect(screen.getByAltText('Beef Meal full-size view').style.transform).toBe('scale(1.5)');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
