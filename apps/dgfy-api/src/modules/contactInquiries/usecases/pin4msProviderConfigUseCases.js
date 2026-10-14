import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  encryptPin4msApiKey,
  isPin4msCredentialEncryptionReady
} from '../domain/pin4msCredentialCrypto.js';
import {
  getPin4msProviderConfig,
  savePin4msProviderConfig
} from '../repositories/pin4msProviderConfigRepository.js';

const MAX_API_KEY_BYTES = 4096;

export const getPin4msProviderConfigStatus = async () => ({
  ...await getPin4msProviderConfig(),
  secureStorageAvailable: isPin4msCredentialEncryptionReady(),
  submissionSyncAvailable: false
});

export const savePin4msProviderApiKey = async ({ apiKey, admin }) => {
  if (typeof apiKey !== 'string' || !apiKey.trim()) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'Enter a Pin4MS API key.');
  }

  const normalizedKey = apiKey.trim();
  if (Buffer.byteLength(normalizedKey, 'utf8') > MAX_API_KEY_BYTES) {
    throw new DomainError(DomainErrorCode.VALIDATION_FAILED, 'The Pin4MS API key is too long.');
  }

  const encryptedApiKey = encryptPin4msApiKey(normalizedKey);
  const status = await savePin4msProviderConfig({ encryptedApiKey, admin });
  return {
    ...status,
    secureStorageAvailable: true,
    submissionSyncAvailable: false
  };
};
