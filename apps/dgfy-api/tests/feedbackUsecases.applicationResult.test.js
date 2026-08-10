import { jest } from '@jest/globals';
import { buildSubmitFeedbackUseCase } from '../src/modules/feedback/usecases/submitFeedbackUseCase.js';
import { DomainErrorCode } from '../src/modules/shared/contracts/domainErrors.js';

describe('feedback use-cases application result contract', () => {
  it('validates required fields', async () => {
    const useCase = buildSubmitFeedbackUseCase({
      feedbackRepository: {
        append: jest.fn()
      }
    });

    const result = await useCase({ type: '', description: '' });
    expect(result.success).toBe(false);
    expect(result.error.code).toBe(DomainErrorCode.VALIDATION_FAILED);
    expect(result.error.statusCode).toBe(400);
  });

  it('returns success envelope on repository append', async () => {
    const append = jest.fn().mockResolvedValue(undefined);
    const useCase = buildSubmitFeedbackUseCase({
      feedbackRepository: { append }
    });

    const result = await useCase({
      type: 'bug',
      description: 'Sample issue',
      url: '/items',
      context: { source: 'test' },
      tenant: { id: 1, name: 'Tenant A' },
      user: { id: 1, username: 'alice', email: 'alice@example.com' }
    });

    expect(append).toHaveBeenCalled();
    expect(result).toEqual({
      success: true,
      data: { message: 'Feedback submitted successfully' },
      error: null,
      message: null
    });
  });
});
