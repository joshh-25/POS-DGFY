/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StorefrontReviewsSettings from '../settings/StorefrontReviewsSettings.jsx';
import { listStorefrontReviews } from '../settings/storefrontReviewsService.js';

vi.mock('../settings/storefrontReviewsService.js', () => ({
  listStorefrontReviews: vi.fn()
}));

const reviews = [
  {
    review_id: 'review-1',
    reviewer_name: 'Juan D.',
    reviewer_initials: 'JD',
    rating: 5,
    comment: 'Fast delivery and everything arrived correctly.',
    submitted_at: '2026-09-12T10:24:00.000Z',
    order_reference: '#10428',
    verified_purchase: true
  },
  {
    review_id: 'review-2',
    reviewer_name: 'Maria S.',
    reviewer_initials: 'MS',
    rating: 4,
    comment: 'Good food and nice packaging.',
    submitted_at: '2026-09-10T16:15:00.000Z',
    order_reference: '#10412'
  },
  {
    review_id: 'review-3',
    reviewer_name: 'Ryan L.',
    reviewer_initials: 'RL',
    rating: 5,
    comment: 'Excellent quality as always.',
    submitted_at: '2026-09-08T01:42:00.000Z',
    order_reference: '#10398'
  }
];

beforeEach(() => {
  vi.clearAllMocks();
  listStorefrontReviews.mockResolvedValue({
    reviews,
    summary: {
      average_rating: 4.7,
      total_count: 128,
      distribution: { 1: 2, 2: 3, 3: 8, 4: 23, 5: 92 }
    }
  });
});

afterEach(cleanup);

describe('Storefront Reviews settings', () => {
  it('renders summary analytics and a read-only list by default', async () => {
    render(<StorefrontReviewsSettings tenantId="tenant-1" />);

    expect(await screen.findByRole('heading', { name: 'Reviews', exact: true })).toBeTruthy();
    expect(await screen.findByTestId('storefront-reviews-list')).toBeTruthy();
    expect(screen.getByText('Customer feedback from your storefront.')).toBeTruthy();
    expect(screen.getByText('4.7')).toBeTruthy();
    expect(screen.getByText('128')).toBeTruthy();
    expect(screen.getByText('Rating Distribution')).toBeTruthy();
    expect(screen.getByText('Juan D.')).toBeTruthy();
    expect(screen.getByText('#10428')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'List', exact: true })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cards', exact: true })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Add Review|Edit Review|Delete Review|Approve|Reject/i })).toBeNull();
  });

  it('keeps filters and the loaded dataset synchronized when switching views', async () => {
    render(<StorefrontReviewsSettings tenantId="tenant-1" />);
    await screen.findByTestId('storefront-reviews-list');

    const search = screen.getByRole('searchbox', { name: 'Search reviews' });
    const ratingFilter = screen.getByRole('combobox', { name: 'Filter reviews by rating' });
    fireEvent.change(search, { target: { value: 'Maria' } });
    fireEvent.change(ratingFilter, { target: { value: '4' } });
    fireEvent.click(screen.getAllByRole('button', { name: 'Cards', exact: true })[0]);

    expect(await screen.findByTestId('storefront-reviews-grid')).toBeTruthy();
    expect(search.value).toBe('Maria');
    expect(ratingFilter.value).toBe('4');
    expect(screen.getByText('Maria S.')).toBeTruthy();
    expect(screen.queryByText('Juan D.')).toBeNull();

    fireEvent.click(screen.getAllByRole('button', { name: 'List', exact: true })[0]);
    expect(await screen.findByTestId('storefront-reviews-list')).toBeTruthy();
    expect(screen.getByRole('searchbox', { name: 'Search reviews' }).value).toBe('Maria');
    expect(screen.getByRole('combobox', { name: 'Filter reviews by rating' }).value).toBe('4');
  });

  it('shows and clears a filtered-empty state without changing review data', async () => {
    render(<StorefrontReviewsSettings tenantId="tenant-1" />);
    await screen.findByTestId('storefront-reviews-list');

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search reviews' }), { target: { value: 'not found' } });
    expect(await screen.findByRole('heading', { name: 'No reviews found.', exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear Filters', exact: true }));
    expect(await screen.findByTestId('storefront-reviews-list')).toBeTruthy();
    expect(screen.getByText('Juan D.')).toBeTruthy();
  });
});
