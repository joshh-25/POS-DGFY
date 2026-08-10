import { jest } from '@jest/globals';
import { buildAppendConfirmedActionConversationUseCase } from '../src/modules/ai/usecases/appendConfirmedActionConversationUseCase.js';

describe('appendConfirmedActionConversationUseCase', () => {
  it('appends follow-up response and persists assistant action result message', async () => {
    const findConversationById = jest.fn().mockResolvedValue({
      conversation_id: 'conv-1',
      messages: JSON.stringify([{ role: 'user', content: 'delete it' }])
    });
    const updateConversation = jest.fn().mockResolvedValue(true);
    const processMessage = jest.fn().mockResolvedValue({
      type: 'text',
      content: 'Anything else you want to clean up?'
    });

    const useCase = buildAppendConfirmedActionConversationUseCase({
      aiConversationRepository: { findConversationById, updateConversation },
      processMessage,
      logger: { error: jest.fn() },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const message = await useCase({
      pendingAction: {
        description: 'Delete item 77',
        conversation_id: 'conv-1'
      },
      result: {
        type: 'success',
        message: 'Deleted item'
      },
      user: { user_id: 1, role: 'admin' }
    });

    expect(processMessage).toHaveBeenCalledWith(
      expect.stringContaining('Delete item 77'),
      [{ role: 'user', content: 'delete it' }],
      { user_id: 1, role: 'admin' },
      'conv-1'
    );
    expect(updateConversation).toHaveBeenCalledWith('conv-1', {
      messages: [
        { role: 'user', content: 'delete it' },
        {
          role: 'assistant',
          content: 'Deleted item\n\nAnything else you want to clean up?',
          timestamp: '2026-03-04T00:00:00.000Z',
          action_result: { type: 'success', message: 'Deleted item' }
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z')
    });
    expect(message).toBe('Deleted item\n\nAnything else you want to clean up?');
  });

  it('returns original result message when no conversation id is present', async () => {
    const findConversationById = jest.fn();
    const updateConversation = jest.fn();
    const processMessage = jest.fn();

    const useCase = buildAppendConfirmedActionConversationUseCase({
      aiConversationRepository: { findConversationById, updateConversation },
      processMessage,
      logger: { error: jest.fn() },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const message = await useCase({
      pendingAction: {
        description: 'Delete item 99'
      },
      result: {
        type: 'success',
        message: 'Deleted item'
      },
      user: { user_id: 1 }
    });

    expect(findConversationById).not.toHaveBeenCalled();
    expect(processMessage).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
    expect(message).toBe('Deleted item');
  });
});
