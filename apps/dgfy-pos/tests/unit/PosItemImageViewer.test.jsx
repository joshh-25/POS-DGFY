// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
    const fullImage = screen.getByAltText('Beef Meal full-size view');
    expect(fullImage.getAttribute('src')).toBe('/uploads/two-large.jpg');
    Object.defineProperties(fullImage, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 1200 }
    });
    fullImage.getBoundingClientRect = () => ({ width: 800, height: 600 });
    fireEvent.load(fullImage);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByText('150%')).toBeTruthy();
    expect(screen.getByAltText('Beef Meal full-size view').style.width).toBe('1200px');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('resets and remeasures zoom after a mobile or orientation resize', async () => {
    const onClose = vi.fn();
    render(<PosItemImageViewer preview={{ ...preview, gallery: [preview.gallery[0]] }} onClose={onClose} />);
    const fullImage = screen.getByAltText('Beef Meal full-size view');
    Object.defineProperties(fullImage, {
      naturalWidth: { configurable: true, value: 1600 },
      naturalHeight: { configurable: true, value: 1200 }
    });
    let bounds = { width: 800, height: 600 };
    fullImage.getBoundingClientRect = () => bounds;
    fireEvent.load(fullImage);
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(fullImage.style.width).toBe('1200px');

    bounds = { width: 320, height: 240 };
    fireEvent(window, new Event('resize'));
    await waitFor(() => expect(fullImage.style.width).toBe(''));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Zoom in' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(fullImage.style.width).toBe('480px');
  });

  it('disables enlargement for a thumbnail and traps focus inside the dialog', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { rerender } = render(<PosItemImageViewer preview={{ ...preview, gallery: [preview.gallery[0]] }} onClose={vi.fn()} />);
    const fullImage = screen.getByAltText('Beef Meal full-size view');
    Object.defineProperties(fullImage, {
      naturalWidth: { configurable: true, value: 144 },
      naturalHeight: { configurable: true, value: 144 }
    });
    fullImage.getBoundingClientRect = () => ({ width: 144, height: 144 });
    fireEvent.load(fullImage);
    expect(screen.getByRole('button', { name: 'Zoom in' }).disabled).toBe(true);
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    rerender(<PosItemImageViewer preview={null} onClose={vi.fn()} />);
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
