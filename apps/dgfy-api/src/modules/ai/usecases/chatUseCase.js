import { v4 as uuidv4 } from 'uuid';
import { normalizeConversationMessages } from './conversationUtils.js';
import { buildPersistChatTurnUseCase } from './persistChatTurnUseCase.js';

export const buildChatUseCase = ({
    aiConversationRepository,
    pendingAIActionRepository,
    processMessage,
    persistChatTurn,
    nowProvider = () => new Date()
}) => {
    const persistChatTurnUseCase = persistChatTurn || buildPersistChatTurnUseCase({
        pendingAIActionRepository,
        aiConversationRepository,
        nowProvider
    });

    return async ({
        messagePayload,
        user,
        conversationId
    }) => {
        const convId = conversationId || uuidv4();

        let conversation = await aiConversationRepository.findConversationById(convId);
        if (!conversation) {
            conversation = await aiConversationRepository.createConversation({
                conversation_id: convId,
                user_id: user.user_id,
                messages: [],
                expires_at: new Date(nowProvider().getTime() + 30 * 24 * 60 * 60 * 1000),
                last_message_at: nowProvider()
            });
        }

        const messages = normalizeConversationMessages(conversation.messages);

        const response = await processMessage(
            messagePayload,
            messages,
            user,
            convId
        );
        const persistedTurn = await persistChatTurnUseCase({
            response,
            messagePayload,
            user,
            conversationId: convId,
            existingTitle: conversation.title,
            messages
        });

        return {
            success: true,
            isSpecial: !!persistedTurn.response.specialQuery,
            conversationId: convId,
            response: persistedTurn.response
        };
    };
};


