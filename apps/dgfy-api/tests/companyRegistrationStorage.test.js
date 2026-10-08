import fs from 'node:fs/promises';
import {
  buildCompanyRegistrationStorageKey,
  companyRegistrationStoragePathForKey,
  persistCompanyRegistrationFile,
  removeCompanyRegistrationFile
} from '../src/services/companyRegistrationStorage.js';

describe('company registration private storage', () => {
  const draftId = '66666666-6666-4666-8666-666666666666';
  const uploadId = '77777777-7777-4777-8777-777777777777';

  it('generates opaque private keys and sanitizes the display filename', async () => {
    const stored = await persistCompanyRegistrationFile({
      draftId,
      uploadId,
      originalName: '../my menu?.png',
      mimeType: 'image/png',
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    });

    expect(stored.storageKey).toBe(draftId + '/' + uploadId + '.png');
    expect(stored.sanitizedName).toBe('my menu_.png');
    expect(stored.sha256).toHaveLength(64);
    await expect(fs.readFile(companyRegistrationStoragePathForKey(stored.storageKey))).resolves.toHaveLength(8);

    await removeCompanyRegistrationFile(stored.storageKey);
    await expect(fs.access(companyRegistrationStoragePathForKey(stored.storageKey))).rejects.toThrow();
  });

  it('rejects absolute and escaping storage keys', () => {
    expect(() => companyRegistrationStoragePathForKey('../outside.txt')).toThrow('escaped');
    expect(() => companyRegistrationStoragePathForKey('C:/outside.txt')).toThrow('Invalid');
    expect(() => buildCompanyRegistrationStorageKey({
      draftId: '../draft',
      uploadId,
      mimeType: 'image/png'
    })).toThrow('identifiers');
  });
});
