import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMock = vi.hoisted(() => ({
  put: vi.fn()
}));

vi.mock('../api.js', () => ({ default: apiMock }));
vi.mock('../browserSession.js', () => ({ setBrowserSession: vi.fn() }));

import { updateUserPermissions } from '../userService.js';

describe('userService Day Close access', () => {
  beforeEach(() => {
    apiMock.put.mockReset();
  });

  it('updates only the supplied permission list without changing master-admin state', async () => {
    apiMock.put.mockResolvedValue({
      data: {
        data: {
          user_id: 17,
          permissions: ['pos:view', 'pos:transact', 'pos:close_day']
        }
      }
    });

    await expect(updateUserPermissions(17, ['pos:view', 'pos:transact', 'pos:close_day']))
      .resolves.toEqual({
        user_id: 17,
        permissions: ['pos:view', 'pos:transact', 'pos:close_day']
      });

    expect(apiMock.put).toHaveBeenCalledWith('/users/17/permissions', {
      permissions: ['pos:view', 'pos:transact', 'pos:close_day']
    });
  });
});
