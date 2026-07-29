import bcrypt from 'bcryptjs';
import { jest } from '@jest/globals';
import { buildPlatformAdminUsersUseCase } from '../src/modules/platformAdmin/usecases/platformAdminUsersUseCase.js';

describe('Platform Admin user lifecycle', () => {
  test('uses the documented default password only when the master leaves the field blank', async () => {
    const repository = {
      findUserByUsername: jest.fn().mockResolvedValue(null),
      createDelegatedUser: jest.fn().mockImplementation(async (payload) => payload)
    };
    const result = await buildPlatformAdminUsersUseCase({ repository }).create({
      actor: { id: 'master-1', username: 'master' },
      body: { username: 'qa-admin', password: '', permissions: ['admin.invoices'] }
    });
    expect(result).toMatchObject({ success: true, status: 201, data: { temporaryPasswordActive: true, username: 'qa-admin' } });
    const payload = repository.createDelegatedUser.mock.calls[0][0];
    expect(await bcrypt.compare('11223344', payload.passwordHash)).toBe(true);
  });

  test('rejects a nonblank delegated password shorter than the policy minimum', async () => {
    const repository = { findUserByUsername: jest.fn() };
    await expect(buildPlatformAdminUsersUseCase({ repository }).create({ actor: { username: 'master' }, body: { username: 'qa-admin', password: 'seven77', permissions: ['admin.invoices'] } })).resolves.toMatchObject({ success: false, status: 422, message: expect.stringContaining('8 characters') });
  });

  test('accepts an explicit eight-character delegated password', async () => {
    const repository = { findUserByUsername: jest.fn().mockResolvedValue(null), createDelegatedUser: jest.fn().mockImplementation(async (payload) => payload) };
    const result = await buildPlatformAdminUsersUseCase({ repository }).create({ actor: { id: 'master-1', username: 'master' }, body: { username: 'qa-admin', password: 'eight888', permissions: ['admin.invoices'] } });
    expect(result).toMatchObject({ success: true, status: 201, data: { temporaryPasswordActive: false } });
  });
});
