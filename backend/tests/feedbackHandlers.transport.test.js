import { jest } from '@jest/globals';

const mockSubmitFeedbackUseCase = jest.fn();
const mockGetStore = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/feedback/index.js', () => ({
  submitFeedbackUseCase: mockSubmitFeedbackUseCase
}));

jest.unstable_mockModule('../src/utils/dbStore.js', () => ({
  default: {
    getStore: mockGetStore
  }
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let submitFeedback;

beforeAll(async () => {
  const mod = await import('../src/modules/feedback/controllers/feedbackHandlers.js');
  submitFeedback = mod.submitFeedback;
});

const createRes = () => {
  const res = {
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('feedbackHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('returns legacy-shaped success payload', async () => {
    mockGetStore.mockReturnValue({ tenantId: 101, tenantName: 'Tenant X' });
    mockSubmitFeedbackUseCase.mockResolvedValue({
      success: true,
      data: { message: 'Feedback submitted successfully' }
    });

    const req = {
      body: {
        type: 'suggestion',
        description: 'Add a filter',
        url: '/dashboard',
        context: {}
      },
      user: {
        user_id: 7,
        username: 'john',
        email: 'john@example.com'
      }
    };
    const res = createRes();

    await submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Feedback submitted successfully'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'feedback_submitted',
      surface: 'feedback',
      action: 'submit_feedback'
    }));
  });

  it('returns legacy-shaped error payload from failure result', async () => {
    mockGetStore.mockReturnValue(null);
    mockSubmitFeedbackUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Type and Description are required',
        statusCode: 400
      }
    });

    const req = {
      body: { type: '', description: '' },
      user: null
    };
    const res = createRes();

    await submitFeedback(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      message: 'Type and Description are required'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'feedback_submitted',
      surface: 'feedback',
      action: 'submit_feedback'
    }));
  });
});
