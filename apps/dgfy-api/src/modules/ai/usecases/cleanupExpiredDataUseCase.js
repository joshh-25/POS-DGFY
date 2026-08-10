export const buildCleanupExpiredDataUseCase = ({
    aiConversationRepository,
    pendingAIActionRepository,
    nowProvider = () => new Date()
}) => {
    return async () => {
        const now = nowProvider();

        const deletedConversations = await aiConversationRepository.deleteExpiredConversations(now);
        const updatedActions = await pendingAIActionRepository.expirePendingActions(now);
        const expiredActions = Array.isArray(updatedActions) ? (updatedActions[0] || 0) : 0;

        return {
            deletedConversations,
            expiredActions
        };
    };
};
