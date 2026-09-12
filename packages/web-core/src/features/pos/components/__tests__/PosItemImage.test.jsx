// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import PosItemImage from '../PosItemImage.jsx';
import { stagePendingPosItemImagePreview, bindPendingPosItemImagePreviewJob, completePendingPosItemImagePreview, markPendingPosItemImagePreviewFailed, resetPendingPosItemImagePreviews } from '../../services/posPendingItemImagePreviewStore.js';

const item = { item_id: 22, pos_image_url: '/uploads/old.webp', pos_image_variants: { pos_thumbnail_url: '/uploads/old144.webp' } };
beforeEach(() => { vi.useFakeTimers(); resetPendingPosItemImagePreviews(); window.dispatchEvent(new Event('auth:logout')); });
afterEach(() => { cleanup(); resetPendingPosItemImagePreviews(); vi.useRealTimers(); });

describe('shared Items / Sell image renderer', () => {
  it('shows the preview without a processing label and preserves upload failure feedback', () => {
    const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:preview' });
    const { container } = render(<PosItemImage item={item} alt="meal" />);
    expect(container.querySelector('img').getAttribute('src')).toBe('blob:preview');
    expect(screen.queryByText('Image processing')).toBeNull();
    expect(screen.queryByRole('status')).toBeNull();
    act(() => markPendingPosItemImagePreviewFailed({ itemId: 22, attemptId }));
    expect(screen.getByRole('status').textContent).toContain('Upload failed; edit to retry');
    expect(container.querySelector('img').getAttribute('src')).toBe('blob:preview');
  });

  it('keeps the loaded preview when the matching thumbnail fails, then swaps only on load', () => {
    const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:preview' });
    bindPendingPosItemImagePreviewJob({ itemId: 22, attemptId, jobId: 'job' });
    const { container } = render(<PosItemImage item={item} alt="meal" />);
    fireEvent.load(container.querySelector('img'));
    act(() => completePendingPosItemImagePreview({ itemId: 22, attemptId, jobId: 'job', url: '/uploads/new144.webp', resultUrl: '/uploads/new.webp' }));
    const candidate = container.querySelector('img[src="/uploads/new144.webp"]');
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeNull();
    expect(candidate.style.opacity).toBe('0');
    fireEvent.error(candidate);
    expect(container.querySelector('img[src="blob:preview"]')).not.toBeNull();
    act(() => vi.advanceTimersByTime(1000));
    fireEvent.load(container.querySelector('img[src="/uploads/new144.webp"]'));
    expect(container.querySelector('img[src="blob:preview"]')).toBeNull();
    expect(container.querySelector('img').getAttribute('src')).toBe('/uploads/new144.webp');
  });

  it('keeps the accepted preview across Items-to-Sell navigation while processing continues', () => {
    const attemptId = stagePendingPosItemImagePreview({ itemId: 22, url: 'blob:preview' });
    bindPendingPosItemImagePreviewJob({ itemId: 22, attemptId, jobId: 'job' });

    const itemsView = render(<PosItemImage item={item} alt="meal" />);
    expect(itemsView.container.querySelector('img').getAttribute('src')).toBe('blob:preview');

    itemsView.unmount();
    const sellView = render(<PosItemImage item={item} alt="meal" />);

    expect(sellView.container.querySelector('img').getAttribute('src')).toBe('blob:preview');
    expect(sellView.container.querySelector('[role="status"]')).toBeNull();
  });

  it('keeps the last persisted thumbnail visible when a replacement thumbnail fails before handoff', () => {
    const persistedItem = {
      item_id: 22,
      pos_image_url: '/uploads/old.webp',
      pos_image_variants: { pos_thumbnail_url: '/uploads/old144.webp' }
    };
    const replacementItem = {
      ...persistedItem,
      pos_image_url: '/uploads/new.webp',
      pos_image_variants: { pos_thumbnail_url: '/uploads/new144.webp' }
    };
    const { container, rerender } = render(<PosItemImage item={persistedItem} alt="meal" />);
    fireEvent.load(container.querySelector('img[src="/uploads/old144.webp"]'));

    rerender(<PosItemImage item={replacementItem} alt="meal" />);
    fireEvent.error(container.querySelector('img[src="/uploads/new144.webp"]'));

    expect(container.querySelector('img[src="/uploads/old144.webp"]')).not.toBeNull();
    expect(container.querySelector('img[src="/uploads/new144.webp"]')).toBeNull();
  });

  it('stops after three automatic retries and a new URL is visible without a hidden DOM flag', () => {
    const { container, rerender } = render(<PosItemImage item={item} alt="meal" />);
    for (const delay of [1000, 2000, 4000]) {
      fireEvent.error(container.querySelector('img'));
      act(() => vi.advanceTimersByTime(delay));
    }
    fireEvent.error(container.querySelector('img'));
    act(() => vi.advanceTimersByTime(60000));
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByRole('button', { name: 'Retry image' })).toBeTruthy();
    rerender(<PosItemImage item={{ item_id: 22, pos_image_url: '/uploads/replacement.webp' }} alt="meal" />);
    expect(container.querySelector('img').hidden).toBe(false);
    expect(container.querySelector('img').getAttribute('src')).toBe('/uploads/replacement.webp');
  });
});
