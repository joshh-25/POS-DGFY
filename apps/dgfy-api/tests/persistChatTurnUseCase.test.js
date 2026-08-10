import { jest } from '@jest/globals';
import { buildPersistChatTurnUseCase } from '../src/modules/ai/usecases/persistChatTurnUseCase.js';

describe('persistChatTurnUseCase', () => {
  it('persists confirmation-required turn and creates pending action with default prompt', async () => {
    const createPendingAction = jest.fn().mockResolvedValue(true);
    const updateConversation = jest.fn().mockResolvedValue(true);

    const useCase = buildPersistChatTurnUseCase({
      pendingAIActionRepository: { createPendingAction },
      aiConversationRepository: { updateConversation },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const result = await useCase({
      response: {
        type: 'confirmation_required',
        action_id: 'act-7',
        action_type: 'delete_item',
        description: 'Delete item 7',
        details: { item_id: 7 }
      },
      messagePayload: 'Delete item 7',
      user: { user_id: 42 },
      conversationId: 'conv-7',
      existingTitle: null,
      messages: []
    });

    expect(createPendingAction).toHaveBeenCalledWith({
      action_id: 'act-7',
      user_id: 42,
      conversation_id: 'conv-7',
      action_type: 'delete_item',
      action_payload: { item_id: 7 },
      description: 'Delete item 7',
      impact_summary: null,
      status: 'pending',
      expires_at: new Date('2026-03-04T00:05:00.000Z')
    });
    expect(updateConversation).toHaveBeenCalledWith('conv-7', {
      messages: [
        {
          role: 'user',
          content: 'Delete item 7',
          timestamp: '2026-03-04T00:00:00.000Z'
        },
        {
          role: 'assistant',
          content: '\uD83D\uDD14 Confirmation required: Delete item 7',
          timestamp: '2026-03-04T00:00:00.000Z',
          action_id: 'act-7'
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z'),
      title: 'Delete item 7'
    });
    expect(result.response.message).toBe(
      '\uD83D\uDD14 I\'m ready to delete item 7. Please confirm to proceed.'
    );
  });

  it('persists text response turn and keeps tool context in conversation memory payload', async () => {
    const repository = { updateConversation: jest.fn().mockResolvedValue(true) };
    const wiredUseCase = buildPersistChatTurnUseCase({
      pendingAIActionRepository: { createPendingAction: jest.fn() },
      aiConversationRepository: repository,
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    await wiredUseCase({
      response: {
        type: 'text',
        content: 'Here are your low stock items.',
        toolContext: { items: [{ id: 1, name: 'Soy Sauce' }] }
      },
      messagePayload: 'show low stock',
      user: { user_id: 7 },
      conversationId: 'conv-text',
      existingTitle: 'Ops thread',
      messages: []
    });

    expect(repository.updateConversation).toHaveBeenCalledWith('conv-text', {
      messages: [
        {
          role: 'user',
          content: 'show low stock',
          timestamp: '2026-03-04T00:00:00.000Z'
        },
        {
          role: 'assistant',
          content: 'Here are your low stock items.',
          timestamp: '2026-03-04T00:00:00.000Z',
          context: { items: [{ id: 1, name: 'Soy Sauce' }] }
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z'),
      title: 'Ops thread'
    });
  });
});
