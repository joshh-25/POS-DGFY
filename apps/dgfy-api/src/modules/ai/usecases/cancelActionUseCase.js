import { buildAppendCancelledActionConversationUseCase } from './appendCancelledActionConversationUseCase.js';

export const buildCancelActionUseCase = ({
    pendingAIActionRepository,
    aiConversationRepository,
    appendCancelledActionConversation,
    nowProvider = () => new Date()
}) => {
    const appendCancelledActionConversationUseCase = appendCancelledActionConversation ||
        buildAppendCancelledActionConversationUseCase({
            aiConversationRepository,
            nowProvider
        });

    return async ({ actionId, userId }) => {
        const pendingAction = await pendingAIActionRepository.findPendingActionById(actionId);

        if (!pendingAction) {
            return {
                success: false,
                statusCode: 404,
                message: 'Action not found or has already been processed'
            };
        }

        if (pendingAction.user_id !== userId) {
            return {
                success: false,
                statusCode: 403,
                message: 'This action does not belong to you'
            };
        }

        if (pendingAction.status !== 'pending') {
            return {
                success: false,
                statusCode: 400,
                message: `This action has already been ${pendingAction.status}`
            };
        }

        await pendingAIActionRepository.updatePendingAction(actionId, { status: 'cancelled' });
        await appendCancelledActionConversationUseCase({
            pendingAction,
            message: 'Action cancelled.'
        });

        return {
            success: true,
            data: {
                actionId,
                status: 'cancelled'
            }
        };
    };
};

