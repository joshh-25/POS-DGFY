import {
  decryptPin4msApiKey,
  encryptPin4msApiKey,
  isPin4msCredentialEncryptionReady
} from '../src/modules/contactInquiries/domain/pin4msCredentialCrypto.js';

const KEY_ENV = 'CONTACT_INQUIRIES_CREDENTIAL_ENCRYPTION_KEY';
const originalKey = process.env[KEY_ENV];

describe('Pin4MS credential encryption', () => {
  beforeEach(() => {
    process.env[KEY_ENV] = 'ab'.repeat(32);
  });

  afterAll(() => {
    if (originalKey === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = originalKey;
  });

  test('encrypts a credential and decrypts it only with the configured key', () => {
    const apiKey = 'pin4ms-generated-secret';
    const encrypted = encryptPin4msApiKey(apiKey);

    expect(encrypted).not.toContain(apiKey);
    expect(decryptPin4msApiKey(encrypted)).toBe(apiKey);
  });

  test('uses a fresh nonce for each encryption', () => {
    const first = encryptPin4msApiKey('same-secret');
    const second = encryptPin4msApiKey('same-secret');

    expect(first).not.toBe(second);
  });

  test('reports unavailable secure storage for a malformed environment key', () => {
    process.env[KEY_ENV] = 'not-a-32-byte-hex-key';

    expect(isPin4msCredentialEncryptionReady()).toBe(false);
    expect(() => encryptPin4msApiKey('secret')).toThrow('Secure Pin4MS credential storage is not configured');
  });

  test('rejects a tampered encrypted value', () => {
    const encrypted = encryptPin4msApiKey('secret');
    const parts = encrypted.split('.');
    parts[3] = Buffer.from('tampered-value').toString('base64url');

    expect(() => decryptPin4msApiKey(parts.join('.'))).toThrow('Stored Pin4MS credential could not be decrypted');
  });
});
