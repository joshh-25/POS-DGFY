/**
 * Pending AI action repository contract.
 *
 * Expected shape:
 * - findPendingActionById(actionId, options)
 * - createPendingAction(payload, options)
 * - updatePendingAction(actionId, patch, options)
 * - cancelPendingActionsByConversation(conversationId)
 * - expirePendingActions(now)
 */
export const PendingAIActionRepositoryContract = Object.freeze([
    'findPendingActionById',
    'createPendingAction',
    'updatePendingAction',
    'cancelPendingActionsByConversation',
    'expirePendingActions'
]);

export const assertPendingAIActionRepositoryContract = (repository) => {
    PendingAIActionRepositoryContract.forEach((method) => {
        if (typeof repository?.[method] !== 'function') {
            throw new Error(`PendingAIActionRepository missing required method: ${method}`);
        }
    });
};
