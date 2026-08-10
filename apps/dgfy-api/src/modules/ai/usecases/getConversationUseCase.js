import { normalizeConversationMessages } from './conversationUtils.js';

export const buildGetConversationUseCase = ({
    aiConversationRepository,
    nowProvider = () => new Date()
}) => {
    return async ({ conversationId, userId }) => {
        const conversation = await aiConversationRepository.findConversationById(conversationId);

        if (!conversation) {
            return {
                success: false,
                statusCode: 404,
                message: 'Conversation not found'
            };
        }

        if (conversation.user_id !== userId) {
            return {
                success: false,
                statusCode: 403,
                message: 'Access denied'
            };
        }

        const now = nowProvider();
        if (new Date(conversation.expires_at) < now) {
            return {
                success: false,
                statusCode: 410,
                message: 'This conversation has expired'
            };
        }

        const daysUntilExpiry = Math.ceil(
            (new Date(conversation.expires_at) - now) / (1000 * 60 * 60 * 24)
        );
        const messages = normalizeConversationMessages(conversation.messages);

        return {
            success: true,
            data: {
                id: conversation.conversation_id,
                user_id: conversation.user_id,
                title: conversation.title,
                messages,
                created_at: conversation.created_at,
                expires_at: conversation.expires_at,
                last_message_at: conversation.last_message_at,
                days_until_expiry: daysUntilExpiry,
                expiry_warning: daysUntilExpiry <= 5
            }
        };
    };
};
