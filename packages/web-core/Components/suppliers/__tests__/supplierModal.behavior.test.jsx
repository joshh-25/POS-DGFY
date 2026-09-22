// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SupplierDetailsModal from '../SupplierDetailsModal.jsx';
import SupplierFormModal from '../SupplierFormModal.jsx';

vi.mock('@/components/SupplierScorecard', () => ({ default: () => null }));
vi.mock('@/hooks/useItems.js', () => ({
  useItems: () => ({ items: [], loading: false })
}));
vi.mock('@/src/features/settings/WorkflowModeContext.jsx', () => ({
  useWorkflowMode: () => ({ workflowMode: 'retail' })
}));
vi.mock('@/components/ui/ConfirmationDialog', () => ({ default: () => null }));

afterEach(() => {
  cleanup();
  document.body.style.overflow = 'unset';
});

const supplier = {
  supplier_id: 'supplier-1',
  name: 'Premium Foods',
  contact_person: 'Alex Cruz',
  email: 'alex@example.test',
  phone: '+63 900 000 0000',
  address: 'Manila',
  status: 'active',
  quality_rating: 4.5,
  avg_delivery_days: 3,
  items_supplied: [],
  bulk_discounts: []
};

describe('Supplier modal behavior', () => {
  it('provides an explicit close action for supplier details', () => {
    const onClose = vi.fn();

    render(
      <MemoryRouter>
        <SupplierDetailsModal supplier={supplier} open onClose={onClose} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close supplier details' }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('keeps the supplier form open until an async save succeeds', async () => {
    let resolveSave;
    const onSave = vi.fn(() => new Promise((resolve) => {
      resolveSave = resolve;
    }));
    const onClose = vi.fn();

    render(
      <SupplierFormModal
        open
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Supplier' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Close supplier form' }).disabled).toBe(true);

    resolveSave(true);
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('keeps the supplier form open when the save reports failure', async () => {
    const onSave = vi.fn().mockResolvedValue(false);
    const onClose = vi.fn();

    render(
      <SupplierFormModal
        open
        onClose={onClose}
        onSave={onSave}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Supplier' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(false));

    expect(onClose).not.toHaveBeenCalled();
  });
});
