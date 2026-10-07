/* @vitest-environment jsdom */
import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestJson } from '../services/requestJson.js';
import { LaundryStorefrontCatalog } from '../modes/laundry/storefront/LaundryStorefrontCatalog.jsx';

vi.mock('../services/requestJson.js', () => ({ requestJson: vi.fn() }));

const store = { slug: 'clean-place', workflow_mode: 'laundry' };

const renderLaundry = ({ catalog, customerName = '', customerEmail = '', customerPhone = '' }) => render(
  <LaundryStorefrontCatalog
    catalog={catalog}
    selectedStore={store}
    locationId="branch-1"
    customerName={customerName}
    customerEmail={customerEmail}
    customerPhone={customerPhone}
  />
);

describe('LaundryStorefrontCatalog', () => {
  beforeEach(() => {
    requestJson.mockReset();
    requestJson.mockImplementation(async (url) => {
      if (url.includes('/availability')) return { payload: { online: true } };
      return {};
    });
  });
  afterEach(cleanup);

  it.each([
    ['guest', {}],
    ['signed-in Store customer', { customerName: 'Pat Customer', customerEmail: 'pat@example.test', customerPhone: '+639123456789' }]
  ])('renders and submits a per-kilo order for a %s', async (_actor, identity) => {
    requestJson.mockImplementation(async (url, options = {}) => {
      if (url.includes('/availability')) return { payload: { online: true } };
      if (url === '/api/v1/store/laundry/orders') return {
        externalOrderReference: 'DGL-ORDER-1', externalTrackingReference: 'secret-tracking-reference-1'
      };
      return {};
    });
    renderLaundry({
      ...identity,
      catalog: [{ id: 'wash-fold', name: 'Wash and fold', pricingMode: 'per_kilo', unitAmountCentavos: 7500 }]
    });

    fireEvent.change(screen.getByLabelText('Estimated kg'), { target: { value: '2' } });
    await waitFor(() => expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('/availability'), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: 'Submit laundry order' }));

    await screen.findByText(/Laundry order submitted/);
    expect(requestJson).toHaveBeenCalledWith('/api/v1/store/laundry/orders', expect.objectContaining({
      method: 'POST',
      body: expect.objectContaining({ mode: 'per_kilo', lines: [expect.objectContaining({ variantId: 'wash-fold', quantity: 2 })] })
    }));
    expect(requestJson).not.toHaveBeenCalledWith('/api/v1/commerce-payments/dglaundry/booking-groups/payment-sessions', expect.anything());
    expect(screen.getByText('Order reference: DGL-ORDER-1')).toBeTruthy();
    expect(screen.getByText('Private tracking key: secret-tracking-reference-1')).toBeTruthy();
  });

  it('shows the honest unavailable state when fixed-price payment is dark-disabled', async () => {
    requestJson.mockImplementation(async (url) => {
      if (url.includes('/availability')) return { payload: { online: true } };
      const error = new Error('DGLaundry booking payments are dark-disabled.');
      error.status = 503;
      throw error;
    });
    renderLaundry({ catalog: [{ id: 'comforter', name: 'Comforter wash', pricingMode: 'fixed', unitAmountCentavos: 45000 }] });

    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1' } });
    await waitFor(() => expect(requestJson).toHaveBeenCalledWith(expect.stringContaining('/availability'), expect.any(Object)));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    expect((await screen.findByRole('status')).textContent).toContain('Online payment for fixed-price laundry items is not available yet. Your order was not submitted.');
    expect(requestJson).toHaveBeenCalledWith('/api/v1/commerce-payments/dglaundry/booking-groups/payment-sessions', expect.objectContaining({ method: 'POST' }));
    expect(requestJson).not.toHaveBeenCalledWith('/api/v1/store/laundry/orders', expect.anything());
  });
});
