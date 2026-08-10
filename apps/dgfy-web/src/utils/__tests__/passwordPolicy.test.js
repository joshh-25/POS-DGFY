import { describe, expect, it } from 'vitest';
import {
  GENERATED_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  generateReadablePassword,
  isPasswordLongEnough
} from '../passwordPolicy.js';

describe('passwordPolicy', () => {
  it('accepts passwords at the minimum length only', () => {
    expect(isPasswordLongEnough('abcdefgh')).toBe(true);
    expect(isPasswordLongEnough('abcdefg')).toBe(false);
  });

  it('generates readable passwords at the default length', () => {
    const password = generateReadablePassword();

    expect(password).toHaveLength(GENERATED_PASSWORD_LENGTH);
    expect(isPasswordLongEnough(password)).toBe(true);
    expect(password).not.toMatch(/[O0Il]/);
  });

  it('never generates below the minimum length', () => {
    expect(generateReadablePassword(1)).toHaveLength(MIN_PASSWORD_LENGTH);
  });
});
