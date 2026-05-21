import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapFeedbackUseCaseError } from './feedbackUseCaseError.js';

export const buildSubmitFeedbackUseCase = ({ feedbackRepository }) => {
  return async ({ type, description, url, context, tenant, user }) => {
    if (!type || !description) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Type and Description are required',
        { statusCode: 400 }
      ));
    }

    const entry = {
      timestamp: new Date().toISOString(),
      type,
      description,
      url: url || 'N/A',
      context: context || {},
      tenant: tenant || null,
      user: user || { id: 'Anonymous', username: 'Anonymous', email: 'N/A' }
    };

    try {
      await feedbackRepository.append(entry);
      return ok({ message: 'Feedback submitted successfully' });
    } catch (error) {
      return fail(mapFeedbackUseCaseError(error, 'Failed to submit feedback'));
    }
  };
};
