import { jest } from '@jest/globals';
import { Op } from 'sequelize';
import dbStore from '../src/utils/dbStore.js';
import {
  updateUserRole,
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
});
