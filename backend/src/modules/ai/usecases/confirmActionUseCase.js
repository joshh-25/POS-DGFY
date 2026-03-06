import { buildAppendConfirmedActionConversationUseCase } from './appendConfirmedActionConversationUseCase.js';

export const buildConfirmActionUseCase = ({
    pendingAIActionRepository,
    aiConversationRepository,
    executeConfirmedAction,
    processMessage,
    logger,
    appendConfirmedActionConversation,
    nowProvider = () => new Date()
}) => {
    const appendConfirmedActionConversationUseCase = appendConfirmedActionConversation || buildAppendConfirmedActionConversationUseCase({
        aiConversationRepository,
        processMessage,
        logger,
        nowProvider
    });

    return async ({ actionId, user }) => {
        const pendingAction = await pendingAIActionRepository.findPendingActionById(actionId);

        if (!pendingAction) {
            return {
                success: false,
                statusCode: 404,
                message: 'Action not found or has expired'
            };
        }

        if (pendingAction.user_id !== user.user_id) {
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

        if (new Date(pendingAction.expires_at) < nowProvider()) {
            await pendingAIActionRepository.updatePendingAction(actionId, { status: 'expired' });
            return {
                success: false,
                statusCode: 410,
                message: 'This action has expired. Please try again.'
            };
        }

        let actionPayload = pendingAction.action_payload;
        if (typeof actionPayload === 'string') {
            try {
                actionPayload = JSON.parse(actionPayload);
            } catch (error) {
                logger?.error?.('Failed to parse action_payload:', error);
                actionPayload = {};
            }
        }

        const actionData = {
            action_id: pendingAction.action_id,
            user_id: pendingAction.user_id,
            toolName: pendingAction.action_type,
            args: actionPayload,
            conversation_id: pendingAction.conversation_id,
            description: pendingAction.description,
            expires_at: pendingAction.expires_at
        };

        const result = await executeConfirmedAction(actionId, actionData, user);

        await pendingAIActionRepository.updatePendingAction(actionId, {
            status: 'confirmed',
            confirmed_at: nowProvider(),
            execution_result: result
        });

        const finalMessageContent = await appendConfirmedActionConversationUseCase({
            pendingAction,
            result,
            user
        });

        return {
            success: true,
            responseSuccess: result.type === 'success',
            data: {
                ...result,
                message: finalMessageContent
            },
            message: finalMessageContent
        };
    };
};
