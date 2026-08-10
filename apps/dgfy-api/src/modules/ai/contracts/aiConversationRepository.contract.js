/**
 * AI conversation repository contract.
 *
 * Expected shape:
 * - findConversationById(conversationId, options)
 * - createConversation(payload, options)
 * - updateConversation(conversationId, patch, options)
 * - findActiveConversationsByUser(userId, now)
 * - deleteConversation(conversationId)
 * - deleteExpiredConversations(now)
 */
export const AIConversationRepositoryContract = Object.freeze([
    'findConversationById',
    'createConversation',
    'updateConversation',
    'findActiveConversationsByUser',
    'deleteConversation',
    'deleteExpiredConversations'
]);

export const assertAIConversationRepositoryContract = (repository) => {
    AIConversationRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`AIConversationRepository missing required method: ${method}`);
        }
    });
};
