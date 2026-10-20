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
    } : null;

    const result = await submitFeedbackUseCase({
      type: req.body?.type,
      description: req.body?.description,
      url: req.body?.url,
      context: req.body?.context,
      origin: req.body?.origin,
      contact: req.body?.contact,
      correlationId: req.requestId,
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
        has_url: Boolean(req.body?.url),
        feedback_id: result.data?.id,
        surface: result.data?.surface,
        client_platform: result.data?.client_platform
      })
    });

    return sendUseCaseResult(res, result, {
      successStatusCodeResolver: () => 201,
      successPayloadResolver: () => ({
        message: result.data?.message || 'Feedback submitted successfully',
        id: result.data?.id
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
