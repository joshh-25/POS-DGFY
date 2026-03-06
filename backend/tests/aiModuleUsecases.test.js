import { jest } from '@jest/globals';
import {
  buildChatUseCase
} from '../src/modules/ai/usecases/chatUseCase.js';
import {
  buildConfirmActionUseCase
} from '../src/modules/ai/usecases/confirmActionUseCase.js';
import {
  buildCancelActionUseCase
} from '../src/modules/ai/usecases/cancelActionUseCase.js';
import {
  buildGetConversationsUseCase
} from '../src/modules/ai/usecases/getConversationsUseCase.js';
import {
  buildGetConversationUseCase
} from '../src/modules/ai/usecases/getConversationUseCase.js';
import {
  buildDeleteConversationUseCase
} from '../src/modules/ai/usecases/deleteConversationUseCase.js';
import {
  buildCleanupExpiredDataUseCase
} from '../src/modules/ai/usecases/cleanupExpiredDataUseCase.js';
import {
  buildDownloadExportUseCase
} from '../src/modules/ai/usecases/downloadExportUseCase.js';
import {
  buildGetDiagnosticsUseCase
} from '../src/modules/ai/usecases/getDiagnosticsUseCase.js';

describe('AI module use cases', () => {
  it('chat use case returns special-query response and persists conversation messages', async () => {
    const processMessage = jest.fn().mockResolvedValue({
      type: 'text',
      content: 'I can help with inventory and subscriptions.',
      specialQuery: true,
      conversationId: 'conv-special'
    });
    const updateConversation = jest.fn().mockResolvedValue(true);
    const useCase = buildChatUseCase({
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'conv-special',
          title: null,
          messages: JSON.stringify([])
        }),
        createConversation: jest.fn(),
        updateConversation
      },
      pendingAIActionRepository: {
        createPendingAction: jest.fn()
      },
      processMessage,
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({
      messagePayload: 'What can you do?',
      finalMessageText: 'What can you do?',
      user: { user_id: 21 },
      conversationId: 'conv-special'
    });

    expect(processMessage).toHaveBeenCalledWith(
      'What can you do?',
      expect.any(Array),
      { user_id: 21 },
      'conv-special'
    );
    expect(updateConversation).toHaveBeenCalledWith('conv-special', {
      messages: [
        { role: 'user', content: 'What can you do?', timestamp: '2026-03-04T00:00:00.000Z' },
        {
          role: 'assistant',
          content: 'I can help with inventory and subscriptions.',
          timestamp: '2026-03-04T00:00:00.000Z'
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z'),
      title: 'What can you do?'
    });
    expect(result).toEqual({
      success: true,
      isSpecial: true,
      conversationId: 'conv-special',
      response: {
        type: 'text',
        content: 'I can help with inventory and subscriptions.',
        specialQuery: true,
        conversationId: 'conv-special'
      }
    });
  });

  it('chat use case persists pending action on confirmation-required response', async () => {
    const createPendingAction = jest.fn().mockResolvedValue(true);
    const updateConversation = jest.fn().mockResolvedValue(true);
    const processMessage = jest.fn().mockResolvedValue({
      type: 'confirmation_required',
      action_id: 'act-1',
      action_type: 'delete_item',
      description: 'Delete item 12',
      details: { item_id: 12 },
      impact_summary: 'Removes item 12 from active catalog.'
    });

    const useCase = buildChatUseCase({
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'conv-confirm',
          title: null,
          messages: []
        }),
        createConversation: jest.fn(),
        updateConversation
      },
      pendingAIActionRepository: {
        createPendingAction
      },
      processMessage,
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({
      messagePayload: 'Delete item 12',
      finalMessageText: 'Delete item 12',
      user: { user_id: 7 },
      conversationId: 'conv-confirm'
    });

    expect(createPendingAction).toHaveBeenCalledWith({
      action_id: 'act-1',
      user_id: 7,
      conversation_id: 'conv-confirm',
      action_type: 'delete_item',
      action_payload: { item_id: 12 },
      description: 'Delete item 12',
      impact_summary: 'Removes item 12 from active catalog.',
      status: 'pending',
      expires_at: new Date('2026-03-04T00:05:00.000Z')
    });
    expect(updateConversation).toHaveBeenCalledWith('conv-confirm', {
      messages: [
        {
          role: 'user',
          content: 'Delete item 12',
          timestamp: '2026-03-04T00:00:00.000Z'
        },
        {
          role: 'assistant',
          content: '\uD83D\uDD14 Confirmation required: Delete item 12',
          timestamp: '2026-03-04T00:00:00.000Z',
          action_id: 'act-1'
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z'),
      title: 'Delete item 12'
    });
    expect(result).toEqual({
      success: true,
      isSpecial: false,
      conversationId: 'conv-confirm',
      response: {
        type: 'confirmation_required',
        action_id: 'act-1',
        action_type: 'delete_item',
        description: 'Delete item 12',
        details: { item_id: 12 },
        impact_summary: 'Removes item 12 from active catalog.',
        message: '\uD83D\uDD14 I\'m ready to delete item 12. Please confirm to proceed.'
      }
    });
  });

  it('confirmAction use case returns 404 when action is missing', async () => {
    const useCase = buildConfirmActionUseCase({
      pendingAIActionRepository: {
        findPendingActionById: jest.fn().mockResolvedValue(null),
        updatePendingAction: jest.fn()
      },
      aiConversationRepository: {
        findConversationById: jest.fn(),
        updateConversation: jest.fn()
      },
      executeConfirmedAction: jest.fn(),
      processMessage: jest.fn(),
      logger: { error: jest.fn() }
    });

    const result = await useCase({
      actionId: 'missing-action',
      user: { user_id: 3 }
    });

    expect(result).toEqual({
      success: false,
      statusCode: 404,
      message: 'Action not found or has expired'
    });
  });

  it('confirmAction use case marks expired action and returns 410', async () => {
    const updatePendingAction = jest.fn().mockResolvedValue(true);
    const useCase = buildConfirmActionUseCase({
      pendingAIActionRepository: {
        findPendingActionById: jest.fn().mockResolvedValue({
          action_id: 'a-exp',
          user_id: 9,
          status: 'pending',
          expires_at: '2026-03-01T00:00:00.000Z'
        }),
        updatePendingAction
      },
      aiConversationRepository: {
        findConversationById: jest.fn(),
        updateConversation: jest.fn()
      },
      executeConfirmedAction: jest.fn(),
      processMessage: jest.fn(),
      logger: { error: jest.fn() },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({
      actionId: 'a-exp',
      user: { user_id: 9 }
    });

    expect(updatePendingAction).toHaveBeenCalledWith('a-exp', { status: 'expired' });
    expect(result).toEqual({
      success: false,
      statusCode: 410,
      message: 'This action has expired. Please try again.'
    });
  });

  it('confirmAction use case executes action and appends conversation follow-up', async () => {
    const executeConfirmedAction = jest.fn().mockResolvedValue({
      type: 'success',
      message: 'Deleted item'
    });
    const processMessage = jest.fn().mockResolvedValue({
      type: 'text',
      content: 'Anything else?'
    });
    const updatePendingAction = jest.fn().mockResolvedValue(true);
    const updateConversation = jest.fn().mockResolvedValue(true);

    const useCase = buildConfirmActionUseCase({
      pendingAIActionRepository: {
        findPendingActionById: jest.fn().mockResolvedValue({
          action_id: 'a-ok',
          user_id: 1,
          status: 'pending',
          action_type: 'delete_item',
          action_payload: JSON.stringify({ item_id: 77 }),
          description: 'Delete item 77',
          conversation_id: 'conv-77',
          expires_at: '2026-03-10T00:00:00.000Z'
        }),
        updatePendingAction
      },
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'conv-77',
          messages: JSON.stringify([{ role: 'user', content: 'please delete' }])
        }),
        updateConversation
      },
      executeConfirmedAction,
      processMessage,
      logger: { error: jest.fn() },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({
      actionId: 'a-ok',
      user: { user_id: 1, role: 'admin' }
    });

    expect(executeConfirmedAction).toHaveBeenCalledWith(
      'a-ok',
      expect.objectContaining({
        toolName: 'delete_item',
        args: { item_id: 77 },
        conversation_id: 'conv-77'
      }),
      { user_id: 1, role: 'admin' }
    );
    expect(updatePendingAction).toHaveBeenCalledWith('a-ok', expect.objectContaining({
      status: 'confirmed',
      execution_result: { type: 'success', message: 'Deleted item' }
    }));
    expect(updateConversation).toHaveBeenCalledWith('conv-77', {
      messages: [
        { role: 'user', content: 'please delete' },
        {
          role: 'assistant',
          content: 'Deleted item\n\nAnything else?',
          timestamp: '2026-03-04T00:00:00.000Z',
          action_result: { type: 'success', message: 'Deleted item' }
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z')
    });
    expect(result).toEqual({
      success: true,
      responseSuccess: true,
      data: {
        type: 'success',
        message: 'Deleted item\n\nAnything else?'
      },
      message: 'Deleted item\n\nAnything else?'
    });
  });

  it('cancelAction use case returns 404 when action is missing', async () => {
    const useCase = buildCancelActionUseCase({
      pendingAIActionRepository: {
        findPendingActionById: jest.fn().mockResolvedValue(null),
        updatePendingAction: jest.fn()
      },
      aiConversationRepository: {
        findConversationById: jest.fn(),
        updateConversation: jest.fn()
      }
    });

    const result = await useCase({ actionId: 'a1', userId: 5 });
    expect(result).toEqual({
      success: false,
      statusCode: 404,
      message: 'Action not found or has already been processed'
    });
  });

  it('cancelAction use case cancels action and appends cancel message to conversation', async () => {
    const pendingAction = {
      action_id: 'a2',
      user_id: 10,
      status: 'pending',
      conversation_id: 'c1'
    };
    const updatePendingAction = jest.fn().mockResolvedValue(true);
    const updateConversation = jest.fn().mockResolvedValue(true);
    const useCase = buildCancelActionUseCase({
      pendingAIActionRepository: {
        findPendingActionById: jest.fn().mockResolvedValue(pendingAction),
        updatePendingAction
      },
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'c1',
          messages: JSON.stringify([{ role: 'user', content: 'hello' }])
        }),
        updateConversation
      },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({ actionId: 'a2', userId: 10 });

    expect(updatePendingAction).toHaveBeenCalledWith('a2', { status: 'cancelled' });
    expect(updateConversation).toHaveBeenCalledWith('c1', {
      messages: [
        { role: 'user', content: 'hello' },
        {
          role: 'assistant',
          content: 'Action cancelled.',
          timestamp: '2026-03-04T00:00:00.000Z'
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z')
    });
    expect(result).toEqual({
      success: true,
      data: { actionId: 'a2', status: 'cancelled' }
    });
  });

  it('getConversations use case formats conversation rows and title fallback', async () => {
    const useCase = buildGetConversationsUseCase({
      aiConversationRepository: {
        findActiveConversationsByUser: jest.fn().mockResolvedValue([
          {
            conversation_id: 'c1',
            title: null,
            messages: [
              { role: 'user', content: 'Inventory status check for this week' },
              { role: 'assistant', content: 'ok' }
            ],
            created_at: '2026-03-01T00:00:00.000Z',
            last_message_at: '2026-03-02T00:00:00.000Z',
            expires_at: '2026-03-10T00:00:00.000Z'
          }
        ])
      },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({ userId: 7 });

    expect(result).toEqual({
      conversations: [
        {
          id: 'c1',
          title: 'Inventory status check for this week',
          message_count: 2,
          created_at: '2026-03-01T00:00:00.000Z',
          last_message_at: '2026-03-02T00:00:00.000Z',
          expires_at: '2026-03-10T00:00:00.000Z',
          days_until_expiry: 6,
          expiry_warning: false
        }
      ],
      retention_notice: 'Conversations are automatically deleted after 30 days'
    });
  });

  it('getConversation use case returns 410 when conversation is expired', async () => {
    const useCase = buildGetConversationUseCase({
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'c2',
          user_id: 9,
          expires_at: '2026-03-01T00:00:00.000Z'
        })
      },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({ conversationId: 'c2', userId: 9 });
    expect(result).toEqual({
      success: false,
      statusCode: 410,
      message: 'This conversation has expired'
    });
  });

  it('getConversation use case returns formatted payload when valid', async () => {
    const useCase = buildGetConversationUseCase({
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'c3',
          user_id: 3,
          title: 'Ops',
          messages: JSON.stringify([{ role: 'user', content: 'hello' }]),
          created_at: '2026-03-01T00:00:00.000Z',
          expires_at: '2026-03-10T00:00:00.000Z',
          last_message_at: '2026-03-03T00:00:00.000Z'
        })
      },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({ conversationId: 'c3', userId: 3 });
    expect(result).toEqual({
      success: true,
      data: {
        id: 'c3',
        user_id: 3,
        title: 'Ops',
        messages: [{ role: 'user', content: 'hello' }],
        created_at: '2026-03-01T00:00:00.000Z',
        expires_at: '2026-03-10T00:00:00.000Z',
        last_message_at: '2026-03-03T00:00:00.000Z',
        days_until_expiry: 6,
        expiry_warning: false
      }
    });
  });

  it('deleteConversation use case enforces ownership and cascades pending-action cancel', async () => {
    const deleteConversation = jest.fn().mockResolvedValue(true);
    const cancelPendingActionsByConversation = jest.fn().mockResolvedValue([2]);
    const useCase = buildDeleteConversationUseCase({
      aiConversationRepository: {
        findConversationById: jest.fn().mockResolvedValue({
          conversation_id: 'c4',
          user_id: 4
        }),
        deleteConversation
      },
      pendingAIActionRepository: {
        cancelPendingActionsByConversation
      }
    });

    const result = await useCase({ conversationId: 'c4', userId: 4 });
    expect(deleteConversation).toHaveBeenCalledWith('c4');
    expect(cancelPendingActionsByConversation).toHaveBeenCalledWith('c4');
    expect(result).toEqual({
      success: true,
      data: { id: 'c4', status: 'deleted' }
    });
  });

  it('cleanupExpiredData use case reports counts', async () => {
    const useCase = buildCleanupExpiredDataUseCase({
      aiConversationRepository: {
        deleteExpiredConversations: jest.fn().mockResolvedValue(3)
      },
      pendingAIActionRepository: {
        expirePendingActions: jest.fn().mockResolvedValue([5])
      },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase();
    expect(result).toEqual({
      deletedConversations: 3,
      expiredActions: 5
    });
  });

  it('downloadExport use case returns 404 when file does not exist', async () => {
    const useCase = buildDownloadExportUseCase({
      getTemporaryFile: jest.fn().mockResolvedValue(null)
    });

    const result = await useCase({ fileId: 'f1', userId: 2 });
    expect(result).toEqual({
      success: false,
      statusCode: 404,
      message: 'Export file not found or expired'
    });
  });

  it('downloadExport use case returns file payload when present', async () => {
    const filePayload = {
      filename: 'report.csv',
      contentType: 'text/csv',
      content: 'a,b'
    };
    const useCase = buildDownloadExportUseCase({
      getTemporaryFile: jest.fn().mockResolvedValue(filePayload)
    });

    const result = await useCase({ fileId: 'f2', userId: 3 });
    expect(result).toEqual({
      success: true,
      data: filePayload
    });
  });

  it('getDiagnostics use case returns diagnostic report from dependency', async () => {
    const useCase = buildGetDiagnosticsUseCase({
      runDiagnostics: jest.fn().mockResolvedValue({
        summary: { score: 95 }
      })
    });

    const result = await useCase({ user: { user_id: 1 } });
    expect(result).toEqual({
      summary: { score: 95 }
    });
  });
});



