/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { StorefrontReviewsSection } from './StorefrontReviewsSection.jsx';

afterEach(cleanup);

it('uses the shared customer-facing review copy for an empty section', () => {
  render(<StorefrontReviewsSection isMobileViewport={false} viewportWidth={1440} onWriteReview={vi.fn()} />);

  expect(screen.getByRole('heading', { name: 'Reviews' })).toBeTruthy();
  expect(screen.getByText('See what customers are saying')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Write a Review' })).toBeTruthy();
  expect(screen.getByRole('heading', { name: 'No reviews yet' })).toBeTruthy();
  expect(screen.getByText('Be the first to share your experience with this store.')).toBeTruthy();
  expect(screen.queryByText(/SKUpervisor/i)).toBeNull();
});
