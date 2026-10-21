import { feedbackRepository } from './repositories/feedbackRepository.js';
import { buildSubmitFeedbackUseCase } from './usecases/submitFeedbackUseCase.js';
import { buildReadFeedbackUseCases } from './usecases/readFeedbackUseCases.js';

export const submitFeedbackUseCase = buildSubmitFeedbackUseCase({ feedbackRepository });
export const { getAllFeedback, getFilteredFeedback, getFeedbackStats } = buildReadFeedbackUseCases({ feedbackRepository });
