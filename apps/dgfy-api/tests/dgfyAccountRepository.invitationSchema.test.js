import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dgfyAccountRepository, { ensureTenantUserInvitationSchema } from '../src/modules/dgfy/repositories/dgfyAccountRepository.js';
import { DgfyAccountTenantMembership, UserTenantMapping } from '../src/models/index.js';

afterEach(() => {
  jest.restoreAllMocks();
});

describe('DGFY account repository invitation schema guard', () => {
  it('adds missing tenant user invitation columns and widens invitation enums before membership actions', async () => {
    const addColumn = jest.fn(async () => {});
    const changeColumn = jest.fn(async () => {});
    const sequelizeInstance = {
      getQueryInterface: () => ({
        describeTable: jest.fn(async () => ({
          user_id: {},
          username: {},
          email: {},
          password_hash: {},
          role: {}
        })),
        addColumn,
        changeColumn
      })
    };

    await ensureTenantUserInvitationSchema(sequelizeInstance);

    expect(addColumn).toHaveBeenCalledWith('users', 'invitation_status', expect.objectContaining({
      allowNull: true
    }));
    expect(addColumn).toHaveBeenCalledWith('users', 'invitation_accepted_at', expect.objectContaining({
      allowNull: true
    }));
    expect(addColumn).toHaveBeenCalledWith('users', 'invitation_cancelled_at', expect.objectContaining({
      allowNull: true
    }));
    expect(addColumn).toHaveBeenCalledWith('users', 'role_preset_key', expect.objectContaining({
      allowNull: true
    }));
    expect(changeColumn).toHaveBeenCalledWith('users', 'role', expect.objectContaining({
      allowNull: true,
      defaultValue: 'staff'
    }));
    expect(changeColumn).toHaveBeenCalledWith('users', 'invitation_status', expect.objectContaining({
      allowNull: true
    }));
  });

  it('does not add columns that already exist', async () => {
    const addColumn = jest.fn(async () => {});
    const changeColumn = jest.fn(async () => {});
    const sequelizeInstance = {
      getQueryInterface: () => ({
        describeTable: jest.fn(async () => ({
          user_id: {},
          username: {},
          email: {},
          phone_number: {},
          password_hash: {},
          role: {},
          role_preset_key: {},
          permissions: {},
          is_master_admin: {},
          invitation_token: {},
          invitation_expires_at: {},
          invited_by: {},
          invitation_status: {},
          invitation_delivery_status: {},
          invitation_delivery_error: {},
          invitation_last_sent_at: {},
          invitation_accepted_at: {},
          invitation_cancelled_at: {},
          invitation_cancelled_by: {},
          deleted_at: {},
          deleted_by: {}
        })),
        addColumn,
        changeColumn
      })
    };

    await ensureTenantUserInvitationSchema(sequelizeInstance);

    expect(addColumn).not.toHaveBeenCalled();
    expect(changeColumn).toHaveBeenCalledTimes(2);
  });

  it('does not resurrect an existing removed membership from a legacy mapping', async () => {
    const account = {
      id: 'dgfy-account-1',
      email: 'gutojoshua.hubomoto@gmail.com',
      email_verified_at: new Date()
    };
    const tenant = {
      id: 'tenant-old-company',
      status: 'active'
    };
    const findAll = jest.spyOn(UserTenantMapping, 'findAll').mockResolvedValue([{ tenant }]);
    const findOne = jest.spyOn(DgfyAccountTenantMembership, 'findOne').mockResolvedValue({
      id: 22,
      status: 'removed',
      source: 'founder'
    });
    const upsertFounderMembership = jest.spyOn(dgfyAccountRepository, 'upsertFounderMembership');

    const mirrored = await dgfyAccountRepository.mirrorLegacyFounderMembershipsForAccount(account);

    expect(mirrored).toEqual([]);
    expect(findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { email: account.email } }));
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        dgfy_account_id: account.id,
        tenant_id: tenant.id
      },
      attributes: ['id', 'status', 'source']
    }));
    expect(upsertFounderMembership).not.toHaveBeenCalled();
  });
});
