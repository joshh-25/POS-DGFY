import { toAdminFeedback } from './feedbackSubmissionMapper.js';

export const buildReadFeedbackUseCases = ({ feedbackRepository }) => ({
  async getAllFeedback() {
    return (await feedbackRepository.list()).map(toAdminFeedback);
  },
  async getFilteredFeedback(filters = {}) {
    return (await feedbackRepository.list(filters)).map(toAdminFeedback);
  },
  async getFeedbackStats() {
    const stats = await feedbackRepository.stats();
    return { ...stats, latest: stats.latest ? toAdminFeedback(stats.latest) : null };
  }
});
