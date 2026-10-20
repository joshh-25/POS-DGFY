import { ok, fail } from '../../shared/contracts/applicationResult.js';
import { DomainError, DomainErrorCode } from '../../shared/contracts/domainErrors.js';
import { mapFeedbackUseCaseError } from './feedbackUseCaseError.js';
import { FEEDBACK_TYPES, toSubmission } from './feedbackSubmissionMapper.js';

export const buildSubmitFeedbackUseCase = ({ feedbackRepository }) => {
  return async ({ type, description, url, context, origin, contact, tenant, identity, correlationId }) => {
    if (!type || typeof description !== 'string' || !description.trim()) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Type and Description are required',
        { statusCode: 400 }
      ));
    }
    if (!FEEDBACK_TYPES.includes(type) || description.trim().length > 5000) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Invalid feedback type or description (maximum 5000 characters)',
        { statusCode: 400 }
      ));
    }

    if (!identity && (
      typeof contact?.name !== 'string' || !contact.name.trim() || contact.name.trim().length > 255 ||
      typeof contact?.email !== 'string' || contact.email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)
    )) {
      return fail(new DomainError(
        DomainErrorCode.VALIDATION_FAILED,
        'Guest name and valid email are required',
        { statusCode: 400 }
      ));
    }

    const entry = toSubmission({ type, description, url, context, origin, contact, tenant, identity, correlationId });

    try {
      const created = await feedbackRepository.create(entry);
      return ok({ message: 'Feedback submitted successfully', id: created.id, surface: created.surface, client_platform: created.client_platform });
    } catch (error) {
      return fail(mapFeedbackUseCaseError(error, 'Failed to submit feedback'));
    }
  };
};
