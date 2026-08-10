import { feedbackRepository } from './repositories/feedbackRepository.js';
import { buildSubmitFeedbackUseCase } from './usecases/submitFeedbackUseCase.js';

export const submitFeedbackUseCase = buildSubmitFeedbackUseCase({ feedbackRepository });
