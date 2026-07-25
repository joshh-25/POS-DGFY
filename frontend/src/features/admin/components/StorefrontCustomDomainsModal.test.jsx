// @vitest-environment jsdom

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StorefrontCustomDomainsModal from './StorefrontCustomDomainsModal.jsx';

const mocks = vi.hoisted(() => ({
  listStorefrontDomains: vi.fn(),
  createStorefrontDomain: vi.fn()
}));

vi.mock('@/services/adminService', () => ({
  listStorefrontDomains: mocks.listStorefrontDomains,
  createStorefrontDomain: mocks.createStorefrontDomain
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}));

describe('StorefrontCustomDomainsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listStorefrontDomains.mockResolvedValue({
      success: true,
      data: { domains: [], operations: [], limits: { canonical: 1, aliases: 5 } }
    });
    mocks.createStorefrontDomain.mockResolvedValue({
      success: true,
      data: {
        domain: { id: 'domain-1', hostname: 'grandmatador.com', status: 'pending_dns' },
        dns: {
          verification_name: '_dgfy-verification.grandmatador.com',
          verification_value: 'dgfy-secret-once',
          route_a: '203.0.113.10'
        }
      }
    });
  });

  it('loads the selected tenant and registers a canonical hostname with an audit reason', async () => {
    render(
      <StorefrontCustomDomainsModal
        open
        tenant={{ id: 'tenant-1', name: 'Grand Matador' }}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Grand Matador')).toBeTruthy();
    expect(await screen.findByText('No custom domain registered')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Hostname'), { target: { value: 'grandmatador.com' } });
    fireEvent.change(screen.getByLabelText('Audit reason'), { target: { value: 'Grand Matador pilot' } });
    fireEvent.click(screen.getByRole('button', { name: 'Register domain' }));

    await waitFor(() => {
      expect(mocks.createStorefrontDomain).toHaveBeenCalledWith('tenant-1', {
        hostname: 'grandmatador.com',
        role: 'canonical',
        canonical_domain_id: null,
        reason: 'Grand Matador pilot'
      });
    });
    expect(await screen.findByText('DNS instructions — copy now')).toBeTruthy();
    expect(screen.getByText('dgfy-secret-once')).toBeTruthy();
  });

  it('marks localhost records as local previews and hides production lifecycle actions', async () => {
    mocks.listStorefrontDomains.mockResolvedValue({
      success: true,
      data: {
        domains: [{
          id: 'local-domain',
          hostname: 'grandmatador.localhost',
          role: 'canonical',
          status: 'active',
          last_dns_checked_at: '2026-07-23T04:23:27.000Z'
        }],
        operations: [],
        limits: { canonical: 1, aliases: 5 }
      }
    });

    render(
      <StorefrontCustomDomainsModal
        open
        tenant={{ id: 'tenant-1', name: 'Grand Matador' }}
        onClose={vi.fn()}
      />
    );

    expect(await screen.findByText('Local preview')).toBeTruthy();
    expect(screen.getByText(/TLS expires: Not required locally/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Check DNS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suspend' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull();
    expect(screen.getByRole('link', { name: 'View Store' }).getAttribute('href'))
      .toBe('http://grandmatador.localhost:5175');
  });
});
