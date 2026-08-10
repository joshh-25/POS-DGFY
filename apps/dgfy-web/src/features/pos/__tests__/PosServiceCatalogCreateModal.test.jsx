/** @vitest-environment jsdom */

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import PosServiceCatalogCreateModal from '../components/PosServiceCatalogCreateModal.jsx';
import { createServiceCatalogEntry } from '../../services/api/servicesApi.js';

vi.mock('../../services/api/servicesApi.js', () => ({
  createServiceCatalogEntry: vi.fn()
}));

vi.mock('../../../utils/iminRuntimeFeedback.js', () => ({
  posToast: { success: vi.fn(), error: vi.fn() }
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PosServiceCatalogCreateModal', () => {
  it('creates a service through the Services API and reports it to the POS catalog', async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    createServiceCatalogEntry.mockResolvedValue({ item_id: 41, name: 'Wash and Fold' });

    render(<PosServiceCatalogCreateModal open isOnline onCreated={onCreated} onClose={onClose} />);

    fireEvent.change(screen.getByLabelText('Service Name'), { target: { value: ' Wash and Fold ' } });
    fireEvent.change(screen.getByLabelText('Price'), { target: { value: '250' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Service' }));

    await waitFor(() => expect(createServiceCatalogEntry).toHaveBeenCalledTimes(1));
    expect(createServiceCatalogEntry).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Wash and Fold',
      default_sale_price: 250,
      unit_of_measure: 'service',
      visible_in_pos: true
    }));
    expect(onCreated).toHaveBeenCalledWith({ item_id: 41, name: 'Wash and Fold' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('blocks service creation while offline', () => {
    render(<PosServiceCatalogCreateModal open isOnline={false} />);

    expect(screen.getByText('Service creation is available online only.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create Service' }).hasAttribute('disabled')).toBe(true);
    expect(createServiceCatalogEntry).not.toHaveBeenCalled();
  });
});
