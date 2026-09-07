/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StorefrontGalleryLightbox } from './StorefrontGalleryLightbox.jsx';

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

const images = ['https://example.test/one.jpg', 'https://example.test/two.jpg', 'https://example.test/three.jpg'];

it('opens with a bounded responsive frame and closes from the backdrop or close button', () => {
  const onClose = vi.fn();
  render(<StorefrontGalleryLightbox open images={images} currentIndex={0} onClose={onClose} onNavigate={vi.fn()} />);

  const dialog = screen.getByRole('dialog', { name: 'Store gallery viewer' });
  const frame = screen.getByTestId('storefront-gallery-lightbox-frame');
  expect(document.body.style.overflow).toBe('hidden');
  expect(frame.style.getPropertyValue('--storefront-gallery-frame-width')).toContain('88vw');
  expect(frame.style.getPropertyValue('--storefront-gallery-frame-height')).toBe('76vh');
  expect(screen.getByRole('button', { name: 'Close image viewer' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Close image viewer' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  fireEvent.click(dialog);
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('navigates with controls and keyboard while keeping the counter with the frame', () => {
  const onNavigate = vi.fn();
  const onClose = vi.fn();
  render(<StorefrontGalleryLightbox open images={images} currentIndex={1} onClose={onClose} onNavigate={onNavigate} />);

  expect(screen.getByRole('button', { name: 'Previous image' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Next image' })).toBeTruthy();
  expect(screen.getByTestId('storefront-gallery-lightbox-counter').textContent).toBe('2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Previous image' }));
  fireEvent.click(screen.getByRole('button', { name: 'Next image' }));
  fireEvent.keyDown(window, { key: 'ArrowLeft' });
  fireEvent.keyDown(window, { key: 'ArrowRight' });
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(onNavigate.mock.calls.map(([direction]) => direction)).toEqual(['previous', 'next', 'previous', 'next']);
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('hides navigation and the counter for a single image', () => {
  render(<StorefrontGalleryLightbox open images={[images[0]]} currentIndex={0} onClose={vi.fn()} onNavigate={vi.fn()} />);

  expect(screen.queryByRole('button', { name: 'Previous image' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Next image' })).toBeNull();
  expect(screen.queryByTestId('storefront-gallery-lightbox-counter')).toBeNull();
  expect(screen.getByRole('button', { name: 'Close image viewer' })).toBeTruthy();
});
