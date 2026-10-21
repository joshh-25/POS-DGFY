import { resolveChangedSettingKeys } from './settingsChangeSet.js';
import {
  STORE_VISIBILITY_POLICY_KEY,
  STORE_VISIBILITY_KEY,
  parseStoredBoolean,
  storeVisibilityAuthorityError,
  assertStoredVisibilityChangeAllowed
} from '../../shared/utils/storeVisibilityEditPolicy.js';

export const assertStoreVisibilityEditAuthorized = async ({ settingsRepository, settingsData }) => {
  if (Object.prototype.hasOwnProperty.call(settingsData, STORE_VISIBILITY_POLICY_KEY)) {
    throw storeVisibilityAuthorityError(STORE_VISIBILITY_POLICY_KEY);
  }
  if (!Object.prototype.hasOwnProperty.call(settingsData, STORE_VISIBILITY_KEY)) return;

  const rows = await settingsRepository.getSettingsByKeys([STORE_VISIBILITY_POLICY_KEY, STORE_VISIBILITY_KEY]);
  if (parseStoredBoolean(rows?.[STORE_VISIBILITY_POLICY_KEY]?.value, true)) return;
  const incoming = parseStoredBoolean(settingsData[STORE_VISIBILITY_KEY], false);
  const current = parseStoredBoolean(rows?.[STORE_VISIBILITY_KEY]?.value, true);
  // The change-set helper handles the ordinary no-op case. Boolean comparison also
  // handles older rows serialized as strings and a missing legacy visibility row.
  const changedKeys = await resolveChangedSettingKeys({ settingsRepository, settingsData: { [STORE_VISIBILITY_KEY]: incoming } });
  if (changedKeys.includes(STORE_VISIBILITY_KEY)) {
    assertStoredVisibilityChangeAllowed({
      policyValue: rows?.[STORE_VISIBILITY_POLICY_KEY]?.value,
      currentValue: current,
      incomingValue: incoming
    });
  }
};
