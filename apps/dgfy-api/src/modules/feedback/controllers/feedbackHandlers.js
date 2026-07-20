import dbStore from '../../../utils/dbStore.js';
import { submitFeedbackUseCase } from '../index.js';
import { sendUseCaseResult } from '../../shared/controllers/useCaseResponder.js';
import { trackProductUsageFromResult } from '../../../services/productUsageTelemetryService.js';

export const submitFeedback = async (req, res) => {
  try {
    const store = dbStore.getStore();
    const tenant = store ? {
      id: store.tenantId,
      name: store.tenantName
    } : null;

    const user = req.user ? {
      id: req.user.user_id,
      username: req.user.username,
      email: req.user.email
    } : { id: 'Anonymous', username: 'Anonymous', email: 'N/A' };

    const result = await submitFeedbackUseCase({
      type: req.body?.type,
      description: req.body?.description,
      url: req.body?.url,
      context: req.body?.context,
      tenant,
      user
    });

    await trackProductUsageFromResult({
      req,
      user: req.user,
      tenantId: tenant?.id || null,
      eventType: 'feedback_submitted',
      surface: 'feedback',
      action: 'submit_feedback',
      result,
      successMetadataResolver: () => ({
        type: req.body?.type || null,
        has_url: Boolean(req.body?.url)
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        message: result.data?.message || 'Feedback submitted successfully'
      }),
      errorPayloadResolver: (failure) => ({
        message: failure.message
      }),
      fallbackErrorMessage: 'Internal Server Error'
    });
  } catch (error) {
    console.error('Feedback Error:', error);
    return res.status(500).json({ message: 'Internal Server Error' });
  }
};

export default {
  submitFeedback
};
