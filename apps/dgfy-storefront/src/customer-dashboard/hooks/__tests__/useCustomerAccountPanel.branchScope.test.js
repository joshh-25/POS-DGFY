/** @vitest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_ACCOUNT_PANEL } from '../../../tracking/accountActivity.js';
import { deriveAccountActivityCollections } from '../../../tracking/accountActivity.js';
import { useCustomerAccountPanel } from '../useCustomerAccountPanel.js';

const buildProps = (overrides = {}) => ({
  EMPTY_ACCOUNT_PANEL,
  selectedStore: { slug: 'cafe-main', tenant_name: 'Cafe Main' },
  selectedLocation: { location_id: 7, name: 'Downtown' },
  selectedLocationId: 7,
  knownStoreRouteCandidates: [],
  isDgfyCustomerSignedIn: true,
  dgfySessionAccount: { id: 'account-1' },
  setDgfySessionAccount: vi.fn(),
  setDgfyAuthTokenState: vi.fn(),
  requestJson: vi.fn((path) => {
    if (path.includes('/activities')) return Promise.resolve({ activities: [] });
    if (path.includes('/auth/me')) return Promise.resolve({ account: { id: 'account-1' } });
    if (path.includes('/dashboard')) return Promise.resolve({});
    return Promise.resolve({});
  }),
  normalizeStorefrontErrorMessage: (error, fallback) => error?.message || fallback,
  deriveAccountActivityCollections,
  readDgfyAuthToken: () => 'dgfy-token',
  readStoreAuthToken: () => '',
  clearDgfyAuthToken: vi.fn(),
  ...overrides
});

describe('useCustomerAccountPanel branch scope', () => {
  it('sends the selected store and branch to global customer history', async () => {
    const requestJson = vi.fn((path) => {
      if (path.includes('/activities')) return Promise.resolve({ activities: [] });
      if (path.includes('/auth/me')) return Promise.resolve({ account: { id: 'account-1' } });
      if (path.includes('/dashboard')) return Promise.resolve({});
      return Promise.resolve({});
    });
    const { result } = renderHook(() => useCustomerAccountPanel(buildProps({ requestJson })));

    await waitFor(() => expect(result.current.accountPanel.loading).toBe(false));

    expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/dgfy/customer/activities?limit=100&store_slug=cafe-main&location_id=7',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(result.current.accountPanel.orderHistoryScope).toEqual(expect.objectContaining({
      mode: 'branch',
      label: 'Cafe Main · Downtown'
    }));
  });

  it('keeps the main DGFY account history global when a stale store remains selected', async () => {
    const requestJson = vi.fn((path) => {
      if (path.includes('/activities')) return Promise.resolve({ activities: [] });
      if (path.includes('/auth/me')) return Promise.resolve({ account: { id: 'account-1' } });
      if (path.includes('/dashboard')) return Promise.resolve({});
      return Promise.resolve({});
    });
    const { result } = renderHook(() => useCustomerAccountPanel(buildProps({ requestJson, isGlobalAccountPage: true })));

    await waitFor(() => expect(result.current.accountPanel.loading).toBe(false));

    expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/dgfy/customer/activities?limit=100',
      expect.objectContaining({ cache: 'no-store' })
    );
    expect(result.current.accountPanel.orderHistoryScope).toEqual(expect.objectContaining({
      mode: 'all_stores',
      label: 'All stores'
    }));
  });

  it('does not let a late old-scope response replace the current branch', async () => {
    let resolveOld;
    const oldResponse = new Promise((resolve) => { resolveOld = resolve; });
    const requestJson = vi.fn((path) => {
      if (path.includes('/activities')) {
        return path.includes('location_id=7')
          ? oldResponse
          : Promise.resolve({ activities: [{ reference: 'SK-NEW', type: 'order', store_slug: 'cafe-main', location_id: 8 }] });
      }
      if (path.includes('/auth/me')) return Promise.resolve({ account: { id: 'account-1' } });
      if (path.includes('/dashboard')) return Promise.resolve({});
      return Promise.resolve({});
    });
    const initialProps = buildProps({ requestJson });
    const { result, rerender } = renderHook((props) => useCustomerAccountPanel(props), { initialProps });

    await waitFor(() => expect(requestJson).toHaveBeenCalledWith(
      '/api/v1/dgfy/customer/activities?limit=100&store_slug=cafe-main&location_id=7',
      expect.anything()
    ));
    rerender({ ...initialProps, selectedLocation: { location_id: 8, name: 'Uptown' }, selectedLocationId: 8 });
    await waitFor(() => expect(result.current.accountPanel.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'SK-NEW' })
    ])));

    await act(async () => {
      resolveOld({ activities: [{ reference: 'SK-OLD', type: 'order', store_slug: 'cafe-main', location_id: 7 }] });
    });
    expect(result.current.accountPanel.orders).toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'SK-NEW' })
    ]));
    expect(result.current.accountPanel.orders).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ reference: 'SK-OLD' })
    ]));
  });
});
