import { getCompanyRegistrationStatusUseCase, resubmitCompanyRegistrationUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';

export const getCompanyRegistrationStatus = async (req, res) => sendUseCaseResult(res, await getCompanyRegistrationStatusUseCase({
  applicationId: req.params.applicationId,
  dgfyAccountId: req.dgfyAccount?.id
}));

export const resubmitCompanyRegistration = async (req, res) => sendUseCaseResult(res, await resubmitCompanyRegistrationUseCase({
  applicationId: req.params.applicationId,
  dgfyAccountId: req.dgfyAccount?.id,
  body: req.body
}));
