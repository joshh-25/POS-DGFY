import { Op } from 'sequelize';
import dbStore from '../../../utils/dbStore.js';
import { assertAIConversationRepositoryContract } from '../contracts/aiConversationRepository.contract.js';

export const aiConversationRepository = {
    findConversationById(conversationId, options = {}) {
        const AIConversation = dbStore.get('AIConversation');
        return AIConversation.findByPk(conversationId, options);
    },
    createConversation(payload, options = {}) {
        const AIConversation = dbStore.get('AIConversation');
        return AIConversation.create(payload, options);
    },
    async updateConversation(conversationId, patch, options = {}) {
        const conversation = await aiConversationRepository.findConversationById(conversationId, options);
        if (!conversation) {
            return null;
        }

        if (Object.prototype.hasOwnProperty.call(patch, 'messages')) {
            const { messages, ...rest } = patch;
            conversation.messages = messages;
            conversation.changed('messages', true);
            Object.assign(conversation, rest);
            await conversation.save(options);
            return conversation;
        }

        await conversation.update(patch, options);
        return conversation;
    },
    findActiveConversationsByUser(userId, now = new Date()) {
        const AIConversation = dbStore.get('AIConversation');
        return AIConversation.findAll({
            where: {
                user_id: userId,
                expires_at: { [Op.gt]: now }
            },
            order: [['last_message_at', 'DESC']],
            attributes: ['conversation_id', 'title', 'messages', 'created_at', 'expires_at', 'last_message_at']
        });
    },
    async deleteConversation(conversationId) {
        const conversation = await aiConversationRepository.findConversationById(conversationId);
        if (!conversation) {
            return false;
        }

        await conversation.destroy();
        return true;
    },
    deleteExpiredConversations(now = new Date()) {
        const AIConversation = dbStore.get('AIConversation');
        return AIConversation.destroy({
            where: {
                expires_at: { [Op.lt]: now }
            }
        });
    }
};

assertAIConversationRepositoryContract(aiConversationRepository);
