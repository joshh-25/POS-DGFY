import { jest } from '@jest/globals';
import { assertStoreVisibilityEditAuthorized } from '../src/modules/settings/usecases/storeVisibilityEditAuthority.js';
import { assertStoredVisibilityChangeAllowed } from '../src/modules/shared/utils/storeVisibilityEditPolicy.js';

const repository = (visible, editable) => ({
  getSettingsByKeys: jest.fn().mockResolvedValue({
    store_is_visible: { value: visible },
    store_visibility_merchant_editable: { value: editable }
  })
});

describe('merchant storefront visibility authority', () => {
  it.each([false, true])('rejects a changed visibility value while locked, current=%s', async (visible) => {
    await expect(assertStoreVisibilityEditAuthorized({
      settingsRepository: repository(visible, false),
      settingsData: { store_is_visible: !visible }
    })).rejects.toMatchObject({ statusCode: 403, details: { reason_code: 'STORE_VISIBILITY_EDIT_PLATFORM_CONTROLLED' } });
  });

  it.each([false, true])('allows an unchanged bulk value and editable changes, current=%s', async (visible) => {
    await expect(assertStoreVisibilityEditAuthorized({
      settingsRepository: repository(visible, false),
      settingsData: { store_is_visible: visible, storefront_tagline: 'updated' }
    })).resolves.toBeUndefined();
    await expect(assertStoreVisibilityEditAuthorized({
      settingsRepository: repository(visible, true),
      settingsData: { store_is_visible: !visible }
    })).resolves.toBeUndefined();
  });

  it('rejects tenant writes of the policy key even when its value is unchanged', async () => {
    await expect(assertStoreVisibilityEditAuthorized({
      settingsRepository: repository(true, true),
      settingsData: { store_visibility_merchant_editable: true }
    })).rejects.toMatchObject({ statusCode: 403 });
  });

  it('uses the same policy for onboarding before progress is written', () => {
    expect(() => assertStoredVisibilityChangeAllowed({ policyValue: 'false', currentValue: 'false', incomingValue: true }))
      .toThrow('Storefront visibility editing is controlled by platform admin.');
    expect(() => assertStoredVisibilityChangeAllowed({ policyValue: 'false', currentValue: 'false', incomingValue: false }))
      .not.toThrow();
  });
});
