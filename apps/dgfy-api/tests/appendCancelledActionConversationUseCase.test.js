import { jest } from '@jest/globals';
import { buildAppendCancelledActionConversationUseCase } from '../src/modules/ai/usecases/appendCancelledActionConversationUseCase.js';

describe('appendCancelledActionConversationUseCase', () => {
  it('appends cancellation message and persists conversation', async () => {
    const findConversationById = jest.fn().mockResolvedValue({
      conversation_id: 'conv-1',
      messages: JSON.stringify([{ role: 'user', content: 'cancel it' }])
    });
    const updateConversation = jest.fn().mockResolvedValue(true);

    const useCase = buildAppendCancelledActionConversationUseCase({
      aiConversationRepository: { findConversationById, updateConversation },
      nowProvider: () => new Date('2026-03-04T00:00:00.000Z')
    });

    const appended = await useCase({
      pendingAction: { conversation_id: 'conv-1' },
      message: 'Action cancelled.'
    });

    expect(appended).toBe(true);
    expect(updateConversation).toHaveBeenCalledWith('conv-1', {
      messages: [
        { role: 'user', content: 'cancel it' },
        {
          role: 'assistant',
          content: 'Action cancelled.',
          timestamp: '2026-03-04T00:00:00.000Z'
        }
      ],
      last_message_at: new Date('2026-03-04T00:00:00.000Z')
    });
  });

  it('returns false when conversation id is missing', async () => {
    const findConversationById = jest.fn();
    const updateConversation = jest.fn();

    const useCase = buildAppendCancelledActionConversationUseCase({
      aiConversationRepository: { findConversationById, updateConversation }
    });

    const appended = await useCase({
      pendingAction: {}
    });

    expect(appended).toBe(false);
    expect(findConversationById).not.toHaveBeenCalled();
    expect(updateConversation).not.toHaveBeenCalled();
  });
});

