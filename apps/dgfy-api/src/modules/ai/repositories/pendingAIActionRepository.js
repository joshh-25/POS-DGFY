import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { assertPendingAIActionRepositoryContract } from '../contracts/pendingAIActionRepository.contract.js';

export const pendingAIActionRepository = {
    findPendingActionById(actionId, options = {}) {
        const PendingAIAction = dbStore.get('PendingAIAction');
        return PendingAIAction.findByPk(actionId, options);
    },
    createPendingAction(payload, options = {}) {
        const PendingAIAction = dbStore.get('PendingAIAction');
        return PendingAIAction.create(payload, options);
    },
    async updatePendingAction(actionId, patch, options = {}) {
        const pendingAction = await pendingAIActionRepository.findPendingActionById(actionId, options);
        if (!pendingAction) {
            return null;
        }

        await pendingAction.update(patch, options);
        return pendingAction;
    },
    cancelPendingActionsByConversation(conversationId) {
        const PendingAIAction = dbStore.get('PendingAIAction');
        return PendingAIAction.update(
            { status: 'cancelled' },
            {
                where: {
                    conversation_id: conversationId,
                    status: 'pending'
                }
            }
        );
    },
    expirePendingActions(now = new Date()) {
        const PendingAIAction = dbStore.get('PendingAIAction');
        return PendingAIAction.update(
            { status: 'expired' },
            {
                where: {
                    expires_at: { [Op.lt]: now },
                    status: 'pending'
                }
            }
        );
    }
};

assertPendingAIActionRepositoryContract(pendingAIActionRepository);
