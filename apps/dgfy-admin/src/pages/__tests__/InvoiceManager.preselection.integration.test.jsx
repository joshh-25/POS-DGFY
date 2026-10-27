/** @vitest-environment jsdom */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InvoiceManager from '../../../Pages/InvoiceManager.jsx';

const mocks = vi.hoisted(() => ({
  listPlatformInvoices: vi.fn(),
  listEligiblePlatformInvoiceApplications: vi.fn(),
  createPlatformInvoiceDraft: vi.fn()
}));

vi.mock('@/services/adminService', () => mocks);

const application = (id, tenantId = 'tenant-1', name = 'North Market') => ({
  id,
  tenant: { id: tenantId, name },
  registration_email_snapshot: 'ops@example.test'
});

const renderInvoices = (search) => render(
  <MemoryRouter initialEntries={[`/admin/invoices${search}`]}>
    <InvoiceManager />
  </MemoryRouter>
);

describe('Invoice Manager tenant/application preselection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listPlatformInvoices.mockResolvedValue({ data: [] });
    mocks.listEligiblePlatformInvoiceApplications.mockResolvedValue({ data: [] });
  });

  afterEach(cleanup);

  it('selects a matching eligible application only after authorized data loads and performs no mutation', async () => {
    mocks.listEligiblePlatformInvoiceApplications.mockResolvedValue({ data: [application('application-1')] });
    renderInvoices('?tenant_id=tenant-1&registration_application_id=application-1');

    expect((await screen.findByRole('status')).textContent).toMatch(/still requires an explicit submit/);
    expect(screen.getByLabelText('Approved company').value).toBe('application-1');
    expect(mocks.createPlatformInvoiceDraft).not.toHaveBeenCalled();
  });

  it('rejects mismatched application IDs and leaves the selector unset', async () => {
    mocks.listEligiblePlatformInvoiceApplications.mockResolvedValue({ data: [application('application-2', 'other-tenant')] });
    renderInvoices('?tenant_id=tenant-1&registration_application_id=application-2');

    expect((await screen.findByRole('status')).textContent).toMatch(/does not belong to the requested tenant/);
    expect(screen.getByLabelText('Approved company').value).toBe('');
    expect(mocks.createPlatformInvoiceDraft).not.toHaveBeenCalled();
  });

  it('selects one unique tenant application but requires manual selection for ambiguous matches', async () => {
    mocks.listEligiblePlatformInvoiceApplications.mockResolvedValueOnce({ data: [application('application-unique')] });
    const uniqueView = renderInvoices('?tenant_id=tenant-1');
    expect((await screen.findByRole('status')).textContent).toMatch(/unique eligible registration application/);
    expect(screen.getByLabelText('Approved company').value).toBe('application-unique');

    uniqueView.unmount();
    mocks.listEligiblePlatformInvoiceApplications.mockResolvedValueOnce({ data: [application('application-a'), application('application-b')] });
    renderInvoices('?tenant_id=tenant-1');
    expect((await screen.findByRole('status')).textContent).toMatch(/More than one eligible registration application/);
    expect(screen.getByLabelText('Approved company').value).toBe('');
    expect(mocks.createPlatformInvoiceDraft).not.toHaveBeenCalled();
  });
});
