import bcrypt from 'bcryptjs';
import {
  POS_SETTINGS_ACCESS_PIN_ENABLED_KEY,
  POS_SETTINGS_ACCESS_PIN_HASH_KEY,
  resolvePosSettingsAccessPinPatch,
  sanitizePosSettingsAccessPinForRead,
  verifyPosSettingsAccessPin
} from '../src/modules/settings/usecases/posSettingsAccessPinPolicy.js';

describe('POS settings access PIN policy', () => {
  it('hashes a new PIN and exposes only the enabled indicator', async () => {
    const patch = await resolvePosSettingsAccessPinPatch({
      settingsData: { pos_settings_access_pin: '4321' }
    });

    expect(patch).not.toHaveProperty('pos_settings_access_pin');
    expect(patch[POS_SETTINGS_ACCESS_PIN_HASH_KEY]).toEqual(expect.any(String));
    await expect(bcrypt.compare('4321', patch[POS_SETTINGS_ACCESS_PIN_HASH_KEY])).resolves.toBe(true);

    const sanitized = sanitizePosSettingsAccessPinForRead({
      [POS_SETTINGS_ACCESS_PIN_HASH_KEY]: {
        value: patch[POS_SETTINGS_ACCESS_PIN_HASH_KEY],
        data_type: 'string'
      }
    });
    expect(sanitized).not.toHaveProperty(POS_SETTINGS_ACCESS_PIN_HASH_KEY);
    expect(sanitized[POS_SETTINGS_ACCESS_PIN_ENABLED_KEY].value).toBe(true);
  });

  it('verifies the configured PIN without returning its hash', async () => {
    const currentHash = await bcrypt.hash('9876', 10);

    await expect(verifyPosSettingsAccessPin({ pin: '9876', currentHash })).resolves.toBe(true);
    await expect(verifyPosSettingsAccessPin({ pin: '1111', currentHash })).rejects.toMatchObject({
      statusCode: 401,
      message: 'POS Settings access PIN is incorrect.'
    });
  });
});
