// @vitest-environment jsdom
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchStorefrontAccountBranches } from '../model/storefrontAccountBranches.js';
import { useStorefrontAccountBranches } from './useStorefrontAccountBranches.js';

vi.mock('../model/storefrontAccountBranches.js', () => ({
  fetchStorefrontAccountBranches: vi.fn()
}));

const servicesStore = {
  tenant_id: 'laundry-tenant',
  slug: 'laundry-store',
  workflow_mode: 'services',
  tenant_name: 'Laundry Store'
};

describe('useStorefrontAccountBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('hides the previous store options while the destination store is loading', async () => {
    fetchStorefrontAccountBranches
      .mockResolvedValueOnce([
        { tenantId: 'laundry-tenant', slug: 'laundry-store', name: 'Laundry Store', isCurrent: true },
        { tenantId: 'laundry-tenant-2', slug: 'laundry-store-2', name: 'Laundry Store 2', isCurrent: false }
      ])
      .mockImplementationOnce(() => new Promise(() => {}));

    const { result, rerender } = renderHook(
      (props) => useStorefrontAccountBranches(props),
      {
        initialProps: {
          isStorefrontAccountAuthenticated: true,
          selectedStore: servicesStore
        }
      }
    );

    await waitFor(() => expect(result.current.hasMultipleAccountBranches).toBe(true));

    rerender({
      isStorefrontAccountAuthenticated: true,
      selectedStore: {
        tenant_id: 'fnb-tenant',
        slug: 'fnb-store',
        workflow_mode: 'fnb',
        tenant_name: 'F&B Store'
      }
    });

    expect(result.current.accountBranches).toEqual([]);
    expect(result.current.hasMultipleAccountBranches).toBe(false);
    expect(result.current.accountBranchesLoading).toBe(true);
  });
});
