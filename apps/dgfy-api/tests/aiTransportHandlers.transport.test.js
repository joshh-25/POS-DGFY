import { jest } from '@jest/globals';

const mockChatUseCase = jest.fn();
const mockConfirmActionUseCase = jest.fn();
const mockCancelActionUseCase = jest.fn();
const mockGetConversationsUseCase = jest.fn();
const mockGetConversationUseCase = jest.fn();
const mockDeleteConversationUseCase = jest.fn();
const mockCleanupExpiredDataUseCase = jest.fn();
const mockDownloadExportUseCase = jest.fn();
const mockGetDiagnosticsUseCase = jest.fn();
const mockPrepareChatPayloadUseCase = jest.fn();
const mockBuildPrepareChatPayloadUseCase = jest.fn(() => mockPrepareChatPayloadUseCase);
const mockTrackProductUsageFromResult = jest.fn();

jest.unstable_mockModule('../src/modules/ai/index.js', () => ({
  chatUseCase: mockChatUseCase,
  confirmActionUseCase: mockConfirmActionUseCase,
  cancelActionUseCase: mockCancelActionUseCase,
  getConversationsUseCase: mockGetConversationsUseCase,
  getConversationUseCase: mockGetConversationUseCase,
  deleteConversationUseCase: mockDeleteConversationUseCase,
  cleanupExpiredDataUseCase: mockCleanupExpiredDataUseCase,
  downloadExportUseCase: mockDownloadExportUseCase,
  getDiagnosticsUseCase: mockGetDiagnosticsUseCase
}));

jest.unstable_mockModule('../src/modules/ai/usecases/prepareChatPayloadUseCase.js', () => ({
  buildPrepareChatPayloadUseCase: mockBuildPrepareChatPayloadUseCase
}));

jest.unstable_mockModule('../src/services/productUsageTelemetryService.js', () => ({
  trackProductUsageFromResult: mockTrackProductUsageFromResult
}));

jest.unstable_mockModule('../src/config/logger.js', () => ({
  default: {
    error: jest.fn(),
    info: jest.fn()
  }
}));

let chat;
let confirmAction;
let getConversations;
let downloadExport;

beforeAll(async () => {
  const mod = await import('../src/modules/ai/controllers/aiTransportHandlers.js');
  chat = mod.chat;
  confirmAction = mod.confirmAction;
  getConversations = mod.getConversations;
  downloadExport = mod.downloadExport;
});

const createRes = () => {
  const res = {
    locals: {},
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn()
  };
  res.status.mockReturnValue(res);
  return res;
};

describe('aiTransportHandlers transport contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockTrackProductUsageFromResult.mockResolvedValue({ created: true });
    mockPrepareChatPayloadUseCase.mockResolvedValue({
      messagePayload: [{ role: 'user', content: 'hello' }],
      finalMessageText: 'hello',
      uploadedPaths: []
    });
  });

  it('chat preserves success payload contract', async () => {
    mockChatUseCase.mockResolvedValue({
      success: true,
      response: { reply: 'Hi there' }
    });

    const req = {
      body: { message: 'hello' },
      files: [],
      user: { user_id: 7 },
      requestId: 'req-ai-chat'
    };
    const res = createRes();

    await chat(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { reply: 'Hi there' },
      message: 'Response generated',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ai_chat_interaction_recorded',
      surface: 'ai',
      action: 'chat'
    }));
  });

  it('confirmAction returns standardized error payload', async () => {
    mockConfirmActionUseCase.mockResolvedValue({
      success: false,
      statusCode: 403,
      message: 'This action does not belong to you'
    });

    const req = {
      body: { actionId: 'act-1' },
      user: { user_id: 7 },
      requestId: 'req-ai-confirm'
    };
    const res = createRes();

    await confirmAction(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'This action does not belong to you',
      error_code: 'AUTHORIZATION_FAILED',
      errors: null,
      request_id: 'req-ai-confirm',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ai_action_confirmation_recorded',
      surface: 'ai',
      action: 'confirm_action'
    }));
  });

  it('getConversations keeps success payload shape', async () => {
    mockGetConversationsUseCase.mockResolvedValue({
      conversations: [{ id: 'conv-1', title: 'New conversation' }],
      retention_notice: 'Conversations are automatically deleted after 30 days'
    });

    const req = {
      user: { user_id: 7 },
      requestId: 'req-ai-list'
    };
    const res = createRes();

    await getConversations(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        conversations: [{ id: 'conv-1', title: 'New conversation' }],
        retention_notice: 'Conversations are automatically deleted after 30 days'
      },
      message: 'Conversations retrieved',
      timestamp: expect.any(String)
    });
    expect(mockTrackProductUsageFromResult).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'ai_conversations_viewed',
      surface: 'ai',
      action: 'list_conversations'
    }));
  });

  it('downloadExport returns standardized error payload on missing file', async () => {
    mockDownloadExportUseCase.mockResolvedValue({
      success: false,
      statusCode: 404,
      message: 'Export file not found or expired'
    });

    const req = {
      params: { id: 'file-1' },
      user: { user_id: 7 },
      requestId: 'req-ai-export'
    };
    const res = createRes();

    await downloadExport(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      data: null,
      message: 'Export file not found or expired',
      error_code: 'RESOURCE_NOT_FOUND',
      errors: null,
      request_id: 'req-ai-export',
      timestamp: expect.any(String)
    });
  });
});
