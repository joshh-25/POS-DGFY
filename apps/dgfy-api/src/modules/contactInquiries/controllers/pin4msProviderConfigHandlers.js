import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import {
  getPin4msProviderConfigStatus,
  savePin4msProviderApiKey
} from '../usecases/pin4msProviderConfigUseCases.js';
import { isSecureAdminCredentialRequest } from '../domain/pin4msCredentialTransport.js';

export { isSecureAdminCredentialRequest } from '../domain/pin4msCredentialTransport.js';

export const getPin4msProviderConfig = async (_req, res, next) => {
  try {
    const data = await getPin4msProviderConfigStatus();
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
};

export const updatePin4msProviderConfig = async (req, res, next, apiKey = req.body?.api_key) => {
  if (req.body && typeof req.body === 'object') delete req.body.api_key;
  req.rawBody = undefined;

  if (!isSecureAdminCredentialRequest(req)) {
    return res.status(426).json({
      success: false,
      error_code: 'HTTPS_REQUIRED',
      message: 'Open Platform Admin over HTTPS (or localhost) before saving this API key.'
    });
  }

  try {
    const data = await savePin4msProviderApiKey({
      apiKey,
      admin: req.admin
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof DomainError && error.code === DomainErrorCode.VALIDATION_FAILED) {
      return res.status(error.statusCode).json({
        success: false,
        error_code: error.code,
        message: error.message
      });
    }
    return next(error);
  }
};
