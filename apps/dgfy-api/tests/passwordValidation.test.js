import {
  registerSchema,
  acceptInviteSchema
} from '../src/validators/authValidator.js';
import { changePasswordSchema } from '../src/validators/userValidator.js';
import { storeRegisterSchema } from '../src/validators/storeValidator.js';

describe('password validation policy', () => {
  it('accepts registration passwords with only 8 characters', () => {
    const { error } = registerSchema.validate({
      username: 'teammate',
      email: 'teammate@example.com',
      phone_number: '+63 912 345 6789',
      password: 'abcdefgh',
      email_otp_code: '123456'
    }, { abortEarly: false });

    expect(error).toBeUndefined();
  });

  it('accepts invitation passwords with only 8 characters', () => {
    const { error } = acceptInviteSchema.validate({
      token: 'a'.repeat(64),
      username: 'teammate',
      phone_number: '+63 912 345 6789',
      password: 'abcdefgh',
      email_otp_code: '123456'
    }, { abortEarly: false });

    expect(error).toBeUndefined();
  });

  it('accepts password changes with only 8 characters', () => {
    const { error } = changePasswordSchema.validate({
      currentPassword: 'old-password',
      newPassword: 'abcdefgh'
    }, { abortEarly: false });

    expect(error).toBeUndefined();
  });

  it('accepts storefront customer registration passwords with only 8 characters', () => {
    const { error } = storeRegisterSchema.validate({
      name: 'Demo Buyer',
      email: 'buyer@example.com',
      password: 'abcdefgh'
    }, { abortEarly: false });

    expect(error).toBeUndefined();
  });

  it('rejects passwords shorter than 8 characters', () => {
    const { error: registerError } = registerSchema.validate({
      username: 'teammate',
      email: 'teammate@example.com',
      phone_number: '+63 912 345 6789',
      password: 'abcdefg',
      email_otp_code: '123456'
    }, { abortEarly: false });

    const { error: changeError } = changePasswordSchema.validate({
      currentPassword: 'old-password',
      newPassword: 'abcdefg'
    }, { abortEarly: false });

    const { error: storeError } = storeRegisterSchema.validate({
      name: 'Demo Buyer',
      email: 'buyer@example.com',
      password: 'abcdefg'
    }, { abortEarly: false });

    expect(registerError?.details.map((detail) => detail.message)).toContain('Password must be at least 8 characters');
    expect(changeError?.details.map((detail) => detail.message)).toContain('New password must be at least 8 characters');
    expect(storeError?.details.map((detail) => detail.message)).toContain('Password must be at least 8 characters');
  });
});
