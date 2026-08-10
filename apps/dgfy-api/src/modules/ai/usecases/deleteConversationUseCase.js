export const buildDeleteConversationUseCase = ({
    aiConversationRepository,
    pendingAIActionRepository
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

        await aiConversationRepository.deleteConversation(conversationId);
        await pendingAIActionRepository.cancelPendingActionsByConversation(conversationId);

        return {
            success: true,
            data: {
                id: conversationId,
                status: 'deleted'
            }
        };
    };
};
