import { describe, expect, it, jest } from '@jest/globals';
import { ensureTenantUserInvitationSchema } from '../src/modules/dgfy/repositories/dgfyAccountRepository.js';

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
});
