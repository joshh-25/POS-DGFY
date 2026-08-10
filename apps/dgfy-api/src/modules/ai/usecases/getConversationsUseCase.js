import { generateConversationTitle, normalizeConversationMessages } from './conversationUtils.js';

export const buildGetConversationsUseCase = ({
    aiConversationRepository,
    nowProvider = () => new Date()
}) => {
    return async ({ userId }) => {
        const now = nowProvider();
        const conversations = await aiConversationRepository.findActiveConversationsByUser(userId, now);

        const formattedConversations = conversations.map((conversation) => {
            const daysUntilExpiry = Math.ceil(
                (new Date(conversation.expires_at) - now) / (1000 * 60 * 60 * 24)
            );

            const messages = normalizeConversationMessages(conversation.messages);

            return {
                id: conversation.conversation_id,
                title: conversation.title || generateConversationTitle(messages),
                message_count: messages.length,
                created_at: conversation.created_at,
                last_message_at: conversation.last_message_at,
                expires_at: conversation.expires_at,
                days_until_expiry: daysUntilExpiry,
                expiry_warning: daysUntilExpiry <= 5
            };
        });

        return {
            conversations: formattedConversations,
            retention_notice: 'Conversations are automatically deleted after 30 days'
        };
    };
};
