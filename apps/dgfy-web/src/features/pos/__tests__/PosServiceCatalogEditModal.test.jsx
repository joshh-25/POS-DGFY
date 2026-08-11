/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosServiceCatalogEditModal from '../components/PosServiceCatalogEditModal.jsx';
import { listServicesCatalog, updateServiceCatalogEntry } from '../../services/api/servicesApi.js';

vi.mock('../../services/api/servicesApi.js', () => ({
  listServicesCatalog: vi.fn(),
  updateServiceCatalogEntry: vi.fn()
}));

vi.mock('../../../utils/iminRuntimeFeedback.js', () => ({
  posToast: { success: vi.fn(), error: vi.fn() }
}));

const service = {
  item_id: 18,
  name: 'Wash and Fold',
  sku_code: 'SVC-18',
  default_sale_price: '250',
  cost_per_unit: null,
  status: 'active',
  service_detail: {
    duration_minutes: 45,
    service_category: 'Laundry',
    visible_in_pos: true,
    visible_in_storefront: true
  }
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PosServiceCatalogEditModal', () => {
  it('loads authoritative service details and updates without stock or mandatory cost fields', async () => {
    const onUpdated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    listServicesCatalog.mockResolvedValue({ services: [service] });
    updateServiceCatalogEntry.mockResolvedValue({ ...service, name: 'Premium Wash and Fold' });

    render(<PosServiceCatalogEditModal open isOnline serviceItem={service} onUpdated={onUpdated} onClose={onClose} />);

    await screen.findByDisplayValue('Wash and Fold');
    expect(screen.queryByLabelText('Stock Quantity')).toBeNull();
    expect(screen.queryByLabelText('Cost Price')).toBeNull();

    fireEvent.change(screen.getByLabelText('Service Name'), { target: { value: 'Premium Wash and Fold' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Service' }));

    await waitFor(() => expect(updateServiceCatalogEntry).toHaveBeenCalledTimes(1));
    expect(updateServiceCatalogEntry).toHaveBeenCalledWith(18, expect.objectContaining({
      name: 'Premium Wash and Fold',
      default_sale_price: 250,
      status: 'active'
    }));
    expect(updateServiceCatalogEntry.mock.calls[0][1]).not.toHaveProperty('current_stock');
    expect(updateServiceCatalogEntry.mock.calls[0][1]).not.toHaveProperty('cost_per_unit');
    expect(onUpdated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks service editing and does not load or submit while offline', () => {
    render(<PosServiceCatalogEditModal open isOnline={false} serviceItem={service} />);

    expect(screen.getByText('Service editing is available online only.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save Service' }).hasAttribute('disabled')).toBe(true);
    expect(listServicesCatalog).not.toHaveBeenCalled();
    expect(updateServiceCatalogEntry).not.toHaveBeenCalled();
  });

  it('shows a safe error when the POS item no longer exists in the Services catalog', async () => {
    listServicesCatalog.mockResolvedValue({ services: [] });

    render(<PosServiceCatalogEditModal open isOnline serviceItem={service} />);

    expect((await screen.findByRole('alert')).textContent).toContain('This service is no longer available in the Services catalog.');
    expect(updateServiceCatalogEntry).not.toHaveBeenCalled();
  });
});
