import {
  EMAIL_OTP_PURPOSES,
  requestEmailOtp,
  verifyEmailOtp
} from '../../services/emailOtpService.js';
import { isEmailOtpEnforcementEnabled } from '../../config/emailOtp.js';
import * as storefrontSupportContactRepository from './repositories/storefrontSupportContactRepository.js';
import { buildStorefrontSupportContactUseCases } from './usecases/storefrontSupportContactUseCases.js';

const storefrontSupportContactUseCases = buildStorefrontSupportContactUseCases({
  repository: storefrontSupportContactRepository,
  emailOtpService: { EMAIL_OTP_PURPOSES, requestEmailOtp, verifyEmailOtp },
  isEmailOtpEnforcementEnabled
});

export const {
  getPublicStorefrontSupportContactStatus,
  getStorefrontSupportContactStatus,
  requestStorefrontSupportEmailVerification,
  saveStorefrontSupportEmailConfiguration,
  verifyStorefrontSupportEmail
} = storefrontSupportContactUseCases;

export {
  getPin4msProviderConfigStatus,
  savePin4msProviderApiKey
} from './usecases/pin4msProviderConfigUseCases.js';
export {
  decryptPin4msApiKey,
  encryptPin4msApiKey,
  isPin4msCredentialEncryptionReady
} from './domain/pin4msCredentialCrypto.js';
