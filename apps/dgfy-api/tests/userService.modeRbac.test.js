import { jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import {
  importUsersFromCSV,
  updateUserRole
} from '../src/services/userService.js';

const createTransaction = () => ({
  finished: false,
  commit: jest.fn(function commit() {
    this.finished = 'commit';
    return Promise.resolve();
  }),
  rollback: jest.fn(function rollback() {
    this.finished = 'rollback';
    return Promise.resolve();
  })
});

const createUser = (overrides = {}) => ({
  user_id: 2,
  username: 'target',
  email: 'target@example.com',
  role: 'staff',
  role_preset_key: null,
  permissions: [],
  is_active: true,
  is_master_admin: false,
  invitation_status: 'accepted',
  deleted_at: null,
  update: jest.fn(async function update(values) {
    Object.assign(this, values);
    return this;
  }),
  reload: jest.fn(async function reload() {
    return this;
  }),
  ...overrides
});

const createDbMocks = ({ userById = {}, userByEmail = null, activeLocationIds = [1, 2] } = {}) => {
  const transaction = createTransaction();
  const sequelize = {
    transaction: jest.fn().mockResolvedValue(transaction)
  };
  const SystemSetting = {
    findOne: jest.fn().mockResolvedValue({
      setting_key: 'ops_workflow_mode',
      setting_value: 'services',
      data_type: 'string'
    })
  };
  const User = {
    findOne: jest.fn(async ({ where }) => {
      if (where?.email) return userByEmail;
      return userById[Number(where?.user_id)] || null;
    }),
    create: jest.fn(async (values) => createUser({
      user_id: 99,
      username: values.username,
      email: values.email,
      role: values.role,
      role_preset_key: values.role_preset_key,
      permissions: values.permissions,
      invitation_status: values.invitation_status,
      is_active: values.is_active
    }))
  };
  const TenantLocation = {
    count: jest.fn().mockResolvedValue(activeLocationIds.length),
    findAll: jest.fn().mockResolvedValue(activeLocationIds.map((location_id) => ({ location_id })))
  };
  const UserLocationGrant = {
    count: jest.fn().mockResolvedValue(0),
    destroy: jest.fn().mockResolvedValue(1),
    bulkCreate: jest.fn().mockResolvedValue([])
  };

  jest.spyOn(dbStore, 'getStore').mockReturnValue({
    sequelize,
    tenantId: 'default',
    tenantName: 'Test Tenant'
  });
  jest.spyOn(dbStore, 'get').mockImplementation((name) => {
    if (name === 'User') return User;
    if (name === 'SystemSetting') return SystemSetting;
    if (name === 'TenantLocation') return TenantLocation;
    if (name === 'UserLocationGrant') return UserLocationGrant;
    if (name === 'sequelize') return sequelize;
    return null;
  });

  return {
    sequelize,
    transaction,
    SystemSetting,
    User,
    TenantLocation,
    UserLocationGrant
  };
};

describe('userService mode-aware RBAC persistence', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('updates role preset and location grants in one transaction', async () => {
    const admin = createUser({
      user_id: 1,
      username: 'admin',
      role: 'admin',
      is_master_admin: true
    });
    const target = createUser({ user_id: 2 });
    const { transaction, UserLocationGrant } = createDbMocks({
      userById: {
        1: admin,
        2: target
      },
      activeLocationIds: [1, 2, 3]
    });

    const result = await updateUserRole(1, 2, {
      role_preset_key: 'services_scheduler',
      location_ids: [1, '3', 3]
    });

    expect(target.update).toHaveBeenCalledWith(expect.objectContaining({
      role: 'staff',
      role_preset_key: 'services_scheduler',
      permissions: expect.arrayContaining([
        'services:bookings:manage',
        'services:waitlist:manage'
      ])
    }), { transaction });
    expect(UserLocationGrant.destroy).toHaveBeenCalledWith({
      where: { user_id: 2 },
      transaction
    });
    expect(UserLocationGrant.bulkCreate).toHaveBeenCalledWith([
      { user_id: 2, location_id: 1, created_by: 1 },
      { user_id: 2, location_id: 3, created_by: 1 }
    ], { transaction });
    expect(transaction.commit).toHaveBeenCalledTimes(1);
    expect(transaction.rollback).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      role_preset_key: 'services_scheduler',
      role_preset_status: 'current'
    }));
  });

  it('rejects explicit empty location ids for assigned-scope presets in multi-location tenants', async () => {
    const admin = createUser({
      user_id: 1,
      username: 'admin',
      role: 'admin',
      is_master_admin: true
    });
    const target = createUser({ user_id: 2 });
    const { sequelize, UserLocationGrant } = createDbMocks({
      userById: {
        1: admin,
        2: target
      },
      activeLocationIds: [1, 2]
    });

    await expect(updateUserRole(1, 2, {
      role_preset_key: 'services_scheduler',
      location_ids: []
    })).rejects.toMatchObject({
      statusCode: 422
    });

    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(UserLocationGrant.destroy).not.toHaveBeenCalled();
  });

  it('rejects retired direct CSV invitations before creating tenant users', async () => {
    const admin = createUser({
      user_id: 1,
      username: 'admin',
      role: 'admin',
      is_master_admin: true
    });
    const { User, UserLocationGrant } = createDbMocks({
      userById: {
        1: admin
      },
      activeLocationIds: [1, 2, 3]
    });

    const result = await importUsersFromCSV([
      {
        email: 'scheduler@example.com',
        role_preset_key: 'services_scheduler',
        locations: '1;3',
        delivery_mode: 'manual'
      }
    ], 1);

    expect(result.errors).toEqual([expect.objectContaining({
      email: 'scheduler@example.com',
      error: expect.stringContaining('Direct user invitation links have been retired')
    })]);
    expect(result.invited).toEqual([]);
    expect(User.create).not.toHaveBeenCalled();
    expect(UserLocationGrant.bulkCreate).not.toHaveBeenCalled();
  });
});
