import { beforeEach, describe, expect, it, vi } from 'vitest';

import { listDgfyAccountCompaniesForTenantSession } from '../../../../../../../packages/web-core/src/services/dgfyAuthService.js';
import { requestJson } from '../../services/requestJson.js';
import { fetchStorefrontAccountBranches } from './storefrontAccountBranches.js';

vi.mock('../../../../../../../packages/web-core/src/services/dgfyAuthService.js', () => ({
  listDgfyAccountCompaniesForTenantSession: vi.fn()
}));

vi.mock('../../services/requestJson.js', () => ({
  requestJson: vi.fn()
}));

describe('fetchStorefrontAccountBranches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('excludes owned stores with a different workflow mode', async () => {
    listDgfyAccountCompaniesForTenantSession.mockResolvedValue({
      owned_companies: [
        { tenant_id: 'laundry-tenant', company_name: 'Laundry Store' },
        { tenant_id: 'laundry-tenant-2', company_name: 'Laundry Store 2' },
        { tenant_id: 'fnb-tenant', company_name: 'F&B Store' }
      ]
    });
    requestJson.mockResolvedValue({
      stores: [
        { tenant_id: 'laundry-tenant', slug: 'laundry-store', workflow_mode: 'services' },
        { tenant_id: 'laundry-tenant-2', slug: 'laundry-store-2', workflow_mode: 'services' },
        { tenant_id: 'fnb-tenant', slug: 'fnb-store', workflow_mode: 'fnb' }
      ]
    });

    const branches = await fetchStorefrontAccountBranches({
      currentTenantId: 'laundry-tenant',
      currentSlug: 'laundry-store',
      currentName: 'Laundry Store',
      workflowMode: 'services'
    });

    expect(branches.map((branch) => branch.slug)).toEqual(['laundry-store', 'laundry-store-2']);
  });
});
