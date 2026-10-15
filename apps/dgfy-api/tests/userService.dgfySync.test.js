import { afterEach, describe, expect, it, jest } from '@jest/globals';
import dbStore from '../src/utils/dbStore.js';
import { comparePassword, hashPassword } from '../src/services/authService.js';

const dgfyAccountRepository = {
  findByAcceptedTenantUserMembership: jest.fn(),
  findByEmail: jest.fn(),
  transaction: jest.fn(async (callback) => callback({ id: 'dgfy-transaction' })),
  forceAssignTenantOwnership: jest.fn(),
  removeMembershipForAccount: jest.fn()
};

const landlordService = {
  findTenantById: jest.fn(),
  updateEmailTenantMapping: jest.fn()
};

const emailOtpService = {
  verifyEmailOtp: jest.fn().mockResolvedValue(true),
  EMAIL_OTP_PURPOSES: { EMAIL_CHANGE: 'email_change' }
};

jest.unstable_mockModule('../src/modules/dgfy/index.js', () => ({
  dgfyAccountRepository
}));

jest.unstable_mockModule('../src/services/landlordService.js', () => landlordService);
jest.unstable_mockModule('../src/services/emailOtpService.js', () => emailOtpService);

const { changePassword, updateUserProfile } = await import('../src/services/userService.js');

const createMutableRecord = (values) => {
  const record = {
    ...values,
    update: jest.fn(async (updates) => {
      Object.assign(record, updates);
      return record;
    })
  };
  return record;
};

const setupTenantContext = (user, tenantId = 'tenant-1') => {
  const User = {
    findOne: jest.fn()
      .mockResolvedValueOnce(user)
      .mockResolvedValue(null)
  };

  jest.spyOn(dbStore, 'getStore').mockReturnValue({ tenantId });
  jest.spyOn(dbStore, 'get').mockImplementation((name) => {
    if (name === 'User') return User;
    if (name === 'StaffRole') return null;
    return null;
  });

  return { User };
};

