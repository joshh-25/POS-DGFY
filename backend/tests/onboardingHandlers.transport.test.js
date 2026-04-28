import { jest } from '@jest/globals';

const mockGetOnboardingStatusUseCase = jest.fn();
const mockSaveOnboardingStepUseCase = jest.fn();
const mockCompleteOnboardingUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();
const mockTrackProductUsageEvent = jest.fn();

jest.unstable_mockModule('../src/modules/onboarding/index.js', () => ({
  getOnboardingStatusUseCase: mockGetOnboardingStatusUseCase,
  saveOnboardingStepUseCase: mockSaveOnboardingStepUseCase,
  completeOnboardingUseCase: mockCompleteOnboardingUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult,
  trackProductUsageEvent: mockTrackProductUsageEvent
}));

let getOnboardingStatus;
let saveOnboardingStep;
let trackOnboardingEvent;

beforeAll(async () => {
  const mod = await import('../src/modules/onboarding/controllers/onboardingHandlers.js');
  getOnboardingStatus = mod.getOnboardingStatus;
  saveOnboardingStep = mod.saveOnboardingStep;
  trackOnboardingEvent = mod.trackOnboardingEvent;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('onboardingHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
    mockTrackProductUsageEvent.mockResolvedValue({ created: true });
  });

  it('forwards tenant name baseline to getOnboardingStatus use case', async () => {
    mockGetOnboardingStatusUseCase.mockResolvedValue({
      success: true,
      data: { tenant_onboarding_state: 'not_started' }
    });
    const req = {
      tenant: { name: 'Tenant Alpha' },
      user: { user_id: 1 },
      requestId: 'req-onboarding-status'
    };
    const res = createRes();
    const next = jest.fn();

    await getOnboardingStatus(req, res, next);

    expect(mockGetOnboardingStatusUseCase).toHaveBeenCalledWith({
      storeNameBaseline: 'Tenant Alpha'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('forwards tenant name baseline to saveOnboardingStep use case', async () => {
    mockSaveOnboardingStepUseCase.mockResolvedValue({
      success: true,
      data: { tenant_onboarding_state: 'in_progress' }
    });
    const req = {
      tenant: { name: 'Tenant Beta' },
      user: { user_id: 1 },
      validatedData: {
        step_key: 'business_profile',
        payload: { pos_business_name: 'Tenant Beta Store' }
      },
      requestId: 'req-onboarding-step'
    };
    const res = createRes();
    const next = jest.fn();

    await saveOnboardingStep(req, res, next);

    expect(mockSaveOnboardingStepUseCase).toHaveBeenCalledWith({
      stepKey: 'business_profile',
      payload: { pos_business_name: 'Tenant Beta Store' },
      storeNameBaseline: 'Tenant Beta'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('accepts onboarding telemetry event without mutating onboarding step state', async () => {
    const req = {
      user: { user_id: 10, is_master_admin: true },
      tenant: { id: 99, name: 'Tenant Gamma' },
      validatedData: {
        event_key: 'reminder_shown',
        metadata: { surface: 'layout' }
      },
      requestId: 'req-onboarding-event'
    };
    const res = createRes();
    const next = jest.fn();

    await trackOnboardingEvent(req, res, next);

    expect(mockTrackProductUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'tenant_onboarding_reminder_shown',
      surface: 'onboarding',
      action: 'track_event',
      metadata: expect.objectContaining({
        event_key: 'reminder_shown',
        surface: 'layout'
      })
    }));
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: {
        accepted: true,
        event_key: 'reminder_shown'
      }
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('maps classifier telemetry event keys to onboarding telemetry event types', async () => {
    const req = {
      user: { user_id: 11, is_master_admin: true },
      tenant: { id: 100, name: 'Tenant Delta' },
      validatedData: {
        event_key: 'classifier_saved',
        metadata: { surface: 'modal' }
      },
      requestId: 'req-onboarding-event-classifier'
    };
    const res = createRes();
    const next = jest.fn();

    await trackOnboardingEvent(req, res, next);

    expect(mockTrackProductUsageEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'tenant_onboarding_classifier_saved',
      metadata: expect.objectContaining({
        event_key: 'classifier_saved'
      })
    }));
    expect(res.status).toHaveBeenCalledWith(202);
    expect(next).not.toHaveBeenCalled();
  });
});
