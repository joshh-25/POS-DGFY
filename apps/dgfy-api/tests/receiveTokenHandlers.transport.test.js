import { jest } from '@jest/globals';

const mockGenerateTokenUseCase = jest.fn();
const mockValidateTokenUseCase = jest.fn();
const mockReceiveViaTokenUseCase = jest.fn();
const mockMarkTokenUsedUseCase = jest.fn();
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/receiveTokens/index.js', () => ({
  generateTokenUseCase: mockGenerateTokenUseCase,
  validateTokenUseCase: mockValidateTokenUseCase,
  receiveViaTokenUseCase: mockReceiveViaTokenUseCase,
  markTokenUsedUseCase: mockMarkTokenUsedUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

let generateToken;
let validateToken;
let receiveViaToken;
let markTokenUsed;

beforeAll(async () => {
  const mod = await import('../src/modules/receiveTokens/controllers/receiveTokenHandlers.js');
  generateToken = mod.generateToken;
  validateToken = mod.validateToken;
  receiveViaToken = mod.receiveViaToken;
  markTokenUsed = mod.markTokenUsed;
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

describe('receiveTokenHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
  });

  it('generateToken preserves 201 success payload shape', async () => {
    mockGenerateTokenUseCase.mockResolvedValue({
      success: true,
      data: { token: 'abc123', expires_at: '2026-03-12T00:00:00.000Z' }
    });

    const req = {
      body: { order_type: 'PO', order_id: 88, expiry_days: 7 },
      user: { user_id: 4 },
      requestId: 'req-token-create'
    };
    const res = createRes();
    const next = jest.fn();

    await generateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { token: 'abc123', expires_at: '2026-03-12T00:00:00.000Z' },
      message: 'Token generated successfully'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'receive_token_generated',
      surface: 'receive_tokens',
      action: 'generate_receive_token'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('validateToken returns standardized error payload for failed result', async () => {
    mockValidateTokenUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHENTICATION_FAILED',
        message: 'Invalid or expired token',
        details: null,
        statusCode: 401
      }
    });

    const req = { params: { token: 'bad-token' }, requestId: 'req-token-401' };
    const res = createRes();
    const next = jest.fn();

    await validateToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Invalid or expired token',
      error_code: 'AUTHENTICATION_FAILED',
      errors: null,
      request_id: 'req-token-401',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'receive_token_validated',
      surface: 'receive_tokens',
      action: 'validate_receive_token'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('receiveViaToken preserves success payload message', async () => {
    mockReceiveViaTokenUseCase.mockResolvedValue({
      success: true,
      data: { po_id: 88, status: 'received' }
    });

    const req = {
      params: { token: 'good-token' },
      body: { line_items: [{ line_item_id: 1, quantity_received: 3 }] },
      requestId: 'req-token-receive'
    };
    const res = createRes();
    const next = jest.fn();

    await receiveViaToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { po_id: 88, status: 'received' },
      message: 'Received successfully'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'receive_token_consumed',
      surface: 'receive_tokens',
      action: 'receive_via_token'
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('receiveViaToken returns deterministic 422 payload for missing location fields', async () => {
    mockReceiveViaTokenUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'location_id is required to receive PO via QR',
        details: null,
        statusCode: 422
      }
    });

    const req = {
      params: { token: 'good-token' },
      body: { line_items: [{ line_item_id: 1, quantity_received: 3 }] },
      user: { user_id: 9 },
      requestId: 'req-token-receive-422'
    };
    const res = createRes();
    const next = jest.fn();

    await receiveViaToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'location_id is required to receive PO via QR',
      error_code: 'VALIDATION_FAILED',
      errors: null,
      request_id: 'req-token-receive-422',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('receiveViaToken returns deterministic 403 payload for location access denial', async () => {
    mockReceiveViaTokenUseCase.mockResolvedValue({
      success: false,
      error: {
        code: 'AUTHORIZATION_FAILED',
        message: 'You do not have location access to perform QR receive at location 2.',
        details: null,
        statusCode: 403
      }
    });

    const req = {
      params: { token: 'good-token' },
      body: {
        source_location_id: 2,
        destination_location_id: 3,
        quantity_produced: 5
      },
      user: { user_id: 9 },
      requestId: 'req-token-receive-403'
    };
    const res = createRes();
    const next = jest.fn();

    await receiveViaToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'You do not have location access to perform QR receive at location 2.',
      error_code: 'AUTHORIZATION_FAILED',
      errors: null,
      request_id: 'req-token-receive-403',
      timestamp: expect.any(String)
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('markTokenUsed preserves success message for optional-auth route', async () => {
    mockMarkTokenUsedUseCase.mockResolvedValue({
      success: true,
      data: undefined
    });

    const req = {
      params: { tokenId: '5' },
      user: null,
      requestId: 'req-token-use'
    };
    const res = createRes();
    const next = jest.fn();

    await markTokenUsed(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: undefined,
      message: 'Token marked as used'
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'receive_token_marked_used',
      surface: 'receive_tokens',
      action: 'mark_receive_token_used'
    }));
    expect(next).not.toHaveBeenCalled();
  });
});