describe('userService DGFY account synchronization', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockReset();
    dgfyAccountRepository.findByEmail.mockReset();
    dgfyAccountRepository.transaction.mockReset();
    dgfyAccountRepository.transaction.mockImplementation(async (callback) => callback({ id: 'dgfy-transaction' }));
    dgfyAccountRepository.forceAssignTenantOwnership.mockReset();
    dgfyAccountRepository.removeMembershipForAccount.mockReset();
    landlordService.findTenantById.mockReset();
    landlordService.updateEmailTenantMapping.mockReset();
    emailOtpService.verifyEmailOtp.mockReset();
    emailOtpService.verifyEmailOtp.mockResolvedValue(true);
  });

  it('repairs a linked DGFY email mismatch during the next POS profile save', async () => {
    const user = createMutableRecord({
      user_id: 1,
      username: 'Josh',
      email: 'gutojoshua.hubomoto@gmail.com',
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      deleted_at: null
    });
    const account = createMutableRecord({
      id: 'dgfy-account-1',
      email: 'admin@test.com',
      email_verified_at: new Date('2026-01-01T00:00:00.000Z')
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(account);
    dgfyAccountRepository.findByEmail.mockResolvedValue(null);

    await updateUserProfile(1, {
      username: 'Josh',
      phone_number: '+639171112233'
    });

    expect(dgfyAccountRepository.findByAcceptedTenantUserMembership).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      tenantUserId: 1
    });
    expect(dgfyAccountRepository.findByEmail).toHaveBeenCalledWith('gutojoshua.hubomoto@gmail.com');
    expect(account.update).toHaveBeenCalledWith(expect.objectContaining({
      email: 'gutojoshua.hubomoto@gmail.com'
    }));
    expect(user.update).toHaveBeenCalledWith({
      username: 'Josh',
      phone_number: '+639171112233'
    });
  });

  it('rejects a profile save when the linked DGFY email belongs to another account', async () => {
    const user = createMutableRecord({
      user_id: 1,
      username: 'Josh',
      email: 'gutojoshua.hubomoto@gmail.com',
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      deleted_at: null
    });
    const account = createMutableRecord({
      id: 'dgfy-account-1',
      email: 'admin@test.com'
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(account);
    dgfyAccountRepository.findByEmail.mockResolvedValue({ id: 'different-account' });

    await expect(updateUserProfile(1, {
      username: 'Josh',
      phone_number: '+639171112233'
    })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Email already in use by another DGFY account'
    });

    expect(account.update).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
  });

  it('changes the linked DGFY password together with the POS password', async () => {
    const currentPassword = 'CurrentPassword123!';
    const newPassword = 'NewPassword123!';
    const currentHash = await hashPassword(currentPassword);
    const user = createMutableRecord({
      user_id: 1,
      email: 'gutojoshua.hubomoto@gmail.com',
      password_hash: currentHash,
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      deleted_at: null
    });
    const account = createMutableRecord({
      id: 'dgfy-account-1',
      email: 'gutojoshua.hubomoto@gmail.com',
      password_hash: currentHash,
      temporary_password_active: true
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(account);

    await changePassword(1, currentPassword, newPassword);

    expect(account.update).toHaveBeenCalledWith({
      password_hash: user.password_hash,
      temporary_password_active: false
    });
    expect(user.password_hash).toBe(account.password_hash);
    await expect(comparePassword(newPassword, user.password_hash)).resolves.toBe(true);
    expect(account.temporary_password_active).toBe(false);
  });

  it('transfers a master admin tenant to the existing DGFY account when its email changes', async () => {
    const currentHash = await hashPassword('Admin123!');
    const user = createMutableRecord({
      user_id: 1,
      username: 'Admin',
      email: 'admin@test.com',
      password_hash: currentHash,
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      is_master_admin: true,
      deleted_at: null
    });
    const previousDgfyAccount = createMutableRecord({
      id: 'legacy-account',
      email: 'legacy@example.com'
    });
    const targetDgfyAccount = createMutableRecord({
      id: 'new-account',
      email: 'gutojoshua.hubomoto@gmail.com',
      password_hash: await hashPassword('DifferentPassword123!'),
      is_active: true,
      deleted_at: null,
      temporary_password_active: true
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(previousDgfyAccount);
    dgfyAccountRepository.findByEmail.mockResolvedValue(targetDgfyAccount);
    dgfyAccountRepository.forceAssignTenantOwnership.mockResolvedValue({});
    dgfyAccountRepository.removeMembershipForAccount.mockResolvedValue({});
    landlordService.findTenantById.mockResolvedValue({ id: 'tenant-1', name: 'Masu Cafe', status: 'active' });

    await updateUserProfile(1, {
      username: 'Admin',
      email: 'gutojoshua.hubomoto@gmail.com',
      email_otp_code: '123456',
      phone_number: '+639171112233'
    });

    expect(previousDgfyAccount.update).not.toHaveBeenCalled();
    expect(dgfyAccountRepository.forceAssignTenantOwnership).toHaveBeenCalledWith({
      tenant: { id: 'tenant-1', name: 'Masu Cafe', status: 'active' },
      toAccountId: 'new-account',
      tenantUserId: 1,
      role: 'admin',
      actorAccountId: 'legacy-account'
    }, { transaction: { id: 'dgfy-transaction' } });
    expect(dgfyAccountRepository.removeMembershipForAccount).toHaveBeenCalledWith({
      dgfyAccountId: 'legacy-account',
      tenantId: 'tenant-1'
    }, { transaction: { id: 'dgfy-transaction' } });
    expect(targetDgfyAccount.update).toHaveBeenCalledWith({
      password_hash: currentHash,
      temporary_password_active: false
    }, { transaction: { id: 'dgfy-transaction' } });
    expect(landlordService.updateEmailTenantMapping).toHaveBeenCalledWith(
      'admin@test.com',
      'gutojoshua.hubomoto@gmail.com',
      'tenant-1',
      { transaction: { id: 'dgfy-transaction' } }
    );
    expect(user.update).toHaveBeenCalledWith({
      username: 'Admin',
      email: 'gutojoshua.hubomoto@gmail.com',
      phone_number: '+639171112233'
    });
  });

  it('transfers a master admin tenant to a new DGFY account when the old email has no DGFY account', async () => {
    const currentHash = await hashPassword('Admin123!');
    const user = createMutableRecord({
      user_id: 1,
      username: 'Admin',
      email: 'admin@test.com',
      password_hash: currentHash,
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      is_master_admin: true,
      deleted_at: null
    });
    const targetDgfyAccount = createMutableRecord({
      id: 'new-account',
      email: 'gutojoshua.hubomoto@gmail.com',
      password_hash: await hashPassword('DifferentPassword123!'),
      is_active: true,
      deleted_at: null,
      temporary_password_active: true
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(null);
    dgfyAccountRepository.findByEmail.mockResolvedValue(targetDgfyAccount);
    dgfyAccountRepository.forceAssignTenantOwnership.mockResolvedValue({});
    landlordService.findTenantById.mockResolvedValue({ id: 'tenant-1', name: 'Masu Cafe', status: 'active' });

    await updateUserProfile(1, {
      username: 'Admin',
      email: 'gutojoshua.hubomoto@gmail.com',
      email_otp_code: '123456',
      phone_number: '+639171112233'
    });

    expect(dgfyAccountRepository.forceAssignTenantOwnership).toHaveBeenCalledWith(
      expect.objectContaining({
        toAccountId: 'new-account',
        tenantUserId: 1,
        actorAccountId: null
      }),
      { transaction: { id: 'dgfy-transaction' } }
    );
    expect(dgfyAccountRepository.removeMembershipForAccount).not.toHaveBeenCalled();
    expect(landlordService.updateEmailTenantMapping).toHaveBeenCalledWith(
      'admin@test.com',
      'gutojoshua.hubomoto@gmail.com',
      'tenant-1',
      { transaction: { id: 'dgfy-transaction' } }
    );
  });

  it('does not rename the old DGFY identity when the replacement account does not exist', async () => {
    const user = createMutableRecord({
      user_id: 1,
      username: 'Admin',
      email: 'admin@test.com',
      password_hash: await hashPassword('Admin123!'),
      phone_number: '+639171112233',
      role: 'admin',
      is_active: true,
      is_master_admin: true,
      deleted_at: null
    });
    const linkedDgfyAccount = createMutableRecord({
      id: 'legacy-account',
      email: 'admin@test.com'
    });
    setupTenantContext(user);
    dgfyAccountRepository.findByAcceptedTenantUserMembership.mockResolvedValue(linkedDgfyAccount);
    dgfyAccountRepository.findByEmail.mockResolvedValue(null);

    await expect(updateUserProfile(1, {
      username: 'Admin',
      email: 'new-owner@example.com',
      email_otp_code: '123456',
      phone_number: '+639171112233'
    })).rejects.toMatchObject({
      statusCode: 409,
      message: 'Create and verify the new DGFY account before changing the company owner email.'
    });

    expect(linkedDgfyAccount.update).not.toHaveBeenCalled();
    expect(user.update).not.toHaveBeenCalled();
    expect(landlordService.updateEmailTenantMapping).not.toHaveBeenCalled();
  });
});
