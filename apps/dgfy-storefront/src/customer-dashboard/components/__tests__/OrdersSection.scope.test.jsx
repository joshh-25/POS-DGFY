/** @vitest-environment jsdom */
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OrdersSection } from '../OrdersSection.jsx';

const props = {
  activeTab: 'active',
  setActiveTab: () => {},
  inProgressOrders: [],
  completedOrders: [],
  reviews: [],
  isMobileViewport: false,
  customerTrackLoadingReference: '',
  onGetOrderDetails: undefined,
  onTrackReference: () => {},
  onOpenStorefront: () => {},
  onOpenReview: () => {},
  EmptyState: ({ title }) => <div>{title}</div>,
  StatusBadge: () => null,
  getStoreLogoUrl: () => '',
  formatDate: () => '',
  money: () => '',
  prettyStatus: (value) => value,
  theme: { text: '#111', muted: '#666', primary: '#05c', border: '#ddd', bg: '#fff', infoBg: '#eef' }
};

describe('OrdersSection history scope label', () => {
  afterEach(cleanup);

  it.each([
    [{ mode: 'all_stores', label: 'All stores' }, 'Showing: All stores'],
    [{ mode: 'store', label: 'Cafe Main · All branches' }, 'Showing: Cafe Main · All branches'],
    [{ mode: 'branch', label: 'Cafe Main · Downtown' }, 'Showing: Cafe Main · Downtown']
  ])('renders the explicit history scope', (orderHistoryScope, expected) => {
    render(<OrdersSection {...props} orderHistoryScope={orderHistoryScope} />);
    expect(screen.getByTestId('customer-order-history-scope').textContent).toContain(expected);
  });
});
