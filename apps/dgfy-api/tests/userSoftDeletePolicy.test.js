import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import {
  updateUserRole,
  toggleUserStatus,
  updateUserPermissions,
  updateUserPermissionsAI,
  updateUserLocationGrants,
  removeUserFromCompany,
  getUsersForExport
} from '../src/services/userService.js';

describe('userService soft-delete policy', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns 404 when role target user is soft-deleted', async () => {
    const User = { findOne: jest.fn().mockResolvedValue(null) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await expect(updateUserRole(1, 2, { role: 'manager' })).rejects.toMatchObject({
      statusCode: 404,
      message: 'Target user not found',
    });

    const args = User.findOne.mock.calls[0][0];
    expect(args.where.user_id).toBe(2);
    expect(args.where.deleted_at).toBeNull();
  });

  it('returns 404 when remove target user is already soft-deleted', async () => {
    const User = {
      findOne: jest.fn()
        .mockResolvedValueOnce({
          user_id: 1,
          role: 'admin',
          is_master_admin: false,
        })
        .mockResolvedValueOnce(null),
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await expect(removeUserFromCompany(1, 2)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Target user not found',
    });
  });

  it('excludes soft-deleted users from export query', async () => {
    const User = { findAll: jest.fn().mockResolvedValue([]) };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await getUsersForExport();

    const args = User.findAll.mock.calls[0][0];
    expect(args.where.deleted_at).toBeNull();
    expect(args.where[Op.or]).toEqual([
      { invitation_status: null },
      { invitation_status: 'accepted' },
    ]);
  });

  it.each([
    ['pending'],
    ['cancelled'],
    ['expired'],
  ])('blocks role edits for %s invitation rows', async (invitationStatus) => {
    const targetUser = {
      user_id: 2,
      role: 'staff',
      invitation_status: invitationStatus,
      is_active: false,
      update: jest.fn()
    };
    const adminUser = {
      user_id: 1,
      role: 'admin',
      is_master_admin: true,
      invitation_status: 'accepted'
    };
    const User = {
      findOne: jest.fn()
        .mockResolvedValueOnce(targetUser)
        .mockResolvedValueOnce(adminUser)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await expect(updateUserRole(1, 2, { role: 'manager' })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cannot change role until the invitation is accepted'
    });
    expect(targetUser.update).not.toHaveBeenCalled();
  });

  it('blocks status edits for invitation rows', async () => {
    const adminUser = {
      user_id: 1,
      role: 'admin',
      is_master_admin: true,
      invitation_status: 'accepted'
    };
    const targetUser = {
      user_id: 2,
      role: 'staff',
      invitation_status: 'pending',
      is_active: false,
      update: jest.fn()
    };
    const User = {
      findOne: jest.fn()
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(targetUser)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await expect(toggleUserStatus(1, 2, true)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cannot change status until the invitation is accepted'
    });
    expect(targetUser.update).not.toHaveBeenCalled();
  });

  it('blocks permission edits for invitation rows from admin UI and AI paths', async () => {
    const adminUser = {
      user_id: 1,
      role: 'admin',
      is_master_admin: true,
      invitation_status: 'accepted'
    };
    const targetUser = {
      user_id: 2,
      role: 'staff',
      invitation_status: 'pending',
      is_active: false,
      update: jest.fn(),
      reload: jest.fn()
    };
    const User = {
      findOne: jest.fn()
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(targetUser)
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(targetUser)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      return {};
    });

    await expect(updateUserPermissions(1, 2, ['items:view'], false)).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cannot change permissions until the invitation is accepted'
    });
    await expect(updateUserPermissionsAI(1, 2, ['items:view'])).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cannot change permissions until the invitation is accepted'
    });
    expect(targetUser.update).not.toHaveBeenCalled();
  });

  it('blocks location scope edits for invitation rows', async () => {
    const adminUser = {
      user_id: 1,
      role: 'admin',
      is_master_admin: true,
      invitation_status: 'accepted'
    };
    const targetUser = {
      user_id: 2,
      role: 'staff',
      invitation_status: 'pending',
      is_active: false,
      update: jest.fn()
    };
    const User = {
      findOne: jest.fn()
        .mockResolvedValueOnce(adminUser)
        .mockResolvedValueOnce(targetUser)
    };

    jest.spyOn(dbStore, 'get').mockImplementation((name) => {
      if (name === 'User') return User;
      if (name === 'UserLocationGrant') return {};
      if (name === 'TenantLocation') return {};
      return {};
    });

    await expect(updateUserLocationGrants(1, 2, [1])).rejects.toMatchObject({
      statusCode: 409,
      message: 'Cannot change location scope until the invitation is accepted'
    });
  });
});
